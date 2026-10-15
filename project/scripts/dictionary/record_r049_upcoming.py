"""Record the R049 DEV-only SQL provider; never manufacture app evidence."""
import json
import sys
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug

OUT = REPO / 'outputs/r049-upcoming-summary'
SOURCE = 'outputs/r049-upcoming-summary/HANDOVER.md'

def main(apply=False):
    pg = json.loads((OUT / 'postgresql-affected-definitions.json').read_text(encoding='utf8'))['sections']
    relation = next(r for r in pg['relations'] if r['name'] == 'oltp_upcoming_charge_summary_v2')
    value = {'definition': relation, 'columns': {c['name']: c for c in pg['columns'] if c['relation'] == relation['name']}}
    assert list(value['columns']) == ['Row ID', 'Ref Borrower', 'Due Date', 'Total Charge', 'As Of Date']
    doc = envelope('postgresql', 'loan_manager_dev', 'relation', 'public.' + relation['name'], {
        'release': 'R049', 'status': 'DEV SQL implemented; AppSheet integration pending',
        'target': 'loan_manager_dev', 'migration': 'V56', 'definition_evidence': SOURCE,
        'before': {'state': 'absent'}, 'after': {'state': 'value', 'value': value},
    }, SOURCE, 'development:R049-upcoming-summary')
    path = ROOT / 'development/postgresql/r049-upcoming-summary' / (slug('relation-public.' + relation['name']) + '.yaml')
    before = path.read_bytes() if path.exists() else None
    data = dump(doc).encode('utf8')
    assert before is None or before == data, 'Existing overlay differs; review before replacing'
    result = validate(ROOT, check_index=False, overrides={path.relative_to(ROOT).as_posix(): doc})
    assert not result['errors'], result['errors']
    write_json(OUT / 'sql-dictionary-plan.json', {'file': path.relative_to(ROOT).as_posix(), 'before_sha256': digest(before) if before else None, 'after_sha256': digest(data)})
    if apply:
        assert (path.read_bytes() if path.exists() else None) == before
        atomic_write(path, data)
        assert load(path) == doc
        write_json(ROOT / 'index.json', make_index(ROOT))
    print(json.dumps({'objects': 1, 'apply': apply, 'appsheet_evidence': 'pending'}))

if __name__ == '__main__':
    main('--apply' in sys.argv)
