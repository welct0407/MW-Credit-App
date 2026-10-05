"""Bounded, rollback-only R051 diagnostic; not a migration or business endpoint.

Generate fresh/late transactions from the reviewed broad suite. Local mode uses
an explicitly supplied disposable PG connection. DEV execution requires the
coordinator's exclusive-window reference and verifies the existing exact target.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import signal
import subprocess
import tempfile
import time
import ReceiptCorrectionDev as dev

MEASURE = r'''
CREATE FUNCTION pg_temp.measure_contribution(mode text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE started timestamptz:=clock_timestamp(); result json; detail text;
BEGIN
 PERFORM set_config('plan_cache_mode',mode,true);
 BEGIN
  EXECUTE $q$EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) INSERT INTO "Cash Pool Contributions"
   ("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount")
   VALUES('CRUD60-EXTRA','CRUD60-A',current_date-15,'Contribution',100::money)$q$ INTO result;
  RAISE NOTICE 'R051_MEASURE %',jsonb_build_object('mode',mode,'elapsed_ms',extract(epoch FROM clock_timestamp()-started)*1000,
   'execution_ms',result->0->'Execution Time','planning_ms',result->0->'Planning Time','triggers',result->0->'Triggers');
 EXCEPTION WHEN query_canceled OR lock_not_available THEN
  GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_CONTEXT;
  RAISE NOTICE 'R051_MEASURE %',jsonb_build_object('mode',mode,'elapsed_ms',extract(epoch FROM clock_timestamp()-started)*1000,'sqlstate',SQLSTATE,'error',SQLERRM,'context',detail);
 END;
END $$;
SAVEPOINT measurement;
SELECT pg_temp.measure_contribution('auto');
ROLLBACK TO measurement;
SELECT pg_temp.measure_contribution('force_generic_plan');
ROLLBACK TO measurement;
ROLLBACK;
'''


def build():
    source=(dev.REPO/'scripts/database/Test-BusinessCrud.sql').read_text()
    source=source.replace("SET LOCAL plan_cache_mode='auto';","SET LOCAL plan_cache_mode='force_generic_plan';",1)
    marker='INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES(\'CRUD60-EXTRA\''
    late=source[:source.index(marker)]
    # Same final source state as the late prefix: deleted intermediate expenses,
    # settlements, movements and unused parents are absent in this fresh setup.
    fresh=source[:source.index('INSERT INTO "Loans"')]
    fresh=fresh.replace("10000::money),('CRUD60-CB'", "30000::money),('CRUD60-CB'")
    fresh+='''
DELETE FROM "Borrowers" WHERE "Row ID"='CRUD60-X';
INSERT INTO "Loans"("Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled")
 VALUES('CI-LISA','CRUD60-L','CRUD60-B',current_date-10,1000::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false);
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due")
 VALUES('CRUD60-C','CRUD60-L',current_date-5,1000::money,1000::money);
INSERT INTO "Payments"("Row ID","Ref Borrower","Status","Amount Received","Payment Date","Allocation Method","Ref Target Charge","Ref Received By Cash Account")
 VALUES('CRUD60-P','CRUD60-B','Processing',1000::money,current_date,'Single Partial','CRUD60-C','CI-DAD');
SET CONSTRAINTS ALL IMMEDIATE;
'''
    fixture='''INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES
 ('DEV-R051-PROFILE-DAD','ch:dad','Synthetic R051 profile','Synthetic'),
 ('DEV-R051-PROFILE-LISA','ch:lisa','Synthetic R051 profile','Synthetic');'''
    answer={}
    for name,text in [('fresh',fresh),('late',late)]:
        text=text.replace('\\ir Test-CashAccountFixtures.sql',fixture).replace('CI-DAD','DEV-R051-PROFILE-DAD').replace('CI-LISA','DEV-R051-PROFILE-LISA')
        # Preserve the original late prefix's forced-generic stress setting.
        # Measure both modes from identical source state using savepoint rollback.
        text='\\timing on\nSELECT pg_backend_pid() AS owned_backend_pid;\n'+text.replace('BEGIN;',"BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s';",1)+MEASURE
        if 'COMMIT;' in text.upper() or 'DISABLE TRIGGER' in text.upper() or '\\ir' in text or not text.rstrip().endswith('ROLLBACK;'):
            raise ValueError('Unsafe diagnostic SQL')
        answer[name]=text
    return answer


def execute(c,params,window):
    if c.execute('SELECT current_database(),session_user').fetchone()!=('loan_manager_dev','postgres'):
        raise ValueError('DEV identity changed')
    if c.execute('SELECT max(version::integer) FROM flyway_schema_history WHERE success').fetchone()[0]!=63:
        raise ValueError('Expected immutable V63')
    c.execute("SET LOCAL timezone='UTC'");before=dev.fingerprints(c);c.rollback()
    root=Path(tempfile.mkdtemp(prefix='r051-contribution-diagnostic-',dir='/workspace'));root.chmod(0o700)
    env={k:v for k,v in os.environ.items() if not k.startswith(('PG','CODEX_','FLYWAY_'))};env['PGPASSWORD']=params['password']
    results={};appnames=[]
    try:
        for name,sql in build().items():
            appname='r051-contrib-'+root.name[-8:]+'-'+name;appnames.append(appname);env['PGAPPNAME']=appname
            with (root/(name+'.log')).open('w') as log:
                p=subprocess.Popen([str(dev.PG/'psql'),'-X','-v','ON_ERROR_STOP=1','-h',params['host'],'-p',str(params['port']),'-U','postgres','-d','loan_manager_dev'],stdin=subprocess.PIPE,env=env,stdout=log,stderr=log,text=True,start_new_session=True)
                try:
                    p.communicate(sql,timeout=240)
                    if p.returncode:raise RuntimeError('Diagnostic SQL failed: '+name)
                finally:
                    if p.poll() is None:
                        os.killpg(p.pid,signal.SIGTERM)
                        try:p.communicate(timeout=5)
                        except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.communicate()
            results[name]=[json.loads(line.split('R051_MEASURE ',1)[1]) for line in (root/(name+'.log')).read_text().splitlines() if 'NOTICE:  R051_MEASURE ' in line]
    finally:
        c.rollback()
        owned=c.execute('SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name=ANY(%s)',(appnames,)).fetchall()
        for (pid,) in owned:c.execute('SELECT pg_terminate_backend(%s)',(pid,))
        c.commit()
        for attempt in range(10):
            remaining=c.execute('SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND application_name=ANY(%s)',(appnames,)).fetchall();c.rollback()
            if not remaining:break
            time.sleep(.5)
        c.execute("SET LOCAL timezone='UTC'");after=dev.fingerprints(c);c.rollback()
        reconciliation=dict(remaining_owned_sessions=remaining,all_26_table_fingerprints_unchanged=before==after)
        (root/'reconciliation.json').write_text(json.dumps(reconciliation,indent=2)+'\n')
        if remaining or before!=after:raise RuntimeError('Diagnostic cleanup mismatch; reconcile before any retry')
    result=dict(version=63,window_reference=window,script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),private_reference=root.name,measurements=results,**reconciliation)
    (dev.REPO/'outputs/r051-receipt-corrections/contribution-diagnostic.json').write_text(json.dumps(result,indent=2)+'\n')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--write-local-sql',type=Path);parser.add_argument('--dev-window-reference');args=parser.parse_args()
    if args.write_local_sql:
        args.write_local_sql.mkdir(parents=True,exist_ok=True)
        for name,sql in build().items():(args.write_local_sql/(name+'.sql')).write_text(sql)
        print('Generated two rollback-only local rehearsal files')
    elif args.dev_window_reference:print(json.dumps(dev.dev_connection(lambda c,p:execute(c,p,args.dev_window_reference))))
    else:parser.error('Choose local generation or an explicitly coordinated DEV window')
