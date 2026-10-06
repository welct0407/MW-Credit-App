"""Read-only before/after catalog and row proof for the R051 view experiment."""
import argparse, hashlib, json, statistics, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
p=argparse.ArgumentParser();p.add_argument('phase',choices=['before','after']);p.add_argument('--batch',choices=['v75','v76'],default='v75');args=p.parse_args()
root=Path(__file__).resolve().parents[2];out=root/'outputs/r051-related-list-views'
prefix='' if args.batch=='v75' else 'v76-'
path=out/(prefix+args.phase+'-contract.json');assert not path.exists()
t=json.loads((root/'database/environments.json').read_text())['development']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 c.execute("SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='30s'")
 assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
 version,checksum=c.execute('SELECT version::integer,checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
 assert version==int(args.batch[1:])-(1 if args.phase=='before' else 0)
 catalog={}
 for schema,name,body in c.execute("SELECT schemaname,viewname,definition FROM pg_views WHERE schemaname IN ('public','assessment_lab')"):
  catalog['view:'+schema+'.'+name]=hashlib.sha256(body.encode()).hexdigest()
 for name,body in c.execute("SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','assessment_lab') AND p.prokind IN ('f','p')"):
  catalog['routine:'+name]=hashlib.sha256(body.encode()).hexdigest()
 for name,body in c.execute("SELECT tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)"):
  catalog['trigger:'+name]=hashlib.sha256(body.encode()).hexdigest()
 data={}
 for schema,table in c.execute("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','assessment_lab','agent_audit') AND tablename<>'flyway_schema_history' ORDER BY 1,2"):
  data[schema+'.'+table]=c.execute(sql.SQL("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM {}.{} t").format(sql.Identifier(schema),sql.Identifier(table))).fetchone()
 nonowner=c.execute('SELECT count(*) FROM "Partners" WHERE coalesce("Email",\'\') NOT IN (\'\',\'welct0407@mw-credit.com\')').fetchone()[0]
 actor=c.execute('SELECT count(*) FROM "Partners" WHERE lower(trim("Login Email"))=\'welct0407@mw-credit.com\'').fetchone()[0]
 assert nonowner==0 and actor==1
 result={'at':datetime.now(timezone.utc).isoformat(),'version':version,'checksum':checksum,'catalog':catalog,'fingerprints':data,'nonowner_delivery_addresses':nonowner,'owner_actor_count':actor}
 if args.phase=='after':
  before=json.loads((out/(prefix+'before-contract.json')).read_text())
  changed=[k for k in set(before['catalog'])|set(catalog) if before['catalog'].get(k)!=catalog.get(k)]
  assert changed==['view:public.oltp_payment_related_ids_v1'],changed
  assert json.loads(json.dumps(data))==before['fingerprints'],'Existing data changed during migration'
  diff=c.execute('''SELECT count(*) FROM public.oltp_payment_related_ids_v1 v WHERE
   ARRAY(SELECT k FROM unnest(string_to_array(v."Repayment IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Repayments" WHERE "Ref Payment"=v."Row ID" ORDER BY "Row ID") OR
   ARRAY(SELECT k FROM unnest(string_to_array(v."Allocation IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Payment Allocations" WHERE "Ref Payment"=v."Row ID" ORDER BY "Row ID") OR
   string_to_array(v."Closing Loan IDs",' , ') IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Loans" WHERE "Ref Closing Payment"=v."Row ID" ORDER BY "Row ID")''').fetchone()[0]
  assert diff==0
  if version>=76:
   visible_diff=c.execute('''SELECT count(*) FROM public.oltp_payment_related_ids_v1 v WHERE ARRAY(SELECT k FROM unnest(string_to_array(v."Visible Allocation IDs",' , ')) k ORDER BY k) IS DISTINCT FROM ARRAY(SELECT "Row ID" FROM "Payment Allocations" WHERE "Ref Payment"=v."Row ID" AND "Allocated Amount">0::money ORDER BY "Row ID")''').fetchone()[0]
   assert visible_diff==0
   result['visible_allocation_differences']=visible_diff
  ambiguous=c.execute('''SELECT count(*) FROM (SELECT "Row ID" FROM "Repayments" UNION ALL SELECT "Row ID" FROM "Payment Allocations" UNION ALL SELECT "Row ID" FROM "Loans") s WHERE position(' , ' in "Row ID")>0 OR btrim("Row ID")<>"Row ID" OR "Row ID"='' ''').fetchone()[0]
  assert ambiguous==0
  samples=[]
  for i in range(4):
   plan=c.execute('EXPLAIN (ANALYZE,FORMAT JSON) SELECT * FROM public.oltp_payment_related_ids_v1').fetchone()[0][0]
   if i:samples.append(plan['Execution Time'])
  result.update(changed_catalog_objects=changed,unchanged_data_tables=len(data),key_set_differences=diff,ambiguous_keys=ambiguous,server_samples_ms=samples,server_median_ms=statistics.median(samples),view_definition=c.execute("SELECT pg_get_viewdef('public.oltp_payment_related_ids_v1'::regclass,true)").fetchone()[0],view_columns=c.execute("SELECT attname,format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.oltp_payment_related_ids_v1'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum").fetchall())
 c.rollback()
path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in result.items() if k not in ['catalog','fingerprints','view_definition','view_columns']}))
