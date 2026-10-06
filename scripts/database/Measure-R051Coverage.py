"""Read-only, bounded coverage-query parity/timing; never returns customer rows."""
import argparse, json, statistics, sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--environment', choices=['production', 'development'], required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
out = root/'outputs/r051-transparent-performance'
path = out/(args.environment+'-query-experiment.json')
assert not path.exists(), 'Preserve earlier measurements'
target = json.loads((root/'database/environments.json').read_text())[args.environment]
assert (target['instance'], target['host'], target['database']) == (
    'appsheet-pg-prod-20260914', '34.21.174.215',
    'loan_manager_prod' if args.environment == 'production' else 'loan_manager_dev')
candidate = (out/'coverage-candidate.sql').read_text(encoding='utf-8').strip().rstrip(';')
queries = {'baseline': 'SELECT * FROM public.oltp_upcoming_charge_coverage_v1', 'candidate': candidate}
result = {'at': datetime.now(timezone.utc).isoformat(), 'environment': args.environment,
          'database': target['database'], 'mode': 'REPEATABLE READ READ ONLY; SELECT and EXPLAIN SELECT only'}
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'],
        user=target['user'], password=Path(target['passwordFile']).read_text().strip(),
        sslmode='require', connect_timeout=15, application_name='r051-readonly-coverage') as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'")
    assert c.execute('SELECT current_database(),host(inet_server_addr())').fetchone() == (target['database'], target['host'])
    result['flyway'] = c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone()
    assert result['flyway'][0] == ('58' if args.environment == 'production' else '73'), 'Original baseline has changed'
    result['source_counts'] = dict(c.execute('SELECT \'Borrowers\',count(*) FROM "Borrowers" UNION ALL SELECT \'Loans\',count(*) FROM "Loans" UNION ALL SELECT \'Charges\',count(*) FROM "Charges" UNION ALL SELECT \'Repayments\',count(*) FROM "Repayments"'))
    parity = 'WITH old AS ('+queries['baseline']+'), new AS ('+candidate+''')
      SELECT (SELECT count(*) FROM old), (SELECT count(*) FROM new),
      (SELECT count(*) FROM ((SELECT * FROM old EXCEPT ALL SELECT * FROM new)
        UNION ALL (SELECT * FROM new EXCEPT ALL SELECT * FROM old)) difference)'''
    result['parity_rows_old_new_differences'] = c.execute(parity).fetchone()
    assert result['parity_rows_old_new_differences'][2] == 0
    samples = {key: [] for key in queries}
    for i in range(4):
        for name in (['baseline', 'candidate'] if i % 2 == 0 else ['candidate', 'baseline']):
            plan = c.execute('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+queries[name]).fetchone()[0][0]
            if i:
                samples[name].append(plan['Execution Time'])
    result['server_ms'] = {key: {'samples': values, 'median': statistics.median(values)} for key, values in samples.items()}
    c.rollback()
path.write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
print(json.dumps(result))
