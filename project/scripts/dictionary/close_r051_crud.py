"""Publish selected, evidenced R051 DEV definitions; never edits a live service.

Historical checkpoints supply only properties confirmed saved there. VM changes
below supersede those values. Uninspected properties are not reconstructed.
"""
import json
import re
import sys
from pathlib import Path
from common import ROOT, REPO, load, dump, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug

OUT = REPO / 'outputs/r051-receipt-corrections'
SOURCE = 'outputs/r051-receipt-corrections/vm01-gui-tests-20261006.md'
APPS = {'oltp': ('500b27b6-884a-41e8-a9ec-df801b0110ad', '1.000194'),
        'olap': ('9f3422be-bc87-4a5a-a42a-67528ee80393', '1.000056')}
objects = {}


def read(name):
    return json.loads((OUT / name).read_text(encoding='utf-8-sig'))


def put(app, kind, name, section, value, evidence=SOURCE):
    obj = objects.setdefault((app, kind, name), {'properties': {}, 'evidence': {}})
    obj['properties'][section] = value
    obj['evidence'][section] = evidence


def column(app, table, name, rules, evidence=SOURCE):
    put(app, 'table', table, 'column:' + name, rules, evidence)


def block(text, marker):
    return re.search(r'```(?:text|appsheet)\s*\n(.*?)\n```', text.split(marker, 1)[1], re.S).group(1)


