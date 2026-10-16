"""Guarded selective R052 PROD87 dictionary closure; offline, preview by default."""
import argparse, hashlib, json, os
from pathlib import Path
from common import load, dump, atomic_write, make_index, write_json
from dictionary import validate
from reconcile_captures import envelope, postgres_objects, slug

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--capture',required=True)
p.add_argument('--scope',required=True)
p.add_argument('--acls',required=True)
p.add_argument('--apply',action='store_true')
a=p.parse_args()
repo=Path(__file__).resolve().parents[2]
if os.name=='nt': repo=Path('\\\\?\\'+str(repo))
root=repo/'Documents/Data Dictionary'
capture=Path(a.capture)
assert capture.is_absolute()
raw=capture.read_bytes(); data=json.loads(raw)
scope=json.loads(Path(a.scope).read_text(encoding='utf-8-sig'))
assert scope['sourceCommit']=='b40c69526bc40b2ef3f6ab6b631df8c51695c921'
assert scope['targetDatabase']=='loan_manager_prod' and scope['requiredHistoryVersion']==87
assert data['environment']=='production' and data['version']==87
assert data['target']==dict(instance='mw-credit-pg-20261017',host='TO_FILL_AFTER_CREATE_HOST',port=5432,database='loan_manager_prod')
assert data['identity']==dict(database='loan_manager_prod',operator='postgres',host='TO_FILL_AFTER_CREATE_HOST',port=5432,read_only='on',ssl=True)
s=data['sections']
assert {x['schema']+'.'+x['name'] for x in s['routines']}==set(scope['routineNames']) and len(scope['routineNames'])==47
assert {x['schema']+'.'+x['name'] for x in s['relations']}==set(scope['relations']) and len(scope['relations'])==9
assert {x['name'] for x in s['schemas']}==set(scope['schemaNames'])=={'public','assessment_lab'}
assert all('mw_app_prod_migration_schema_create' not in str(x) for x in s['application_memberships'])
s.setdefault('types',[])
source='outputs/r052/dictionary-production-closure.json'
entries=json.loads((root/'index.json').read_text(encoding='utf-8'))['entries']
known={(x['system'],x['component'],x['kind'],x['name']):root/x['file'] for x in entries if x['scope']=='production'}
plans={}; counts={}

def stage(path,doc):
    assert path not in plans, 'Duplicate path: '+str(path)
    plans[path]=(path.read_bytes() if path.exists() else None,doc)

def canonical(kind,name,content):
    key=('postgresql','loan_manager_prod',kind,name)
    path=known.get(key,root/'systems/postgresql'/(kind+'s')/(slug(name)+'.yaml'))
    if path.exists():
        doc=load(path)
        assert doc['identity']==dict(system='postgresql',component='loan_manager_prod',kind=kind,name=name,scope='production')
        doc['content']=content
        doc['verification'].update(status='documented',source=source,coverage='Actual bounded PROD87 catalogue after grouped migration and temporary authority restoration; no business-row capture.')
    else: doc=envelope(*key,content,source)
    stage(path,doc); counts[kind]=counts.get(kind,0)+1

objects=postgres_objects(data)
for (kind,name),content in objects.items():
    if kind in ('relation','routine','schema'): canonical(kind,name,content)
canonical('settings','R052 production application capability',{'release':'R052','observedAt':data['captured_utc'],'currentMigration':87,'sections':{k:s[k] for k in ('application_roles','application_memberships','database_acl')},'deferredActivation':'Notification delivery, replacement analytics/charge jobs and automatic purge remain disabled. AppSheet retains scheduled job ownership.'})
closed=[]
for path in (root/'development/postgresql/r052-command').glob('*.yaml'):
    doc=load(path); identity=doc['identity']; kind=identity['kind']; name=identity['name']
    affected=(kind=='relation' and name in scope['relations']) or (kind=='routine' and name.split('(')[0] in scope['routineNames']) or (kind=='settings' and name in ('R052 DEV application capability','R052 DEV notification capture routing'))
    if not affected: continue
    doc['content']['status']='SQL scope promoted to PROD V87; retained DEV observations are dated evidence. Environment-specific roles and bindings remain intentional; notifications and replacement jobs remain deferred.'
    doc['content']['production_delivery']={'evidence':source,'PostgreSQL':87,'observedAt':data['captured_utc'],'scope':'SQL definitions/capability only; no AppSheet definition upgrade or notification/job activation.'}
    doc['verification']['coverage']='Dated DEV observation; current production delivery is recorded in content.production_delivery and canonical PROD objects.'
    stage(path,doc); closed.append(identity['name'])
