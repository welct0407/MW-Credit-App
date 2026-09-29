"""Guarded R049 dictionary promotion from saved PROD AppDoc and SQL metadata.

Read-only planning by default. --apply updates repository documentation only.
"""
import copy
import json
import sys
from pathlib import Path

import yaml

from appdoc_capture import html_tables, objects
from common import ROOT, REPO, atomic_write, digest, dump, load, make_index, write_json
from dictionary import plan_update, validate
from reconcile_captures import app_content, envelope, slug


OUT = REPO / 'outputs/r049-production'
EVIDENCE = 'outputs/r049-production/README.md'
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project/r049-production/after'


def main(apply=False):
    observed, counts, settings = objects(html_tables(PRIVATE / 'prod-after-appdoc.html'))
    assert settings['Version'] == '3.000263' and settings['Runnable?'] == 'Yes'
    assert observed['table', 'Upcoming Charge Summary']['binding']['Data Source'] == 'database-2'
    assert observed['table', 'Upcoming Charge Summary']['binding']['Source Path'] == 'oltp_upcoming_charge_summary_v2'
    index = json.loads((ROOT / 'index.json').read_text(encoding='utf8'))['entries']
    canonical = {(x['system'], x['component'], x['kind'], x['name']): ROOT / x['file']
                 for x in index if x['scope'] == 'production'}
    plans = {}
    selected = {}

    def update(path, values):
        old = load(path)['content']
        changes = [{'pointer': '/content/' + field,
                    'expected': {'state': 'value', 'value': old[field]} if field in old else {'state': 'absent'},
                    'target': {'state': 'value', 'value': value}}
                   for field, value in values.items() if old.get(field) != value]
        if changes:
            plans[path] = plan_update(ROOT, {'file': path.relative_to(ROOT).as_posix(),
                'expected_sha256': digest(path.read_bytes()), 'evidence': EVIDENCE,
                'reason': 'R049 normal App Upgrade to PROD3.000263; saved metadata verified',
                'changes': changes}, validate_candidate=False)

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
            plans[path] = (path, None, dump(doc).encode('utf8'), {'file': path.relative_to(ROOT).as_posix(), 'new': True})

    overlays = list((ROOT / 'development/appsheet/r049-upcoming-summary').glob('*.yaml'))
    overlays += list((ROOT / 'development/postgresql/r049-upcoming-summary').glob('*.yaml'))
    assert len(overlays) == 13
    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))
    assert pg['target']['database'] == 'loan_manager_prod'
    relation = pg['sections']['relations'][0]
    assert relation['name'] == 'oltp_upcoming_charge_summary_v2'
    for path in overlays:
        doc = load(path)
        identity, content = doc['identity'], doc['content']
        system, kind, name = identity['system'], identity['kind'], identity['name']
        if system == 'appsheet':
            value = app_content('oltp', (kind, name), observed[kind, name])
            if kind == 'view' and 'editor_observed' in content:
                supplement = content['editor_observed']
                value['editor_observed'] = {
                    'For this data': supplement['source'],
                    **({'Display name': supplement['display_name']} if 'display_name' in supplement else {})}
            if kind == 'table' and name == 'Upcoming Charge Summary':
                assert value['binding']['Are updates allowed?'] == 'READ_ONLY'
            if kind == 'view' and name in ('Todays Collection Board_Detail', 'Visible Borrowers_Detail'):
                old = load(canonical[system, 'oltp', kind, name])['content']
                if 'editor' in old:
                    editor = copy.deepcopy(old['editor'])
                    order = json.loads(value['definition']['View configuration'])['ColumnOrder']
                    for field in editor.get('fields', []):
                        if field.get('label') == 'Column order':
                            field['text'] = '\n'.join(order)
                            field['controls'] = []
                    value['editor'] = editor
            stage((system, 'oltp', kind, name), value)
        else:
            stage((system, 'loan_manager_prod', kind, name), {
                'definition': relation,
                'columns': {c['name']: c for c in pg['sections']['columns'] if c['relation'] == relation['name']}})
        update(path, {'status': 'Promoted to PROD 2026-09-29; closed, retained as dated DEV evidence',
            'production_delivery': {'evidence': EVIDENCE, 'OLTP': '3.000263', 'OLAP': '1.100208 (unchanged)',
                'PostgreSQL': '56', 'remaining_feature_difference': 'None; environment bindings remain intentional.'}})

    result = validate(ROOT, check_index=False,
                      overrides={p.relative_to(ROOT).as_posix(): yaml.safe_load(a) for p,b,a,r in plans.values()})
    assert not result['errors'], result['errors']
    write_json(OUT / 'oltp-affected-definitions.json',
               {'version': settings['Version'], 'counts': counts, 'objects': selected})
    write_json(OUT / 'dictionary-closure-plan.json',
               [{'file': r['file'], 'new': b is None,
                 'before_sha256': digest(b) if b is not None else None,
                 'after_sha256': digest(a)} for p,b,a,r in plans.values()])
    print(json.dumps({'objects': len(plans), 'new': sum(b is None for p,b,a,r in plans.values()), 'apply': apply}))
    if apply:
        for p,b,a,r in plans.values():
            assert (not p.exists()) if b is None else p.read_bytes() == b, p
        for p,b,a,r in plans.values():
            p.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(p, a)
            assert p.read_bytes() == a
        write_json(ROOT / 'index.json', make_index(ROOT))


if __name__ == '__main__':
    main('--apply' in sys.argv)
