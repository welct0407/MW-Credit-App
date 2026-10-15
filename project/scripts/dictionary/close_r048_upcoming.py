"""Targeted R048 DEV dictionary closure from saved AppDoc and SQL metadata.

No live access. Preview first, then --apply. Never updates production definitions.
"""
import json
import sys
from pathlib import Path
from appdoc_capture import objects, html_tables
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug, app_content

OUT = REPO / 'outputs/r048-upcoming-charges'
SOURCE = 'outputs/r048-upcoming-charges/IMPLEMENTATION.md'
SCOPE = 'development:R048-upcoming-charges'
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project/r048-upcoming-charges'
NEW_TABLES = ['Upcoming Charge Forecast', 'Upcoming Charge Coverage', 'Upcoming Charge Context']
VIEWS = {
    'Upcoming Charges': None,
    'Upcoming Charges by Day': 'Upcoming Charges 7 Days',
    'Borrower Upcoming Charges_Inline': 'Borrower Upcoming 5 Dates',
    'Upcoming Charges Context': 'Upcoming Charge Context',
    'Todays Collection Board_Detail': 'Todays Collection Board',
}


def main(apply=False):
    records = json.loads((PRIVATE / 'oltp-tables.json').read_text(encoding='utf8'))
    assert records == html_tables(PRIVATE / 'oltp-appdoc.html'), 'Incomplete or divergent capture'
    observed, counts, settings = objects(records)
    assert settings['Version'] == '1.000140' and settings['Runnable?'] == 'Yes'
    metadata = {'version': settings['Version'], 'app_id': '500b27b6-884a-41e8-a9ec-df801b0110ad',
                'html_dom_equal': True, 'capture_counts': counts, 'objects': {}}
    candidates = []

    def stage(system, component, kind, name, value):
        content = {'release': 'R048', 'status': 'DEV implemented; owner review and PROD promotion pending',
                   'target': component, 'definition_evidence': SOURCE, **value}
        if system == 'appsheet':
            content.update(app_id=metadata['app_id'], version=settings['Version'])
        doc = envelope(system, component, kind, name, content, SOURCE, SCOPE)
        path = ROOT / 'development' / system / 'r048-upcoming-charges' / (slug(kind + '-' + name) + '.yaml')
        data = dump(doc).encode('utf8')
        before = path.read_bytes() if path.exists() else None
        if before is not None:
            assert before == data, f'Unexpected existing closure file: {path}'
        candidates.append((path, before, data, doc))

    for name in NEW_TABLES:
        obj = observed['table', name]
        assert obj['binding']['Are updates allowed?'] == 'READ_ONLY'
        assert obj['binding']['Data Source'] == 'database-3'
        assert [n for n, c in obj['columns'].items() if c.get('Key') == 'Yes'] == ['Row ID']
        assert obj['columns']['Row ID']['Type'] == 'Text'
        value = app_content('oltp', ('table', name), obj)
        stage('appsheet', 'oltp', 'table', name, {'before': {'state': 'absent'}, 'after': {'state': 'value', 'value': value}})
        metadata['objects']['table:' + name] = value

    for name, columns in [('Borrowers', ['Related Upcoming Charge Forecasts', 'Upcoming Charges', 'Upcoming Charge Note']),
                          ('Loans', ['Related Upcoming Charge Forecasts'])]:
        obj = app_content('oltp', ('table', name), observed['table', name])
        changes = {n: {'before': {'state': 'absent'}, 'after': {'state': 'value', 'value': obj['columns'][n]}} for n in columns}
        assert obj['columns']['Related Upcoming Charge Forecasts']['rules']['Hidden'] == 'Yes'
        stage('appsheet', 'oltp', 'table', name, {'column_changes': changes})
        metadata['objects']['table-columns:' + name] = changes

    for (kind, name), obj in observed.items():
        if kind != 'slice' or 'Upcoming' not in str(obj):
            continue
        value = app_content('oltp', (kind, name), obj)
        stage('appsheet', 'oltp', kind, name, {'after': {'state': 'value', 'value': value},
              'before': {'state': 'absent'} if name in ['Upcoming Charges 7 Days', 'Borrower Upcoming 5 Dates'] else
                        {'state': 'value', 'value': {'Slice Columns': [n for n in obj['definition']['Slice Columns'] if 'Upcoming' not in n]}},
              'scope_note': 'Existing slice changes are appended forecast members only; filters, update modes and actions preserved.'})
        metadata['objects'][kind + ':' + name] = value

    for name, source in VIEWS.items():
        value = app_content('oltp', ('view', name), observed['view', name])
        value['editor_observed'] = {'For this data': source}
        if name == 'Upcoming Charges':
            value['editor_observed']['Display name'] = '"รายการเรียกเก็บล่วงหน้า / Upcoming Charges"'
        before = {'state': 'absent'}
        if name == 'Todays Collection Board_Detail':
            config = json.loads(value['definition']['View configuration'])
            assert config['ColumnOrder'][-4:] == ['Todays Collection Charges', 'Upcoming Charges', 'Upcoming Charge Note', 'Submitted Receipts']
            # Current editor read before this view edit placed receipts before today's list.
            # The earlier design's repository order was dated evidence, not the live baseline.
            baseline_order = [c for c in config['ColumnOrder'] if 'Upcoming' not in c and c != 'Submitted Receipts']
            baseline_order.insert(baseline_order.index('Todays Collection Charges'), 'Submitted Receipts')
            before = {'state': 'value', 'value': {'ColumnOrder': baseline_order}}
        elif name in ['Upcoming Charges by Day', 'Borrower Upcoming Charges_Inline']:
            config = json.loads(value['definition']['View configuration'])
            assert config['GroupBy'] == [{'Column': 'Due Date', 'Order': 'Ascending'}]
            assert config['GroupAggregate'] == 'SUM :: Amount Remaining' and not config['EnableQuickEdit']
        stage('appsheet', 'oltp', 'view', name, {'before': before, 'after': {'state': 'value', 'value': value}})
        metadata['objects']['view:' + name] = value

    # Generated native detail/ref views have no custom mutation; keep their exact definitions.
    for name in ['oltp_upcoming_charge_events_v1_Detail', 'oltp_upcoming_charge_context_v1_Detail',
                 'oltp_upcoming_charge_coverage_v1_Detail', 'Upcoming Charge Forecast_Inline']:
        value = app_content('oltp', ('view', name), observed['view', name])
        stage('appsheet', 'oltp', 'view', name, {'before': {'state': 'absent'}, 'after': {'state': 'value', 'value': value}})
        metadata['objects']['view:' + name] = value

    # Assert all three money columns use baht; preserve cents in source and display.
    for name in ['Principal Remaining', 'Interest Remaining', 'Amount Remaining']:
        props = observed['table', 'Upcoming Charge Forecast']['columns'][name]
        assert props['Type'] == 'Price' and '฿' in props['Type Qualifier']
    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    for relation in pg['relations']:
        value = {'definition': relation, 'columns': {c['name']: c for c in pg['columns'] if c['relation'] == relation['name']}}
        stage('postgresql', 'loan_manager_dev', 'relation', 'public.' + relation['name'],
              {'before': {'state': 'absent'}, 'after': {'state': 'value', 'value': value}, 'migration': 'V54'})

    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): doc for p, b, d, doc in candidates})
    assert not result['errors'], result['errors']
    write_json(OUT / 'app-config-observations.json', metadata)
    write_json(OUT / 'dictionary-closure-plan.json', [{'file': p.relative_to(ROOT).as_posix(), 'before_sha256': digest(b) if b else None,
               'after_sha256': digest(d)} for p, b, d, doc in candidates])
    if apply:
        for p, before, data, doc in candidates:
            assert (p.read_bytes() if p.exists() else None) == before
        for p, before, data, doc in candidates:
            atomic_write(p, data)
            assert load(p) == doc
        write_json(ROOT / 'index.json', make_index(ROOT))
    print(json.dumps({'objects': len(candidates), 'version': settings['Version'], 'html_dom_equal': True, 'apply': apply}))


if __name__ == '__main__':
    main('--apply' in sys.argv)
