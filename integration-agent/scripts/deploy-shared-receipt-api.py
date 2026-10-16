"""Root-only deployment phases (R053 engine, R063 receiver gate). No payment POST, journal migration or replay.

dry-run reports without writes; freeze/install/activate deploy; activate restarts the receiver and resumes
timers only after /ready reports the pinned commit, else rolls back automatically; rollback restores the backup."""
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
import urllib.error
import urllib.request

CHECKOUT = Path('/opt/mw-integration-agent-src')  # monorepo checkout: git only
REPO = CHECKOUT / 'integration-agent'  # package, catalogue, units and tests
PRIVATE = Path('/etc/mw-integration-agent')
PYTHON = '/opt/mw-integration-agent/.venv/bin/python'
POINTER = Path('/var/lib/mw-integration-agent/rollback/r053-current')
PREFIX = 'r053-'
SYSTEMD = Path('/etc/systemd/system')
PROJECT = 'clever-oasis-508610-n7'
ORIGIN = 'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
RECEIVER = 'mw-instagram-webhook.service'
# Graph token backup that W1 worker units may write (ReadWritePaths=-...); must exist to be writable.
OAUTH_BACKUP = 'secrets/outlook-email-oauth.json.bak'
READY_TIMEOUT = 30
# These oneshot workers can import the replaced package; they stay paused until the receiver is ready.
UNITS = ['mw-conversation-poll', 'mw-receipt-summary', 'mw-cash-statement',
         'mw-cash-statement-email-retry', 'mw-partner-conversation', 'mw-audit-relay']
UNIT_FILES = [RECEIVER] + [u + '.service' for u in UNITS]
CONFIGS = ('config.json', 'service-catalogue.json')
TERMINAL = ('activated', 'rolled-back')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def git(*args):
    # A non-root dry run may read the root-owned checkout; root keeps git's ownership check.
    trust = ['-c', 'safe.directory=' + str(CHECKOUT)] if os.geteuid() else []
    return ['git', *trust, '-C', str(CHECKOUT), *args]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stamp():
    return datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')


def tree(path):
    return {str(p.relative_to(path)): digest(p) for p in sorted(path.rglob('*'))
            if p.is_file() and '__pycache__' not in p.parts}


def pyfiles(path):
    return {str(p.relative_to(path)): digest(p) for p in sorted(Path(path).rglob('*.py')) if '__pycache__' not in p.parts}


def compare(source, actual, remove=()):
    require(source, 'Empty source tree')
    expected = {k: v for k, v in source.items() if k not in remove}  # removed names must stay absent
    return (sorted(set(actual) - set(expected)), sorted(set(expected) - set(actual)),
            sorted(k for k in set(expected) & set(actual) if expected[k] != actual[k]))


def compare_tree(source_dir, installed_dir, remove=()):
    """(extras, missing, changed) relative *.py names of the installed tree against the source tree."""
    return compare(pyfiles(source_dir), pyfiles(installed_dir), remove)


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


def restore(source, path):
    temporary = path.with_suffix('.tmp')
    temporary.write_bytes(source.read_bytes())
    shutil.copystat(path if path.exists() else source, temporary)
    if path.exists():
        shutil.chown(temporary, user=path.stat().st_uid, group=path.stat().st_gid)
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


IDENTITY = [('project/project-id', PROJECT), ('instance/name', 'vm-mw-credit-agent'),
            ('instance/service-accounts/default/email', 'mw-integration-agent@' + PROJECT + '.iam.gserviceaccount.com')]


def vm_metadata(key):
    request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/' + key,
                                     headers={'Metadata-Flavor': 'Google'})
    with urllib.request.urlopen(request, timeout=5) as response:
        return response.read(1024).decode().strip()


def identity():
    require(os.geteuid() == 0 and os.uname().nodename == 'vm-mw-credit-agent', 'Wrong host/user')
    for key, expected in IDENTITY:
        require(vm_metadata(key) == expected, 'Wrong VM metadata identity')


def checkout(commit):
    require(re.fullmatch('[0-9a-f]{40}', commit or '') is not None, 'Exact commit required')
    require(output(*git('rev-parse', 'HEAD')) == commit, 'Checkout pin mismatch')
    require(not output(*git('status', '--porcelain')), 'Dirty checkout')
    require((REPO / 'pyproject.toml').is_file(), 'Agent package not found at ' + str(REPO))


