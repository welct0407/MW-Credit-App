"""Coordinated V70 DEV acceptance: unique synthetic sources, no funding, always rollback.

Importing this module never connects. CLI uses the existing pinned DEV transport;
exercise/acceptance can be called on an explicitly verified isolated local copy.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import time
import uuid
from psycopg import sql
import ReceiptCorrectionDev as transport

spec=importlib.util.spec_from_file_location('daily_dev',Path(__file__).with_name('Test-DailyTypeConversionDev.py'))
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
PINS={69:245428688,70:124258995}


def verify(c,version):
    if c.execute('SELECT current_database(),session_user').fetchone()!=('loan_manager_dev','postgres'):
        raise ValueError('DEV identity mismatch')
    if c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()!=(str(version),PINS[version]):
        raise ValueError('Expected exact reviewed version/checksum')


def preflight(c,version,compare_to=None):
    common.setup(c,'r051-v70-preflight',readonly=True);verify(c,version)
    baseline=transport.fingerprints(c)
    state=c.execute('''SELECT "Auto Charge Enabled","Interest Payment Interval","Defaulted","Outstanding Principal","Current Daily Interest"::numeric FROM "Loans" WHERE "Row ID"='SYN-R051-UI-DEFAULT' ''').fetchone()
    charge=c.execute('''SELECT "Row ID","Charge Date"::text,"Principal Due"::numeric,"Interest Due"::numeric,"Amount Remaining","Notes" FROM "Charges" WHERE "Ref Loans"='SYN-R051-UI-DEFAULT' ORDER BY "Row ID"''').fetchall()
    seventh={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        query=sql.SQL("SELECT count(*) FROM {}.{} t WHERE row_to_json(t)::text LIKE %s").format(sql.Identifier(schema),sql.Identifier(table))
        count=c.execute(query,['%SYN-R051-UI-REIMBURSE-%']).fetchone()[0]
        if count:seventh[schema+'.'+table]=count
    result=dict(database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',version=version,checksum=PINS[version],read_only=True,
        snapshot_at=str(c.execute('SELECT transaction_timestamp()').fetchone()[0]),
        all_table_fingerprints=baseline,fixture_fingerprints=common.fixture_fingerprints(c),
        default_fixture_expected=state==(False,1,False,100,10),
        default_original_charge_only=len(charge)==1 and charge[0][0]=='SYN-R051-UI-DEFAULT-C' and charge[0][2:]==(100,10,110,None),
        default_loss_rows=c.execute("""SELECT (SELECT count(*) FROM "Charges" WHERE "Row ID"='df10:19:SYN-R051-UI-DEFAULT'),(SELECT count(*) FROM "Repayments" WHERE "Row ID"='df10:19:SYN-R051-UI-DEFAULT')""").fetchone(),
        daily_receipt_absent=not c.execute('SELECT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"=\'SYN-R051-UI-DAILY-P\')').fetchone()[0],
        seventh_absent=not seventh,seventh_rows_by_table=seventh,
        other_active_or_open_sessions=c.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state IN ('active','idle in transaction','idle in transaction (aborted)')").fetchone()[0])
    if compare_to is not None:
        result['all26_match_acceptance_baseline']=baseline==compare_to['baseline_fingerprints']
        result['fixtures_match_acceptance_baseline']=result['fixture_fingerprints']==compare_to['baseline_fixture_fingerprints']
    result['ready']=not any(result['default_loss_rows']) and all(result[k] for k in ('default_fixture_expected','default_original_charge_only','daily_receipt_absent','seventh_absent')) and result['other_active_or_open_sessions']==0 and result.get('all26_match_acceptance_baseline',True) and result.get('fixtures_match_acceptance_baseline',True)
    c.rollback();return result


def exercise(c,prefix):
    assert prefix.startswith('DEV-R051-REPAY70-') and prefix.replace('-','').isalnum()
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET CONSTRAINTS ALL IMMEDIATE")
    c.execute('''CREATE OR REPLACE FUNCTION pg_temp.repay70_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
    RAISE EXCEPTION 'Expected rejection: %',expected; END $$''')
    account=prefix+'A';borrower=prefix+'B';loan=prefix+'L';other=prefix+'O';charge=prefix+'C';othercharge=prefix+'OC';repayment=prefix+'R';otherrepayment=prefix+'OR'
    c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES(%s,\'ch:lisa\',%s,\'Synthetic\')',[account,'Synthetic '+prefix])
    c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES(%s,\'Synthetic repayment guard acceptance\')',[borrower])
    for key in (loan,other):
        c.execute('''INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval","Defaulted") VALUES(%s,%s,%s,current_date-2,10::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,1::money,1,false)''',[key,borrower,account])
    for key,parent in ((charge,loan),(othercharge,other)):
        c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(%s,%s,current_date-1,10::money,1::money,\'Original evidence\')',[key,parent])
    for key,parent,ch,principal in ((repayment,loan,charge,2),(otherrepayment,other,othercharge,0)):
        c.execute('INSERT INTO "Repayments"("Row ID","Ref Loans","Ref Charges","Payment Date","Principal Paid","Interest Paid","Notes") VALUES(%s,%s,%s,current_date-1,%s::numeric::money,0::money,\'Original repayment\')',[key,parent,ch,principal])
    def source():
        result={}
        for table,field,keys in [('Loans','Row ID',[loan,other]),('Charges','Ref Loans',[loan,other]),('Repayments','Ref Loans',[loan,other])]:
            result[table]=c.execute(sql.SQL('SELECT to_jsonb(t) FROM {} t WHERE {}=ANY(%s) ORDER BY "Row ID"').format(sql.Identifier(table),sql.Identifier(field)),[keys]).fetchall()
        return result
    original=source();cash_before=transport.fingerprints(c)['public.Cash Ledger']
    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[loan])
    c.execute('UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"=\'synthetic@example.invalid\' WHERE "Row ID"=%s',[loan])
    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"=%s',[loan])
    loss=f'df10:{len(loan)}:{loan}';closed=source()
    assert c.execute('SELECT "Defaulted","Auto Charge Enabled","Outstanding Principal","Default Loss Amount"::numeric FROM "Loans" WHERE "Row ID"=%s',[loan]).fetchone()==(True,False,0,8)
    assert c.execute('SELECT "Principal Paid"::numeric,"Interest Paid"::numeric,"Created By" FROM "Repayments" WHERE "Row ID"=%s',[loss]).fetchone()==(8,-8,'synthetic@example.invalid')
    assert c.execute('SELECT "Notes" FROM "Charges" WHERE "Row ID"=%s',[loss]).fetchone()[0]=='Loan default - outstanding principal recorded as loss; zero cash'
    def reject(statement,expected='Undo Default'):
        c.execute('SELECT pg_temp.repay70_reject(%s,%s)',[statement.as_string(c),expected])
        assert source()==closed
    reject(sql.SQL('DELETE FROM "Repayments" WHERE "Row ID"={}').format(sql.Literal(repayment)))
    for field,value in [('Principal Paid',1),('Notes','tamper'),('Ref Loans',other),('Ref Charges',othercharge),('Row ID',prefix+'RENAMED')]:
        reject(sql.SQL('UPDATE "Repayments" SET {}={} WHERE "Row ID"={}').format(sql.Identifier(field),sql.Literal(value),sql.Literal(repayment)))
    for field,value in [('Ref Loans',loan),('Ref Charges',charge)]:
        reject(sql.SQL('UPDATE "Repayments" SET {}={} WHERE "Row ID"={}').format(sql.Identifier(field),sql.Literal(value),sql.Literal(otherrepayment)))
    reject(sql.SQL('DELETE FROM "Loans" WHERE "Row ID"={}').format(sql.Literal(loan)))
    reject(sql.SQL('DELETE FROM "Charges" WHERE "Row ID"={}').format(sql.Literal(charge)),'receipts')
    reject(sql.SQL('DELETE FROM "Repayments" WHERE "Row ID"={}').format(sql.Literal(loss)),'immutable')
    assert transport.fingerprints(c)['public.Cash Ledger']==cash_before
    c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[loan])
    assert source()==original
    assert transport.fingerprints(c)['public.Cash Ledger']==cash_before
    c.execute('UPDATE "Repayments" SET "Notes"=\'ordinary correction\',"Principal Paid"=3::money WHERE "Row ID"=%s',[repayment])
    c.execute('UPDATE "Repayments" SET "Ref Loans"=%s,"Ref Charges"=%s WHERE "Row ID"=%s',[other,othercharge,repayment])
    assert c.execute('SELECT "Outstanding Principal" FROM "Loans" WHERE "Row ID"=%s',[loan]).fetchone()[0]==10
    assert c.execute('SELECT "Outstanding Principal" FROM "Loans" WHERE "Row ID"=%s',[other]).fetchone()[0]==7
    c.execute('DELETE FROM "Repayments" WHERE "Row ID"=%s',[repayment])
    c.execute('DELETE FROM "Charges" WHERE "Row ID"=%s',[charge])
    c.execute('DELETE FROM "Loans" WHERE "Row ID"=%s',[loan])


def acceptance(c,appname):
    common.setup(c,appname,readonly=True)
    before=transport.fingerprints(c);fixtures=common.fixture_fingerprints(c);c.rollback()
    result=dict(passed=False,table_fingerprints_compared=len(before),application_name=appname,baseline_fingerprints=before,baseline_fixture_fingerprints=fixtures)
    prefix='DEV-R051-REPAY70-'+uuid.uuid4().hex[:10]+'-';started=time.monotonic()
    try:
        common.setup(c,appname);exercise(c,prefix);c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        result['functional_checks']='passed'
    except Exception as error:
        result.update(error_type=type(error).__name__,error_sqlstate=getattr(error,'sqlstate',None),error=str(error).splitlines()[0] if str(error) else type(error).__name__)
    finally:c.rollback()
    common.setup(c,appname,readonly=True)
    result['fingerprints_unchanged']=transport.fingerprints(c)==before
    result['original_and_six_fixture_fingerprints_unchanged']=common.fixture_fingerprints(c)==fixtures
    result['synthetic_rows_remaining']=c.execute('SELECT count(*) FROM "Borrowers" WHERE "Row ID" LIKE %s',[prefix+'%']).fetchone()[0]
    result['other_owned_sessions']=c.execute('SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name=%s AND pid<>pg_backend_pid()',[appname]).fetchone()[0]
    result['elapsed_seconds']=round(time.monotonic()-started,3)
    result['passed']='error' not in result and result['fingerprints_unchanged'] and result['original_and_six_fixture_fingerprints_unchanged'] and not result['synthetic_rows_remaining'] and not result['other_owned_sessions']
    c.rollback();return result


def run(mode,version,window_reference=None,compare_to=None):
    if mode not in ('preflight','acceptance') or version not in PINS:raise ValueError('Unsupported mode/version')
    if mode=='acceptance' and (version!=70 or not window_reference):raise ValueError('Reviewed V70 and coordinated window required')
    baseline=json.loads(Path(compare_to).read_text()) if compare_to else None
    if baseline and (not baseline['passed'] or baseline['version']!=70):raise ValueError('Expected successful V70 acceptance baseline')
    def callback(c,params):
        if mode=='preflight':return preflight(c,version,baseline)
        state=preflight(c,version)
        if not state['ready']:raise ValueError('GUI fixture/session preflight changed; reconcile before acceptance')
        result=acceptance(c,'r051-v70-acceptance-'+uuid.uuid4().hex)
        result.update(database='loan_manager_dev',version=70,checksum=PINS[70],window_reference=window_reference)
        return result
    result=transport.dev_connection(callback)
    name=f'dev-default-repayment-preflight-v{version}.json' if mode=='preflight' else 'dev-default-repayment-v70.json'
    (transport.REPO/'outputs/r051-receipt-corrections'/name).write_text(json.dumps(result,indent=2)+'\n')
    if not result.get('passed',result.get('ready',False)):raise RuntimeError('Preflight/acceptance failed; evidence recorded, reconcile without replay')
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['preflight','acceptance']);p.add_argument('--expected-version',type=int,choices=[69,70],required=True);p.add_argument('--window-reference');p.add_argument('--compare-to')
    a=p.parse_args();print(json.dumps(run(a.mode,a.expected_version,a.window_reference,a.compare_to),indent=2))
