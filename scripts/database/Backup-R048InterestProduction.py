"""R048 PROD V52-only private backup, restore verification and rate-backfill rehearsal."""
import hashlib, json, os, socket, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql

repo=Path(__file__).resolve().parents[2]
target=json.loads((repo/'database/environments.json').read_text())['production']
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_prod')
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
folder=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r048-loan-interest-production')/stamp
folder.mkdir(parents=True,exist_ok=False)
out=repo/'outputs/r048-loan-interest-production';out.mkdir(parents=True,exist_ok=True)
pgbin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
password=Path(target['passwordFile']).read_text().strip()
env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require')
dump=folder/'production-before.dump'
startup=dict(creationflags=subprocess.CREATE_NO_WINDOW) if os.name=='nt' else {}

def fingerprint(c):
    result={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        query=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'Original Daily Interest Rate')::text),'' ORDER BY md5((to_jsonb(t)-'Original Daily Interest Rate')::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count,digest=c.execute(query).fetchone();result[schema+'.'+table]={'count':count,'digest':digest}
    return result

def run(arguments,log,runenv=None):
    with (folder/log).open('wb') as f:
        subprocess.run(arguments,stdout=f,stderr=subprocess.STDOUT,env=runenv,check=True,**startup)

with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],user=target['user'],password=password,sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL timezone='UTC'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(target['database'],target['host'])
    assert c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]==52
    baseline=fingerprint(c)
    snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
    run([str(pgbin/'pg_dump.exe'),'-h',target['host'],'-p',str(target['port']),'-U',target['user'],'-d',target['database'],
         '-Fc','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--schema=agent_audit',
         '--snapshot='+snapshot,'--file='+str(dump)],'dump.log',env)
    (folder/'fingerprints.json').write_text(json.dumps(baseline,indent=2))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
data=folder/'restore-data'
run([str(pgbin/'initdb.exe'),'-D',str(data),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],'initdb.log')
started=False
try:
    run([str(pgbin/'pg_ctl.exe'),'-D',str(data),'-l',str(folder/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'start.log');started=True
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==data.resolve()
        c.execute('DROP SCHEMA public') # Newly created empty disposable database only.
    run([str(pgbin/'pg_restore.exe'),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error',str(dump)],'restore.log')
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres') as c:
        c.execute("SET LOCAL timezone='UTC'")
        assert fingerprint(c)==baseline,'Restored fingerprints differ'
        migration=repo/'database/migrations/V53__original_daily_interest_rate.sql'
        c.execute(migration.read_text(encoding='utf-8'))
        after=fingerprint(c)
        assert all(after[k]==v for k,v in baseline.items() if k.startswith('public.')),'Migration changed existing public values'
        coverage=c.execute('SELECT count(*), count("Original Daily Interest Rate") FROM public."Loans"').fetchone()

        catalog_queries={
          'routines': "SELECT proname,pg_get_function_identity_arguments(oid),pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('vc_loan_row','apply_principal_daily_interest','original_daily_interest_rate','forecast_schedule_v1') ORDER BY 1,2",
          'views': "SELECT viewname,definition FROM pg_views WHERE schemaname='public' AND viewname IN ('olap_loans_analytics','reporting_forecast_inputs_v1') ORDER BY 1",
          'columns': "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Loans','olap_loans_analytics','reporting_forecast_inputs_v1') ORDER BY 1,ordinal_position"}
        def catalog(connection):
            return {k:[tuple(v.replace('\r\n','\n') if isinstance(v,str) else v for v in row) for row in connection.execute(q)] for k,q in catalog_queries.items()}
        restored_catalog=catalog(c)
        dev=json.loads((repo/'database/environments.json').read_text())['development']
        assert (dev['instance'],dev['host'],dev['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
        with psycopg.connect(host=dev['host'],port=dev['port'],dbname=dev['database'],user=dev['user'],password=Path(dev['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on') as dc:
            assert dc.execute('SELECT current_database()').fetchone()[0]=='loan_manager_dev'
            tested_catalog=catalog(dc)
        (folder/'affected-schema-comparison.json').write_text(json.dumps({'restored_production_after_v53':restored_catalog,'tested_development':tested_catalog},ensure_ascii=False,indent=2),encoding='utf8')
        assert restored_catalog==tested_catalog,'Affected PROD definitions after rehearsal differ from tested DEV'
        exceptions=c.execute('SELECT "Row ID","Loan Type","Due Date" IS NULL AS missing_due,"Fixed Interest" IS NULL AS missing_fixed FROM public."Loans" WHERE "Original Daily Interest Rate" IS NULL').fetchall()
        (folder/'exceptions-private.json').write_text(json.dumps(exceptions,ensure_ascii=False,indent=2),encoding='utf8')

        c.rollback()
    evidence={'at':stamp,'environment':'production','instance':target['instance'],'database':target['database'],
              'baseline_version':52,'backup_file':str(dump),'backup_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),
              'restored_fingerprints_match':True,'migration_rehearsed':53,'existing_public_values_unchanged':True,'coverage':list(coverage),
              'migration_sha256':hashlib.sha256(migration.read_bytes()).hexdigest(),
              'affected_post_migration_schema_matches_tested_dev':True,
              'scope':'public, assessment_lab, agent_audit; instance settings/roles external'}
    (out/'production-backup.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
finally:
    if started:run([str(pgbin/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],'stop.log')
