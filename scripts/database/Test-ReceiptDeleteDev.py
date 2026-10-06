"""One coordinated, rollback-only DEV V65/V67 receipt-action acceptance check.

No disposable funding, role, trigger or schema changes. Additional GUI namespaces
must still be empty; no seeded GUI source is edited/deleted by this test.
"""
import json
import uuid
from pathlib import Path
import psycopg
import ReceiptCorrectionDev as transport
import R051UiAdditionalFixtures as fixtures


def flag_checks(c,i):
    assert c.execute("SELECT NOT attnotnull FROM pg_attribute WHERE attrelid='public.\"Payments\"'::regclass AND attname='Delete Requested'").fetchone()[0]
    assert c.execute("SELECT convalidated AND pg_get_constraintdef(oid) LIKE '%IS NOT NULL%' FROM pg_constraint WHERE conrelid='public.\"Payments\"'::regclass AND conname='payment_delete_requested_present'").fetchone()[0]
    assert c.execute("SELECT pg_get_expr(adbin,adrelid)='false' FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='public.\"Payments\"'::regclass AND a.attname='Delete Requested'").fetchone()[0]
    assert c.execute('SELECT NOT "Delete Requested" FROM "Payments" WHERE "Row ID"=%s',[i['payment']]).fetchone()[0]
    def null_rejected(action):
        try:
            with c.transaction(): action()
        except psycopg.Error as e:
            assert e.sqlstate=='23514' and e.diag.constraint_name=='payment_delete_requested_present', f'Unexpected null-test error {e.sqlstate}: {e}'
        else: raise AssertionError('NULL flag accepted')
    baseline=fixtures.readback(c,'DAILY')
    null_rejected(lambda:c.execute('UPDATE "Payments" SET "Delete Requested"=NULL WHERE "Row ID"=%s',[i['payment']]))
    fields=['Row ID','Ref Borrower','Status','Amount Received','Payment Date','Allocation Method','Ref Target Charge','Ref Received By Cash Account','Delete Requested']
    from psycopg import sql
    insert=sql.SQL("INSERT INTO \"Payments\" ({}) VALUES (%s,%s,'Processing',1::money,current_date,%s,%s,%s,%s)").format(sql.SQL(',').join(map(sql.Identifier,fields)))
    null_rejected(lambda:c.execute(insert,[i['root']+'-NULL',i['borrower'],'Single Partial',i['later'],i['dad'],None]))
    copy_sql=sql.SQL('COPY "Payments" ({}) FROM STDIN').format(sql.SQL(',').join(map(sql.Identifier,fields)))
    # Fetch date before entering COPY: the connection cannot run SQL during COPY.
    date=c.execute('SELECT current_date').fetchone()[0]
    def copy_rows():
        with c.cursor().copy(copy_sql) as copy:
            for suffix,flag in [('COPY-FALSE',False),('COPY-NULL',None)]:
                copy.write_row([i['root']+'-'+suffix,i['borrower'],'Processing',1,date,'Single Partial',i['later'],i['dad'],flag])
    null_rejected(copy_rows)
    with c.transaction(force_rollback=True):
        fixtures.payment(c,i,i['root']+'-BULK',1,date,target=i['later'])
        null_rejected(lambda:c.execute('UPDATE "Payments" SET "Delete Requested"=CASE WHEN "Row ID"=%s THEN false ELSE NULL END WHERE "Row ID"=ANY(%s)',[i['payment'],[i['payment'],i['root']+'-BULK']]))
        assert c.execute('SELECT count(*)=2 AND bool_and(NOT "Delete Requested") FROM "Payments" WHERE "Row ID"=ANY(%s)',[[i['payment'],i['root']+'-BULK']]).fetchone()[0]
    assert fixtures.readback(c,'DAILY')==baseline


