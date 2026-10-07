"""Read-only R048 PROD identity, backfill and affected view-dependency verification."""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'scripts/dictionary'))
import capture_postgresql as capture

target = json.loads((REPO / 'database/environments.json').read_text())['production']
assert (target['instance'], target['host'], target['database']) == (
    'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_prod')
with capture.psycopg.connect(
    host=target['host'], port=target['port'], dbname=target['database'], user=target['user'],
    password=Path(target['passwordFile']).read_text().strip(), sslmode='require',
    options='-c default_transaction_read_only=on -c statement_timeout=30000',
    row_factory=capture.dict_row,
) as conn:
    conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    identity = conn.execute("SELECT current_database() AS database,host(inet_server_addr()) AS host,current_setting('transaction_read_only') AS read_only,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl").fetchone()
    assert identity == {'database': target['database'], 'host': target['host'], 'read_only': 'on', 'ssl': True}
    history = conn.execute('SELECT version,success FROM public.flyway_schema_history ORDER BY installed_rank DESC LIMIT 1').fetchone()
    assert history == {'version': '53', 'success': True}
    coverage = conn.execute('''SELECT count(*) AS loans,count("Original Daily Interest Rate") AS populated,
      count(*) FILTER (WHERE "Original Daily Interest Rate" IS NULL) AS missing,
      count(*) FILTER (WHERE "Original Daily Interest Rate" < 0) AS negative,
      count(*) FILTER (WHERE "Original Daily Interest Rate" IS NULL AND coalesce("Outstanding Principal",0)>0) AS missing_with_outstanding
      FROM public."Loans"''').fetchone()
    assert coverage['negative'] == 0
    dependencies = conn.execute("SELECT * FROM (" + capture.QUERIES['view_dependencies'] + ") q WHERE schema='public' AND relation IN ('olap_loans_analytics','reporting_forecast_inputs_v1')").fetchall()
    conn.rollback()
out = REPO / 'outputs/r048-loan-interest-production'
result = {'identity': identity, 'history': history, 'coverage': coverage, 'view_dependencies': dependencies}
(out / 'sql-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'identity': identity, 'history': history, 'coverage': coverage, 'dependencies': len(dependencies)}))
