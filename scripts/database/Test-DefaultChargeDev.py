"""Coordinated DEV V69 guard acceptance: synthetic, no funding, always rollback."""
import argparse
import importlib.util
import json
from pathlib import Path
import time
import uuid
import ReceiptCorrectionDev as transport

spec=importlib.util.spec_from_file_location('daily_dev',Path(__file__).with_name('Test-DailyTypeConversionDev.py'))
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
PINS={68:-79096429,69:245428688}


def verify(c,version):
    assert c.execute('SELECT current_database(),session_user').fetchone()==('loan_manager_dev','postgres')
    assert c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==(str(version),PINS[version])


def preflight(c,version):
    common.setup(c,'r051-v69-preflight',readonly=True);verify(c,version)
    state=c.execute('''SELECT "Auto Charge Enabled","Interest Payment Interval","Defaulted","Outstanding Principal","Current Daily Interest"::numeric FROM "Loans" WHERE "Row ID"='SYN-R051-UI-DEFAULT' ''').fetchone()
    result=dict(database='loan_manager_dev',instance='appsheet-pg-prod-20260914',host='34.21.174.215',version=version,checksum=PINS[version],read_only=True,
        snapshot_at=str(c.execute('SELECT transaction_timestamp()').fetchone()[0]),
        default_fixture_expected=state==(False,1,False,100,10),
        daily_receipt_absent=not c.execute('SELECT EXISTS(SELECT 1 FROM "Payments" WHERE "Row ID"=\'SYN-R051-UI-DAILY-P\')').fetchone()[0],
        seventh_absent=not c.execute('SELECT EXISTS(SELECT 1 FROM "Cash Accounts" WHERE "Row ID" LIKE \'SYN-R051-UI-REIMBURSE-%\')').fetchone()[0],
        fixture_fingerprints=common.fixture_fingerprints(c))
    result['other_active_or_open_sessions']=c.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state IN ('active','idle in transaction','idle in transaction (aborted)')").fetchone()[0]
    result['default_fixture']=dict(zip(['auto_charge_enabled','interest_payment_interval','defaulted','outstanding_principal','current_daily_interest'],[str(v) if v is not None and not isinstance(v,(bool,int)) else v for v in state])) if state else None
    charge=c.execute('''SELECT "Row ID","Charge Date"::text,"Principal Due"::numeric,"Interest Due"::numeric,"Amount Remaining","Notes" FROM "Charges" WHERE "Ref Loans"='SYN-R051-UI-DEFAULT' ORDER BY "Row ID"''').fetchall()
    result['default_charge_rows']=[[str(v) if v is not None and not isinstance(v,(bool,int,str)) else v for v in row] for row in charge]
    result['default_original_charge_only']=len(charge)==1 and charge[0][0]=='SYN-R051-UI-DEFAULT-C' and charge[0][2:]==(100,10,110,None)
    result['default_loss_rows']=c.execute("""SELECT (SELECT count(*) FROM "Charges" WHERE "Row ID"='df10:19:SYN-R051-UI-DEFAULT'),(SELECT count(*) FROM "Repayments" WHERE "Row ID"='df10:19:SYN-R051-UI-DEFAULT')""").fetchone()
    result['ready']=not any(result['default_loss_rows']) and all(result[k] for k in ('default_fixture_expected','default_original_charge_only','daily_receipt_absent','seventh_absent')) and result['other_active_or_open_sessions']==0
    c.rollback();return result


