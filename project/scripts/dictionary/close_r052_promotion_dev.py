"""Document the bounded DEV87 catalogue; no live database or application changes."""
import argparse, hashlib, json, re
from pathlib import Path
from common import load, atomic_write

p=argparse.ArgumentParser()
p.add_argument('--capture',required=True)
p.add_argument('--apply',action='store_true')
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
source=Path(a.capture)
assert source.is_absolute()
raw=source.read_bytes(); data=json.loads(raw)
assert data['identity']['database']=='loan_manager_dev'
assert data['identity']['host']=='TO_FILL_AFTER_CREATE_HOST' and data['identity']['history_version']==87
assert len(data['relations'])==5 and len(data['routines'])==20 and len(data['triggers'])==2
folder=root/'Documents/Data Dictionary/development/postgresql/r052-command'
evidence='https://github.com/welct0407/MW-Credit-App/blob/codex/r052-review-shell/outputs/r052-promotion-readiness/dev87-model-catalog.json'
known={}
for file in folder.glob('*.yaml'):
    doc=load(file)
    known[(doc['identity']['kind'],doc['identity']['name'])]=(file,doc)
updates=[]

def add(kind,name,observation,status,filename=None):
    old=known.get((kind,name))
    if old:
        file,doc=old
        before=hashlib.sha256(file.read_bytes()).hexdigest()
    else:
        stem=filename or re.sub(r'[^a-z0-9]+','-',name.split('(')[0].lower()).strip('-')
        file=folder/(stem+'.yaml'); assert not file.exists()
        before=None
        doc={'format':1,'identity':{'system':'postgresql','component':'loan_manager_dev','kind':kind,'name':name,'scope':'development:R052-command'},'content':{'release':'R052'}}
    doc['verification']={'status':'documented','source':evidence,'coverage':'Actual bounded DEV87 catalog; current fields below supersede dated retained observations. PROD77 and AppSheet definitions unchanged.'}
    doc['content'].update(status=status,observedAt=data['identity']['observed_at'],catalog_observation=observation)
    doc['content']['currentMigration']=87
    serialized=json.dumps(doc,ensure_ascii=False,indent=2)+'\n'
    assert json.loads(serialized)==doc
    updates.append((file,before,serialized))

for relation in data['relations']:
    add('relation','public.'+relation['name'],relation,'DEV87 present; approved V86 governance state is inactive for launch; PROD77 has no corresponding migration applied.')
for routine in data['routines']:
    add('routine','public.'+routine['signature'],routine,'DEV87 actual definition and privileges; notifications/jobs remain deferred and disabled for launch; PROD77 unchanged.')
cap={'roles':data['capability'],'memberships':data['memberships'],'schemas':data['schemas']}
add('settings','R052 DEV application capability',cap,'DEV87 validated; original temporary maintenance authority restored; PROD77 unchanged.','dev-application-capability')
add('settings','R052 DEV notification capture routing',{'triggers':data['triggers'],'captureGate':'mw.pwa_event_capture=enabled is required by the captured trigger function; default runtime activation remains disabled.','ownership':'AppSheet retains scheduled analytics and charge generation; no PWA notification/job activation.'},'DEV87 trigger definitions present, capture gated; notification and replacement job activation deferred.','dev-notification-capture-routing')
for file,before,serialized in updates:
    current=hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
    assert current==before, 'Concurrent dictionary edit: '+str(file)
if a.apply:
    for file,before,serialized in updates:
        current=hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
        assert current==before, 'Concurrent dictionary edit: '+str(file)
        atomic_write(file,serialized)
print(json.dumps({'apply':a.apply,'captureSha256':hashlib.sha256(raw).hexdigest(),'files':[str(f.relative_to(root)).replace('\\','/') for f,_,_ in updates]},indent=2))
