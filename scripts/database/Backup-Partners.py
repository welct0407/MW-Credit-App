"""Private DEV/PROD backup and restore proof for additive borrower page providers."""
import argparse, hashlib, json, os, socket, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg import sql

parser=argparse.ArgumentParser()
parser.add_argument('--environment',choices=['development','production'],required=True)
parser.add_argument('--release',default='r044-partners')
parser.add_argument('--baseline',type=int,choices=[46],default=None)
parser.add_argument('--candidate',choices=['reporting_partner_position_v1'],default='reporting_partner_position_v1')

args=parser.parse_args()
repo=Path(__file__).resolve().parents[2]
assert args.release == 'r044-partners'
private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project')/args.release
private.mkdir(parents=True,exist_ok=True)
out=repo/'outputs'/args.release;out.mkdir(parents=True,exist_ok=True)
target=json.loads((repo/'database/environments.json').read_text())[args.environment]
expected='loan_manager_dev' if args.environment=='development' else 'loan_manager_prod'
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
bin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
password=Path(target['passwordFile']).read_text().strip()
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
folder=private/(args.environment+'-'+stamp);folder.mkdir()
dump=folder/'before.dump'
def fingerprint(c):
    result={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2").fetchall():
        q=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count,digest=c.execute(q).fetchone();result[schema+'.'+table]={'count':count,'digest':digest}
    return result
env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require')
with psycopg.connect(host=target['host'],port=target['port'],dbname=expected,user=target['user'],password=password,sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL timezone='UTC'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(expected,target['host'])
    version=c.execute('SELECT max(version::integer) FROM flyway_schema_history WHERE success').fetchone()[0]
    assert version in ([args.baseline] if args.baseline else [46]),'Unexpected baseline'
    assert c.execute('SELECT to_regclass(%s)',('public.'+args.candidate,)).fetchone()[0] is None, 'Candidate already present'
    baseline=fingerprint(c)
    snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
    with (folder/'dump.stderr').open('wb') as err:
        subprocess.run([str(bin/'pg_dump.exe'),'-h',target['host'],'-p',str(target['port']),'-U',target['user'],'-d',expected,
          '-Fc','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--schema=agent_audit',
          '--snapshot='+snapshot,'--file='+str(dump)],env=env,stdout=subprocess.DEVNULL,stderr=err,check=True)
    (folder/'fingerprints.json').write_text(json.dumps(baseline,indent=2))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
data=folder/'restore-data'
startup=dict(creationflags=subprocess.CREATE_NO_WINDOW) if os.name=='nt' else {}
def run(arguments,log):
    with (folder/log).open('wb') as f:subprocess.run(arguments,stdout=f,stderr=subprocess.STDOUT,check=True,**startup)
run([str(bin/'initdb.exe'),'-D',str(data),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],'initdb.log')
started=False
try:
    run([str(bin/'pg_ctl.exe'),'-D',str(data),'-l',str(folder/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'start.log');started=True
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==data.resolve()
        c.execute('DROP SCHEMA public') # only this newly created empty loopback server
    run([str(bin/'pg_restore.exe'),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error',str(dump)],'restore.log')
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres') as c:
        c.execute("SET LOCAL timezone='UTC'")
        assert fingerprint(c)==baseline,'Restore row fingerprints differ'
        c.rollback() # verified restore preserved; no candidate execution in backup tool
    evidence={'environment':args.environment,'database':expected,'instance':target['instance'],'at':stamp,
      'backup_file':str(dump),'backup_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),
      'baseline_version':version,'table_count':len(baseline),'restore_fingerprints_match':True,
      'candidate_already_present':False,'candidate_rehearsed':False,
      'scope':'public, assessment_lab, agent_audit; instance roles/settings/cron remain external',
      'financial_values_published':False}
    (out/(args.environment+'-backup.json')).write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
finally:
    if started:run([str(bin/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],'stop.log')