def reimbursement_checks(c,reject):
    root='DEV-R051-REIM67-'
    ids={k:root+k for k in ('T1','T2','LISA','E1','E2','R')}
    for table,column in [('Cash Accounts','Row ID'),('Business Expenses','Row ID'),('Cash Ledger','Row ID')]:
        from psycopg import sql
        assert c.execute(sql.SQL('SELECT count(*) FROM {} WHERE {}=ANY(%s)').format(sql.Identifier(table),sql.Identifier(column)),[list(ids.values())]).fetchone()[0]==0
    for key,holder in [('T1','ch:tommy'),('T2','ch:tommy'),('LISA','ch:lisa')]:
        fixtures.insert(c,'Cash Accounts',{'Row ID':ids[key],'Ref Cash Holder':holder,'Account Label':'Synthetic R051 reimbursement '+key,'Bank Name':'Synthetic'})
    today=c.execute('SELECT current_date').fetchone()[0]
    for key,amount,account in [('E1',20,'T1'),('E2',10,'T2')]:
        fixtures.insert(c,'Business Expenses',{'Row ID':ids[key],'Expense Date':today,'Expense Category':'Other / อื่น ๆ','Amount':amount,'Ref Paid By Cash Account':ids[account],'Ref Paid By Cash Holder':'ch:tommy'})
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    def expense():return c.execute('SELECT to_jsonb(e) FROM "Business Expenses" e WHERE "Row ID"=%s',[ids['E1']]).fetchone()[0]
    def source_cash():return c.execute('SELECT to_jsonb(l) FROM "Cash Ledger" l WHERE "Ref Business Expense"=%s AND "Entry Origin"=\'System\'',[ids['E1']]).fetchall()
    before=expense();cash=source_cash()
    c.execute('INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense") VALUES(%s,current_date,\'Expense Reimbursement\',5,\'ch:lisa\',\'ch:tommy\',%s,%s,%s)',[ids['R'],ids['LISA'],ids['T1'],ids['E1']])
    assert expense()==before and source_cash()==cash
    independent=c.execute('SELECT to_jsonb(l) FROM "Cash Ledger" l WHERE "Row ID"=%s',[ids['R']]).fetchone()[0]
    reject('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s,"Ref Paid By Cash Holder"=\'ch:lisa\' WHERE "Row ID"=%s',[ids['LISA'],ids['E1']],'Correct linked reimbursement')
    reject('UPDATE "Business Expenses" SET "Amount"=0::money WHERE "Row ID"=%s',[ids['E1']],'Correct linked reimbursement')
    c.execute('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s,"Amount"=3::money WHERE "Row ID"=%s',[ids['T2'],ids['E1']])
    assert c.execute('SELECT "Amount"=3::money AND "Ref Paid By Cash Holder"=\'ch:tommy\' FROM "Business Expenses" WHERE "Row ID"=%s',[ids['E1']]).fetchone()[0]
    assert c.execute('SELECT count(*)=1 AND min("Amount")=3 AND min("Ref From Cash Account")=%s FROM "Cash Ledger" WHERE "Ref Business Expense"=%s AND "Entry Origin"=\'System\'',[ids['T2'],ids['E1']]).fetchone()[0]
    assert c.execute('SELECT to_jsonb(l) FROM "Cash Ledger" l WHERE "Row ID"=%s',[ids['R']]).fetchone()[0]==independent
    c.execute('UPDATE "Cash Ledger" SET "Ref Business Expense"=%s WHERE "Row ID"=%s',[ids['E2'],ids['R']])
    c.execute('UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=%s,"Ref Paid By Cash Holder"=\'ch:lisa\' WHERE "Row ID"=%s',[ids['LISA'],ids['E1']])
    reject('UPDATE "Business Expenses" SET "Amount"=0::money WHERE "Row ID"=%s',[ids['E2']],'Correct linked reimbursement')
    reject('UPDATE "Cash Ledger" SET "Ref Business Expense"=%s WHERE "Row ID"=%s',[ids['E1'],ids['R']],'must have been paid by Tommy')


