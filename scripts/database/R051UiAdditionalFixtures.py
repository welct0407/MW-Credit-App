"""R051 additional GUI fixtures. Explicit batches; no import-time DB access.

Use with ReceiptCorrectionDev.dev_connection only during a coordinated DEV write
window. seed/cleanup do not commit: caller owns commit and unknown-outcome
reconciliation. readback discovers GUI-generated IDs; cleanup requires a freshly
reviewed exact inventory. No production migration or permission change.
"""
from datetime import timedelta
from psycopg import sql

PREFIX = 'SYN-R051-UI-'
BATCHES = ('DAILY', 'DEFAULT', 'LEGACY', 'CLOSE', 'PREPARED', 'PARTNER-A')


def ids(batch):
    if batch not in BATCHES:
        raise ValueError('Unknown fixture batch')
    root = PREFIX + batch
    return dict(root=root, borrower=root+'-B', referrer=root+'-REF',
                loan=root if batch in ('DAILY','DEFAULT','LEGACY') else root+'-L',
                charge=root+'-C', later=root+'-LATER', payment=root+'-P',
                first=root+'-FIRST', repayment=root+'-R', partner=root,
                dad=root+'-DAD', lisa=root+'-LISA', lisa2=root+'-LISA2')


def setup(c, *, readonly=False):
    if readonly:
        c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL timezone='Asia/Bangkok'")
    c.execute("SET LOCAL statement_timeout='30s'")
    c.execute("SET LOCAL lock_timeout='3s'")
    c.execute("SET LOCAL application_name='r051-additional-gui-fixtures'")


def gate(c, window_reference, containment_reference):
    if not window_reference or not containment_reference:
        raise ValueError('Current exclusive GUI/backend window and notification references required')
    if c.execute('SELECT current_database(),session_user').fetchone() != ('loan_manager_dev','postgres'):
        raise ValueError('DEV identity mismatch')
    if c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0] != 64:
        raise ValueError('Expected validated V64')


def rows(c, table, where, args):
    q = sql.SQL('SELECT to_jsonb(t) FROM public.{} t WHERE {} ORDER BY "Row ID"').format(sql.Identifier(table),sql.SQL(where))
    return [r[0] for r in c.execute(q,args)]


def keys(data, table):
    return [r['Row ID'] for r in data.get(table,[])]


def readback(c, batch):
    """Synthetic relationship scope, including unknown GUI IDs and orphan keys."""
    i=ids(batch); result={}
    result['Borrowers']=rows(c,'Borrowers','"Row ID"=ANY(%s)',[[i['borrower'],i['referrer']]])
    result['Partners']=rows(c,'Partners','"Row ID"=%s',[i['partner']]) if batch=='PARTNER-A' else []
    result['Cash Accounts']=rows(c,'Cash Accounts','"Row ID"=ANY(%s)',[[i['dad'],i['lisa'],i['lisa2']]])
    result['Loans']=rows(c,'Loans','"Row ID"=%s OR "Ref Borrowers"=%s',[i['loan'],i['borrower']])
    loans=list(set(keys(result,'Loans')+[i['loan']]))
    result['Charges']=rows(c,'Charges','"Ref Loans"=ANY(%s) OR "Row ID"=ANY(%s)',[loans,[i['charge'],i['later']]])
    charges=list(set(keys(result,'Charges')+[i['charge'],i['later']]))
    result['Payments']=rows(c,'Payments','"Ref Borrower"=%s OR "Row ID"=ANY(%s)',[i['borrower'],[i['payment'],i['first']]])
    payments=list(set(keys(result,'Payments')+[i['payment'],i['first']]))
    result['Payment Allocations']=rows(c,'Payment Allocations','"Ref Payment"=ANY(%s) OR "Ref Charge"=ANY(%s)',[payments,charges])
    result['Repayments']=rows(c,'Repayments','"Ref Payment"=ANY(%s) OR "Ref Charges"=ANY(%s) OR "Ref Loans"=ANY(%s) OR "Row ID"=%s',[payments,charges,loans,i['repayment']])
    result['Business Expenses']=rows(c,'Business Expenses','"Ref Related Loan"=ANY(%s) OR "Ref Related Borrower"=%s OR "Ref Payee Borrower"=%s',[loans,i['borrower'],i['referrer']])
    result['Cash Pool Contributions']=rows(c,'Cash Pool Contributions','"Ref Partner"=%s',[i['partner']]) if batch=='PARTNER-A' else []
    result['Settlements']=rows(c,'Settlements','"Ref Partner"=%s',[i['partner']]) if batch=='PARTNER-A' else []
    result['Cash Ledger']=rows(c,'Cash Ledger','"Ref Payment"=ANY(%s) OR "Ref Loan"=ANY(%s) OR "Ref Business Expense"=ANY(%s) OR "Ref Settlement"=ANY(%s) OR "Ref From Cash Account"=ANY(%s) OR "Ref To Cash Account"=ANY(%s)',[payments,loans,keys(result,'Business Expenses'),keys(result,'Settlements'),[i['dad'],i['lisa'],i['lisa2']],[i['dad'],i['lisa'],i['lisa2']]])
    return result


