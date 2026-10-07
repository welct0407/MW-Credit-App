"""Read-only partner source parity and schema preservation; no financial values published."""
from pathlib import Path as _DatabasePath
import sys as _database_sys
_database_sys.path.insert(0, str(_DatabasePath(__file__).resolve().parents[1]))
from database_location import DATABASE_REPO_ROOT
import argparse,json,os,sys,time
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
ROOT=Path(__file__).resolve().parents[2]
PRIVATE=Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r044-partners')
VIEWS=['reporting_partner_'+x+'_v1' for x in ['capital','earnings','settlements','position','daily','capital_ledger']]
def verify(c):
 checks=[]
 def check(name,query):
  assert c.execute(query).fetchone()[0] is True,name
  checks.append(name)
 check('position key','SELECT count(*)=count(DISTINCT partner_id) FROM reporting_partner_position_v1')
 check('net earned matches independent settlement guard', 'SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_position_v1 WHERE ready AND net_earned IS DISTINCT FROM partner_net_profit(partner_id))')
 check('capital and full-pool shares', '''WITH s AS (SELECT "Ref Partner" id,sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END) amount FROM "Cash Pool Contributions" GROUP BY 1)
 SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_position_v1 p LEFT JOIN s ON s.id=p.partner_id WHERE p.net_capital IS DISTINCT FROM coalesce(s.amount,0) OR p.pool IS DISTINCT FROM (SELECT "Contributed Capital"::numeric FROM "Loan Form Context"))''')
 check('all-status reservation parity', '''SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_position_v1 p WHERE reserved IS DISTINCT FROM coalesce((SELECT sum("Amount"::numeric) FROM "Settlements" WHERE "Ref Partner"=p.partner_id AND "Status" IS DISTINCT FROM 'Cancelled'),0))''')
 check('entitlement arithmetic', 'SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_position_v1 WHERE ready AND net_earned IS DISTINCT FROM completed+pending+other_reserved+available)')
 check('settlement key coverage', '''SELECT (SELECT count(*) FROM reporting_partner_settlements_v1)=(SELECT count(*) FROM "Settlements") AND NOT EXISTS(SELECT 1 FROM reporting_partner_settlements_v1 GROUP BY settlement_id HAVING count(*)>1)''')
 check('capital ledger key coverage', '''SELECT (SELECT count(*) FROM reporting_partner_capital_ledger_v1)=(SELECT count(*) FROM "Cash Pool Contributions") AND NOT EXISTS(SELECT 1 FROM reporting_partner_capital_ledger_v1 GROUP BY capital_id HAVING count(*)>1)''')
 check('earnings grain', 'SELECT count(*)=count(DISTINCT (event_type,event_id,role)) FROM reporting_partner_earnings_v1')
 check('daily grain','SELECT count(*)=count(DISTINCT (partner_id,activity_date)) FROM reporting_partner_daily_v1')
 check('no future daily actuals','SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_daily_v1 WHERE activity_date>olap_reporting_date())')
 for days in [0,30,90,365]:
  # Expected interest/expense amounts use canonical allocation and base expense sources directly.
  q=f'''WITH p AS (SELECT * FROM reporting_partner_daily_v1 WHERE activity_date BETWEEN olap_reporting_date()-{days} AND olap_reporting_date()),
   totals AS (SELECT partner_id,sum(allocated_interest) interest,sum(allocated_expense) expense,sum(completed_payouts) completed,sum(capital_movement) movement FROM p GROUP BY 1)
   SELECT NOT EXISTS(SELECT 1 FROM totals t JOIN "Partners" x ON x."Row ID"=t.partner_id WHERE
   interest IS DISTINCT FROM coalesce((SELECT sum(CASE WHEN x."Partner Role"='A' THEN "Partner A Profit" ELSE "Partner B Profit" END) FROM olap_repayments_analytics WHERE "Payment Date" BETWEEN olap_reporting_date()-{days} AND olap_reporting_date()),0)
   OR expense IS DISTINCT FROM coalesce((SELECT sum(CASE WHEN x."Partner Role"='A' THEN "Partner A Expense"::numeric ELSE "Partner B Expense"::numeric END) FROM "Business Expenses" WHERE "Expense Date" BETWEEN olap_reporting_date()-{days} AND olap_reporting_date()),0)
   OR completed IS DISTINCT FROM coalesce((SELECT sum("Amount"::numeric) FROM "Settlements" WHERE "Ref Partner"=t.partner_id AND "Status"='Completed' AND "Transfer Date" BETWEEN olap_reporting_date()-{days} AND olap_reporting_date()),0)
   OR movement IS DISTINCT FROM coalesce((SELECT sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END) FROM "Cash Pool Contributions" WHERE "Ref Partner"=t.partner_id AND "Contribution Date" BETWEEN olap_reporting_date()-{days} AND olap_reporting_date()),0))'''
  check('independent period parity '+str(days),q)
 check('cumulative capital before filter','''SELECT NOT EXISTS(SELECT 1 FROM reporting_partner_daily_v1 p WHERE capital_exceptions=0 AND capital_eod IS DISTINCT FROM coalesce((SELECT sum(CASE WHEN "Transaction Type"='Contribution' THEN "Amount"::numeric ELSE -"Amount"::numeric END) FROM "Cash Pool Contributions" WHERE "Ref Partner"=p.partner_id AND "Contribution Date"<=p.activity_date),0))''')
 return checks
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('environment',choices=['development','production']);ap.add_argument('--baseline',action='store_true');a=ap.parse_args()
 t=json.loads((DATABASE_REPO_ROOT / 'database/environments.json').read_text())[a.environment]
 assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_dev' if a.environment=='development' else 'loan_manager_prod')
 with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
  c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');c.execute("SET LOCAL statement_timeout='60s'")
  assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
  schemas={'relations':c.execute("SELECT n.nspname,cl.relname,cl.relkind,CASE WHEN cl.relkind='v' THEN pg_get_viewdef(cl.oid,true) END FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relkind IN ('r','v') ORDER BY 1,2").fetchall(),
   'columns':c.execute("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position").fetchall(),
   'routines':c.execute("SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1").fetchall()}
  baseline=PRIVATE/(a.environment+'-full-schema.json')
  if a.baseline:
   assert not baseline.exists();baseline.write_text(json.dumps(schemas,indent=2));print('Captured private full public schema baseline');sys.exit(0)
  previous=json.loads(baseline.read_text())
  filtered={'relations':[r for r in schemas['relations'] if r[1] not in VIEWS],'columns':[r for r in schemas['columns'] if r[0] not in VIEWS],'routines':schemas['routines']}
  assert json.loads(json.dumps(filtered))==previous,'Existing public schema changed'
  start=time.monotonic();checks=verify(c)
  grants=[]
  for v in VIEWS:
   assert c.execute("SELECT has_table_privilege('metabase_borrower_reader',%s,'SELECT') AND NOT has_table_privilege('metabase_borrower_reader',%s,'INSERT,UPDATE,DELETE')",(v,v)).fetchone()[0];grants.append(v)
  catalog={'views':c.execute("SELECT relname,pg_get_viewdef(cl.oid,true) FROM pg_class cl WHERE cl.relnamespace='public'::regnamespace AND relname=any(%s) ORDER BY relname",(VIEWS,)).fetchall(),'columns':[r for r in schemas['columns'] if r[0] in VIEWS]}
  dest=ROOT/'outputs/r044-partners';dest.mkdir(exist_ok=True)
  report={'environment':a.environment,'at':datetime.now(timezone.utc).isoformat(),'checks':checks,'passed':True,'existing_schema_unchanged':True,'read_only_grants':grants,'seconds':round(time.monotonic()-start,2),'financial_values_published':False}
  (dest/(a.environment+'-verification.json')).write_text(json.dumps(report,indent=2)+'\n')
  (dest/(a.environment+'-catalog.json')).write_text(json.dumps(catalog,indent=2)+'\n')
  print(json.dumps(report))