def build():
    receipt = read('receipt-frontend-checkpoint-20261006.json')
    repay = read('repayment-frontend-checkpoint-20261006.json')
    charge = read('charge-frontend-checkpoint-20261006.json')
    oltp = (OUT / 'vm01-oltp-appendix-20261006.md').read_text(encoding='utf-8')
    olap = (OUT / 'vm01-olap-appendix-20261006.md').read_text(encoding='utf-8')
    column('oltp', 'Payments', 'Notes', receipt['notes'])
    column('oltp', 'Payments', 'Amount Received', {'ValidIf': receipt['amount_valid_if']})
    guidance = dict(receipt['correction_guidance'])
    for key in ('AppFormula', 'Content'):
        guidance[key] = guidance[key].replace('[Status] = "Processing"', 'AND(IN([Row ID], Payments[Row ID]), [Status] = "Processing")').replace('[Status] = "Error"', 'AND(IN([Row ID], Payments[Row ID]), [Status] = "Error")')
    column('oltp', 'Payments', 'Correction Guidance', guidance)
    for view, placement in receipt['views'].items():
        put('oltp', 'view', view, 'relative_column_order_change', placement)
    for app in ('oltp', 'olap'):
        column(app, 'Payments', 'Delete Requested', {'Type': 'Yes/No', 'Initial value': 'FALSE', 'App formula': '', 'Show_If': 'FALSE', 'Editable_If': 'FALSE', 'Reset on edit': False})
    put('oltp', 'table', 'Payments', 'Are updates allowed?', 'ADDS_AND_UPDATES')
    put('oltp', 'slice', 'Submitted Receipt Payments', 'Update mode', 'UPDATES_ONLY')
    for creator in read('receipt-creation-bootstrap.json')['receipt_creators']:
        put('oltp', 'action', creator['table'] + '.' + creator['action'], 'added_assignment', {'Delete Requested': 'FALSE'})
    for field in repay['fields']['names']:
        rules = {'EditableIf': 'AND(NOT(STARTSWITH([Row ID], "df10:")), ' + repay['fields']['EditableIf'] + ')'}
        if field == 'Ref Charges': rules.update(repay['Ref Charges'])
        error = repay.get(field + ' Invalid value error')
        if error: rules['Invalid value error'] = error
        column('oltp', 'Repayments', field, rules)
    for name, expr in repay['actions'].items():
        put('oltp', 'action', 'Repayments.' + name, 'OnlyIf', 'AND(NOT(STARTSWITH([Row ID], "df10:")), ' + expr + ')')
    column('oltp', 'Repayments', 'Correction Guidance', repay['Correction Guidance'])
    for name, placement in repay['views'].items(): put('oltp', 'view', name, 'relative_column_order_change', placement)
    for field in charge['EditableIf']['fields'] + ['Ref Loans']:
        rules = {'EditableIf': charge['EditableIf'].get(field, charge['EditableIf']['expression'])}
        if field in charge['ValidIf']: rules['ValidIf'] = charge['ValidIf'][field]
        if field == 'Ref Loans':
            rules['ValidIf'] = 'IF(NOT(IN([Row ID], Charges[Row ID])), Loans[Row ID], IF(COUNT(SELECT(Repayments[Row ID], [Ref Charges] = [_THISROW].[Row ID])) > 0, SELECT(Loans[Row ID], AND([Row ID] = LOOKUP([_THISROW].[Row ID], "Charges", "Row ID", "Ref Loans"), NOT([Defaulted] = TRUE))), SELECT(Loans[Row ID], NOT([Defaulted] = TRUE))))'
        column('oltp', 'Charges', field, rules)
    for name, expr in charge['OnlyIf'].items(): put('oltp', 'action', 'Charges.' + name, 'OnlyIf', expr)
    column('oltp', 'Charges', 'Correction Guidance', charge['Correction Guidance'])
    for name in ('Charges_Detail', 'Charges_Form'): put('oltp', 'view', name, 'relative_column_order_change', 'Prepend Correction Guidance; preserve prior columns/order')
    column('oltp', 'Loans', 'Principal Amount', {
        'EditableIf': block(oltp, 'Loans.Principal Amount.EditableIf — UNSAVED'),
        'ValidIf': block(oltp, 'Loans.Principal Amount.ValidIf — UNSAVED'),
        'Invalid value error': block(oltp, 'Loans.Principal Amount invalid-value error — UNSAVED')})
    column('oltp', 'Loans', 'Loan Type', {
        'ValidIf': 'OR(NOT(IN([Row ID], Loans[Row ID])), [_THIS] <> "ดอกเบี้ยรายวัน", AND(ISNOTBLANK([Original Daily Interest Rate]), OR(NOT([Auto Charge Enabled] = TRUE), AND(ISNOTBLANK([Loan Date]), ISNOTBLANK([Interest Payment Interval]), [Interest Payment Interval] >= 1))))',
        'Invalid value error': block(oltp, 'Loans.Loan Type invalid-value error — DENIED/UNAPPLIED')})
    column('oltp', 'Loans', 'Ref Borrowers', {'EditableIf': block(oltp, 'Loans.Ref Borrowers.EditableIf — inspected UNCHANGED')})
    put('oltp', 'action', 'Loans.Delete', 'OnlyIf', block(oltp, 'Loans Delete.OnlyIf — UNSAVED'))
    put('oltp', 'action', 'Loans.Undo Default', 'Set these columns', {'Defaulted': 'FALSE', 'Loan Status': '"ยังไม่ปิดยอด"', 'Close Date': '""', 'Closed By': '""', 'Default Loss Amount': '""'})
    put('oltp', 'action', 'Business Expenses.Delete', 'Confirmation Message', '"ลบค่าใช้จ่ายนี้หรือไม่? รายการโอนคืนเงินที่มีอยู่ยังคงอยู่ ให้บันทึกเงินที่รับคืนจริงแยกต่างหาก / Delete this expense? Existing reimbursement transfers remain. Record any actual cash return separately."')
    put('oltp', 'action', 'Business Expenses.Delete', 'Needs confirmation?', True)
    column('olap', 'Cash Pool Contributions', 'Net Contribution', {'App formula': 'IF([Transaction Type] = "Contribution", [Amount], 0 - [Amount])'})
    column('olap', 'Cash Ledger', 'Ref Business Expense', {
        'Invalid value error': block(olap, '## Exactly one unsaved delta'),
        'Description': '"ลบค่าใช้จ่ายแล้ว รายการโอนคืนเงินนี้ยังคงอยู่ ให้บันทึกเงินที่รับคืนจริงแยกต่างหาก / Deleting an expense retains its reimbursement transfer. Record any actual cash return separately."',
        'Required': False, 'IsAPartOf': False,
        'ValidIf': 'IF([Entry Origin] = "System", LIST([_THIS]), SELECT(Business Expenses[Row ID], AND([Amount] > 0, [Ref Paid By Cash Holder] = "ch:tommy")))'})
    financial = ['Movement Date', 'Amount', 'Ref From Cash Holder', 'Ref To Cash Holder', 'Ref From Cash Account', 'Ref To Cash Account']
    same = 'AND(IN([_THISROW].[Row ID], Cash Ledger[Row ID]), ' + ', '.join(f'[_THISROW].[{f}] = LOOKUP([_THISROW].[Row ID], "Cash Ledger", "Row ID", "{f}")' for f in financial) + ')'
    errors = {
        'From': '"เลือกบัญชีที่เปิดใช้งานและตรงกับผู้ถือเงินต้นทาง ก่อนเปลี่ยนจำนวน วันที่ หรือบัญชี / Choose an active account belonging to the sending cash holder before changing amount, date, or accounts."',
        'To': '"เลือกบัญชีที่เปิดใช้งานของผู้รับ และต่างจากบัญชีต้นทาง / Choose an active account belonging to the receiving cash holder, different from the sending account."'}
    for side in ('From', 'To'):
        extra = '[Row ID] <> [_THISROW].[Ref From Cash Account], ' if side == 'To' else ''
        expr = f'SELECT(Cash Accounts[Row ID], AND([Ref Cash Holder] = [_THISROW].[Ref {side} Cash Holder], {extra}OR([Active], AND([Row ID] = LOOKUP([_THISROW].[Row ID], "Cash Ledger", "Row ID", "Ref {side} Cash Account"), {same}))))'
        column('olap', 'Cash Ledger', f'Ref {side} Cash Account', {'ValidIf': expr, 'Invalid value error': errors[side]})
    # Saved OLAP54 values are still in effect at56; all proposals after the
    # appendix's stopped state are excluded except the explicitly saved VM work.
    section = olap.split('## Saved54: Settlements.Amount ValidIf', 1)[1]
    column('olap', 'Settlements', 'Amount', {'ValidIf': block(section, 'After:'), 'Invalid value error': block(section, 'Amount Invalid value error:')})
    section = olap.split('## Saved54: Ref Paid From Cash Account', 1)[1]
    column('olap', 'Settlements', 'Ref Paid From Cash Account', {'ValidIf': block(section, 'ValidIf after:'), 'RequiredIf': block(section, 'RequiredIf after:'), 'EditableIf': block(section, 'EditableIf retained:'), 'Initial value': block(section, 'Initial Value retained:'), 'Invalid value error': block(section, 'Invalid value error:')})
    section = olap.split('## Saved54: Complete Transfer action', 1)[1]
    put('olap', 'action', 'Settlements.Complete Transfer', 'OnlyIf', block(section, 'Only if after:'))
    column('olap', 'Settlements', 'Settlement Guidance', {'Type': 'Show', 'Category': 'Text', 'App formula': '""', 'Show': True, 'Content': block(olap, '## Saved54: Settlement Guidance')})


