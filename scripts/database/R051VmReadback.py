"""Bounded read-only VM-01 readback for existing R051 synthetic GUI batches."""
import json
import sys
from pathlib import Path

sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
import R051UiAdditionalFixtures as fixtures

repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == (
    'appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
batch = sys.argv[1]
assert batch in fixtures.BATCHES
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    fixtures.setup(c, readonly=True)
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    data = fixtures.readback(c, batch)
    # Private full snapshot, with only synthetic rows selected by causal references.
    private = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r051-receipt-corrections') / ('vm01-' + batch + '-readback.json')
    private.write_text(json.dumps(data, indent=2, default=str, ensure_ascii=False), encoding='utf-8')
    fields = ['Row ID', 'Amount', 'Principal Amount', 'Loan Date', 'Loan Status', 'Loan Type', 'Current Daily Interest', 'Original Daily Interest Rate', 'Outstanding Principal', 'Due Date', 'Fixed Interest', 'Close Date', 'Expense Date', 'Movement Date', 'Ref Paid By Cash Account', 'Payment Date', 'Amount Received', 'Interest Paid', 'Principal Paid', 'Interest Due', 'Principal Due', 'Defaulted', 'Auto Charge Enabled', 'Status', 'Ref From Cash Account', 'Ref To Cash Account', 'Ref Business Expense']
    fields += ['Delete Requested', 'Allocation Method', 'Ref Target Loan', 'Ref Target Charge', 'Posted Amount', 'Ref Payment', 'Ref Charge']
    print(json.dumps({'preflight': fixtures.preflight(c, batch), 'rows': {t: [{k: r[k] for k in fields if k in r} for r in rows] for t, rows in data.items() if rows}}, default=str))