def ancestry(commit):
    """Is the installed commit an ancestor of the checkout HEAD? Informational, never fatal."""
    if not isinstance(commit, str) or not re.fullmatch('[0-9a-f]{7,40}', commit):
        return 'unknown'
    try:
        code = subprocess.run(git('merge-base', '--is-ancestor', commit, 'HEAD'), capture_output=True).returncode
    except OSError:
        return 'unknown'
    return {0: 'ancestor', 1: 'not-ancestor'}.get(code, 'unknown-object')


def active(unit):
    return output('systemctl', 'show', unit, '--property=ActiveState', '--value')


def invocation():
    return output('systemctl', 'show', RECEIVER, '-p', 'InvocationID', '--value')


def quiet():
    require(all(active(u + '.timer') == 'inactive' for u in UNITS), 'Timers not paused')
    require(all(active(u + '.service') in ('inactive', 'failed') for u in UNITS), 'Worker still running')


def pause():
    run('systemctl', 'stop', *[u + '.timer' for u in UNITS])
    deadline = time.monotonic() + 2400
    while any(active(u + '.service') not in ('inactive', 'failed') for u in UNITS):
        require(time.monotonic() < deadline, 'Workers still running; timers remain paused')
        time.sleep(2)
    quiet()


def installed():
    return Path(output(PYTHON, '-c', 'import mw_integration_agent; print(next(iter(mw_integration_agent.__path__)))'))


def unit_hashes(root):
    return {name: digest(root / name) for name in UNIT_FILES if (root / name).is_file()}


def verify_backup(backup, metadata):
    require(tree(backup / 'package') == metadata['package_hashes'], 'Package backup hash mismatch')
    for name, sha in metadata['config_hashes'].items():
        require(digest(backup / name) == sha, 'Configuration backup hash mismatch')
    require(unit_hashes(backup / 'units') == metadata.get('unit_hashes', {}), 'Unit backup hash mismatch')


def verify_install(metadata):
    actual = tree(installed())
    require(actual == metadata['installed_hashes'], 'Installed package changed')
    require(compare_tree(REPO / 'src/mw_integration_agent', installed(), metadata.get('removed_files', ())) == ([], [], []),
            'Installed code differs from pinned source')


def install_units():
    changed = []
    for name in UNIT_FILES:
        source, target = REPO / 'systemd' / name, SYSTEMD / name
        if not target.is_file() or target.read_bytes() != source.read_bytes():
            shutil.copyfile(source, target)
            os.chmod(target, 0o644)
            changed.append(name)
    run('systemctl', 'daemon-reload')
    return changed


def create_oauth_backup():
    path = PRIVATE / OAUTH_BACKUP
    if path.exists():
        return False
    os.close(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600))
    os.chmod(path, 0o600)
    shutil.chown(path, user='mwagent', group='mwagent')
    return True


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


def receiver_get(config, path):
    host = config['listen_host']
    url = 'http://%s:%d%s' % ('[' + host + ']' if ':' in host else host, config['listen_port'], path)
    try:
        with OPENER.open(url, timeout=5) as response:
            return response.status, response.read(4096)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(4096)


def wait_ready(config, expected, timeout=READY_TIMEOUT, legacy=False):
    """Poll /ready once per second until it reports ready for the expected code_version.
    legacy: a package without /ready (404) passes on /health 200; the caller checks the new InvocationID."""
    deadline, last = time.monotonic() + timeout, None
    while True:
        try:
            status, body = receiver_get(config, '/ready')
            if legacy and status == 404:
                last = 'no /ready'
                if receiver_get(config, '/health')[0] == 200:
                    return {'ready': None, 'health': 200}
            else:
                last = json.loads(body)
                if status == 200 and last.get('ready') is True and last.get('code_version') == expected:
                    return last
        except (OSError, ValueError, AttributeError) as exc:
            last = type(exc).__name__
        if time.monotonic() >= deadline:
            raise RuntimeError('Receiver not ready for %s within %ss: %s' % (expected, timeout, json.dumps(last)))
        time.sleep(1)


def current():
    backup = Path(POINTER.read_text())
    require(backup.parent.resolve() == POINTER.parent.resolve() and backup.name.startswith(PREFIX), 'Invalid backup pointer')
    return backup, json.loads((backup / 'deployment.json').read_text())