def run(window_reference, expected_version=65):
    if expected_version not in (65,67): raise ValueError("Only reviewed V65/V67 acceptance")
    if not window_reference:
        raise ValueError("Coordinated DEV write-window reference required")
    result={'passed':False,'database':'loan_manager_dev','expected_version':expected_version,'window_reference':window_reference,'application_name':f'r051-v{expected_version}-delete-'+uuid.uuid4().hex}
    def check(c,params):
        if c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() != {65:('65',-2087638333),67:('67',1721477385)}[expected_version]:
            raise ValueError('Expected reviewed migration version/checksum before live acceptance')
        c.execute("SET LOCAL timezone='UTC'")
        before=transport.fingerprints(c);c.rollback()
        fixtures.setup(c)
        c.execute("SELECT set_config('application_name',%s,true)",[result['application_name']])
        def reject(query,args,expected):
            try:
                with c.transaction(): c.execute(query,args)
            except psycopg.Error as error:
                if expected not in str(error): raise
            else: raise AssertionError('Expected '+expected)
        try:
            for batch in ('DAILY','CLOSE','PREPARED','DEFAULT'):
                seeded=fixtures.seed(c,batch);i=fixtures.ids(batch)
                if expected_version==67 and batch=='DAILY':
                    flag_checks(c,i)
                    result['flag_metadata_null_bulk_copy_checks']='passed'
                if batch=='DEFAULT':
                    fixtures.payment(c,i,i['payment'],1,c.execute('SELECT current_date').fetchone()[0])
                    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[i['loan']])
                    c.execute('UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"=%s WHERE "Row ID"=%s',['synthetic-r051-v65',i['loan']])
                    reject('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s',[i['payment']],'later loan default')
                    assert c.execute('SELECT NOT "Delete Requested" FROM "Payments" WHERE "Row ID"=%s',[i['payment']]).fetchone()[0]
                    continue
                reject('DELETE FROM "Payment Allocations" WHERE "Ref Payment"=%s',[i['payment']],'immutable')
                reject('UPDATE "Payments" SET "Delete Requested"=true,"Notes"=%s WHERE "Row ID"=%s',['mixed',i['payment']],'separate action')
                returning=c.execute('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s RETURNING "Row ID","Delete Requested"',[i['payment']]).fetchall()
                assert returning==[(i['payment'],True)]
                c.execute('SET CONSTRAINTS ALL IMMEDIATE')
                assert c.execute('UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=%s',[i['payment']]).rowcount==0
                for table in ('Payments','Payment Allocations','Repayments','Cash Ledger'):
                    from psycopg import sql
                    column='Row ID' if table=='Payments' else 'Ref Payment'
                    assert c.execute(sql.SQL('SELECT count(*) FROM {} WHERE {}=%s').format(sql.Identifier(table),sql.Identifier(column)),[i['payment']]).fetchone()[0]==0
                assert c.execute('SELECT "Outstanding Principal"=100 FROM "Loans" WHERE "Row ID"=%s',[i['loan']]).fetchone()[0]
                if batch=='DAILY':
                    assert c.execute('SELECT "Interest Due"::numeric=9 FROM "Charges" WHERE "Row ID"=%s',[i['later']]).fetchone()[0]
                if batch=='CLOSE':
                    assert not fixtures.readback(c,batch)['Business Expenses']
                if batch=='PREPARED':
                    assert c.execute('SELECT "Principal Due"::numeric=100 AND "Interest Due"::numeric=10 FROM "Charges" WHERE "Row ID"=%s',[i['charge']]).fetchone()[0]
                    assert c.execute('SELECT "Posted Amount"=10 FROM "Payments" WHERE "Row ID"=%s',[i['first']]).fetchone()[0]
            result['functional_checks']='passed'
            if expected_version==67:
                reimbursement_checks(c,reject)
                result['linked_reimbursement_checks']='passed'
        except Exception as error:
            import traceback
            result['error_location']=[f'{Path(frame.filename).name}:{frame.lineno}' for frame in traceback.extract_tb(error.__traceback__)]
            result['error_type']=type(error).__name__
            result['error']=str(error)
        finally:
            c.rollback()
        c.execute("SET LOCAL timezone='UTC'")
        after=transport.fingerprints(c);c.rollback()
        result['table_fingerprints_compared']=len(before)
        result['fingerprints_unchanged']=before==after
        result['passed']='error' not in result and before==after
        return result
    answer=transport.dev_connection(check)
    (transport.REPO/f'outputs/r051-receipt-corrections/dev-receipt-delete-v{expected_version}.json').write_text(json.dumps(answer,indent=2)+'\n')
    if not answer['passed']:
        raise RuntimeError('DEV receipt-delete checks failed; recorded rollback/fingerprint outcome must be reconciled')
    return answer


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--window-reference',required=True)
    p.add_argument('--expected-version',type=int,choices=(65,67),default=65)
    args=p.parse_args()
    print(json.dumps(run(args.window_reference,args.expected_version),indent=2))
