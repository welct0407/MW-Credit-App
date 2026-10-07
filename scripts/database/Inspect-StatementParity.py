import json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'AppSheetLoanTools/python-deps'))
import psycopg
root=Path(__file__).resolve().parents[2]
t=json.loads((root/'database/environments.json').read_text())['development']
with psycopg.connect(host=t['host'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require') as c:
 c.execute('BEGIN READ ONLY')
 q='''WITH old AS (SELECT * FROM reporting_cashflow_transactions), new AS (
 SELECT t.* FROM reporting_cash_scopes s CROSS JOIN LATERAL reporting_cash_period_entries(olap_reporting_date()-60,olap_reporting_date(),s.id) t)
 SELECT k,count(*) FROM old o FULL JOIN new n USING("Entry ID") CROSS JOIN LATERAL jsonb_object_keys(coalesce(to_jsonb(o),to_jsonb(n))) k
 WHERE to_jsonb(o)->k IS DISTINCT FROM to_jsonb(n)->k GROUP BY k ORDER BY k'''
 print(c.execute(q).fetchall())
