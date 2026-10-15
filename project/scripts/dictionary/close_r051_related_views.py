"""Publish reviewed related-view experiment evidence and guarded DEV dictionary delta."""
import json
from common import ROOT, REPO, load, dump, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug

out = REPO / 'outputs/r051-related-list-views'
source = 'outputs/r051-related-list-views/v76-after-contract.json'
capture = json.loads((REPO / source).read_text(encoding='utf-8'))
assert capture['version'] == 76 and capture['key_set_differences'] == 0
name = 'public.oltp_payment_related_ids_v1'
path = ROOT / 'development/postgresql/r051-crud' / (slug('relation-' + name) + '.yaml')
content = {'release': 'R051', 'status': 'Applied DEV V76; dormant after AppSheet experiment rollback; PROD unchanged',
           'database': 'loan_manager_dev', 'captured_at': capture['at'],
           'catalog_observation': {'name': name, 'kind': 'ordinary view', 'security_invoker': True,
                                   'definition': capture['view_definition'], 'columns': capture['view_columns']},
           'consumers': 'No AppSheet binding retained. No physical ID-list columns, cache, triggers or grants added.'}
candidates = {path: envelope('postgresql', 'loan_manager_dev', 'relation', name, content, source, 'development:R051-crud')}
payment = ROOT / 'development/appsheet/r051-crud/oltp-table-payments-e339c2af.yaml'
doc = load(payment)
assert doc['content']['version'] in ['1.000200', '1.000206']
doc['content']['version'] = '1.000206'
trial = json.loads((out / 'formula-trial.json').read_text(encoding='utf-8'))
for column, values in trial['properties'].items():
    doc['content']['properties'].setdefault('column:' + column, {})['AppFormula'] = values['before']
doc['content']['related_list_experiment'] = {'status': 'Original formulas restored; helper binding removed',
                                          'evidence': 'outputs/r051-related-list-views/README.md'}
candidates[payment] = doc
originals = {p: p.read_bytes() if p.exists() else None for p in candidates}
result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): d for p, d in candidates.items()})
assert not result['errors'], result['errors']
for p, d in candidates.items():
    assert (p.read_bytes() if p.exists() else None) == originals[p]
    atomic_write(p, dump(d).encode('utf-8'))
    assert load(p) == d
write_json(ROOT / 'index.json', make_index(ROOT))
print(json.dumps({'objects': len(candidates), 'errors': result['errors']}))
