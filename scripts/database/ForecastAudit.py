"""Scoped read-only preflight and verification; all private source data stays off Git."""
import json, os, sys, hashlib, argparse
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/r045-forecast-planning'
PRIVATE=Path.home()/'Documents/ChatGPT/AppSheet-Loan-Project/r045-forecast-planning'
OUT.mkdir(parents=True,exist_ok=True);PRIVATE.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--environment',choices=['development','production','both'],default='both');parser.add_argument('--verify',action='store_true');args=parser.parse_args()
result={}
for env in (['development','production'] if args.environment=='both' else [args.environment]):
 t=json.loads((ROOT/'database/environments.json').read_text())[env]
 expected='loan_manager_dev' if env=='development' else 'loan_manager_prod'
 assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215',expected)
 with psycopg.connect(host=t['host'],dbname=expected,user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',options='-c default_transaction_read_only=on') as c:
  assert c.execute('select current_database(),host(inet_server_addr())').fetchone()==(expected,t['host'])
  version=c.execute('select max(version::integer) from public.flyway_schema_history where success').fetchone()[0]
  functions=c.execute("select p.proname,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=ANY(%s)",(['generate_loan_charge','vc_charge_values','daily_interest_basis','apply_principal_daily_interest'],)).fetchall()
  columns=c.execute("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name=ANY(%s) order by 1,ordinal_position",(['Loans','Charges','Repayments','Borrowers','reporting_cash_daily','reporting_borrower_schedule_health_v1'],)).fetchall()
  r={'database':expected,'version':version,'source_functions':{n:hashlib.sha256(v.encode()).hexdigest() for n,v in functions},'columns':columns}
  (PRIVATE/(env+'-source-functions.json')).write_text(json.dumps(dict(functions),ensure_ascii=False,indent=2),encoding='utf-8')
  if not args.verify:
   r['loan_type_counts']=c.execute('SELECT "Loan Type",count(*) FROM public."Loans" GROUP BY 1').fetchall()
   r['forecast_objects']=c.execute("select relname from pg_class where relnamespace='public'::regnamespace and relname like 'reporting_forecast_%'").fetchall()
  else:
   r['loan_rows']=c.execute('select count(*) from public.reporting_forecast_loans_v1').fetchone()[0]
   r['events']=c.execute('select origin,bucket,count(*) from public.reporting_forecast_events_v1 group by 1,2 order by 1,2').fetchall()
   r['issues']=c.execute('select issue,count(*) from public.reporting_forecast_events_v1 where issue is not null group by 1').fetchall()
   r['actual_reconciliation']=c.execute('''select abs(coalesce((select sum(interest) from public.reporting_forecast_actuals_v1),0)-coalesce((select sum("Interest Paid"::numeric) from public."Repayments" where "Payment Date" between date_trunc('month',public.olap_reporting_date())::date and public.olap_reporting_date()),0))<0.005''').fetchone()[0]
   assert r['actual_reconciliation']
   r['no_duplicate_simulations']=c.execute("select not exists(select 1 from public.reporting_forecast_events_v1 where origin='Simulated' group by loan_id,due_date having count(*)>1)").fetchone()[0];assert r['no_duplicate_simulations']
   r['read_only_functions']=c.execute("select bool_and(provolatile in ('i','s') and not prosecdef) from pg_proc where pronamespace='public'::regnamespace and proname like 'forecast_%_v1'").fetchone()[0];assert r['read_only_functions']
  result[env]=r
path=OUT/('verification-'+args.environment+'.json' if args.verify else 'preflight.json')
path.write_text(json.dumps(result,indent=2,default=str)+'\n',encoding='utf-8')
print(json.dumps({e:{k:v for k,v in r.items() if k not in ['columns','source_functions']} for e,r in result.items()},default=str))
