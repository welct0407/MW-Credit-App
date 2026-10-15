"""Guarded R048 upcoming-charge dictionary promotion from saved PROD metadata.

No live mutations. Preview first, then --apply. Retains dated DEV evidence.
"""
import copy
import json
import sys
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import plan_update, validate
from reconcile_captures import envelope, slug, app_content
from appdoc_capture import objects, html_tables
from pathlib import Path
import yaml

OUT = REPO / 'outputs/r048-production'
EVIDENCE = 'outputs/r048-production/README.md'
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project/r048-production'

def main(apply=False):
    records = json.loads((PRIVATE / 'prod-after-tables.json').read_text(encoding='utf8'))
    assert records == html_tables(PRIVATE / 'prod-after-appdoc.html')
    observed, counts, settings = objects(records)
    assert settings['Version'] == '3.000260' and settings['Runnable?'] == 'Yes'
    index = json.loads((ROOT / 'index.json').read_text(encoding='utf8'))['entries']
    canonical = {(x['system'], x['component'], x['kind'], x['name']): ROOT / x['file']
                 for x in index if x['scope'] == 'production'}
    plans = []
    selected = {}

    def update(path, values):
        old = load(path)['content']
        changes = [{'pointer': '/content/' + field,
                    'expected': {'state': 'value', 'value': old[field]} if field in old else {'state': 'absent'},
                    'target': {'state': 'value', 'value': value}}
                   for field, value in values.items() if old.get(field) != value]
        if changes:
            plans.append(plan_update(ROOT, {'file': path.relative_to(ROOT).as_posix(),
                'expected_sha256': digest(path.read_bytes()), 'evidence': EVIDENCE,
                'reason': 'R048 normal App Upgrade to PROD3.000260; saved metadata verified',
                'changes': changes}, validate_candidate=False))

    def stage(key, values):
        selected[':'.join(key)] = values
        if key in canonical:
            update(canonical[key], values)
        else:
            system, component, kind, name = key
            folder = ROOT / 'systems' / system
            folder = folder / component if system == 'appsheet' else folder
            path = folder / (kind + 's') / (slug(name) + '.yaml')
            assert not path.exists(), path
            doc = envelope(system, component, kind, name, values, EVIDENCE)
            plans.append((path, None, dump(doc).encode('utf8'), {'file': path.relative_to(ROOT).as_posix(), 'new': True}))

    overlays = list((ROOT / 'development/appsheet/r048-upcoming-charges').glob('*.yaml'))
    overlays += list((ROOT / 'development/postgresql/r048-upcoming-charges').glob('*.yaml'))
    assert len(overlays) == 28
    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    for path in overlays:
        doc = load(path)
        identity, content = doc['identity'], doc['content']
        system, kind, name = identity['system'], identity['kind'], identity['name']
        if system == 'appsheet':
            if name == 'Upcoming Charges by Day':
                assert ('view', name) not in observed
            else:
                value = app_content('oltp', (kind, name), observed[kind, name])
                if 'column_changes' in content:
                    current = copy.deepcopy(load(canonical[system, 'oltp', kind, name])['content']['columns'])
                    for col in content['column_changes']:
                        current[col] = value['columns'][col]
                    value = {'columns': current}
                elif kind == 'view':
                    extra = content.get('after', {}).get('value', {}).get('editor_observed')
                    if extra:
                        value['editor_observed'] = extra
                if kind == 'table' and name.startswith('Upcoming'):
                    assert value['binding']['Data Source'] == 'database-2'
                    assert value['binding']['Are updates allowed?'] == 'READ_ONLY'
                stage((system, 'oltp', kind, name), value)
        else:
            relation = next(r for r in pg['relations'] if 'public.' + r['name'] == name)
            stage((system, 'loan_manager_prod', kind, name), {
                'definition': relation,
                'columns': {c['name']: c for c in pg['columns'] if c['relation'] == relation['name']}})
        update(path, {'status': 'Promoted to PROD 2026-09-29; closed, retained as dated DEV evidence',
            'production_delivery': {'evidence': EVIDENCE, 'OLTP': '3.000260', 'OLAP': '1.100208 (unchanged)',
                'PostgreSQL': '55', 'remaining_feature_difference': 'None; environment bindings remain intentional.'}})

    # The Collection detail editor supplement must not retain its former column order.
    key = ('appsheet', 'oltp', 'view', 'Todays Collection Board_Detail')
    path = canonical[key]
    # app_content above replaces the authoritative definition; remove stale duplicated editor
    # supplement by documenting the verified source and order in that field as well.
    old_editor = load(path)['content'].get('editor')
    if old_editor:
        replacement = copy.deepcopy(old_editor)
        order = json.loads(observed['view', key[-1]]['definition']['View configuration'])['ColumnOrder']
        for field in replacement.get('fields', []):
            if field.get('label') == 'Column order':
                field['text'] = '\n'.join(order)
                field['controls'] = []
        # Merge into the existing planned file to preserve one atomic mutation per path.
        for i, (p, before, after, report) in enumerate(plans):
            if p == path:
                candidate = yaml.safe_load(after)
                candidate['content']['editor'] = replacement
                plans[i] = (p, before, dump(candidate).encode('utf8'), report)
                break
    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): yaml.safe_load(a) for p,b,a,r in plans})
    assert not result['errors'], result['errors']
    write_json(OUT / 'oltp-affected-definitions.json', {'version': settings['Version'], 'html_dom_equal': True, 'counts': counts, 'objects': selected})
    write_json(OUT / 'dictionary-closure-plan.json', [{'file': r['file'], 'new': b is None,
        'before_sha256': digest(b) if b is not None else None, 'after_sha256': digest(a)} for p,b,a,r in plans])
    print(json.dumps({'objects': len(plans), 'new': sum(b is None for p,b,a,r in plans), 'apply': apply}))
    if apply:
        for p,b,a,r in plans:
            assert (not p.exists()) if b is None else p.read_bytes() == b, p
        for p,b,a,r in plans:
            p.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(p,a)
            assert p.read_bytes() == a
        write_json(ROOT / 'index.json', make_index(ROOT))

if __name__ == '__main__':
    main('--apply' in sys.argv)
