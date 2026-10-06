"""R051 private snapshot backup, verified restore and migration rehearsal (no live writes)."""
import hashlib, json, os, socket, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql

repo=Path(__file__).resolve().parents[2]
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('--environment',choices=['development','production'],required=True)
parser.add_argument('--baseline',type=int,required=True)
args=parser.parse_args()
target=json.loads((repo/'database/environments.json').read_text())[args.environment]
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215',('loan_manager_prod' if args.environment=='production' else 'loan_manager_dev'))
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
folder=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r051-production')/stamp
folder.mkdir(parents=True,exist_ok=False)
out=repo/'outputs/r051-production';out.mkdir(parents=True,exist_ok=True)
pgbin=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/postgresql-18.6-3/pgsql/bin'
password=Path(target['passwordFile']).read_text().strip()
env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require')
dump=folder/(args.environment+'-before.dump')
startup=dict(creationflags=subprocess.CREATE_NO_WINDOW) if os.name=='nt' else {}

def fingerprint(c, normalized=False):
    result={}
    for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
        expression = "(to_jsonb(t)-'Delete Requested')" if normalized and table=='Payments' and args.baseline<65 else "to_jsonb(t)"
        query=sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5("+expression+"::text),'' ORDER BY md5("+expression+"::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))
        count,digest=c.execute(query).fetchone();result[schema+'.'+table]={'count':count,'digest':digest}
    return result

def run(arguments,log,runenv=None):
    with (folder/log).open('wb') as f:
        subprocess.run(arguments,stdout=f,stderr=subprocess.STDOUT,env=runenv,check=True,**startup)

def catalog(c):
    c.execute('SET LOCAL search_path=public')
    result={}
    for schema,name,body in c.execute("SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname IN ('public','assessment_lab','agent_audit')"):
        result['view:'+schema+'.'+name]=body
    for schema,name,body in c.execute("SELECT n.nspname,p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','assessment_lab','agent_audit') AND p.prokind IN ('f','p')"):
        result['routine:'+schema+'.'+name]=body
    for schema,table,name,body in c.execute("SELECT n.nspname,r.relname,t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','assessment_lab','agent_audit')"):
        result['trigger:'+schema+'.'+table+'.'+name]=body
    for schema,table,name,body in c.execute("SELECT n.nspname,r.relname,x.conname,pg_get_constraintdef(x.oid) FROM pg_constraint x JOIN pg_class r ON r.oid=x.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname IN ('public','assessment_lab','agent_audit') AND r.relname<>'flyway_schema_history'"):
        result['constraint:'+schema+'.'+table+'.'+name]=body
    for schema,table,name,typ,required,default in c.execute("SELECT n.nspname,r.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),'') FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid JOIN pg_namespace n ON n.oid=r.relnamespace LEFT JOIN pg_attrdef d ON (d.adrelid,d.adnum)=(a.attrelid,a.attnum) WHERE a.attnum>0 AND NOT a.attisdropped AND r.relkind IN ('r','p') AND r.relname<>'flyway_schema_history' AND n.nspname IN ('public','assessment_lab','agent_audit')"):
        result['column:'+schema+'.'+table+'.'+name]=repr((typ,required,default))
    for schema,name,body in c.execute("SELECT schemaname,indexname,indexdef FROM pg_indexes WHERE schemaname IN ('public','assessment_lab','agent_audit') AND tablename<>'flyway_schema_history'"):
        result['index:'+schema+'.'+name]=body
    # PG17 dump/reparse on PG18 renders implicit UNION text aliases and an
    # associative three-term AND differently. These are exact known cosmetic
    # forms; do not strip arbitrary parentheses or normalize business SQL.
    for key,body in result.items():
        body=body.replace('\r\n','\n')
        if key.startswith('view:'):
            body=body.replace('::text AS text','::text')
            body=body.replace('((("Borrower Due Date Rank" >= 1) AND ("Borrower Due Date Rank" <= 5)) AND ("Due Date" <= "Horizon End"))','(("Borrower Due Date Rank" >= 1) AND ("Borrower Due Date Rank" <= 5) AND ("Due Date" <= "Horizon End"))')
        result[key]=body
    return result

