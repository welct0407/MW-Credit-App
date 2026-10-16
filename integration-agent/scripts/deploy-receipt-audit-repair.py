"""Scoped root maintenance: drain receipt/relay, verify backup, install, resume.

No archive cutoff, catalogue, business schema, credentials or messaging change.
Run resume only after the explicitly authorized audit recovery succeeds.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time

p=argparse.ArgumentParser();p.add_argument('phase',choices=['freeze','install','resume'])
p.add_argument('--commit');a=p.parse_args()
assert os.geteuid()==0 and os.uname().nodename=='vm-mw-credit-agent'
checkout=Path('/opt/mw-integration-agent-src');repo=checkout/'integration-agent';python='/opt/mw-integration-agent/.venv/bin/python'
pointer=Path('/var/lib/mw-integration-agent/rollback/receipt-audit-repair-current')
units=['mw-receipt-summary','mw-audit-relay']
def output(*args):return subprocess.check_output(args,text=True).strip()
def run(*args):subprocess.run(args,check=True)
def active(unit):return output('systemctl','show',unit,'--property=ActiveState','--value')
if a.phase=='freeze':
    assert not output('git','-C',str(checkout),'status','--porcelain')
    backup=pointer.parent/('receipt-audit-repair-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    metadata={'source_commit':output('git','-C',str(checkout),'rev-parse','HEAD'),
              'resume_timers':[u+'.timer' for u in units if active(u+'.timer')=='active']}
    pointer.write_text(str(backup))
    (backup/'deployment.json').write_text(json.dumps(metadata))
    run('systemctl','stop',*[u+'.timer' for u in units])
    deadline=time.monotonic()+600
    while any(active(u+'.service') in ('active','activating','deactivating') for u in units):
        if time.monotonic()>deadline:raise SystemExit('Still running; timers remain paused')
        time.sleep(2)
    installed=Path(output(python,'-c','import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'))
    shutil.copytree(installed,backup/'package')
    shutil.copy2('/etc/mw-integration-agent/config.json',backup/'config.json')
    def hashes(root):return {str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in root.rglob('*') if f.is_file()}
    assert hashes(installed)==hashes(backup/'package')
    metadata.update(package_copy_verified=True,installed=str(installed))
    (backup/'deployment.json').write_text(json.dumps(metadata))
    print(json.dumps({'phase':'frozen','backup':str(backup),'package_copy_verified':True}))
else:
    backup=Path(pointer.read_text());metadata=json.loads((backup/'deployment.json').read_text())
    assert metadata.get('package_copy_verified') and a.commit
    assert output('git','-C',str(checkout),'rev-parse','HEAD')==a.commit
    assert all(active(u+'.timer')!='active' for u in units)
    if a.phase=='install':
        run(python,'-m','pip','install','--no-deps',str(repo))
        run(python,'-m','unittest','discover','-s',str(repo/'tests'),'-q')
        metadata['installed_commit']=a.commit
        (backup/'deployment.json').write_text(json.dumps(metadata))
        print(json.dumps({'phase':'installed','commit':a.commit,'timers_paused':True}))
    else:
        assert metadata['installed_commit']==a.commit
        path=Path('/etc/mw-integration-agent/config.json');config=json.loads(path.read_text())
        before=json.loads((backup/'config.json').read_text())
        assert config==before, 'Configuration changed during maintenance'
        config['code_version']=a.commit
        temporary=path.with_suffix('.audit-repair.tmp');temporary.write_text(json.dumps(config,indent=2)+'\n')
        shutil.copystat(path,temporary);shutil.chown(temporary,user='root',group='mwagent');os.replace(temporary,path)
        run('systemctl','start',*metadata['resume_timers'])
        print(json.dumps({'phase':'resumed','commit':a.commit,'timers':metadata['resume_timers']}))
