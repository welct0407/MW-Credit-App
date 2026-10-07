"""Read/reconcile the original R051 GUI fixture, including actual GUI UNIQUEIDs.

Cleanup is exact-inventory guarded, source-owned and backed up privately. It
never uses the historical static cleanup list as complete runtime inventory.
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, r'C:\Users\MWCredit\AppData\Local\AppSheetLoanTools\python-deps')
import psycopg
from psycopg import sql
from R051UiAdditionalFixtures import rows, keys, setup

mode = sys.argv[1]
assert mode in ('readback', 'cleanup')
repo = Path(__file__).resolve().parents[2]
target = json.loads((repo / 'database/environments.json').read_text())['development']
assert (target['instance'], target['host'], target['database']) == ('appsheet-pg-prod-20260914', '34.21.174.215', 'loan_manager_dev')
private = Path('C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r051-receipt-corrections')
inventory = private / 'vm01-original-readback.json'
state = private / 'vm01-original-cleanup.json'
borrower = 'SYN-R051-UI-B'
accounts = ['SYN-R051-UI-DAD', 'SYN-R051-UI-LISA']


def read(c):
    result = {}
    result['Borrowers'] = rows(c, 'Borrowers', '"Row ID"=%s', [borrower])
    result['Loans'] = rows(c, 'Loans', '"Ref Borrowers"=%s OR "Row ID"=ANY(%s)', [borrower, ['SYN-R051-UI-L1', 'SYN-R051-UI-L2']])
    loans = keys(result, 'Loans')
    result['Charges'] = rows(c, 'Charges', '"Ref Loans"=ANY(%s) OR "Row ID"=ANY(%s)', [loans, ['SYN-R051-UI-C0', 'SYN-R051-UI-C1', 'SYN-R051-UI-C2']])
    charges = keys(result, 'Charges')
    result['Payments'] = rows(c, 'Payments', '"Ref Borrower"=%s OR "Row ID"=ANY(%s)', [borrower, ['SYN-R051-UI-P1', 'SYN-R051-UI-P2', 'Bx59mH6SCh4OMcWXvOpo6Y']])
    payments = keys(result, 'Payments')
    result['Payment Allocations'] = rows(c, 'Payment Allocations', '"Ref Payment"=ANY(%s) OR "Ref Charge"=ANY(%s)', [payments, charges])
    result['Repayments'] = rows(c, 'Repayments', '"Ref Loans"=ANY(%s) OR "Ref Charges"=ANY(%s) OR "Ref Payment"=ANY(%s)', [loans, charges, payments])
    result['Business Expenses'] = rows(c, 'Business Expenses', '"Ref Related Loan"=ANY(%s) OR "Ref Related Borrower"=%s OR "Ref Payee Borrower"=%s OR "Row ID"=%s', [loans, borrower, borrower, 'SYN-R051-UI-E'])
    result['Cash Ledger'] = rows(c, 'Cash Ledger', '"Ref Loan"=ANY(%s) OR "Ref Payment"=ANY(%s) OR "Ref Business Expense"=ANY(%s) OR "Ref From Cash Account"=ANY(%s) OR "Ref To Cash Account"=ANY(%s) OR "Row ID"=%s', [loans, payments, keys(result, 'Business Expenses'), accounts, accounts, 'SYN-R051-UI-H'])
    result['Cash Accounts'] = rows(c, 'Cash Accounts', '"Row ID"=ANY(%s)', [accounts])
    return result


with psycopg.connect(host=target['host'], port=target['port'], dbname=target['database'], user=target['user'], password=Path(target['passwordFile']).read_text().strip(), sslmode='require', connect_timeout=15) as c:
    setup(c, readonly=mode == 'readback')
    assert c.execute('SELECT current_database(),host(inet_server_addr()),session_user').fetchone() == ('loan_manager_dev', target['host'], 'postgres')
    assert c.execute('SELECT version,checksum FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1').fetchone() == ('72', -1995290851)
    before = read(c)
    if mode == 'readback':
        inventory.write_text(json.dumps(before, indent=2, default=str), encoding='utf-8')
    else:
        assert not state.exists(), 'Prior attempt exists; reconcile before retry'
        backup = json.loads((repo / 'outputs/r051-receipt-corrections/vm01-development-backup.json').read_text())
        assert backup['restored_fingerprints_match'] and Path(backup['backup_file']).is_file()
        captured = json.loads(inventory.read_text())
        assert {t: sorted(keys(before,t)) for t in before} == {t: sorted(keys(captured,t)) for t in captured}, 'Inventory changed'
        assert all(r['Ref Borrowers'] == borrower and r['Auto Charge Enabled'] is False for r in before['Loans'])
        assert all(r['Ref Borrower'] == borrower for r in before['Payments'])
        loans, charges, payments = (keys(before,t) for t in ('Loans','Charges','Payments'))
        assert all(r['Ref Loans'] in loans for r in before['Charges'])
        assert all(r['Ref Payment'] in payments and r['Ref Charge'] in charges for r in before['Payment Allocations'])
        assert all(r['Ref Loans'] in loans and r['Ref Charges'] in charges and r.get('Ref Payment') in payments + [None] for r in before['Repayments'])
        assert all(r.get('Ref Related Loan') in loans + [None] and r.get('Ref Related Borrower') in [borrower,None] and r.get('Ref Payee Borrower') in [borrower,None] for r in before['Business Expenses'])
        assert all(r.get('Ref Loan') in loans + [None] and r.get('Ref Payment') in payments + [None] and r.get('Ref Business Expense') in keys(before,'Business Expenses') + [None] and not r.get('Ref Settlement') for r in before['Cash Ledger'])
        assert all(r['Entry Origin'] != 'Manual' or all(r.get(f) in accounts + [None] for f in ('Ref From Cash Account','Ref To Cash Account')) for r in before['Cash Ledger'])
        record = {'outcome': 'pending', 'before': before, 'containment': 'Reviewed owner-only DEV route; original GUI tests finished, no pending writes'}
        state.write_text(json.dumps(record, indent=2, default=str))
        for table in ('Payments','Repayments','Business Expenses','Cash Ledger','Charges','Loans','Borrowers','Cash Accounts'):
            selected = before[table]
            if table == 'Repayments': selected = [r for r in selected if not r.get('Ref Payment') and not r['Row ID'].startswith('df10:')]
            if table == 'Business Expenses': selected = [r for r in selected if r['Source Type'] == 'Manual']
            if table == 'Cash Ledger': selected = [r for r in selected if r['Entry Origin'] == 'Manual']
            row_ids = [r['Row ID'] for r in selected]
            if table == 'Cash Accounts': c.execute('DELETE FROM public."Cash Account Daily Analytics" WHERE "Ref Cash Account"=ANY(%s)', [row_ids])
            if row_ids: c.execute(sql.SQL('DELETE FROM public.{} WHERE "Row ID"=ANY(%s)').format(sql.Identifier(table)), [row_ids])
        c.execute('SET CONSTRAINTS ALL IMMEDIATE')
        after = read(c)
        assert not any(after.values()), 'Cleanup residue; transaction rolled back'
        record['after'] = after
        state.write_text(json.dumps(record, indent=2, default=str))
        c.commit()
        record['outcome'] = 'committed'
        state.write_text(json.dumps(record, indent=2, default=str))
        before = after
    print(json.dumps({'mode': mode, 'keys': {t: keys(before,t) for t in before if before[t]}}))
