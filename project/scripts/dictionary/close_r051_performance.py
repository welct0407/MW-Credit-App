"""Guarded DEV dictionary closure for the measured V73 catalog capture."""
import json
import sys
from common import ROOT, REPO, load, dump, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, slug
source='outputs/r051-trigger-performance/sql-definitions.json'
capture=json.loads((REPO/source).read_text(encoding='utf-8'))
assert capture['version']==73 and capture['database']=='loan_manager_dev'
candidates={}; originals={}
for kind,items in [('routine',capture['routines']),('relation',capture['relations'])]:
    for item in items:
        p=ROOT/'development/postgresql/r051-crud'/(slug(kind+'-'+item['name'])+'.yaml')
        originals[p]=p.read_bytes() if p.exists() else None
        if p.exists():
            old=load(p)
            assert old['content']['database']=='loan_manager_dev'
            assert old['content']['status'] in ['Applied DEV V72; PROD unchanged','Applied DEV V73; PROD unchanged']
        content={'release':'R051','status':'Applied DEV V73; PROD unchanged','database':'loan_manager_dev','catalog_observation':item,'captured_at':capture['captured_at']}
        candidates[p]=envelope('postgresql','loan_manager_dev',kind,item['name'],content,source,'development:R051-crud')
result=validate(ROOT,check_index=False,overrides={p.relative_to(ROOT).as_posix():d for p,d in candidates.items()})
assert not result['errors'],result['errors']
if '--apply' in sys.argv:
    for p,d in candidates.items():
        assert (p.read_bytes() if p.exists() else None)==originals[p]
        atomic_write(p,dump(d).encode('utf-8'))
        assert load(p)==d
    write_json(ROOT/'index.json',make_index(ROOT))
print(json.dumps({'objects':len(candidates),'applied':'--apply' in sys.argv,'errors':result['errors']}))
