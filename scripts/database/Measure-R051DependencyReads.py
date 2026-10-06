"""Bounded production SELECT plans for the observed expensive VC dependencies."""
import json, statistics, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
root=Path(__file__).resolve().parents[2]
out=root/'outputs/r051-transparent-performance/production-dependency-reads.json'
assert not out.exists()
t=json.loads((root/'database/environments.json').read_text())['production']
assert (t['instance'],t['host'],t['database'])==('appsheet-pg-prod-20260914','34.21.174.215','loan_manager_prod')
result={'at':datetime.now(timezone.utc).isoformat(),'database':t['database'],
    'mode':'REPEATABLE READ READ ONLY; EXPLAIN SELECT only; no row values returned',
    'limitation':'Direct full-table read server timings, not AppSheet connector/client or dependent VC timings','relations':{}}
with psycopg.connect(host=t['host'],port=t['port'],dbname=t['database'],user=t['user'],
        password=Path(t['passwordFile']).read_text().strip(),sslmode='require',connect_timeout=15) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='2s'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone()==(t['database'],t['host'])
    result['flyway']=c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
    for table in ['Loans','Payment Allocations','Repayments','Cash Account Statement Recent']:
        samples=[]
        for i in range(3):
            plan=c.execute(sql.SQL('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.{}').format(sql.Identifier(table))).fetchone()[0][0]
            samples.append(plan['Execution Time'])
        result['relations'][table]={'rows':plan['Plan']['Actual Rows'],'server_samples_ms':samples,'server_median_ms':statistics.median(samples)}
    c.rollback()
out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
