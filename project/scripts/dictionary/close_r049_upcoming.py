"""Close dated R049 DEV documentation from private captures; no live writes."""
import json
import sys
from pathlib import Path
from appdoc_capture import objects, html_tables
from common import ROOT, REPO, load, dump, digest, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug, app_content

OUT = REPO / 'outputs/r049-upcoming-summary'
SOURCE = 'outputs/r049-upcoming-summary/HANDOVER.md'
PRIVATE = Path.home() / 'Documents/ChatGPT/AppSheet-Loan-Project/r049-upcoming-summary'
EXPECTED = {
    ('action', 'Upcoming Charge Summary.Open Upcoming Charge Details'),
    ('action', 'Upcoming Charge Summary.View Ref (Ref Borrower)'),
    ('slice', 'Borrower Upcoming Summary'), ('slice', 'Upcoming Summary 7 Days'),
    ('table', 'Upcoming Charge Summary'),
    *[('view', name) for name in ('Borrower Upcoming Summary_Inline',
      'Todays Collection Board_Detail', 'Upcoming Charge Details',
      'Upcoming Charge Summary_Inline', 'Upcoming Charges',
      'Upcoming Summary 7 Days_Detail', 'Visible Borrowers_Detail')],
}

def main(apply=False):
    records = json.loads((PRIVATE / 'after/oltp-tables.json').read_text(encoding='utf8'))
    assert html_tables(PRIVATE / 'after/oltp-appdoc.html') == records
    after, counts, settings = objects(records)
    before, _, baseline = objects(json.loads((PRIVATE / 'before/oltp-tables.json').read_text(encoding='utf8')))
    assert baseline['Version'] == '1.000152'
    assert settings['Version'] == '1.000157' and settings['Runnable?'] == 'Yes'
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    assert changed == EXPECTED, changed ^ EXPECTED
    bindings = json.loads((OUT / 'view-bindings.json').read_text(encoding='utf8'))
    candidates = {}
    for key in sorted(changed):
        kind, name = key
        content = {'release': 'R049', 'status': 'DEV implemented; owner review and PROD promotion pending',
          'app_id': '500b27b6-884a-41e8-a9ec-df801b0110ad', 'version': settings['Version'],
          'before': {'state': 'value', 'value': app_content('oltp', key, before[key])} if key in before else {'state': 'absent'},
          'after': {'state': 'value', 'value': app_content('oltp', key, after[key])}}
        if kind == 'view' and name in bindings:
            content['editor_observed'] = bindings[name]
        path = ROOT / 'development/appsheet/r049-upcoming-summary' / (slug(kind + '-' + name) + '.yaml')
        candidates[path] = envelope('appsheet', 'oltp', kind, name, content, SOURCE, 'development:R049-upcoming-summary')
        assert not path.exists() or load(path) == candidates[path], 'Unexpected existing overlay'
    sqlpaths = list((ROOT / 'development/postgresql/r049-upcoming-summary').glob('*.yaml'))
    assert len(sqlpaths) == 1
    sql = load(sqlpaths[0])
    assert sql['content']['status'] in ('DEV SQL implemented; AppSheet integration pending', 'DEV SQL and AppSheet integration implemented; PROD unchanged')
    sql['content']['status'] = 'DEV SQL and AppSheet integration implemented; PROD unchanged'
    candidates[sqlpaths[0]] = sql
    originals = {p: p.read_bytes() if p.exists() else None for p in candidates}
    result = validate(ROOT, check_index=False, overrides={p.relative_to(ROOT).as_posix(): d for p, d in candidates.items()})
    assert not result['errors'], result['errors']
    write_json(OUT / 'dictionary-closure-plan.json', [{'file': p.relative_to(ROOT).as_posix(),
      'before_sha256': digest(originals[p]) if originals[p] else None,
      'after_sha256': digest(dump(d).encode('utf8'))} for p, d in candidates.items()])
    if apply:
        for path, doc in candidates.items():
            assert (path.read_bytes() if path.exists() else None) == originals[path]
            atomic_write(path, dump(doc).encode('utf8'))
            assert load(path) == doc
        write_json(ROOT / 'index.json', make_index(ROOT))
    write_json(OUT / 'app-config-observations.json', {'baseline': baseline['Version'],
      'version': settings['Version'], 'runnable': True, 'html_dom_equal': True,
      'changed_objects': [{'kind': k, 'name': n} for k, n in sorted(changed)],
      'unrelated_objects_unchanged': True, 'counts': counts})
    print(json.dumps({'app_objects': len(changed), 'sql_objects': 1, 'apply': apply, 'validation_errors': 0}))

if __name__ == '__main__':
    main('--apply' in sys.argv)
