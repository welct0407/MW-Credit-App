#!/usr/bin/env python3
"""Scoped approved telemetry rollout through the existing fixed gcloud/Docker shim.

Never reads secret payloads/tokens, performs deliveries, modifies subscriptions,
creates alerts or calls any VM/controller operation. Private baseline stays outside Git.
"""
import argparse,copy,csv,datetime,hashlib,io,json,os,pathlib,re,subprocess,sys
PROJECT='clever-oasis-508610-n7';NUMBER='737787224638';REGION='asia-southeast1'
SERVICE=DATABASE='mw-grafana-events';RUNTIME=SERVICE+'@'+PROJECT+'.iam.gserviceaccount.com'
ACTOR='codex-cloud@'+PROJECT+'.iam.gserviceaccount.com'
BASE_IMAGE='asia-southeast1-docker.pkg.dev/'+PROJECT+'/mw-monitoring/grafana-mcp-bridge'
FIELDS=[{'fieldPath':'state','order':'ASCENDING'},{'fieldPath':'createdAt','order':'ASCENDING'}]
def run(*args):
 r=subprocess.run(args,capture_output=True,text=True,check=False)
 if r.returncode:raise RuntimeError('Approved command failed: '+str(args[:3])+'; exit='+str(r.returncode))
 return r.stdout

def gc(*args):
 raw=run('gcloud',*args,*(() if any(a.startswith('--format=') for a in args) else ('--format=json',)))
 try:return json.loads(raw or 'null')
 except json.JSONDecodeError:raise RuntimeError('Non-JSON sanitized CLI response at '+str(args[:3])+'; bytes='+str(len(raw)))
def private(path,value):
 path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n')
def service():
 # Secret references are metadata, not payloads. Fetch their scalar columns to
 # avoid a known redactor false-positive on the JSON key named "secret".
 projection='json(metadata,spec.template.metadata,spec.template.spec.containers,spec.template.spec.serviceAccountName,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds,spec.traffic,status)'
 raw=run('gcloud','run','services','describe',SERVICE,'--region='+REGION,'--format='+projection)
 s=json.loads(raw)
 mounts=run('gcloud','run','services','describe',SERVICE,'--region='+REGION,'--flatten=spec.template.spec.volumes','--format=csv[no-heading](spec.template.spec.volumes.name,spec.template.spec.volumes.secret.secretName,spec.template.spec.volumes.secret.items.key,spec.template.spec.volumes.secret.items.path,spec.template.spec.volumes.secret.defaultMode)')
 volumes=[]
 for row in csv.reader(io.StringIO(mounts)):
  assert len(row)==5
  name,secret_name,key,path,mode=row
  # This approved service has exactly five pinned one-item secret mounts.
  assert name and re.fullmatch('mw-grafana-[a-z-]+',secret_name) and key.isdigit() and path=='value'
  secret={'secretName':secret_name,'items':[{'key':key,'path':path}]}
  if mode:assert mode.isdigit();secret['defaultMode']=int(mode)
  volumes.append({'name':name,'secret':secret})
 assert len(volumes)==5
 s['spec']['template']['spec']['volumes']=volumes
 return s
def expected(s):
 t=s['spec']['template']['spec'];assert t['serviceAccountName']==RUNTIME
 c=t['containers'];assert len(c)==1 and c[0]['image'].startswith(BASE_IMAGE+'@sha256:')
 env={e['name']:e for e in c[0].get('env',[])}
 assert env['PUBLIC_BASE_URL']['value']=='https://alerts.mw-credit.com'
 assert env['GCP_PROJECT']['value']==PROJECT and env['FIRESTORE_DATABASE']['value']==DATABASE
 assert env['OWNER_ENABLED']['value']=='true'
 assert all(e.get('value','').startswith('/secrets/') for k,e in env.items() if k.endswith('_FILE'))
 assert all('True'==x['status'] for x in s['status']['conditions'] if x['type'] in ('Ready','ConfigurationsReady','RoutesReady'))
 return c[0],env