acl_raw=Path(a.acls).read_bytes(); acl_capture=json.loads(acl_raw)
assert acl_capture['environment']=='production' and acl_capture['database']=='loan_manager_prod'
assert acl_capture['sourceCommit']==scope['sourceCommit'] and acl_capture['businessRowsRead']==0
acl_changes=[]
by_relation={}
for row in acl_capture['columns']: by_relation.setdefault(row['relation'],[]).append(row)
for row in acl_capture['objects']:
    key=('postgresql','loan_manager_prod',row['kind'],row['name'])
    path=known.get(key)
    if path is None:
        path=next((p for p,(_,d) in plans.items() if (d['identity']['system'],d['identity']['component'],d['identity']['kind'],d['identity']['name'])==key),None)
    if path is None: continue
    before,doc=plans[path] if path in plans else (path.read_bytes(),load(path))
    definition=doc['content'].get('definition')
    if not isinstance(definition,dict): continue
    changed=[]
    if definition.get('acl')!=row['acl']:
        definition['acl']=row['acl']; changed.append('/content/definition/acl')
    if row['kind']=='relation':
        for col in by_relation.get(row['name'],[]):
            value=doc['content'].get('columns',{}).get(col['name'])
            if isinstance(value,dict) and value.get('acl')!=col['acl']:
                value['acl']=col['acl']; changed.append('/content/columns/'+col['name'].replace('~','~0').replace('/','~1')+'/acl')
    if changed:
        doc.setdefault('evidence',{})
        for pointer in changed: doc['evidence'][pointer]={'reference':source,'reason':'Actual final PROD87 application/reader privileges; unrelated definitions preserved.','observedAt':acl_capture['observedAt']}
        plans[path]=(before,doc)
        acl_changes.append({'file':path.relative_to(root).as_posix(),'pointers':changed})
cap_path=next(p for p,(_,d) in plans.items() if d['identity']['name']=='R052 production application capability')
plans[cap_path][1]['content']['sections']['runtimeSettings']=acl_capture['runtimeSettings']
result=validate(root,check_index=False,overrides={path.relative_to(root).as_posix():doc for path,(_,doc) in plans.items()})
assert not result['errors'],result['errors']
evidence={'release':'R052','environment':'production','version':87,'observedAt':data['captured_utc'],'captureSha256':hashlib.sha256(raw).hexdigest(),'migrationSource':scope['sourceCommit'],'counts':counts,'closedDevOverlays':closed,'finalAclCaptureSha256':hashlib.sha256(acl_raw).hexdigest(),'aclUpdates':acl_changes,'appsheetDefinitionsChanged':False,'businessRowsCaptured':0,'files':[{'file':path.relative_to(root).as_posix(),'beforeSha256':hashlib.sha256(before).hexdigest() if before else None,'afterSha256':hashlib.sha256(dump(doc).encode('utf-8')).hexdigest()} for path,(before,doc) in plans.items()]}
if a.apply:
    for path,(before,doc) in plans.items(): assert (path.read_bytes() if path.exists() else None)==before, 'Concurrent dictionary edit: '+str(path)
    for path,(before,doc) in plans.items():
        assert (path.read_bytes() if path.exists() else None)==before
        path.parent.mkdir(parents=True,exist_ok=True)
        atomic_write(path,dump(doc)); assert load(path)==doc
    write_json(repo/source,evidence)
    write_json(root/'index.json',make_index(root))
print(json.dumps({'apply':a.apply,'captureSha256':evidence['captureSha256'],'productionObjects':counts,'closedDevOverlays':len(closed),'files':len(plans),'aclUpdatedObjects':len(acl_changes),'validationErrors':result['errors']}))
