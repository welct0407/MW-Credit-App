"""Compare DEV/PROD schema definitions excluding this additive candidate; no data export."""
import json,os,sys,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
r=Path(__file__).resolve().parents[2];out=r/'outputs/r045-forecast-planning';cfg=json.loads((r/'database/environments.json').read_text());result={};rows={}
queries={
 'columns':"select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name not like 'reporting_forecast_%' order by 1,ordinal_position",
 'views':"select viewname,definition from pg_views where schemaname='public' and viewname not like 'reporting_forecast_%' order by 1",
 'functions':"select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname not like 'forecast_%_v1' order by 1,2",
 'triggers':"select tgrelid::regclass::text,tgname,pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) order by 1,2",
 'constraints':"select conrelid::regclass::text,conname,pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace order by 1,2"}
for env,t in cfg.items():
 if env not in ('development','production'):continue
 assert t['host']=='34.21.174.215' and t['instance']=='appsheet-pg-prod-20260914'
 with psycopg.connect(host=t['host'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on') as c:
  rows[env]={k:[tuple(x.replace('\r\n','\n') if isinstance(x,str) else x for x in row) for row in c.execute(q).fetchall()] for k,q in queries.items()}
  result[env]={k:hashlib.sha256(json.dumps(v,default=str).encode()).hexdigest() for k,v in rows[env].items()}
if result['development']!=result['production']:
 for k in queries:
  if result['development'][k]!=result['production'][k]:
   print(k+' differences: '+json.dumps([x[:2] for x in rows['development'][k] if x not in rows['production'][k]],default=str))
   (Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r045-forecast-planning'/('schema-drift-'+k+'.json')).write_text(json.dumps({e:v[k] for e,v in rows.items()},indent=2,default=str))
assert result['development']==result['production'],'Baseline schema mismatch'
(out/'schema-preflight.json').write_text(json.dumps({'passed':True,'existing_objects_match':True,'fingerprints':result},indent=2)+'\n')
print('Existing DEV/PROD columns, views, functions, triggers and constraints match outside forecast additions')
