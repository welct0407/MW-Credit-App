"""Read-only dependency drift check and DEV Metabase-query preflight for R027."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import json, os, sys, hashlib
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
repo=Path(__file__).resolve().parents[2]
cfg=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())
out=repo/'outputs/r027-payment-health'
meta={};checks=[]
for env,db in [('development','loan_manager_dev'),('production','loan_manager_prod')]:
 t=cfg[env];assert (t['instance'],t['host'],t['database'])==('mw-credit-pg-20261017','136.85.127.134',db)
 with psycopg.connect(host=t['host'],dbname=db,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on -c statement_timeout=30000') as c:
  assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(db,t['host'])
  version=c.execute('select max(version::int) from flyway_schema_history where success').fetchone()[0]
  assert version==(41 if env=='development' else 40)
  cols=c.execute("select table_name,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('Borrowers','Loans','Charges','Repayments') order by 1,2").fetchall()
  fn=c.execute("select pg_get_functiondef('public.olap_reporting_date()'::regprocedure)").fetchone()[0]
  names=c.execute("select pg_get_viewdef('public.olap_borrowers_analytics'::regclass,true)").fetchone()[0]
  meta[env]={'columns':cols,'clock':fn,'names':names}
  if env=='development':
   for s in json.loads((out/'metabase-plan.json').read_text())['specs']:
    rows=c.execute(s['dataset_query']['native']['query']).fetchall();checks.append({'key':s['key'],'rows':len(rows),'passed':True})
assert meta['development']==meta['production'],'Affected dependency schema/clock/name-provider drift'
(out/'promotion-preflight.json').write_text(json.dumps({'dependency_schema_matches':True,'dependency_sha256':hashlib.sha256(json.dumps(meta['production'],default=str).encode()).hexdigest(),'dev_report_checks':checks,'dev_version':41,'prod_before_version':40,'writes':False},indent=2)+'\n')
print('Affected PROD/DEV dependencies match; all %d report queries passed DEV preflight'%len(checks))
