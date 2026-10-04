"""Read only the approved inert service/image and asynchronous index/TTL metadata."""
import json
import subprocess

PROJECT='clever-oasis-508610-n7'
REGION='asia-southeast1'
SERVICE='mw-grafana-events'
IMAGE=f'{REGION}-docker.pkg.dev/{PROJECT}/mw-monitoring/grafana-mcp-bootstrap'
PACKAGE=f'projects/{PROJECT}/locations/{REGION}/repositories/mw-monitoring/packages/grafana-mcp-bootstrap'

def read(*args):
    r=subprocess.run(['gcloud',*args,'--format=json'],capture_output=True,stdin=subprocess.DEVNULL,timeout=60)
    if r.returncode: raise RuntimeError(f'Read failed: {args[:3]}: {r.stderr.decode()[:2048]}')
    return json.loads(r.stdout or 'null')

def require(value,message):
    if not value: raise RuntimeError(message)

tags=read('artifacts','docker','tags','list',IMAGE)
versions=[x['version'] for x in tags if x.get('image')==IMAGE and x.get('tag')==PACKAGE+'/tags/v1']
require(len(versions)==1,'Bootstrap tag missing/ambiguous')
digest=versions[0].removeprefix(PACKAGE+'/versions/')
s=read('run','services','describe',SERVICE,'--region='+REGION)
metadata=s['metadata'];template=s['spec']['template'];spec=template['spec'];container=spec['containers'][0]
annotations=metadata.get('annotations',{});scale=template['metadata'].get('annotations',{})
require(metadata.get('labels',{}).get('bridge')=='grafana-mcp-bootstrap-v1','Wrong service marker')
require(annotations.get('run.googleapis.com/ingress')=='all','Wrong ingress')
require(annotations.get('run.googleapis.com/invoker-iam-disabled')=='true','Invoker IAM check enabled')
require(spec['serviceAccountName']==f'{SERVICE}@{PROJECT}.iam.gserviceaccount.com','Wrong runtime identity')
require(container['image']==IMAGE+'@'+digest,'Service image differs from registry tag digest')
require(int(scale.get('autoscaling.knative.dev/minScale','0'))==0,'Wrong minimum instances')
require(int(scale.get('autoscaling.knative.dev/maxScale','0'))==2,'Wrong maximum instances')
require(spec['containerConcurrency']==20 and spec['timeoutSeconds']==300,'Wrong concurrency/timeout')
limits=container['resources']['limits']
require(limits['cpu'] in ('1','1000m') and limits['memory']=='512Mi','Wrong resource limits')
require(container.get('env')==[{'name':'OWNER_ENABLED','value':'false'}],'Unexpected env/secrets')
require(not spec.get('volumes'),'Unexpected mounted secrets')
status=s['status']
require(any(x['type']=='Ready' and x['status']=='True' for x in status['conditions']),'Service not Ready')
require(status['latestReadyRevisionName']==status['latestCreatedRevisionName'],'Latest revision not Ready')
require(status.get('traffic') and all(x.get('percent',0)==100 and x.get('revisionName')==status['latestReadyRevisionName'] for x in status['traffic']),'Unexpected traffic')
revision=read('run','revisions','describe',status['latestReadyRevisionName'],'--region='+REGION)
require(revision['status'].get('imageDigest')==IMAGE+'@'+digest,'Resolved revision digest mismatch')
result={'project':PROJECT,'region':REGION,'service':SERVICE,'url':status['url'],'revision':status['latestReadyRevisionName'],'Ready':True,'image':container['image'],'resolvedImageDigest':revision['status']['imageDigest'],'runtimeServiceAccount':spec['serviceAccountName'],'ingress':annotations['run.googleapis.com/ingress'],'invokerIamDisabled':True,'minInstances':0,'maxInstances':2,'cpu':limits['cpu'],'memory':limits['memory'],'concurrency':spec['containerConcurrency'],'timeoutSeconds':spec['timeoutSeconds'],'environment':container['env'],'mountedSecrets':False}
indexes=read('firestore','indexes','composite','list','--database='+SERVICE)
result['indexes']=[{'name':x['name'],'state':x.get('state')} for x in indexes]
require(len(indexes)==3 and all(x.get('state') in ('READY','CREATING') for x in indexes),'Unexpected index count/state')
result['ttls']=[]
for group in ('events','deliveries','subscriptions','oauth','googleStates','revokedGrants'):
    f=read('firestore','indexes','fields','describe','deleteAfter','--database='+SERVICE,'--collection-group='+group)
    state=f.get('ttlConfig',{}).get('state')
    require(state in ('ACTIVE','CREATING'),'Unexpected TTL state')
    result['ttls'].append({'collectionGroup':group,'state':state})
jobs=read('scheduler','jobs','list','--location='+REGION)
matching=[j for j in jobs if j['name'].split('/')[-1]=='mw-grafana-dispatch']
require(not matching or all(j.get('state')=='PAUSED' for j in matching),'Dispatcher job active')
result['scheduler']='absent' if not matching else 'PAUSED'
print(json.dumps(result,indent=2))
