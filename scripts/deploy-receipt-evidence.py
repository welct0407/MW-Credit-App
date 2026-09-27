"""Root-only R046 package update. Explicit freeze/install/activate phases, no replay."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

p=argparse.ArgumentParser();p.add_argument('phase',choices=['freeze','install','activate']);p.add_argument('--commit');a=p.parse_args()
assert os.geteuid()==0 and os.uname().nodename=='vm-mw-credit-agent'
repo=Path('/opt/mw-integration-agent-src');private=Path('/etc/mw-integration-agent')
python='/opt/mw-integration-agent/.venv/bin/python'
pointer=Path('/var/lib/mw-integration-agent/rollback/receipt-evidence-current')
units=['mw-conversation-poll','mw-receipt-summary','mw-cash-statement','mw-cash-statement-email-retry','mw-partner-conversation']
def run(*args,**kwargs):return subprocess.run(args,check=True,**kwargs)
def output(*args):return subprocess.check_output(args,text=True).strip()
def active(unit):return output('systemctl','show',unit,'--property=ActiveState','--value')
def save(path,value):
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value,indent=2)+'\n')
    shutil.copystat(path,temporary) if path.exists() else os.chmod(temporary,0o640)
    shutil.chown(temporary,user='root',group='mwagent');os.replace(temporary,path)
if a.phase=='freeze':
    if output('git','-C',str(repo),'status','--porcelain'):raise SystemExit('Runtime checkout dirty')
    backup=pointer.parent/('receipt-evidence-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    metadata={'source_commit':output('git','-C',str(repo),'rev-parse','HEAD'),
              'resume_timers':[u+'.timer' for u in units if active(u+'.timer')=='active']}
    (backup/'deployment.json').write_text(json.dumps(metadata))
    pointer.write_text(str(backup))
    run('systemctl','stop',*[u+'.timer' for u in units])
    deadline=time.monotonic()+1200
    while any(active(u+'.service') in ('active','activating','deactivating') for u in units):
        if time.monotonic()>deadline:raise SystemExit('Workers still running; left timers paused')
        time.sleep(2)
    for name in ('config.json','service-catalogue.json','appsheet-schema.json'):
        if (private/name).exists():shutil.copy2(private/name,backup/name)
    installed=Path(output(python,'-c','import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'))
    shutil.copytree(installed,backup/'package')
    source={str(f.relative_to(installed)):hashlib.sha256(f.read_bytes()).hexdigest() for f in installed.rglob('*') if f.is_file()}
    restored={str(f.relative_to(backup/'package')):hashlib.sha256(f.read_bytes()).hexdigest() for f in (backup/'package').rglob('*') if f.is_file()}
    assert source==restored
    metadata.update(package_copy_verified=True,package_files=len(source),frozen_at=datetime.now(timezone.utc).isoformat())
    (backup/'deployment.json').write_text(json.dumps(metadata,indent=2))
    print(json.dumps({'phase':'frozen','backup':str(backup),'package_copy_verified':True,'source_commit':metadata['source_commit']}))
else:
    backup=Path(pointer.read_text());metadata=json.loads((backup/'deployment.json').read_text())
    assert metadata['package_copy_verified'] and all(active(u+'.timer')!='active' for u in units)
    assert a.commit and output('git','-C',str(repo),'rev-parse','HEAD')==a.commit
    if a.phase=='install':
        # Build tools stay in pip's temporary isolated environment; runtime dependencies stay pinned.
        run(python,'-m','pip','install','--no-deps',str(repo),stdout=subprocess.DEVNULL)
        run(python,'-m','unittest','discover','-s',str(repo/'tests'),'-q')
        metadata['installed_commit']=a.commit
        (backup/'deployment.json').write_text(json.dumps(metadata,indent=2))
        print(json.dumps({'phase':'installed','commit':a.commit,'tests':'passed','effects_resumed':False}))
    else:
        assert metadata.get('installed_commit')==a.commit
        # Run activation with installed package/VM identity. No Add, email or IG call.
        activation=r'''
import base64,json,os
from datetime import datetime,timezone
from pathlib import Path
from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.cash_statement import read_query
from mw_integration_agent.receipt_storage import GCS,BUCKET
from mw_integration_agent.state import transaction
root=Path('/etc/mw-integration-agent');c=json.loads((root/'config.json').read_text())
assert c['state_backend']=='postgres' and c['database_name']=='loan_manager_prod'
assert Path('/etc/mw-integration-agent/secrets/receipt-projector-password.txt').is_file()
assert read_query(c,"SELECT to_json(count(*)=3) FROM information_schema.columns WHERE table_schema='public' AND table_name='Payments' AND column_name IN ('IG Receipt ID','Receipt Image','Receipt Received At');") is True
with transaction(c) as db:db.execute('SELECT receipt_id FROM runtime.receipt_assets LIMIT 0')
probe=dict(c,receipt_bucket=BUCKET)
raw=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
generation,crc=GCS(probe).put('test/receipt-storage/debian-r046.png',raw,'image/png')
stamp=datetime.now(timezone.utc).isoformat()
c.update(receipt_archive_enabled=True,receipt_archive_cutoff=stamp,receipt_environment='prod',receipt_bucket=BUCKET,
 receipt_spool_limit_bytes=536870912,receipt_projector_password_file='/etc/mw-integration-agent/secrets/receipt-projector-password.txt')
catalogue=json.loads((root/'service-catalogue.json').read_text());catalogue['revision']=23
catalogue['services']['receipt_evidence']={'enabled':True,'implemented':True}
validate_config(c);validate_catalogue(catalogue)
print(json.dumps({'config':c,'catalogue':catalogue,'activation_cutoff':stamp,'probe_generation':generation,'probe_crc32c':crc}))
'''
        # Captured private config is never printed or persisted under /tmp/Git.
        prepared=json.loads(output('sudo','-u','mwagent',python,'-c',activation))
        prepared['config']['code_version']=a.commit
        save(private/'config.json',prepared['config']);save(private/'service-catalogue.json',prepared['catalogue'])
        metadata.update(activation_cutoff=prepared['activation_cutoff'],probe_generation=prepared['probe_generation'],activated_commit=a.commit)
        (backup/'deployment.json').write_text(json.dumps(metadata,indent=2))
        run('systemctl','start',*metadata['resume_timers'])
        print(json.dumps({'phase':'activated','commit':a.commit,'activation_cutoff':metadata['activation_cutoff'],
                          'probe_generation':metadata['probe_generation'],'timers_resumed':metadata['resume_timers']}))
