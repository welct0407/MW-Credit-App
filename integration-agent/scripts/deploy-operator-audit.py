"""Scoped root deployment of only operator_audit.py and its outbox dispatch.

Preserve a verified package/config copy and previously active relay timer.
No dependency installation, business worker activation or monitoring edit.
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

parser = argparse.ArgumentParser()
parser.add_argument('phase', choices=['freeze', 'install', 'resume'])
parser.add_argument('--commit', required=True)
args = parser.parse_args()
assert os.geteuid() == 0 and os.uname().nodename == 'vm-mw-credit-agent'
checkout = Path('/opt/mw-integration-agent-src')
repo = checkout/'integration-agent'
python = '/opt/mw-integration-agent/.venv/bin/python'
pointer = Path('/var/lib/mw-integration-agent/rollback/operator-audit-current')

def output(*command):
    return subprocess.check_output(command, text=True).strip()

def run(*command):
    subprocess.run(command, check=True)

def hashes(root):
    return {str(f.relative_to(root)): hashlib.sha256(f.read_bytes()).hexdigest()
            for f in root.rglob('*') if f.is_file()}

assert not output('git', '-C', str(checkout), 'status', '--porcelain')
assert output('git', '-C', str(checkout), 'rev-parse', 'HEAD') == args.commit
if args.phase == 'freeze':
    backup = pointer.parent/('operator-audit-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    backup.mkdir(mode=0o700)
    active = output('systemctl', 'show', 'mw-audit-relay.timer', '-p', 'ActiveState', '--value') == 'active'
    metadata = {'commit': args.commit, 'resume_relay_timer': active}
    pointer.write_text(str(backup))
    run('systemctl', 'stop', 'mw-audit-relay.timer')
    deadline = time.monotonic()+120
    while output('systemctl', 'show', 'mw-audit-relay.service', '-p', 'ActiveState', '--value') in ('active','activating','deactivating'):
        if time.monotonic() > deadline:
            raise SystemExit('Relay still running; timer remains paused')
        time.sleep(1)
    installed = Path(output(python, '-c', 'import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'))
    shutil.copytree(installed, backup/'package')
    shutil.copy2('/etc/mw-integration-agent/config.json', backup/'config.json')
    assert hashes(installed) == hashes(backup/'package')
    metadata.update(installed=str(installed), package_copy_verified=True)
    (backup/'deployment.json').write_text(json.dumps(metadata))
    print(json.dumps({'phase': 'frozen', 'package_copy_verified': True, 'backup': str(backup)}))
else:
    backup = Path(pointer.read_text())
    metadata = json.loads((backup/'deployment.json').read_text())
    assert metadata['commit'] == args.commit and metadata['package_copy_verified']
    assert output('systemctl', 'show', 'mw-audit-relay.timer', '-p', 'ActiveState', '--value') != 'active'
    installed = Path(metadata['installed'])
    if args.phase == 'install':
        assert hashes(installed) == hashes(backup/'package'), 'Installed package changed during maintenance'
        for name in ('outbox.py', 'operator_audit.py'):
            shutil.copy2(repo/'src/mw_integration_agent'/name, installed/name)
            shutil.chown(installed/name, user='root', group='root')
            (installed/name).chmod(0o644)
        run(python, '-m', 'unittest', 'discover', '-s', str(repo/'tests'), '-q')
        metadata['installed_commit'] = args.commit
        (backup/'deployment.json').write_text(json.dumps(metadata))
        print(json.dumps({'phase': 'installed', 'commit': args.commit, 'relay_timer_paused': True}))
    else:
        assert metadata.get('installed_commit') == args.commit
        for name in ('outbox.py', 'operator_audit.py'):
            assert (installed/name).read_bytes() == (repo/'src/mw_integration_agent'/name).read_bytes()
        path = Path('/etc/mw-integration-agent/config.json')
        config = json.loads(path.read_text())
        assert config == json.loads((backup/'config.json').read_text()), 'Configuration drift'
        config['code_version'] = args.commit
        temporary = path.with_suffix('.operator-audit.tmp')
        temporary.write_text(json.dumps(config, indent=2)+'\n')
        shutil.copystat(path, temporary)
        shutil.chown(temporary, user='root', group='mwagent')
        os.replace(temporary, path)
        if metadata['resume_relay_timer']:
            run('systemctl', 'start', 'mw-audit-relay.timer')
        print(json.dumps({'phase': 'resumed', 'commit': args.commit, 'timer_restored': metadata['resume_relay_timer']}))