def exercise(c,prefix):
    """Same callable for isolated local rehearsal and pinned DEV; no commits."""
    assert prefix.startswith('DEV-R051-GUARD69-') and prefix.replace('-','').isalnum()
    c.execute("SET LOCAL timezone='Asia/Bangkok'; SET CONSTRAINTS ALL IMMEDIATE")
    c.execute('''CREATE OR REPLACE FUNCTION pg_temp.guard69_reject(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF position(expected in SQLERRM)=0 THEN RAISE; END IF; RETURN; END;
    RAISE EXCEPTION 'Expected rejection: %',expected; END $$''')
    account=prefix+'A';borrower=prefix+'B';loan=prefix+'L';other=prefix+'O';charge=prefix+'C';othercharge=prefix+'OC'
    c.execute('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES(%s,\'ch:lisa\',\'Synthetic guard acceptance\',\'Synthetic\')',[account])
    c.execute('INSERT INTO "Borrowers"("Row ID","Borrower Name") VALUES(%s,\'Synthetic guard acceptance\')',[borrower])
    for key in (loan,other):
        c.execute('''INSERT INTO "Loans"("Row ID","Ref Borrowers","Ref Disbursed From Cash Account","Loan Date","Principal Amount","Loan Type","Loan Status","Auto Charge Enabled","Current Daily Interest","Interest Payment Interval")
        VALUES(%s,%s,%s,current_date-1,10::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',false,1::money,1)''',[key,borrower,account])
    for key,parent in ((charge,loan),(othercharge,other)):
        c.execute('INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES(%s,%s,current_date,10::money,1::money,\'Original evidence\')',[key,parent])
    original=c.execute('SELECT to_jsonb(c) FROM "Charges" c WHERE "Row ID"=%s',[charge]).fetchone()[0]
    cash=c.execute('SELECT to_jsonb(l) FROM "Cash Ledger" l WHERE "Ref Loan"=ANY(%s) ORDER BY "Row ID"',[[loan,other]]).fetchall()
    c.execute('UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"=%s',[loan])
    c.execute('UPDATE "Loans" SET "Defaulted"=true,"Close Date"=current_date,"Closed By"=\'synthetic@example.invalid\' WHERE "Row ID"=%s',[loan])
    loss=f'df10:{len(loan)}:{loan}'
    assert c.execute('SELECT "Principal Due"::numeric,"Interest Due"::numeric FROM "Charges" WHERE "Row ID"=%s',[charge]).fetchone()==(0,0)
    assert c.execute('SELECT count(*) FROM "Repayments" WHERE "Row ID"=%s',[loss]).fetchone()[0]==1
    from psycopg import sql
    def reject(statement,expected='Undo Default'):
        c.execute('SELECT pg_temp.guard69_reject(%s,%s)',[statement.as_string(c),expected])
    for column,value in [('Principal Due',1),('Interest Due',1),('Notes','erase evidence')]:
        reject(sql.SQL('UPDATE "Charges" SET {}={} WHERE "Row ID"={}').format(sql.Identifier(column),sql.Literal(value),sql.Literal(charge)))
    reject(sql.SQL('DELETE FROM "Charges" WHERE "Row ID"={}').format(sql.Literal(charge)))
    reject(sql.SQL('UPDATE "Charges" SET "Ref Loans"={} WHERE "Row ID"={}').format(sql.Literal(other),sql.Literal(charge)))
    reject(sql.SQL('UPDATE "Charges" SET "Ref Loans"={} WHERE "Row ID"={}').format(sql.Literal(loan),sql.Literal(othercharge)))
    c.execute("SELECT set_config('business_crud.default',%s,true)",[loan])
    reject(sql.SQL('UPDATE "Charges" SET "Notes"=\'forged\' WHERE "Row ID"={}').format(sql.Literal(charge)))
    c.execute("SELECT set_config('business_crud.default','',true)")
    for table in ('Charges','Repayments'):
        reject(sql.SQL('UPDATE {} SET "Notes"=\'tamper\' WHERE "Row ID"={}').format(sql.Identifier(table),sql.Literal(loss)),'immutable')
    c.execute('UPDATE "Charges" SET "Amount Remaining"=999,"Total Paid"=999 WHERE "Row ID"=%s',[charge])
    assert c.execute('SELECT "Amount Remaining","Total Paid" FROM "Charges" WHERE "Row ID"=%s',[charge]).fetchone()==(0,0)
    c.execute('UPDATE "Loans" SET "Defaulted"=false WHERE "Row ID"=%s',[loan])
    assert c.execute('SELECT to_jsonb(c) FROM "Charges" c WHERE "Row ID"=%s',[charge]).fetchone()[0]==original
    assert c.execute('SELECT "Outstanding Principal","Current Daily Interest"::numeric FROM "Loans" WHERE "Row ID"=%s',[loan]).fetchone()==(10,1)
    for table in ('Charges','Repayments'):
        assert c.execute(sql.SQL('SELECT count(*) FROM {} WHERE "Row ID"=%s').format(sql.Identifier(table)),[loss]).fetchone()[0]==0
    assert c.execute('SELECT to_jsonb(l) FROM "Cash Ledger" l WHERE "Ref Loan"=ANY(%s) ORDER BY "Row ID"',[[loan,other]]).fetchall()==cash
    c.execute('UPDATE "Charges" SET "Notes"=\'ordinary correction\' WHERE "Row ID"=ANY(%s)',[[charge,othercharge]])
    c.execute('DELETE FROM "Charges" WHERE "Row ID"=%s',[charge])
    assert c.execute('SELECT count(*) FROM "Charges" WHERE "Row ID"=%s',[charge]).fetchone()[0]==0


def acceptance(c,appname):
    common.setup(c,appname,readonly=True)
    before=transport.fingerprints(c);fixtures=common.fixture_fingerprints(c);c.rollback()
    result=dict(passed=False,table_fingerprints_compared=len(before),application_name=appname)
    prefix='DEV-R051-GUARD69-'+uuid.uuid4().hex[:10]+'-';started=time.monotonic()
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


def run(mode,version,window_reference=None):
    if mode not in ('preflight','acceptance') or version not in PINS:raise ValueError('Unsupported mode/version')
    if mode=='acceptance' and (version!=69 or not window_reference):raise ValueError('Reviewed V69 and coordinated window required')
    def callback(c,params):
        if mode=='preflight':return preflight(c,version)
        state=preflight(c,version)
        if not state['ready']:raise ValueError('GUI fixture/session preflight changed; reconcile before acceptance')
        result=acceptance(c,'r051-v69-acceptance-'+uuid.uuid4().hex)
        result.update(database='loan_manager_dev',version=69,checksum=PINS[69],window_reference=window_reference)
        return result
    result=transport.dev_connection(callback)
    name=f'dev-default-charge-preflight-v{version}.json' if mode=='preflight' else 'dev-default-charge-v69.json'
    (transport.REPO/'outputs/r051-receipt-corrections'/name).write_text(json.dumps(result,indent=2)+'\n')
    if mode=='acceptance' and not result['passed']:raise RuntimeError('Guard acceptance failed; rollback evidence recorded; no replay')
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['preflight','acceptance']);p.add_argument('--expected-version',type=int,choices=[68,69],required=True);p.add_argument('--window-reference')
    a=p.parse_args();print(json.dumps(run(a.mode,a.expected_version,a.window_reference),indent=2))