with psycopg.connect(host=target['host'],port=target['port'],dbname=target['database'],user=target['user'],password=password,sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL timezone='UTC'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(target['database'],target['host'])
    assert c.execute('SELECT max(version::integer) FROM public.flyway_schema_history WHERE success').fetchone()[0]==args.baseline
    baseline=fingerprint(c)
    snapshot=c.execute('SELECT pg_export_snapshot()').fetchone()[0]
    run([str(pgbin/'pg_dump.exe'),'-h',target['host'],'-p',str(target['port']),'-U',target['user'],'-d',target['database'],
         '-Fc','--no-owner','--no-privileges','--schema=public','--schema=assessment_lab','--schema=agent_audit',
         '--snapshot='+snapshot,'--file='+str(dump)],'dump.log',env)
    (folder/'fingerprints.json').write_text(json.dumps(baseline,indent=2))
with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
data=Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/private-restores'/('r051-'+stamp)
data.parent.mkdir(parents=True,exist_ok=True)
run([str(pgbin/'initdb.exe'),'-D',str(data),'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C'],'initdb.log')
started=False
try:
    run([str(pgbin/'pg_ctl.exe'),'-D',str(data),'-l',str(data/'postgres.log'),'-o',f'-h 127.0.0.1 -p {port}','-w','start'],'start.log');started=True
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as c:
        assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==data.resolve()
        c.execute('DROP SCHEMA public') # Newly created empty disposable database only.
    run([str(pgbin/'pg_restore.exe'),'-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','--no-owner','--no-privileges','--exit-on-error',str(dump)],'restore.log')
    with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres') as c:
        c.execute("SET LOCAL timezone='UTC'")
        assert fingerprint(c)==baseline,'Restored fingerprints differ'
        if args.environment=='production':
            restored_catalog=catalog(c)
            with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='postgres',autocommit=True) as admin:
                assert Path(admin.execute('SHOW data_directory').fetchone()[0]).resolve()==data.resolve()
                admin.execute('CREATE DATABASE r051_schema_reference')
                admin.execute((repo/'scripts/database/Test-AgentAuditPrerequisites.sql').read_text(encoding='utf-8'))
            with psycopg.connect(host='127.0.0.1',port=port,user='postgres',dbname='r051_schema_reference') as ref:
                for p in sorted((p for p in (repo/'database/migrations').glob('V*__*.sql') if int(p.name.split('__')[0][1:])<=args.baseline),key=lambda p:int(p.name.split('__')[0][1:])):
                    ref.execute('SET search_path=public')
                    ref.execute(p.read_text(encoding='utf-8'))
                    ref.commit()
                expected=catalog(ref)
                differences=[k for k in sorted(set(expected)|set(restored_catalog)) if expected.get(k)!=restored_catalog.get(k)]
                (folder/'schema-drift.json').write_text(json.dumps(differences,indent=2))
                (folder/'schema-drift-details.json').write_text(json.dumps({k:{'expected':expected.get(k),'actual':restored_catalog.get(k)} for k in differences},indent=2))
                assert not differences,'Production schema differs from immutable baseline; see private schema-drift.json'
        migrations=sorted((p for p in (repo/'database/migrations').glob('V*__*.sql') if args.baseline<int(p.name.split('__')[0][1:])<=77),key=lambda p:int(p.name.split('__')[0][1:]))
        for migration in migrations: c.execute(migration.read_text(encoding='utf-8'))
        after=fingerprint(c)
        normalized_after=fingerprint(c, normalized=True)
        assert all(normalized_after[k]==v for k,v in baseline.items() if k!='public.flyway_schema_history'),'Migration changed existing values'
        assert c.execute("SELECT to_regclass('public.oltp_payment_related_ids_v1')").fetchone()[0] is None
        coverage=c.execute('SELECT count(*) FROM public.oltp_upcoming_charge_summary_v2').fetchone()
        c.rollback()
    evidence={'at':stamp,'environment':args.environment,'instance':target['instance'],'database':target['database'],
              'baseline_version':args.baseline,'backup_file':str(dump),'backup_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),
              'restored_fingerprints_match':True,'migrations_rehearsed':[int(p.name.split('__')[0][1:]) for p in migrations],'existing_public_values_unchanged':True,'summary_row_count':coverage[0],
              'migration_sha256':{m.name:hashlib.sha256(m.read_bytes()).hexdigest() for m in migrations},
              'scope':'public, assessment_lab, agent_audit; instance settings/roles external'}
    evidence['baseline_catalog_matches_migration_chain']=args.environment=='production'
    (out/(args.environment+'-backup.json')).write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps(evidence))
finally:
    if started:run([str(pgbin/'pg_ctl.exe'),'-D',str(data),'-m','fast','-w','stop'],'stop.log')