def archive_pointer():
    """A finished deployment's pointer is archived; any other phase still needs reconciliation."""
    if not POINTER.exists():
        return None
    _backup, metadata = current()
    require(metadata.get('phase') in TERMINAL, 'Existing deployment pointer: reconcile before another freeze')
    archived = POINTER.with_name(POINTER.name + '.archived-' + stamp())
    POINTER.rename(archived)
    return str(archived)


def rollback(backup, metadata, resume=False):
    """Restore package, configuration and units, restart the receiver and verify it. Timers resume only when asked and verified."""
    package = Path(metadata.get('installed_path') or installed())
    kept = set(tree(backup / 'package'))
    for path in sorted(package.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts and str(path.relative_to(package)) not in kept:
            path.unlink()
    shutil.copytree(backup / 'package', package, dirs_exist_ok=True)
    require(tree(package) == metadata['package_hashes'], 'Restored package hash mismatch')
    for name in CONFIGS:
        restore(backup / name, PRIVATE / name)
        require(digest(PRIVATE / name) == metadata['config_hashes'][name], 'Restored configuration hash mismatch')
    for name in UNIT_FILES:
        saved, target = backup / 'units' / name, SYSTEMD / name
        if saved.is_file():
            shutil.copyfile(saved, target)
            os.chmod(target, 0o644)
        elif name in metadata.get('units_changed', ()) and target.exists():
            target.unlink()
    run('systemctl', 'daemon-reload')
    before = invocation()
    run('systemctl', 'restart', RECEIVER)
    config = json.loads((backup / 'config.json').read_text())
    wait_ready(config, config.get('code_version'), READY_TIMEOUT, legacy=True)
    require(invocation() != before, 'Receiver was not restarted')
    metadata.update(phase='rolled-back', rolled_back_at=datetime.now(timezone.utc).isoformat())
    save(backup / 'deployment.json', metadata)
    if resume and metadata['resume_timers']:
        run('systemctl', 'start', *metadata['resume_timers'])
    return metadata['resume_timers'] if resume else []


def recover(backup, metadata, error):
    """Activation failed after the writes: roll back, keep timers stopped, exit non-zero."""
    metadata['phase'] = 'rolling-back'
    save(backup / 'deployment.json', metadata)
    report = {'phase': 'rolled-back', 'backup': str(backup), 'error': str(error), 'timers_resumed': [],
              'next_step': 'investigate, then systemctl start ' + ' '.join(metadata['resume_timers'])}
    try:
        rollback(backup, metadata, resume=False)
    except Exception as exc:
        report.update(phase='rollback-failed', rollback_error=str(exc))
    print(json.dumps(report))
    raise SystemExit(1)


def attempt(fn):
    try:
        return fn()
    except (OSError, subprocess.CalledProcessError, ValueError, KeyError):
        return 'unreadable'


def commit_tree(commit, prefix='integration-agent/src/mw_integration_agent'):
    names = output(*git('ls-tree', '-r', '--name-only', commit, prefix)).splitlines()
    return {n[len(prefix) + 1:]: hashlib.sha256(subprocess.check_output(git('show', commit + ':' + n))).hexdigest()
            for n in names if n.endswith('.py') and '__pycache__' not in n.split('/')}


def dry_run(commit):
    """Read-only plan: no writes, no root requirement, only git/systemctl show/venv path lookup and file reads."""
    report = {'phase': 'dry-run', 'commit': commit, 'euid': os.geteuid(), 'host': os.uname().nodename,
              'identity': {key: attempt(lambda key=key: vm_metadata(key)) for key, _ in IDENTITY}}
    head = attempt(lambda: output(*git('rev-parse', 'HEAD')))
    known = 'unreadable' if head == 'unreadable' else attempt(
        lambda: subprocess.run(git('cat-file', '-e', commit + '^{commit}'), capture_output=True).returncode == 0)
    report['checkout'] = {'path': str(CHECKOUT), 'head': head, 'commit_matches': head == commit,
                          'commit_in_checkout': known,
                          'dirty': attempt(lambda: bool(output(*git('status', '--porcelain')))),
                          'shallow': attempt(lambda: output(*git('rev-parse', '--is-shallow-repository')) == 'true'),
                          'pyproject': attempt(lambda: (REPO / 'pyproject.toml').is_file())}
    package = attempt(installed)
    report['installed_package'] = str(package)

    def against(source):
        try:
            extras, missing, changed = compare(source, pyfiles(package))
            return {'extras': extras, 'missing': missing, 'changed': changed}
        except RuntimeError as exc:
            return str(exc)
    report['installed_vs_checkout'] = (attempt(lambda: against(pyfiles(REPO / 'src/mw_integration_agent')))
                                       if package != 'unreadable' else 'unreadable')
    if head != commit:
        report['installed_vs_commit'] = ('unreadable' if 'unreadable' in (known, package) else 'commit not in checkout'
                                         if known is not True else attempt(lambda: against(commit_tree(commit))))
    version = attempt(lambda: json.loads((PRIVATE / 'config.json').read_text()).get('code_version'))
    report['installed_code_version'] = version
    report['ancestry'] = ancestry(version)

    def pointer():
        try:
            os.stat(POINTER)
        except FileNotFoundError:
            return 'absent'
        try:
            return current()[1].get('phase')
        except RuntimeError:
            return 'invalid pointer'
    report['pointer'] = {'path': str(POINTER), 'phase': attempt(pointer)}
    report['receiver'] = {'invocation_id': attempt(invocation), 'active_state': attempt(lambda: active(RECEIVER))}
    from_commit = head != commit and known is True

    def unit(name):
        try:
            host = (SYSTEMD / name).read_bytes()
        except FileNotFoundError:
            return 'missing-on-host'
        wanted = (subprocess.check_output(git('show', commit + ':integration-agent/systemd/' + name)) if from_commit
                  else (REPO / 'systemd' / name).read_bytes())
        return 'unchanged' if host == wanted else 'changed'
    # Without the commit there is nothing to compare: say so instead of comparing with an unrelated checkout.
    comparable = from_commit or head == commit
    report['units'] = {'compared_with': 'commit' if from_commit else
                       'checkout' if head == commit else 'not compared (commit not in checkout)',
                       'files': {name: attempt(lambda name=name: unit(name)) if comparable else 'unknown'
                                 for name in UNIT_FILES}}
    timers = {u + '.timer': attempt(lambda u=u: active(u + '.timer')) for u in UNITS}
    report['timers_to_pause_and_resume'] = [t for t, state in timers.items() if state == 'active']
    report['timers_unreadable'] = [t for t, state in timers.items() if state == 'unreadable']
    report['plan'] = [
        'freeze: archive a finished pointer; stop worker timers; wait for workers; back up config, catalogue, package and units; '
        'record receiver InvocationID, unit hashes and ancestry',
        'install: pip install --no-deps ' + str(REPO) + '; delete installed *.py absent from source; verify installed == source; '
        'install changed units; daemon-reload; create the Graph token backup file when missing',
        'activate: read-only probe; write config/catalogue; restart ' + RECEIVER + '; wait for /ready with this commit (' +
        str(READY_TIMEOUT) + ' s) and a new InvocationID; then start the paused timers',
        'on activation failure: automatic rollback (package, config, units, daemon-reload, receiver restart and check); timers stay stopped']
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['dry-run', 'freeze', 'install', 'activate', 'rollback'])
    parser.add_argument('--commit', required=True)
    parser.add_argument('--origin'); parser.add_argument('--audience'); parser.add_argument('--cutoff')
    parser.add_argument('--probe-request-id')
    args = parser.parse_args()
    if args.phase == 'dry-run':
        require(re.fullmatch('[0-9a-f]{40}', args.commit) is not None, 'Exact commit required')
        print(json.dumps(dry_run(args.commit), indent=2))
        return
    identity()
    if args.phase == 'rollback':
        backup, metadata = current()
        require(metadata.get('source_commit') == args.commit, 'Rollback commit does not match the deployment')
        require(metadata.get('phase') in ('frozen', 'installed', 'activating', 'activated', 'rolling-back'), 'Nothing to roll back')
        verify_backup(backup, metadata)
        pause()
        metadata['phase'] = 'rolling-back'
        save(backup / 'deployment.json', metadata)
        resumed = rollback(backup, metadata, resume=True)
        print(json.dumps({'phase': 'rolled-back', 'backup': str(backup), 'timers_resumed': resumed}))
        return
    checkout(args.commit)
    if args.phase == 'freeze':
        archived = archive_pointer()
        POINTER.parent.mkdir(parents=True, exist_ok=True)
        backup = POINTER.parent / (PREFIX + stamp())
        backup.mkdir(mode=0o700)
        metadata = {'source_commit': args.commit, 'resume_timers': [u + '.timer' for u in UNITS if active(u + '.timer') == 'active'], 'phase': 'pausing'}
        save(backup / 'deployment.json', metadata)
        POINTER.write_text(str(backup)); os.chmod(POINTER, 0o600)
        pause()
        for name in CONFIGS:
            shutil.copy2(PRIVATE / name, backup / name)
        package = installed()
        shutil.copytree(package, backup / 'package', ignore=shutil.ignore_patterns('__pycache__'))
        (backup / 'units').mkdir(mode=0o700)
        for name in UNIT_FILES:
            if (SYSTEMD / name).is_file():
                shutil.copy2(SYSTEMD / name, backup / 'units' / name)
        live = json.loads((PRIVATE / 'config.json').read_text()).get('code_version')
        metadata.update(package_hashes=tree(package), config_hashes={name: digest(PRIVATE / name) for name in CONFIGS},
                        installed_path=str(package), unit_hashes=unit_hashes(SYSTEMD), receiver_invocation=invocation(),
                        installed_code_version=live, ancestry=ancestry(live), phase='frozen')
        verify_backup(backup, metadata); save(backup / 'deployment.json', metadata)
        print(json.dumps({'phase': 'frozen', 'backup': str(backup), 'commit': args.commit, 'archived_pointer': archived,
                          'ancestry': metadata['ancestry'], 'backup_metadata_sha256': digest(backup / 'deployment.json')}))
        return
    backup, metadata = current()
    quiet(); verify_backup(backup, metadata)
    for name, sha in metadata['config_hashes'].items():
        require(digest(PRIVATE / name) == sha, 'Live configuration drift; left paused')
    if args.phase == 'install':
        require(metadata['phase'] == 'frozen', 'Expected frozen deployment')
        source = pyfiles(REPO / 'src/mw_integration_agent')
        require(source, 'Empty source tree')
        run(PYTHON, '-m', 'pip', 'install', '--no-deps', '--no-build-isolation', str(REPO))
        package = installed()
        # Modules no longer in source would survive pip; they stay in backup/package for rollback.
        removed = sorted(name for name in pyfiles(package) if name not in source)
        for name in removed:
            (package / name).unlink()
        metadata.update(installed_commit=args.commit, removed_files=removed, installed_hashes=tree(package))
        verify_install(metadata)
        metadata.update(units_changed=install_units(), oauth_backup_created=create_oauth_backup(), phase='installed')
        save(backup / 'deployment.json', metadata)
        print(json.dumps({'phase': 'installed', 'commit': args.commit, 'removed_files': removed,
                          'units_changed': metadata['units_changed'], 'effects_resumed': False}))
        return
    require(metadata['phase'] == 'installed' and metadata['installed_commit'] == args.commit, 'Installed pin mismatch')
    verify_install(metadata)
    config, catalogue = prepare(json.loads((PRIVATE / 'config.json').read_text()), json.loads((PRIVATE / 'service-catalogue.json').read_text()),
                                json.loads((REPO / 'service-catalogue.json').read_text()), args.commit, args.origin, args.audience, args.cutoff)
    probe(config, catalogue, args.probe_request_id)
    # Both writes occur while every affected worker remains stopped. Failure leaves them stopped.
    save(PRIVATE / 'config.json', config, True); save(PRIVATE / 'service-catalogue.json', catalogue, True)
    require(json.loads((PRIVATE / 'config.json').read_text()) == config and json.loads((PRIVATE / 'service-catalogue.json').read_text()) == catalogue, 'Activation readback mismatch')
    metadata.update(phase='activating', activated_commit=args.commit, cutoff=args.cutoff,
                    activated_hashes={name: digest(PRIVATE / name) for name in CONFIGS})
    save(backup / 'deployment.json', metadata)
    try:
        run('systemctl', 'restart', RECEIVER)
        wait_ready(config, args.commit, READY_TIMEOUT)
        require(invocation() != metadata['receiver_invocation'], 'Receiver was not restarted')
    except Exception as exc:
        recover(backup, metadata, exc)
    metadata.update(phase='activated', receiver_ready_at=datetime.now(timezone.utc).isoformat())
    save(backup / 'deployment.json', metadata)
    if metadata['resume_timers']:
        run('systemctl', 'start', *metadata['resume_timers'])
    print(json.dumps({'phase': 'activated', 'commit': args.commit, 'cutoff': args.cutoff, 'timers_resumed': metadata['resume_timers']}))


if __name__ == '__main__':
    main()
