"""Read-only verification of R027 DEV health providers; sanitized evidence only."""
import argparse,json,os,sys,time
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
from psycopg.rows import dict_row
repo=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--environment',choices=['development','production'],default='development');args=parser.parse_args()
environment=args.environment
target=json.loads((repo/'database/environments.json').read_text())[environment]
assert (target['instance'],target['host'],target['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev' if environment=='development' else 'loan_manager_prod')
views=['reporting_charge_payment_health_v1','reporting_borrower_payment_health_v1','reporting_borrower_matrix_v2','oltp_borrower_payment_health_v1','oltp_charge_payment_health_v1']
with psycopg.connect(host=target['host'],dbname=target['database'],user=target['user'],password=Path(target['passwordFile']).read_text().strip(),sslmode='require',row_factory=dict_row,options='-c default_transaction_read_only=on -c statement_timeout=30000') as c:
 c.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 identity=c.execute('select current_database() database,host(inet_server_addr()) host,current_setting(\'transaction_read_only\') read_only,statement_timestamp() captured_at').fetchone()
 assert identity['database']==target['database'] and identity['host']==target['host'] and identity['read_only']=='on'
 checks={}
 checks['version']=c.execute('select max(version::int) v from flyway_schema_history where success').fetchone()['v']==41
 checks['borrower_coverage']=c.execute('select (select count(*) from "Borrowers")=(select count(*) from reporting_borrower_payment_health_v1) ok').fetchone()['ok']
 checks['unique_keys']=c.execute('select count(*)=count(distinct borrower_id) ok from reporting_borrower_payment_health_v1').fetchone()['ok']
 checks['charge_coverage']=c.execute('select (select count(*) from "Charges")=(select count(*) from reporting_charge_payment_health_v1) ok').fetchone()['ok']
 checks['aggregate_reconciliation']=c.execute('''select not exists(select 1 from reporting_borrower_payment_health_v1 b left join
 (select borrower_id,sum(overdue_amount) amount,count(*) filter(where is_overdue) n from reporting_charge_payment_health_v1 group by 1) c using(borrower_id)
 where b.overdue_amount is not null and (b.overdue_amount<>coalesce(c.amount,0) or b.overdue_charge_count<>coalesce(c.n,0))) ok''').fetchone()['ok']
 checks['no_unclassified_rating']=c.execute("select not exists(select 1 from reporting_borrower_payment_health_v1 where rating_status<>'Rated' and (reliability_score is not null or reliability_band is not null)) ok").fetchone()['ok']
 checks['no_default_success_rating']=c.execute('select not exists(select 1 from reporting_borrower_payment_health_v1 where default_count>0 and reliability_score is not null) ok').fetchone()['ok']
 checks['no_today_arrears']=c.execute('select not exists(select 1 from reporting_charge_payment_health_v1 where due_date>=reporting_date and is_overdue) ok').fetchone()['ok']
 checks['independent_matrix_axes']=c.execute("select not exists(select 1 from reporting_borrower_matrix_v2 where quadrant<>'Unclassified' and (quadrant in ('Star','Cash Cow')) is distinct from (reliability_score>=80)) ok").fetchone()['ok']
 checks['read_only_adapters']=c.execute("select count(*)=2 and bool_and(is_updatable='NO') ok from information_schema.views where table_schema='public' and table_name in ('oltp_borrower_payment_health_v1','oltp_charge_payment_health_v1')").fetchone()['ok']
 categories=c.execute('select quadrant,count(*) borrowers from reporting_borrower_matrix_v2 group by 1 order by 1').fetchall()
 statuses=c.execute('select rating_status,count(*) borrowers from reporting_borrower_payment_health_v1 group by 1 order by 1').fetchall()
 times=[]
 for _ in range(3):
  start=time.perf_counter();c.execute('select * from oltp_borrower_payment_health_v1').fetchall();times.append(round((time.perf_counter()-start)*1000,2))
 definitions=[]
 for v in views:
  definitions.append({'name':v,'definition':c.execute('select pg_get_viewdef(%s::regclass,true) def',('public.'+v,)).fetchone()['def'],
   'columns':c.execute("select column_name,data_type,udt_name,is_nullable,ordinal_position from information_schema.columns where table_schema='public' and table_name=%s order by ordinal_position",(v,)).fetchall()})
 assert all(checks.values()),checks
 out=repo/'outputs/r027-payment-health'
 result={'identity':identity,'checks':checks,'categories':categories,'rating_statuses':statuses,'summary_query_ms':times,'scope':environment+' current data; no expected live category quota','financial_writes':False}
 (out/('dev-verification.json' if environment=='development' else 'production-verification.json')).write_text(json.dumps(result,default=str,indent=2)+'\n')
 (out/('sql-definitions.json' if environment=='development' else 'production-sql-definitions.json')).write_text(json.dumps(definitions,default=str,indent=2)+'\n')
 print(json.dumps(result,default=str))
