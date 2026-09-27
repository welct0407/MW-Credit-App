"""Guarded, targeted R048 original-interest dictionary closure from PROD evidence."""
import copy
import json
import re
import sys
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import plan_update, validate
from reconcile_captures import envelope, slug
import yaml

OUT = REPO / 'outputs/r048-loan-interest-production'
EVIDENCE = 'outputs/r048-loan-interest-production/README.md'
FIELD = 'Original Daily Interest Rate'

def main(apply=False):
    index = json.loads((ROOT / 'index.json').read_text())['entries']
    objects = {(x['system'], x['component'], x['kind'], x['name']): ROOT / x['file']
               for x in index if x['scope'] == 'production'}
    candidates = []

    def stage_path(path, values, evidence):
        old = load(path)
        changes = [{'pointer': '/content/' + field,
                    'expected': {'state': 'value', 'value': old['content'][field]} if field in old['content'] else {'state': 'absent'},
                    'target': {'state': 'value', 'value': value}}
                   for field, value in values.items() if old['content'].get(field) != value]
        if not changes:
            return
        patch = {'file': path.relative_to(ROOT).as_posix(), 'expected_sha256': digest(path.read_bytes()),
                 'evidence': evidence, 'reason': 'Owner-authorized R048 manual PROD cutover; targeted saved-state closure', 'changes': changes}
        candidates.append(plan_update(ROOT, patch, validate_candidate=False))

    def stage(key, values, evidence):
        if key in objects:
            stage_path(objects[key], values, evidence)
        else:
            system, component, kind, name = key
            assert system == 'postgresql' and kind == 'routine'
            path = ROOT / 'systems/postgresql/routines' / (slug(name) + '.yaml')
            assert not path.exists()
            doc = envelope(system, component, kind, name, values, evidence)
            candidates.append((path, None, dump(doc).encode('utf8'), {'file': path.relative_to(ROOT).as_posix(), 'new': True}))

    app = json.loads((REPO / 'outputs/r048-loan-interest/app-evidence.json').read_text(encoding='utf8'))
    slices = json.loads((OUT / 'slices-observed.json').read_text(encoding='utf8'))
    for role, slice_name in [('oltp', 'R008 Loan Commands'), ('olap', 'Reporting Loans')]:
        key = ('appsheet', role, 'table', 'Loans')
        columns = copy.deepcopy(load(objects[key])['content']['columns'])
        rate = app['original_rate']
        columns[FIELD] = {
            'inventory': {'App': role.upper(), 'Table': 'Loans', 'Column': FIELD, 'Type': 'Number',
                          'Virtual': 'No', 'Key': 'No', 'Label': 'No', 'Read-only': 'Yes', 'Hidden': 'No'},
            'rules': {'Column name': FIELD, 'Type': 'Number', 'Visible?': 'ALWAYS', 'Read-Only': 'Yes',
                      'Hidden': 'No', 'Key': 'No', 'Label': 'No', 'Virtual?': 'No', 'Reset on edit?': 'No',
                      'App formula': '', 'Initial value': '=' + rate['initial_value_' + role] if rate['initial_value_' + role] else '',
                      'Display name': '=' + rate['display_name']},
        }
        columns['Loan Key']['rules']['App formula'] = '=' + app['loan_key'][role]
        if role == 'oltp':
            qualifier = json.loads(columns['Current Daily Interest']['rules']['Type Qualifier'])
            qualifier['Valid_If'] = '=' + app['current_daily_interest']['valid_if']
            qualifier['Editable_If'] = '=' + app['current_daily_interest']['editable_if']
            columns['Current Daily Interest']['rules']['Type Qualifier'] = json.dumps(qualifier, ensure_ascii=False, separators=(',', ':'))
        stage(key, {'columns': columns}, 'outputs/r048-loan-interest-production/app-config-observations.json')

        key = ('appsheet', role, 'slice', slice_name)
        content = copy.deepcopy(load(objects[key])['content'])
        section = slices[role].split('- heading "Slice Columns"')[1].split('- heading "Slice Actions"')[0]
        observed = re.findall(r'- generic: Move 0 Items\n  - generic(?: "Key columns cannot be deleted")?: (.*)', section)
        observed = ['Row ID' if x == 'Row IDKey' else x for x in observed]
        assert observed == content['definition']['Slice Columns'] + [FIELD], (role, observed)
        content['definition']['Slice Columns'] = observed
        content['members'] = [{'Ordinal': n + 1, 'Column': v} for n, v in enumerate(observed)]
        stage(key, content, 'outputs/r048-loan-interest-production/slices-observed.json')

        for name in (['Loans_Form', 'Loans_Detail'] if role == 'oltp' else ['Loans_Detail']):
            key = ('appsheet', role, 'view', name)
            content = copy.deepcopy(load(objects[key])['content'])
            config = json.loads(content['definition']['View configuration'])
            assert FIELD not in config['ColumnOrder']
            at = config['ColumnOrder'].index('Current Daily Interest') + 1
            config['ColumnOrder'].insert(at, FIELD)
            content['definition']['View configuration'] = json.dumps(config, ensure_ascii=False, separators=(',', ':'))
            for item in content.get('editor', {}).get('fields', []):
                if item.get('label') == 'Column order':
                    assert FIELD not in item['text']
                    item['text'] = item['text'].replace('Current Daily Interest\n', 'Current Daily Interest\n' + FIELD + '\n')
                    checks = [i for i, c in enumerate(item['controls']) if c.get('type') == 'checkbox']
                    if at < len(checks):
                        item['controls'].insert(checks[at], copy.deepcopy(item['controls'][checks[at]]))
                    else:
                        item['controls'].append(copy.deepcopy(item['controls'][checks[-1]]))
            stage(key, content, 'outputs/r048-loan-interest-production/app-config-observations.json')

    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    dev = json.loads((REPO / 'outputs/r048-loan-interest/postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    deps = json.loads((OUT / 'sql-verification.json').read_text(encoding='utf8'))['view_dependencies']
    pg_evidence = 'outputs/r048-loan-interest-production/postgresql-affected-definitions.json'
    for relation in pg['relations']:
        name = relation['name']
        key = ('postgresql', 'loan_manager_prod', 'relation', 'public.' + name)
        old = load(objects[key])['content']
        values = {'definition': relation, 'columns': {x['name']: x for x in pg['columns'] if x['relation'] == name}}
        if name == 'Loans':
            values['constraints'] = {x['name']: x for x in pg['constraints'] if x['relation'] == name}
        else:
            values['dependencies'] = [x for x in deps if x['relation'] == name]
        if 'development_definition' in old:
            values['development_definition'] = next(x for x in dev['relations'] if x['name'] == name)
        stage(key, values, pg_evidence)
    for routine in pg['routines']:
        key = ('postgresql', 'loan_manager_prod', 'routine', 'public.' + routine['name'] + '(' + routine['arguments'] + ')')
        values = {'definition': routine}
        if key in objects and 'development_definition' in load(objects[key])['content']:
            values['development_definition'] = next(x for x in dev['routines'] if x['name'] == routine['name'] and x['arguments'] == routine['arguments'])
        stage(key, values, pg_evidence)
    overlays = list((ROOT / 'development/appsheet/r048').glob('*interest.yaml')) + list((ROOT / 'development/postgresql/r048').glob('*.yaml'))
    assert len(overlays) == 13
    for path in overlays:
        stage_path(path, {
            'status': 'Delivered to PROD 2026-09-28 by owner-authorized manual cutover; closed, retained as dated DEV evidence',
            'production_delivery': {'evidence': EVIDENCE, 'OLTP': '3.000257', 'OLAP': '1.100208', 'PostgreSQL': '53',
                                    'remaining_feature_difference': 'None; environment bindings and different missing-basis data remain intentional.'},
        }, EVIDENCE)
    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): yaml.safe_load(a) for p, b, a, r in candidates})
    if result['errors']:
        raise ValueError(result['errors'])
    write_json(OUT / 'dictionary-closure-plan.json', [
        {'file': r['file'], 'new': b is None, 'before_sha256': digest(b) if b is not None else None,
         'after_sha256': digest(a), 'changed_pointers': [c['pointer'] for c in r.get('changes', [])]}
        for p, b, a, r in candidates])
    print(json.dumps({'objects': len(candidates), 'new': sum(b is None for _, b, _, _ in candidates), 'apply': apply}))
    if apply:
        for p, b, a, r in candidates:
            assert (not p.exists()) if b is None else p.read_bytes() == b, p
        for p, b, a, r in candidates:
            p.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(p, a)
            assert p.read_bytes() == a
        write_json(ROOT / 'index.json', make_index(ROOT))

if __name__ == '__main__':
    main('--apply' in sys.argv)
