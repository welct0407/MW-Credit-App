"""Guarded R051 production dictionary closure; repository writes only."""
import json
import sys
from pathlib import Path
from appdoc_capture import html_tables, objects
from common import ROOT, REPO, atomic_write, digest, dump, load, make_index, write_json
from dictionary import validate
from reconcile_captures import app_content, envelope, postgres_objects, slug

OUT = REPO / 'outputs/r051-production'
SOURCE = 'outputs/r051-production/README.md'
PRIVATE = Path(r'C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r051-production\after')

def main(apply=False):
    captures = {}
    for app, version in [('oltp', '3.000270'), ('olap', '1.100212')]:
        observed, counts, settings = objects(html_tables(PRIVATE / f'prod-{app}-appdoc.html'))
        assert settings['Version'] == version and settings['Runnable?'] == 'Yes'
        captures[app] = observed
    index = json.loads((ROOT / 'index.json').read_text(encoding='utf8'))['entries']
    canonical = {(x['system'], x['component'], x['kind'], x['name']): ROOT / x['file'] for x in index if x['scope'] == 'production'}
    plans = {}
    selected = {}

    def stage(key, value):
        path = canonical.get(key)
        if path:
            before = path.read_bytes()
            doc = load(path)
            doc['content'] = value
            doc['verification']['source'] = SOURCE
        else:
            system, component, kind, name = key
            folder = ROOT / 'systems' / system
            if system == 'appsheet': folder /= component
            path = folder / (kind + 's') / (slug(name) + '.yaml')
            assert not path.exists(), path
            before = None
            doc = envelope(*key, value, SOURCE)
        plans[path] = (before, doc)
        selected[':'.join(key)] = value

    overlays = list((ROOT / 'development/appsheet/r051-crud').glob('*.yaml'))
    app_keys = {(load(p)['identity']['component'], load(p)['identity']['kind'], load(p)['identity']['name']) for p in overlays}
    affected_tables = {'Borrowers', 'Loans', 'Charges', 'Payments', 'Repayments', 'Payment Allocations', 'Business Expenses'}
    app_keys.update((app, 'table', name) for app in captures for name in affected_tables)
    app_keys.update(('olap', 'action', name) for name in ['Loans.Open in Operational App', 'Charges.Open Charge in Operational App', 'Payments.Open Payment in Operational App', 'Business Expenses.Open Expense in Operational App', 'Statistics.Open Loan Manager'])
    app_keys.add(('oltp', 'action', 'Statistics.Open Loan Business Insights'))
    for app, kind, name in sorted(app_keys):
        stage(('appsheet', app, kind, name), app_content(app, (kind, name), captures[app][kind, name]))

    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))
    assert pg['version'] == 77 and pg['target']['database'] == 'loan_manager_prod'
    for section in ('schemas', 'sequences', 'types'): pg['sections'][section] = []
    for (kind, name), value in postgres_objects(pg).items():
        if kind in ('relation', 'routine'): stage(('postgresql', 'loan_manager_prod', kind, name), value)

    overlays += list((ROOT / 'development/postgresql/r051-crud').glob('*.yaml'))
    for path in overlays:
        before = path.read_bytes()
        doc = load(path)
        retired = doc['identity']['name'] == 'public.oltp_payment_related_ids_v1'
        doc['content']['status'] = ('Rejected experiment retired in DEV and PROD V77; retained as dated evidence' if retired else 'Promoted to PROD 2026-10-07; closed, retained as dated DEV evidence')
        doc['content']['production_delivery'] = {'evidence': SOURCE, 'OLTP': '3.000270', 'OLAP': '1.100212', 'PostgreSQL': '77', 'remaining_feature_difference': 'None; environment bindings remain intentional.'}
        plans[path] = (before, doc)
    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): d for p, (b, d) in plans.items()})
    assert not result['errors'], result['errors']
    write_json(OUT / 'affected-app-definitions.json', {k: v for k, v in selected.items() if k.startswith('appsheet:')})
    write_json(OUT / 'dictionary-closure-plan.json', [{'file': p.relative_to(ROOT).as_posix(), 'before_sha256': digest(b) if b else None, 'after_sha256': digest(dump(d).encode('utf8'))} for p, (b, d) in plans.items()])
    if apply:
        for p, (before, doc) in plans.items(): assert (p.read_bytes() if p.exists() else None) == before, p
        for p, (before, doc) in plans.items():
            p.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(p, dump(doc).encode('utf8'))
            assert load(p) == doc
        write_json(ROOT / 'index.json', make_index(ROOT))
    print(json.dumps({'production_objects': len(selected), 'closed_overlays': len(overlays), 'apply': apply, 'errors': result['errors']}))

if __name__ == '__main__': main('--apply' in sys.argv)