def main(apply=False):
    build()
    candidates = {}
    for (app, kind, name), facts in objects.items():
        content = {'release': 'R051', 'status': 'Open DEV implementation; PROD unchanged', 'app_id': APPS[app][0], 'version': APPS[app][1],
            'coverage': 'Selected saved properties only; unlisted properties retained. UI-relative placement is not a full serialized view definition.',
            'source_representation': 'AppSheet current editor fields and reviewed saved checkpoints', **facts}
        path = ROOT / 'development/appsheet/r051-crud' / (app + '-' + slug(kind + '-' + name) + '.yaml')
        candidates[path] = envelope('appsheet', app, kind, name, content, SOURCE, 'development:R051-crud')
    sql_source = 'outputs/r051-receipt-corrections/vm01-sql-definitions-20261006.json'
    if (REPO / sql_source).exists():
        captured = read('vm01-sql-definitions-20261006.json')
        assert captured['version'] == 72 and captured['database'] == 'loan_manager_dev'
        for kind, items in (('routine', captured['routines']), ('relation', captured['relations'])):
            for item in items:
                path = ROOT / 'development/postgresql/r051-crud' / (slug(kind + '-' + item['name']) + '.yaml')
                content = {'release': 'R051', 'status': 'Applied DEV V72; PROD unchanged', 'database': 'loan_manager_dev', 'catalog_observation': item, 'captured_at': captured['captured_at']}
                candidates[path] = envelope('postgresql', 'loan_manager_dev', kind, item['name'], content, sql_source, 'development:R051-crud')
    originals = {p: p.read_bytes() if p.exists() else None for p in candidates}
    for p, d in candidates.items(): assert not p.exists() or load(p) == d, 'Existing overlay changed; use guarded dictionary update'
    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): d for p, d in candidates.items()})
    assert not result['errors'], result['errors']
    if apply:
        for p, d in candidates.items():
            assert (p.read_bytes() if p.exists() else None) == originals[p]
            atomic_write(p, dump(d).encode('utf-8'))
            assert load(p) == d
        write_json(ROOT / 'index.json', make_index(ROOT))
    write_json(OUT / 'vm01-app-properties-20261006.json', {'apps': APPS, 'objects': [{'app': k[0], 'kind': k[1], 'name': k[2], **v} for k,v in objects.items()]})
    print(json.dumps({'objects': len(candidates), 'applied': apply, 'validation_errors': result['errors']}))


if __name__ == '__main__': main('--apply' in sys.argv)
