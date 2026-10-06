"""One bounded recovery of the stale pre-Undo GUI test snapshot; DEV only.

The failed GUI sequence restored default children correctly, then its stale
edit re-sent closure fields. This repairs only that disposable fixture, after
the Undo action has been corrected. No trigger or permission bypass.
"""
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
private = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r051-receipt-corrections')
state = private / 'vm01-default-stale-recovery.json'
assert not state.exists(), 'Do not replay; inspect the saved state and current row.'
assert (private / '20261006T110359Z/development-before-v71.dump').exists()
with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    fixtures.setup(c, readonly=False)
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    before = fixtures.readback(c, 'DEFAULT')
    loan = before['Loans'][0]
    assert loan['Row ID'] == 'SYN-R051-UI-DEFAULT'
    assert loan['Defaulted'] is False and loan['Auto Charge Enabled'] is False
    assert loan['Loan Status'] == 'ปิดยอดแล้ว' and str(loan['Close Date']) == '2026-10-06'
    assert not before.get('Repayments') and not before.get('Payments')
    assert len(before['Charges']) == 1 and before['Charges'][0]['Row ID'] == 'SYN-R051-UI-DEFAULT-C'
    assert len(before['Cash Ledger']) == 1 and before['Cash Ledger'][0]['Row ID'] == 'cash:LOAN:SYN-R051-UI-DEFAULT'
    c.execute('UPDATE public."Loans" SET "Loan Status"=%s,"Close Date"=NULL,"Closed By"=NULL,"Default Loss Amount"=NULL WHERE "Row ID"=%s', ('ยังไม่ปิดยอด', loan['Row ID']))
    c.execute('SET CONSTRAINTS ALL IMMEDIATE')
    after = fixtures.readback(c, 'DEFAULT')
    for table, fields in {
        'Charges': ['Row ID', 'Ref Loans', 'Charge Date', 'Principal Due', 'Interest Due', 'Principal Paid', 'Interest Paid'],
        'Cash Ledger': ['Row ID', 'Movement Date', 'Amount', 'Ref From Cash Account', 'Ref To Cash Account', 'Entry Origin', 'Source Type']
    }.items():
        assert [{k: r[k] for k in fields} for r in after[table]] == [{k: r[k] for k in fields} for r in before[table]]
    assert after['Loans'][0]['Loan Status'] == 'ยังไม่ปิดยอด' and after['Loans'][0]['Close Date'] is None
    result = {'status': 'pending', 'purpose': 'Restore disposable fixture after demonstrated stale GUI closure overwrite', 'before': before, 'after': after}
    state.write_text(json.dumps(result, indent=2, default=str, ensure_ascii=False), encoding='utf-8')
    c.commit()
    result['status'] = 'committed'
    state.write_text(json.dumps(result, indent=2, default=str, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'recovered': 'SYN-R051-UI-DEFAULT', 'child_and_cash_financial_fields_unchanged': True, 'auto_charge': False}))
