"""R053 root-only deployment phases. No payment POST, journal migration or replay."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

REPO = Path('/opt/mw-integration-agent-src')
PRIVATE = Path('/etc/mw-integration-agent')
PYTHON = '/opt/mw-integration-agent/.venv/bin/python'
POINTER = Path('/var/lib/mw-integration-agent/rollback/r053-current')
PROJECT = 'clever-oasis-508610-n7'
ORIGIN = 'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
# These oneshot workers can import the replaced package; ingress/proxy stay running.
UNITS = ['mw-conversation-poll', 'mw-receipt-summary', 'mw-cash-statement',
         'mw-cash-statement-email-retry', 'mw-partner-conversation', 'mw-audit-relay']


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree(path):
    return {str(p.relative_to(path)): digest(p) for p in sorted(path.rglob('*'))
            if p.is_file() and '__pycache__' not in p.parts}


def save(path, value, public_to_agent=False):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    if path.exists():
        shutil.copystat(path, temporary)
        shutil.chown(temporary, user=path.stat().st_uid, group=path.stat().st_gid)
    else:
        os.chmod(temporary, 0o640 if public_to_agent else 0o600)
        if public_to_agent:
            shutil.chown(temporary, user='root', group='mwagent')
    os.replace(temporary, path)


def prepare(config, catalogue, candidate, commit, origin, audience, cutoff):
    """Only the explicitly authorized route fields and one capability may change."""
    require(re.fullmatch('[0-9a-f]{40}', commit) is not None, 'Exact commit required')
    require(origin == audience == ORIGIN, 'Wrong production origin/audience')
    try:
        require(datetime.fromisoformat(cutoff).tzinfo is not None, 'Cutoff timezone required')
    except (TypeError, ValueError):
        raise RuntimeError('Explicit valid cutoff required') from None
    require(config.get('state_backend') == 'postgres' and config.get('database_name') == 'loan_manager_prod'
            and config.get('receipt_environment') == 'prod' and config.get('receipt_archive_enabled') is True,
            'Existing production PostgreSQL/archive configuration required')
    require(candidate.get('revision') == 26 and candidate['services'].get('shared_receipt_payment_api') ==
            {'enabled': False, 'implemented': True}, 'Expected reviewed candidate capability')
    require(catalogue.get('default_policy') == 'deny' and catalogue.get('revision', 0) <= 26,
            'Unexpected current catalogue')
    c, cat = copy.deepcopy(config), copy.deepcopy(catalogue)
    c.update(receipt_payment_api_enabled=True, receipt_payment_api_origin=origin,
             receipt_payment_api_audience=audience, receipt_payment_api_cutoff=cutoff, code_version=commit)
    cat['revision'] = 26
    cat['services']['shared_receipt_payment_api'] = {'enabled': True, 'implemented': True}
    return c, cat


def identity():
    require(os.geteuid() == 0 and os.uname().nodename == 'vm-mw-credit-agent', 'Wrong host/user')
    for key, expected in [('project/project-id', PROJECT), ('instance/name', 'vm-mw-credit-agent'),
                          ('instance/service-accounts/default/email', 'mw-integration-agent@' + PROJECT + '.iam.gserviceaccount.com')]:
        request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/' + key,
                                         headers={'Metadata-Flavor': 'Google'})
        with urllib.request.urlopen(request, timeout=5) as response:
            require(response.read(1024).decode().strip() == expected, 'Wrong VM metadata identity')


def checkout(commit):
    require(re.fullmatch('[0-9a-f]{40}', commit or '') is not None, 'Exact commit required')
    require(output('git', '-C', str(REPO), 'rev-parse', 'HEAD') == commit, 'Checkout pin mismatch')
    require(not output('git', '-C', str(REPO), 'status', '--porcelain'), 'Dirty checkout')


def active(unit):
    return output('systemctl', 'show', unit, '--property=ActiveState', '--value')


def quiet():
    require(all(active(u + '.timer') == 'inactive' for u in UNITS), 'Timers not paused')
    require(all(active(u + '.service') in ('inactive', 'failed') for u in UNITS), 'Worker still running')


def installed():
    return Path(output(PYTHON, '-c', 'import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'))


def verify_backup(backup, metadata):
    require(tree(backup / 'package') == metadata['package_hashes'], 'Package backup hash mismatch')
    for name, sha in metadata['config_hashes'].items():
        require(digest(backup / name) == sha, 'Configuration backup hash mismatch')


def verify_install(metadata):
    actual = tree(installed())
    require(actual == metadata['installed_hashes'], 'Installed package changed')
    source = tree(REPO / 'src/mw_integration_agent')
    require(all(actual.get(name) == sha for name, sha in source.items() if name.endswith('.py')),
            'Installed code differs from pinned source')


def probe(config, catalogue, request_id):
    require(re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', request_id or ''),
            'Explicit unused status probe UUID required')
    code = '''import json,sys
from mw_integration_agent.config import validate_config,validate_catalogue
from mw_integration_agent.receipt_api import call
p=json.load(sys.stdin);validate_config(p['config']);validate_catalogue(p['catalogue'])
result=call(p['config'],'GET',request=p['request'])
if result!={'kind':'unresolved'}:raise RuntimeError('Unexpected status probe result')
print('read-only-status-ok')
'''
    result = subprocess.run(['sudo', '-u', 'mwagent', PYTHON, '-c', code],
                            input=json.dumps({'config': config, 'catalogue': catalogue, 'request': request_id}),
                            text=True, capture_output=True)
    require(result.returncode == 0 and result.stdout.strip() == 'read-only-status-ok', 'Read-only OIDC/status probe failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['freeze', 'install', 'activate'])
    parser.add_argument('--commit', required=True)
    parser.add_argument('--origin'); parser.add_argument('--audience'); parser.add_argument('--cutoff')
    parser.add_argument('--probe-request-id')
    args = parser.parse_args()
    identity(); checkout(args.commit)
    if args.phase == 'freeze':
        require(not POINTER.exists(), 'Existing deployment pointer: reconcile before another freeze')
        POINTER.parent.mkdir(parents=True, exist_ok=True)
        backup = POINTER.parent / ('r053-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        backup.mkdir(mode=0o700)
        metadata = {'source_commit': args.commit, 'resume_timers': [u + '.timer' for u in UNITS if active(u + '.timer') == 'active'], 'phase': 'pausing'}
        save(backup / 'deployment.json', metadata)
        POINTER.write_text(str(backup)); os.chmod(POINTER, 0o600)
        run('systemctl', 'stop', *[u + '.timer' for u in UNITS])
        deadline = time.monotonic() + 2400
        while any(active(u + '.service') not in ('inactive', 'failed') for u in UNITS):
            require(time.monotonic() < deadline, 'Workers still running; timers remain paused')
            time.sleep(2)
        quiet()
        for name in ('config.json', 'service-catalogue.json'):
            shutil.copy2(PRIVATE / name, backup / name)
        shutil.copytree(installed(), backup / 'package', ignore=shutil.ignore_patterns('__pycache__'))
        metadata.update(package_hashes=tree(installed()), config_hashes={name: digest(PRIVATE / name) for name in ('config.json', 'service-catalogue.json')}, phase='frozen')
        verify_backup(backup, metadata); save(backup / 'deployment.json', metadata)
        print(json.dumps({'phase': 'frozen', 'backup': str(backup), 'commit': args.commit, 'backup_metadata_sha256': digest(backup / 'deployment.json')}))
        return
    backup = Path(POINTER.read_text())
    require(backup.parent.resolve() == POINTER.parent.resolve() and backup.name.startswith('r053-'), 'Invalid backup pointer')
    metadata = json.loads((backup / 'deployment.json').read_text())
    quiet(); verify_backup(backup, metadata)
    for name, sha in metadata['config_hashes'].items():
        require(digest(PRIVATE / name) == sha, 'Live configuration drift; left paused')
    if args.phase == 'install':
        require(metadata['phase'] == 'frozen', 'Expected frozen deployment')
        run(PYTHON, '-m', 'pip', 'install', '--no-deps', '--no-build-isolation', str(REPO))
        metadata.update(installed_commit=args.commit, installed_hashes=tree(installed()), phase='installed')
        verify_install(metadata); save(backup / 'deployment.json', metadata)
        print(json.dumps({'phase': 'installed', 'commit': args.commit, 'effects_resumed': False}))
        return
    require(metadata['phase'] == 'installed' and metadata['installed_commit'] == args.commit, 'Installed pin mismatch')
    verify_install(metadata)
    config, catalogue = prepare(json.loads((PRIVATE / 'config.json').read_text()), json.loads((PRIVATE / 'service-catalogue.json').read_text()),
                                json.loads((REPO / 'service-catalogue.json').read_text()), args.commit, args.origin, args.audience, args.cutoff)
    probe(config, catalogue, args.probe_request_id)
    # Both writes occur while every affected worker remains stopped. Failure leaves them stopped.
    save(PRIVATE / 'config.json', config, True); save(PRIVATE / 'service-catalogue.json', catalogue, True)
    require(json.loads((PRIVATE / 'config.json').read_text()) == config and json.loads((PRIVATE / 'service-catalogue.json').read_text()) == catalogue, 'Activation readback mismatch')
    metadata.update(phase='activated', activated_commit=args.commit, cutoff=args.cutoff,
                    activated_hashes={name: digest(PRIVATE / name) for name in ('config.json', 'service-catalogue.json')})
    save(backup / 'deployment.json', metadata)
    if metadata['resume_timers']:
        run('systemctl', 'start', *metadata['resume_timers'])
    print(json.dumps({'phase': 'activated', 'commit': args.commit, 'cutoff': args.cutoff, 'timers_resumed': metadata['resume_timers']}))


if __name__ == '__main__':
    main()
