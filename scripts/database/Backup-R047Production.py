"""R047 production read-only backup, disposable restore and V51/V52 rehearsal."""
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
folder=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r047-production')/stamp
folder.mkdir(parents=True,exist_ok=False)
out=repo/'outputs/r047-production';out.mkdir(parents=True,exist_ok=True)
pgbin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
password=Path(target['passwordFile']).read_text().strip()
env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require')
dump=folder/'production-before.dump'
startup=dict(creationflags=subprocess.CREATE_NO_WINDOW) if os.name=='nt' else {}

def fingerprint(c):
    result={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        query=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'Selected Charge IDs'-'Uploaded Receipt'-'Uploaded Receipt At')::text),'' ORDER BY md5((to_jsonb(t)-'Selected Charge IDs'-'Uploaded Receipt'-'Uploaded Receipt At')::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count,digest=c.execute(query).fetchone();result[schema+'.'+table]={'count':count,'digest':digest}
    return result

def run(arguments,log,runenv=None):
    with (folder/log).open('wb') as f:
        subprocess.run(arguments,stdout=f,stderr=subprocess.STDOUT,env=runenv,check=True,**startup)

with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],user=target['user'],password=password,sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL timezone='UTC'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(target['database'],target['host'])
    assert c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]==50
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
        migrations=[repo/'database/migrations/V51__selected_charge_receiving.sql',repo/'database/migrations/V52__manual_payment_receipt_upload.sql']
        for migration in migrations:c.execute(migration.read_text(encoding='utf-8'))
        assert fingerprint(c)==baseline,'Migration changed existing rows'
        c.rollback()
    evidence={'at':stamp,'environment':'production','instance':target['instance'],'database':target['database'],
              'baseline_version':50,'backup_file':str(dump),'backup_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),
              'restored_fingerprints_match':True,'migrations_rehearsed':[51,52],'all_existing_rows_unchanged':True,
              'migration_sha256':{m.name:hashlib.sha256(m.read_bytes()).hexdigest() for m in migrations},
              'scope':'public, assessment_lab, agent_audit; instance settings/roles external'}
    (out/'production-backup.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
finally:
    if started:run([str(pgbin/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],'stop.log')
