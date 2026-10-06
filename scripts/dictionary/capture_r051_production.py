"""Read-only R051 production catalog capture using maintained catalog queries."""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg.rows import dict_row
from capture_postgresql import QUERIES
from common import REPO

target = json.loads((REPO / 'database/environments.json').read_text())['production']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_prod')
names = set()
for p in (REPO / 'database/migrations').glob('V*__*.sql'):
    if 59 <= int(p.name.split('__')[0][1:]) <= 74:
        names.update(re.findall(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_]+\.[a-z_0-9]+)\s*\(', p.read_text(encoding='utf8'), re.I))
relations = {'Payments', 'Loans', 'Borrowers', 'Cash Ledger', 'Business Expenses', 'Settlements', 'Cash Accounts', 'Repayments', 'Charges', 'Payment Allocations', 'Loan Assessment', 'Loan Assessment SQL Lab', 'Cash Pool Contributions', 'oltp_upcoming_charge_coverage_v1'}
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15, row_factory=dict_row) as c:
    c.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    c.execute("SET LOCAL statement_timeout='30s'")
    assert c.execute('SELECT current_database() AS db,host(inet_server_addr()) AS host').fetchone() == {'db': target['database'], 'host': target['host']}
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == {'version': '77', 'checksum': 102577726}
    assert c.execute("SELECT to_regclass('public.oltp_payment_related_ids_v1') AS object").fetchone()['object'] is None
    sections = {}
    for section in ('relations', 'columns', 'constraints', 'indexes', 'triggers', 'policies', 'view_dependencies', 'routines'):
        rows = c.execute(QUERIES[section]).fetchall()
        if section == 'routines':
            rows = [r for r in rows if r['schema'] + '.' + r['name'] in names]
        else:
            rows = [r for r in rows if r['schema'] == 'public' and r.get('relation', r.get('name')) in relations]
        sections[section] = rows
    c.rollback()
out = REPO / 'outputs/r051-production/postgresql-affected-definitions.json'
assert not out.exists(), 'Preserve existing dated capture'
out.write_text(json.dumps({'captured_utc': datetime.now(timezone.utc).isoformat(), 'target': {k: target[k] for k in ('instance', 'host', 'port', 'database')}, 'version': 77, 'scope': 'Affected catalog metadata only; no business rows', 'sections': sections}, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print(json.dumps({'counts': {k: len(v) for k, v in sections.items()}, 'business_rows_read': 0}))
