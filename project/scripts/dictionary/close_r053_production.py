"""Offline selective R053 PROD89 dictionary closure; preview by default."""
import argparse,json,hashlib,os
from pathlib import Path
from common import load,dump,atomic_write,make_index,write_json
from dictionary import validate
from reconcile_captures import envelope,slug
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--capture',required=True);p.add_argument('--expected-sha256',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
repo=Path(__file__).resolve().parents[2]
if os.name=='nt':repo=Path('\\\\?\\'+str(repo))
root=repo/'Documents/Data Dictionary';capture=Path(a.capture);assert capture.is_absolute();raw=capture.read_bytes();assert hashlib.sha256(raw).hexdigest()==a.expected_sha256;data=json.loads(raw);assert data['identity']=={'database':'loan_manager_prod','operator':'postgres','host':'TO_FILL_AFTER_CREATE_HOST'} and data['sqlVersion']==89 and data['businessRowsRead']==0;assert len(data['routines'])==19 and len(data['roles'])==5
source='outputs/r053-notifications-jobs/dictionary-production-closure.json';entries=json.loads((root/'index.json').read_text(encoding='utf-8'))['entries'];known={(x['kind'],x['name']):root/x['file'] for x in entries if x['system']=='postgresql' and x['component']=='loan_manager_prod' and x['scope']=='production'};plans={}
def get(kind,name):
 path=known.get((kind,name),root/'systems/postgresql'/(kind+'s')/(slug(name)+'.yaml'));before=path.read_bytes() if path.exists() else None;doc=load(path) if before else envelope('postgresql','loan_manager_prod',kind,name,{},source);return path,before,doc
def stage(path,before,doc):
 if before is not None and dump(doc)==before.decode('utf-8'):return
 doc['verification'].update(status='documented',source=source,coverage='Actual affected PROD89 catalogue after maintained migration and authority restoration; no business rows.');plans[path]=(before,doc)
for x in data['routines']:
 name=x['schema']+'.'+x['name']+'('+x['arguments']+')';path,before,doc=get('routine',name);doc['content']['definition']=x;stage(path,before,doc)
for x in data['relations']:
 path,before,doc=get('relation',x['schema']+'.'+x['name']);assert before,'Existing unchanged relation definition required';definition=doc['content']['definition'];changed=False
 for k in ['owner','acl']:
  if definition.get(k)!=x[k]:definition[k]=x[k];changed=True
 for col in data['columns']:
  if col['relation']==x['schema']+'.'+x['name']:
   value=doc['content'].get('columns',{}).get(col['name']);assert value is not None,'Unknown existing column'
   if value.get('acl')!=col['acl']:value['acl']=col['acl'];changed=True
 if changed:stage(path,before,doc)
for x in data['dependencyRoutineAcls']:
 path,before,doc=get('routine',x['name']);assert before,'Existing dependency routine required'
 if doc['content']['definition'].get('acl')!=x['acl']:doc['content']['definition']['acl']=x['acl'];stage(path,before,doc)
x=data['schema'];path,before,doc=get('schema','public');assert before
if doc['content']['definition'].get('acl')!=x['acl']:doc['content']['definition']['acl']=x['acl'];stage(path,before,doc)
path,before,doc=get('settings','R053 production notification jobs and machine capability');doc['content']={'release':'R053','sqlVersion':89,'sourceCommit':data['sourceCommit'],'observedAt':data['observedAt'],'roles':data['roles'],'memberships':data['memberships'],'commandExecute':data['commandExecute'],'captureEnabled':data['captureEnabled'],'runtimeActivationEvidence':'MW-Credit-App outputs/r053-notifications-jobs/production-contained-runtime-evidence.json','note':'SQL state is distinct from final worker/scheduler/device/agent release verification.'};stage(path,before,doc)
result=validate(root,check_index=False,overrides={path.relative_to(root).as_posix():doc for path,(_,doc) in plans.items()});assert not result['errors'],result['errors'];evidence={'release':'R053','sqlVersion':89,'sourceCommit':data['sourceCommit'],'captureSha256':a.expected_sha256,'observedAt':data['observedAt'],'businessRowsRead':0,'appsheetDefinitionsChanged':False,'files':[{'file':path.relative_to(root).as_posix(),'beforeSha256':hashlib.sha256(before).hexdigest() if before else None,'afterSha256':hashlib.sha256(dump(doc).encode('utf-8')).hexdigest()} for path,(before,doc) in plans.items()]}
if a.apply:
 for path,(before,doc) in plans.items():assert (path.read_bytes() if path.exists() else None)==before,'Concurrent edit'
 for path,(before,doc) in plans.items():path.parent.mkdir(parents=True,exist_ok=True);atomic_write(path,dump(doc));assert load(path)==doc
 write_json(repo/source,evidence);write_json(root/'index.json',make_index(root))
print(json.dumps({'apply':a.apply,'files':len(plans),'validationErrors':result['errors']}))