def preflight(c, batch):
    i=ids(batch)
    last=c.execute('''SELECT greatest(current_date,
      coalesce((SELECT max("Payment Date") FROM public."Repayments"),current_date),
      coalesce((SELECT max("Expense Date") FROM public."Business Expenses"),current_date))''').fetchone()[0]
    available=None
    if batch=='PARTNER-A' and c.execute('SELECT EXISTS(SELECT 1 FROM public."Partners" WHERE "Row ID"=%s)',[i['partner']]).fetchone()[0]:
        available=c.execute('''SELECT public.partner_net_profit(%s)-coalesce(sum("Amount"::numeric),0)
          FROM public."Settlements" WHERE "Ref Partner"=%s AND "Status" IS DISTINCT FROM 'Cancelled' ''',[i['partner'],i['partner']]).fetchone()[0]
    return {
                'batch':batch,'business_date':str(c.execute('SELECT current_date').fetchone()[0]),
                'contribution_date':str(last+timedelta(days=1)),
                'settlement_available':None if available is None else str(available),
                'settlement_positive_flow_permitted':available is not None and available>=2}


def insert(c, table, values):
    money={'Principal Amount','Current Daily Interest','Principal Due','Interest Due','Amount Received','Principal Paid','Interest Paid','Amount'}
    placeholders=[sql.SQL('%s::numeric::money') if name in money else sql.Placeholder() for name in values]
    c.execute(sql.SQL('INSERT INTO public.{} ({}) VALUES ({})').format(sql.Identifier(table),sql.SQL(',').join(map(sql.Identifier,values)),sql.SQL(',').join(placeholders)),list(values.values()))


def payment(c,i,key,amount,date,method='Single Partial',target=None):
    values={'Row ID':key,'Ref Borrower':i['borrower'],'Status':'Processing','Amount Received':amount,
            'Payment Date':date,'Allocation Method':method,'Ref Received By Cash Account':i['dad'],
            'Notes':'Synthetic R051 GUI '+i['root']}
    values['Ref Target Loan' if method=='Loan Close' else 'Ref Target Charge']=target or i['charge']
    insert(c,'Payments',values)


