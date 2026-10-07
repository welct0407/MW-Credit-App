"""Bounded read-only production timing of the view SELECT; no schema mutation."""
import hashlib,json,statistics,sys
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
root=Path(__file__).resolve().parents[2]
out=root/'outputs/r051-related-list-views/production-query.json';assert not out.exists()
migration=root/'database/migrations/V76__payment_visible_allocation_ids_view.sql'
query=migration.read_text(encoding='utf-8').split(' AS\n',1)[1].strip().removesuffix(';')
assert query.startswith('SELECT p."Row ID"') and ';' not in query
t=json.loads((root/'database/environments.json').read_text())['production']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_prod')
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
 c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 c.execute("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s'")
 assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
 assert c.execute('SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()==('58',)
 rows,total_bytes,largest=c.execute('SELECT count(*),sum(octet_length("Repayment IDs")+octet_length("Allocation IDs")+octet_length("Closing Loan IDs")+octet_length("Visible Allocation IDs")),max(octet_length("Repayment IDs")+octet_length("Allocation IDs")+octet_length("Closing Loan IDs")+octet_length("Visible Allocation IDs")) FROM ('+query+') v').fetchone()
 samples=[]
 for i in range(4):
  plan=c.execute('EXPLAIN (ANALYZE,FORMAT JSON) '+query).fetchone()[0][0]
  if i:samples.append(plan['Execution Time'])
 c.rollback()
result={'at':datetime.now(timezone.utc).isoformat(),'database':'loan_manager_prod','flyway':58,'mode':'repeatable read read only; SELECT only; no customer rows exported','query_source':migration.name,'query_source_sha256':hashlib.sha256(migration.read_bytes()).hexdigest(),'payment_rows':rows,'total_list_bytes':total_bytes,'largest_combined_list_bytes':largest,'server_samples_ms':samples,'server_median_ms':statistics.median(samples),'limitation':'Server execution, not AppSheet save/sync or connector timing'}
out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
