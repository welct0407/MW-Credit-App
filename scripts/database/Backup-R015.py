"""R015 private snapshot + disposable restore proof; no live business writes."""
import argparse
from datetime import datetime,timezone
import hashlib,json,os
import re
from pathlib import Path
import subprocess
import psycopg
from psycopg import sql

p=argparse.ArgumentParser();p.add_argument('--environment',choices=['development','production'],required=True)
p.add_argument('--lab-manifest',required=True);p.add_argument('--output',required=True);p.add_argument('--label',default='before');p.add_argument('--resume-existing',action='store_true');a=p.parse_args()
assert re.fullmatch(r'[a-z0-9-]{1,30}',a.label)
repo=Path(__file__).resolve().parents[2]
target=json.loads((repo/'database/environments.json').read_text())[a.environment]
expected='loan_manager_dev' if a.environment=='development' else 'loan_manager_prod'
assert (target['host'],target['instance'],target['database'])==('34.21.174.215','appsheet-pg-prod-20260914',expected)
lab=json.loads(Path(a.lab_manifest).read_text(encoding='utf-8-sig'))
assert lab['host']=='127.0.0.1' and lab['port']!=5432 and 'agent-state-lab-' in lab['root']
private=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r015-20260922')
private.mkdir(parents=True,exist_ok=True)
dump=private/(a.environment+'-'+a.label+'.dump')
if dump.exists() and not a.resume_existing:raise RuntimeError('Backup exists; inspect before replacing')
if a.resume_existing and not dump.exists():raise RuntimeError('No existing backup to verify')
password=Path(target['passwordFile']).read_text().strip()
env=dict(os.environ,PGPASSWORD=password)
bin=Path(lab['bin'])

def fingerprint(c):
    c.execute("SET LOCAL timezone='UTC'")
    result={}
    for schema,table in c.execute("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','assessment_lab') AND c.relkind IN ('r','p') ORDER BY 1,2"):
        query=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count,digest=c.execute(query).fetchone();result[schema+'.'+table]={'count':count,'fingerprint':digest}
    return result

if a.resume_existing:
    before=json.loads((private/(a.environment+'-'+a.label+'-fingerprints.json')).read_text(encoding='utf-8'))
else:
    with psycopg.connect(host=target['host'],port=target['port'],dbname=expected,user=target['user'],password=password,sslmode='require',connect_timeout=15) as c:
        c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
        before=fingerprint(c)
        (private/(a.environment+'-'+a.label+'-fingerprints.json')).write_text(json.dumps(before,indent=2),encoding='utf-8')
        args=[str(bin/'pg_dump.exe'),'-h',target['host'],'-p',str(target['port']),'-U',target['user'],'-d',expected,
              '--format=custom','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--snapshot='+snapshot,'--file='+str(dump)]
        with (private/(a.environment+'-dump.stderr')).open('wb') as err:
            subprocess.run(args,env=dict(env,PGSSLMODE='require'),stdout=subprocess.DEVNULL,stderr=err,check=True)
local_db='mw_r015_restore_'+a.environment+'_'+a.label.replace('-','_')
local=dict(host=lab['host'],port=lab['port'],user='postgres')
if not a.resume_existing:
    with psycopg.connect(**local,dbname='postgres',autocommit=True) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==(Path(lab['root'])/'data').resolve()
        c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(local_db)))
    with psycopg.connect(**local,dbname=local_db) as c:
        assert not c.execute("SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace").fetchone()
        c.execute('DROP SCHEMA public') # only the newly created empty disposable database
    with (private/(a.environment+'-restore.stderr')).open('wb') as err:
        subprocess.run([str(bin/'pg_restore.exe'),'-h',lab['host'],'-p',str(lab['port']),'-U','postgres','-d',local_db,
            '--no-owner','--no-privileges','--exit-on-error',str(dump)],stdout=subprocess.DEVNULL,stderr=err,check=True)
with psycopg.connect(**local,dbname=local_db) as c:
    after=fingerprint(c)
    if before!=after:raise RuntimeError('Restored row fingerprints differ')
    version=c.execute('SELECT max(version::int) FROM public.flyway_schema_history WHERE success').fetchone()[0]
    c.execute((repo/'database/migrations/V33__agent_transaction_audit.sql').read_text(encoding='utf-8'))
    c.rollback() # rehearsal only, preserve this restored baseline for later tests
result={'environment':a.environment,'database':expected,'instance':target['instance'],'created_at':datetime.now(timezone.utc).isoformat(),
    'backup_file':str(dump),'backup_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'restored_database':local_db,
    'flyway_before':version,'tables':before,'restore_fingerprints_match':True,'v33_restore_rehearsal_passed':True,
    'scope':'public and assessment_lab; separate instance backup/PITR and role/private-runtime recovery required'}
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'environment':a.environment,'restore_verified':True,'table_count':len(before),'baseline_version':version,'candidate_rehearsed':True}))