def seed(c,batch):
    """Exact setup only; caller must gate, capture recovery/baseline, then commit."""
    i=ids(batch)
    if any(readback(c,batch).values()):
        raise ValueError('Batch already has records; reconcile, never replay seed')
    today=c.execute('SELECT current_date').fetchone()[0]
    for who in (('dad','lisa','lisa2') if batch in ('LEGACY','PARTNER-A') else ('dad','lisa')):
        insert(c,'Cash Accounts',{'Row ID':i[who],'Ref Cash Holder':'ch:'+('dad' if who=='dad' else 'lisa'),'Account Label':'SYNTHETIC R051 '+batch+' '+who,'Bank Name':'Synthetic'})
    if batch=='PARTNER-A':
        insert(c,'Partners',{'Row ID':i['partner'],'Partner Name':'SYNTHETIC R051 GUI','Partner Role':'A','Email':None,'Login Email':None,'IG Integration Enabled':False})
        # GUI creates contributions/settlements only after the returned preflight;
        # no synthetic capital is manufactured for positive settlement tests.
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        return readback(c,batch)
    insert(c,'Borrowers',{'Row ID':i['borrower'],'Borrower Name':'SYNTHETIC R051 '+batch})
    if batch=='CLOSE':
        insert(c,'Borrowers',{'Row ID':i['referrer'],'Borrower Name':'SYNTHETIC R051 REFERRER'})
        c.execute('UPDATE public."Borrowers" SET "Ref Referrer"=%s WHERE "Row ID"=%s',[i['referrer'],i['borrower']])
    daily=batch in ('DAILY','DEFAULT','PREPARED')
    values={'Row ID':i['loan'],'Ref Borrowers':i['borrower'],'Loan Date':today-timedelta(days=2),
            'Principal Amount':100,'Loan Status':'ยังไม่ปิดยอด','Loan Type':'ดอกเบี้ยรายวัน' if daily else 'กำหนดวันชำระ',
            'Auto Charge Enabled':False,'Ref Disbursed From Cash Account':i['lisa']}
    if daily: values['Current Daily Interest']=10
    insert(c,'Loans',values)
    insert(c,'Charges',{'Row ID':i['charge'],'Ref Loans':i['loan'],
        'Charge Date':today if batch in ('DEFAULT','PREPARED') else today-timedelta(days=2),
        'Principal Due':0 if batch=='PREPARED' else 100,'Interest Due':100 if batch=='CLOSE' else 10})
    if batch=='DAILY':
        payment(c,i,i['payment'],20,today-timedelta(days=2))
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        insert(c,'Charges',{'Row ID':i['later'],'Ref Loans':i['loan'],'Charge Date':today-timedelta(days=1),'Principal Due':0,'Interest Due':9})
    elif batch=='LEGACY':
        insert(c,'Repayments',{'Row ID':i['repayment'],'Ref Loans':i['loan'],'Ref Charges':i['charge'],'Payment Date':today,'Principal Paid':0,'Interest Paid':1,'Notes':'Synthetic independent legacy row'})
    elif batch=='CLOSE':
        payment(c,i,i['payment'],200,today,'Single Full')
    elif batch=='PREPARED':
        payment(c,i,i['first'],10,today,'Single Full')
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        c.execute('UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[i['loan']])
        payment(c,i,i['payment'],1,today,'Loan Close',i['loan'])
        c.execute('UPDATE public."Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"=%s',[i['loan']])
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    result=readback(c,batch)
    if any(row.get('Auto Charge Enabled') for row in result['Loans']):
        raise ValueError('Seed must not leave scheduled auto charges enabled')
    return result


def cleanup(c,batch,reviewed_inventory):
    """Exact reviewed IDs only. New GUI/scheduler IDs require new readback review."""
    i=ids(batch); before=readback(c,batch)
    actual={table:sorted(keys(before,table)) for table in before}
    if actual != {table:sorted(value) for table,value in reviewed_inventory.items()}:
        raise ValueError('Inventory changed; capture/review all new GUI IDs before cleanup')
    loans=keys(before,'Loans'); payments=keys(before,'Payments'); charges=keys(before,'Charges')
    if any(row['Ref Borrowers']!=i['borrower'] for row in before['Loans']):
        raise ValueError('Foreign loan dependency')
    if any(row['Ref Borrower']!=i['borrower'] for row in before['Payments']):
        raise ValueError('Foreign payment dependency')
    if any(row['Ref Loans'] not in loans for row in before['Charges']):
        raise ValueError('Foreign charge dependency')
    if any(row.get('Ref Payment') not in payments or row.get('Ref Charge') not in charges for row in before['Payment Allocations']):
        raise ValueError('Foreign allocation dependency')
    if any(row.get('Ref Loans') not in loans or row.get('Ref Charges') not in charges or row.get('Ref Payment') not in payments+[None] for row in before['Repayments']):
        raise ValueError('Foreign repayment dependency')
    for row in before['Business Expenses']:
        if row.get('Ref Related Loan') not in loans+[None] or row.get('Ref Related Borrower') not in [i['borrower'],None] or row.get('Ref Payee Borrower') not in [i['referrer'],i['borrower'],None]:
            raise ValueError('Foreign expense dependency')
    for row in before['Cash Ledger']:
        if row.get('Ref Payment') not in payments+[None] or row.get('Ref Loan') not in loans+[None] or row.get('Ref Business Expense') not in keys(before,'Business Expenses')+[None] or row.get('Ref Settlement') not in keys(before,'Settlements')+[None]:
            raise ValueError('Foreign cash source dependency')
        if row['Entry Origin']=='Manual' and any(row.get(field) not in [i['dad'],i['lisa'],i['lisa2'],None] for field in ('Ref From Cash Account','Ref To Cash Account')):
            raise ValueError('Manual cash crosses fixture account boundary')
    # Undo default through its source transition before touching system loss rows.
    for row in before['Loans']:
        if row.get('Defaulted'):
            c.execute('UPDATE public."Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[row['Row ID']])
    c.execute('UPDATE public."Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"=ANY(%s)',[loans])
    for table in ('Settlements','Payments','Repayments','Business Expenses','Cash Ledger','Charges','Loans','Cash Pool Contributions','Partners','Borrowers','Cash Accounts'):
        row_ids=keys(before,table)
        if table=='Repayments': row_ids=[r['Row ID'] for r in before[table] if not r.get('Ref Payment') and not r['Row ID'].startswith('df10:')]
        if table=='Business Expenses': row_ids=[r['Row ID'] for r in before[table] if r['Source Type']=='Manual']
        if table=='Cash Ledger': row_ids=[r['Row ID'] for r in before[table] if r['Entry Origin']=='Manual']
        if table=='Borrowers':
            c.execute('UPDATE public."Borrowers" SET "Ref Referrer"=NULL WHERE "Row ID"=%s',[i['borrower']])
        if table=='Cash Accounts':
            c.execute('DELETE FROM public."Cash Account Daily Analytics" WHERE "Ref Cash Account"=ANY(%s)',[row_ids])
        if row_ids:
            c.execute(sql.SQL('DELETE FROM public.{} WHERE "Row ID"=ANY(%s)').format(sql.Identifier(table)),[row_ids])
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    if any(readback(c,batch).values()):
        raise ValueError('Fixture residue remains; rollback cleanup')


def main():
    import argparse
    import hashlib
    import json
    from pathlib import Path
    import ReceiptCorrectionDev as transport
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('mode',choices=['preflight','readback','seed','cleanup'])
    p.add_argument('batch',choices=BATCHES)
    p.add_argument('--window-reference')
    p.add_argument('--containment-reference')
    p.add_argument('--state',type=Path,help='Private state JSON outside every repository; mandatory for mutation')
    p.add_argument('--inventory',type=Path,help='Fresh reviewed readback JSON; mandatory for cleanup')
    args=p.parse_args()
    write=args.mode in ('seed','cleanup')
    if write:
        if not args.state or any((parent/'.git').exists() for parent in args.state.resolve().parents):
            p.error('Mutation requires a private state path outside the repository')
        if args.mode=='seed' and args.state.exists():
            p.error('State already exists; reconcile unknown outcome before retry')
        if args.mode=='cleanup' and (not args.state.exists() or not args.inventory):
            p.error('Cleanup requires existing seed state and reviewed current inventory')
    def perform(c,params):
        setup(c,readonly=not write)
        if write:
            gate(c,args.window_reference,args.containment_reference)
            state={'batch':args.batch,'database':'loan_manager_dev','operation':args.mode,'outcome':'pending',
                   'window_reference':args.window_reference,'containment_reference':args.containment_reference}
            if args.mode=='seed':
                state['before_fingerprints']=transport.fingerprints(c)
            else:
                state['seed_state']=json.loads(args.state.read_text())
                if state['seed_state']['batch']!=args.batch:
                    raise ValueError('State belongs to another batch')
            args.state.write_text(json.dumps(state,indent=2));args.state.chmod(0o600)
            if args.mode=='seed':
                result=seed(c,args.batch)
            else:
                captured=json.loads(args.inventory.read_text())
                captured=captured.get('rows',captured)
                cleanup(c,args.batch,{t:keys(captured,t) for t in captured})
                result=readback(c,args.batch)
            state['rows']=result
            state['preflight']=preflight(c,args.batch)
            state['script_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            # Persist planned IDs before COMMIT; any error leaves pending for
            # independent readback rather than silently replaying the operation.
            args.state.write_text(json.dumps(state,indent=2,default=str))
            c.commit()
            state['outcome']='committed'
            args.state.write_text(json.dumps(state,indent=2,default=str))
            return {'batch':args.batch,'outcome':'committed','rows':result,'preflight':state['preflight']}
        result=preflight(c,args.batch) if args.mode=='preflight' else readback(c,args.batch)
        c.rollback()
        return result
    print(json.dumps(transport.dev_connection(perform),indent=2,default=str,ensure_ascii=False))


if __name__=='__main__':
    main()