def normalize_spec(s):
 d=copy.deepcopy(s['spec']);d.pop('traffic',None)
 t=d['template'];t['metadata'].pop('name',None)
 t['metadata'].get('labels',{}).pop('client.knative.dev/nonce',None)
 for k in list(t['metadata'].get('annotations',{})):
  if k in ('run.googleapis.com/client-name','run.googleapis.com/client-version','run.googleapis.com/operation-id'):del t['metadata']['annotations'][k]
 c=t['spec']['containers'][0];c.pop('image',None)
 c['env']=sorted([e for e in c.get('env',[]) if e['name']!='MONITORING_ENABLED'],key=lambda e:e['name'])
 return d

def indexes():return gc('firestore','indexes','composite','list','--database='+DATABASE,'--filter=COLLECTION_GROUP:deliveries')
def matching(rows):return [i for i in rows if i.get('queryScope')=='COLLECTION' and [f for f in i['fields'] if f['fieldPath']!='__name__']==FIELDS]
def main():
 a=argparse.ArgumentParser();a.add_argument('phase',choices=['baseline','infrastructure','stage','activate','verify']);a.add_argument('--private',required=True);a.add_argument('--evidence',required=True);a.add_argument('--image');a.add_argument('--source');args=a.parse_args()
 root=pathlib.Path(args.private).resolve();assert not str(root).startswith('/workspace/AppSheet-Loan-Project/');root.mkdir(mode=0o700,parents=True,exist_ok=True)
 evidence=pathlib.Path(args.evidence);actual=gc('auth','list','--filter=status:ACTIVE');assert [x['account'] for x in actual]==[ACTOR]
 p=gc('projects','describe',PROJECT);assert p['projectId']==PROJECT and str(p['projectNumber'])==NUMBER and p['lifecycleState']=='ACTIVE'
 policy=gc('projects','get-iam-policy',PROJECT);assert any(b['role']=='roles/owner' and 'condition' not in b and 'serviceAccount:'+ACTOR in b['members'] for b in policy['bindings'])
 if args.phase=='baseline':
  s=service();c,env=expected(s);assert s['status']['traffic']==[{'percent':100,'revisionName':'mw-grafana-events-00014-s6x'}]
  api=gc('services','list','--enabled','--filter=config.name:monitoring.googleapis.com');assert any(x['config']['name']=='monitoring.googleapis.com' for x in api)
  idx=indexes();private(root/'service-before.json',s);private(root/'project-policy-before.json',policy);private(root/'indexes-before.json',idx)
  scheduler=gc('scheduler','jobs','describe','mw-grafana-dispatch','--location='+REGION);private(root/'scheduler-before.json',scheduler)
  private(evidence,{'phase':'baseline','time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actor':ACTOR,'runtime':RUNTIME,'ready_revision':s['status']['latestReadyRevisionName'],'traffic':s['status']['traffic'],'rollback_image':c['image'],'monitoring_flag':env.get('MONITORING_ENABLED',{}).get('value','absent'),'monitoring_api_enabled':True,'matching_index':matching(idx),'metric_writer_direct_grant':any(b['role']=='roles/monitoring.metricWriter' and 'condition' not in b and 'serviceAccount:'+RUNTIME in b['members'] for b in policy['bindings']),'private_configuration_backup':str(root)})
  return
 before=json.loads((root/'service-before.json').read_text());expected(before)
 if args.phase=='infrastructure':
  c,env=expected(service());assert c['image']==before['spec']['template']['spec']['containers'][0]['image'] and normalize_spec(service())==normalize_spec(before)
  idx=indexes();existing=matching(idx);assert len(existing)<=1
  if not existing:
   gc('firestore','indexes','composite','create','--database='+DATABASE,'--collection-group=deliveries','--query-scope=collection','--async','--field-config=field-path=state,order=ascending','--field-config=field-path=createdAt,order=ascending')
  # Only exact approved binding; all unrelated bindings must survive.
  member='serviceAccount:'+RUNTIME
  exists=any(b['role']=='roles/monitoring.metricWriter' and 'condition' not in b and member in b['members'] for b in policy['bindings'])
  if not exists:gc('projects','add-iam-policy-binding',PROJECT,'--member='+member,'--role=roles/monitoring.metricWriter','--condition=None')
  after=gc('projects','get-iam-policy',PROJECT)
  def without_writer(p):
   b=copy.deepcopy(p['bindings'])
   for x in b:
    if x['role']=='roles/monitoring.metricWriter' and 'condition' not in x:x['members']=[y for y in x['members'] if y!=member]
   return sorted([json.dumps(x,sort_keys=True) for x in b if x['members']])
  assert without_writer(policy)==without_writer(after)
  private(root/'project-policy-after.json',after);private(evidence,{'phase':'infrastructure','metric_writer_added':not exists,'unrelated_iam_preserved':True,'matching_index':matching(indexes()),'alerts_created':0});return
 if args.phase=='stage':
  assert args.image and re.fullmatch(re.escape(BASE_IMAGE)+r'@sha256:[a-f0-9]{64}',args.image)
  assert args.source and re.fullmatch('[a-f0-9]{40}',args.source)
  assert matching(indexes()) and all(i['state']=='READY' for i in matching(indexes()))
  current=service();assert normalize_spec(current)==normalize_spec(before)
  assert current['status']['traffic']==before['status']['traffic']
  c,env=expected(current)
  # Resume after a CLI response/redactor failure without creating another revision.
  if not (c['image']==args.image and env.get('MONITORING_ENABLED',{}).get('value')=='true'):
   assert c['image']==before['spec']['template']['spec']['containers'][0]['image']
   run('gcloud','run','services','update',SERVICE,'--region='+REGION,'--image='+args.image,'--update-env-vars=MONITORING_ENABLED=true','--no-traffic','--format=value(status.latestReadyRevisionName)')
  staged=service();c,env=expected(staged);assert c['image']==args.image and env['MONITORING_ENABLED']['value']=='true'
  assert normalize_spec(staged)==normalize_spec(before) and staged['status']['traffic']==before['status']['traffic']
  revision=staged['status']['latestCreatedRevisionName']
  rev=gc('run','revisions','describe',revision,'--region='+REGION,'--format=json(metadata.name,status.conditions,status.imageDigest)')
  assert rev['status']['imageDigest']==args.image and any(x['type']=='Ready' and x['status']=='True' for x in rev['status']['conditions'])
  private(root/'service-staged.json',staged);private(evidence,{'phase':'stage','source':args.source,'image':args.image,'staged_revision':revision,'revision_ready':True,'traffic':staged['status']['traffic'],'unrelated_service_spec_preserved':True,'alerts_created':0});return
 staged=json.loads((root/'service-staged.json').read_text());revision=staged['status']['latestCreatedRevisionName']
 if args.phase=='activate':
  current=service();assert normalize_spec(current)==normalize_spec(staged) and current['status']['latestCreatedRevisionName']==revision
  assert current['status']['traffic']==before['status']['traffic']
  run('gcloud','run','services','update-traffic',SERVICE,'--region='+REGION,'--to-revisions='+revision+'=100','--format=value(status.latestReadyRevisionName)')
  current=service();assert current['status']['traffic']==[{'percent':100,'revisionName':revision}];assert normalize_spec(current)==normalize_spec(before)
  private(root/'service-after.json',current);private(evidence,{'phase':'activate','ready_revision':revision,'traffic':current['status']['traffic'],'unrelated_service_spec_preserved':True,'alerts_created':0});return
 current=service();assert normalize_spec(current)==normalize_spec(before) and current['status']['traffic']==[{'percent':100,'revisionName':revision}]
 scheduler=gc('scheduler','jobs','describe','mw-grafana-dispatch','--location='+REGION)
 old=json.loads((root/'scheduler-before.json').read_text());assert {k:v for k,v in scheduler.items() if k not in ('lastAttemptTime','status','scheduleTime')}=={k:v for k,v in old.items() if k not in ('lastAttemptTime','status','scheduleTime')}
 logs=gc('logging','read','resource.type="cloud_run_revision" AND resource.labels.service_name="'+SERVICE+'" AND resource.labels.revision_name="'+revision+'" AND (jsonPayload.event="monitoring_exported" OR jsonPayload.event="monitoring_export_failed" OR jsonPayload.event="monitoring_failed" OR jsonPayload.event="dispatch_completed")','--limit=12','--freshness=15m','--format=json(timestamp,jsonPayload.event,jsonPayload.count,jsonPayload.status)')
 private(evidence,{'phase':'verify','ready_revision':revision,'traffic':current['status']['traffic'],'scheduler_unchanged':True,'logs':logs,'alerts_created':0})
if __name__=='__main__':
 try:main()
 except Exception as error:
  print('Scoped rollout stopped: '+type(error).__name__+((': '+str(error)) if isinstance(error,RuntimeError) else ''),file=sys.stderr);sys.exit(1)
