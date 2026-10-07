"""Read-only verification of the V73 target and preserved pre-migration rows."""
import argparse,hashlib,json,sys
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
p=argparse.ArgumentParser();p.add_argument('phase',choices=['before','after','cleanup']);a=p.parse_args()
r=Path(__file__).resolve().parents[2];o=r/'outputs/r051-trigger-performance';b=json.loads((o/'vm01-development-backup.json').read_text());old=json.loads((Path(b['backup_file']).parent/'fingerprints.json').read_text());t=json.loads((r/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
assert hashlib.sha256(Path(b['backup_file']).read_bytes()).hexdigest()==b['backup_sha256']
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==('loan_manager_dev',t['host'])
 version,checksum=c.execute('SELECT version,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
 assert version==('72' if a.phase=='before' else '73')
 if a.phase=='before':assert checksum==-1995290851
 now={}
 for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') ORDER BY 1,2"):
  count,digest=c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()
  now[schema+'.'+table]={'count':count,'digest':digest}
 excluded={'public.flyway_schema_history'} if a.phase!='before' else set()
 if a.phase=='cleanup': excluded.update(['public.Cash Account Daily Analytics','public.Daily Analytics','public.Statistics'])
 equal={k:v==now[k] for k,v in old.items() if k not in excluded}
 result={'at':datetime.now(timezone.utc).isoformat(),'phase':a.phase,'version':version,'checksum':checksum,'unchanged_tables':equal,'all_equal':all(equal.values()),'migration_sha256':hashlib.sha256(next((r/'database/migrations').glob('V73*')).read_bytes()).hexdigest()}
 (o/('migration-'+a.phase+'-verification.json')).write_text(json.dumps(result,indent=2)+'\n')
 assert all(equal.values()),'Changed table fingerprints; reconcile before further mutation'
 print(json.dumps({'version':version,'checksum':checksum,'unchanged_tables':len(equal)}))
