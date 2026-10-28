"""Config-only change on vm-mw-credit-agent: the OPERATIONS.md route with no package change, as one root-only script.

apply --tag T --config NEW [--catalogue NEW] backs the live files up to /root/<file>.pre-T (refused when a backup with
that tag exists), stops every worker trigger and waits until their services are inactive, installs the new files,
runs the agent's check as mwagent, restores the backups when the check fails (then checks again), and always brings
the services back: the receiver (receiver-ready --wait 30), the recognizer and the chat relay when enabled (their
/healthz), then exactly the triggers that were active before. restore --tag T installs the T backups the same way.

R103 (after the R102 VM incident): every write (backup, new file, restore) is a temporary file in the target's
directory, fchown root:mwagent, fchmod 0640, fsync, os.replace. Owner and mode are always set explicitly, never copied
from another file: a cp -p restore from a backup made 0600 left config.json unreadable to mwagent for 2.5 minutes.
The run ends by asserting that every live file it handles is root:mwagent 0640.

The trigger list is derived from the repository units: every .timer and .path whose service runs as mwagent, in
integration-agent/systemd and in project/scripts/monitoring (the host monitor reads config.json too)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

HOST = 'vm-mw-credit-agent'
PRIVATE = Path('/etc/mw-integration-agent')
BACKUPS = Path('/root')
AGENT = '/opt/mw-integration-agent/.venv/bin/mw-integration-agent'
CONFIG, CATALOGUE = 'config.json', 'service-catalogue.json'
REPO = Path(__file__).resolve().parents[1]
UNIT_DIRS = (REPO / 'systemd', REPO.parent / 'project' / 'scripts' / 'monitoring')
RECEIVER = 'mw-instagram-webhook.service'
# Long-running mwagent services that re-read the files but keep running: restarted when enabled (or running).
# (unit, config switch, catalogue service, listen-host key, listen-port key, default port)
HEALTH_SERVICES = (('mw-receipt-recognition.service', 'receipt_recognition_enabled', 'receipt_recognition_api',
                    'receipt_recognition_listen_host', 'receipt_recognition_listen_port', None),
                   ('mw-chat-relay.service', 'chat_relay_enabled', 'chat_messages_relay',
                    'chat_relay_listen_host', 'chat_relay_listen_port', 8791))
MODE = 0o640
READY_SECONDS = 30
IDLE_SECONDS = 2400  # the same worker drain bound as the deploy helper's freeze
TAG = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}')
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run_systemctl(*args):
    result = subprocess.run(['systemctl', *args], capture_output=True, text=True, timeout=300)
    return result.returncode, result.stdout.strip()


def run_agent(*args):
    """The agent CLI as the service user, so a file mwagent cannot read fails here as it would in the services.
    Output and the validation text are captured and dropped; callers report only the exit code."""
    return subprocess.run(['runuser', '-u', 'mwagent', '--', AGENT, *args], capture_output=True, timeout=300).returncode


def lookup_owner():
    import grp
    import pwd
    return pwd.getpwnam('root').pw_uid, grp.getgrnam('mwagent').gr_gid


def http_get(url):
    try:
        with OPENER.open(url, timeout=5) as response:
            return response.status, response.read(4096)
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(4096)


def unit_value(text, key):
    match = re.search(rf'^{key}=(\S+)\s*$', text, re.MULTILINE)
    return match.group(1) if match else None


def worker_triggers(unit_dirs):
    """[(trigger, service)] for every .timer/.path in the unit directories whose service runs as mwagent."""
    found = []
    for directory in unit_dirs:
        for path in sorted(Path(directory).glob('*')):
            if path.suffix not in ('.timer', '.path'):
                continue
            service = unit_value(path.read_text(encoding='utf-8'), 'Unit') or path.stem + '.service'
            unit = Path(directory) / service
            # A trigger whose service file is not beside it is kept (fail toward stopping more).
            if not unit.is_file() or unit_value(unit.read_text(encoding='utf-8'), 'User') == 'mwagent':
                found.append((path.name, service))
    require(any(t.endswith('.path') for t, _ in found) and any(t.endswith('.timer') for t, _ in found), 'No worker triggers found')
    return found


def load_json(data, name, catalogue=False):
    try:
        value = json.loads(data)
    except ValueError:
        raise RuntimeError(f'{name} is not JSON') from None
    require(isinstance(value, dict), f'{name} must be a JSON object')
    if catalogue:
        require(isinstance(value.get('services'), dict), f'{name} must carry a services object')
    return value


class Host:
    """Paths and side effects, injectable for tests."""

    def __init__(self, private=PRIVATE, backups=BACKUPS, unit_dirs=UNIT_DIRS, systemctl=run_systemctl, agent=run_agent,
                 owner=lookup_owner, get=http_get, idle_seconds=IDLE_SECONDS, ready_seconds=READY_SECONDS, sleep=time.sleep):
        self.private, self.backups, self.unit_dirs = Path(private), Path(backups), unit_dirs
        self.systemctl, self.agent, self.owner, self.get = systemctl, agent, owner, get
        self.idle_seconds, self.ready_seconds, self.sleep = idle_seconds, ready_seconds, sleep

    def ctl(self, *args):
        code, out = self.systemctl(*args)
        require(code == 0, 'systemctl ' + ' '.join(args) + f' failed ({code})')
        return out

    def state(self, unit):
        return self.systemctl('show', unit, '--property=ActiveState', '--value')[1]

    def enabled(self, unit):
        code, out = self.systemctl('is-enabled', unit)
        return code == 0 and out == 'enabled'

    def loaded(self, unit):
        return self.systemctl('show', unit, '--property=LoadState', '--value')[1] != 'not-found'

    def check(self):
        """The agent's check exit code (0 passes)."""
        return self.agent('check', '--config', str(self.private / CONFIG), '--catalogue', str(self.private / CATALOGUE))


def log(message):
    print('config-only-change: ' + message, file=sys.stderr)


def write_file(host, target, data, exclusive=False):
    """Temporary file beside the target, fchown root:mwagent, fchmod 0640, fsync, then os.replace (or, exclusive, a
    hard link that refuses an existing target). Owner and mode never come from another file."""
    uid, gid = host.owner()
    fd, temporary = tempfile.mkstemp(prefix='.' + target.name + '.', suffix='.tmp', dir=target.parent)
    try:
        try:
            os.fchown(fd, uid, gid)
            os.fchmod(fd, MODE)
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view):]
            os.fsync(fd)
        finally:
            os.close(fd)
        if exclusive:
            os.link(temporary, target)
        else:
            os.replace(temporary, target)
    finally:
        if os.path.lexists(temporary):
            os.unlink(temporary)
    directory = os.open(target.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    require(target.read_bytes() == data, f'{target} readback mismatch')


def mode_problems(host, names):
    uid, gid = host.owner()
    problems = []
    for name in names:
        try:
            info = (host.private / name).stat()
        except OSError as exc:
            problems.append(f'{host.private / name}: {exc}')
            continue
        if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (uid, gid, MODE):
            problems.append(f'{host.private / name} is {info.st_uid}:{info.st_gid} {stat.S_IMODE(info.st_mode):04o}, expected root:mwagent 0640')
    return problems


def pause(host, triggers, report):
    """Stop each trigger. A repository unit not installed on the host (LoadState not-found, or stop exit 5) is
    skipped and logged; any other stop failure refuses."""
    skipped = []
    for trigger, _ in triggers:
        if not host.loaded(trigger):
            skipped.append(trigger)
            continue
        code, _ = host.systemctl('stop', trigger)
        if code == 5:
            skipped.append(trigger)
            continue
        require(code == 0, f'systemctl stop {trigger} failed ({code})')
    report['skipped_not_installed'] = skipped
    if skipped:
        log('not installed on this host, skipped: ' + ', '.join(skipped))
    triggers = [(t, s) for t, s in triggers if t not in skipped]
    services = sorted({s for _, s in triggers})
    deadline = time.monotonic() + host.idle_seconds
    while busy := [s for s in services if host.state(s) not in ('inactive', 'failed')]:
        require(time.monotonic() < deadline, 'Workers still running: ' + ', '.join(busy))
        host.sleep(2)
    require(all(host.state(t) == 'inactive' for t, _ in triggers), 'Triggers not stopped')


def wait_health(host, config, catalogue, unit, switch, service, host_key, port_key, default_port):
    expected = bool(config.get(switch) and catalogue['services'].get(service, {}).get('enabled'))
    address, port = config.get(host_key), config.get(port_key, default_port)
    require(address and port, f'{unit}: {host_key}/{port_key} missing')
    url = f"http://{'[' + address + ']' if ':' in address else address}:{port}/healthz"
    deadline, last = time.monotonic() + host.ready_seconds, None
    while True:
        try:
            status, body = host.get(url)
            last = json.loads(body)
            if status == 200 and last.get('status') == 'ok' and last.get('enabled') is expected:
                return last
        except (OSError, ValueError, AttributeError) as exc:
            last = type(exc).__name__
        require(time.monotonic() < deadline, f'{unit} /healthz not ok with enabled={expected} within {host.ready_seconds}s: {json.dumps(last)}')
        host.sleep(1)


def bring_back(host, resume, report):
    """Every step is attempted; failures are collected, never skip the next step."""
    problems = []

    def step(name, fn):
        try:
            report[name] = fn()
        except Exception as exc:
            problems.append(f'{name}: {exc}')

    def receiver():
        host.ctl('restart', RECEIVER)
        require(host.agent('receiver-ready', '--config', str(host.private / CONFIG), '--wait', str(host.ready_seconds)) == 0, 'receiver not ready')
        return 'ready'

    step('receiver', receiver)
    for unit, *keys in HEALTH_SERVICES:
        def service(unit=unit, keys=keys):
            if not (host.enabled(unit) or host.state(unit) == 'active'):
                return 'not enabled'
            host.ctl('restart', unit)
            config = json.loads((host.private / CONFIG).read_text(encoding='utf-8'))
            catalogue = json.loads((host.private / CATALOGUE).read_text(encoding='utf-8'))
            return wait_health(host, config, catalogue, unit, *keys)
        step(unit, service)
    def triggers():
        if resume:
            host.ctl('start', *resume)
        return list(resume)

    step('triggers_started', triggers)
    return problems


def run_check(host, report, key, problems):
    """Run check; a check that cannot run counts as failed. Only the exit code is reported, never its output."""
    try:
        code = host.check()
    except Exception as exc:
        code = None
        problems.append(f'{key} could not run ({type(exc).__name__})')
    report[key] = code == 0
    if code not in (0, None):
        problems.append(f'{key} failed (exit {code})')
    return code == 0


def manual_recovery(host, fallback):
    """The OPERATIONS.md manual fallback for each backup: explicit owner and mode, never cp -p."""
    return ' && '.join(f'install -m 0640 -o root -g mwagent {path} {host.private / name}' for name, path in sorted(fallback.items()))


def recover(host, fallback, report, problems):
    """Restore the backups through the same atomic 0640 write, then check again."""
    try:
        for name, path in fallback.items():
            write_file(host, host.private / name, path.read_bytes())
        report['restored'] = sorted(fallback)
    except Exception as exc:
        problems.append(f'restore failed ({exc}); backups {", ".join(str(p) for p in fallback.values())}; '
                        f'recover by hand: {manual_recovery(host, fallback)}')
        return
    if run_check(host, report, 'check_after_restore', problems):
        problems.append('backup restored; check after restore passed')
    else:
        problems.append(f'backup restored but check after restore FAILED; backups {", ".join(str(p) for p in fallback.values())}; '
                        f'recover by hand: {manual_recovery(host, fallback)}')


def change(host, files, fallback, report):
    """files: {name: bytes} to install; fallback: {name: backup path} restored when the install or the check fails,
    or when the run is interrupted (KeyboardInterrupt, SystemExit) after the install began; then re-raised."""
    triggers = worker_triggers(host.unit_dirs)
    resume = [t for t, _ in triggers if host.state(t) == 'active']
    report.update(triggers=[t for t, _ in triggers], resume=resume)
    problems, installing, interrupted = [], False, None
    try:
        pause(host, triggers, report)
        installing = True
        for name, data in files.items():
            write_file(host, host.private / name, data)
        report['installed'] = {name: digest(data) for name, data in files.items()}
        require(run_check(host, report, 'check', problems), 'new files not accepted')
    except BaseException as exc:
        if not isinstance(exc, Exception):
            interrupted = exc
        problems.append(str(exc) or type(exc).__name__)
        if installing and fallback:
            recover(host, fallback, report, problems)
        if interrupted is not None:
            raise
    finally:
        problems += bring_back(host, resume, report)
        problems += mode_problems(host, sorted(set(files) | set(fallback or {})))
        if interrupted is not None:
            log('interrupted: ' + '; '.join(problems))
    report['problems'] = problems
    if problems:
        raise RuntimeError('; '.join(problems))
    return report


def backup_paths(host, tag, names):
    require(TAG.fullmatch(tag or '') is not None, 'Tag must be 1-64 letters, digits, dot, dash or underscore')
    return {name: host.backups / f'{name}.pre-{tag}' for name in names}


def apply(host, tag, config_path, catalogue_path=None):
    sources = {CONFIG: Path(config_path)} | ({CATALOGUE: Path(catalogue_path)} if catalogue_path else {})
    files = {name: path.read_bytes() for name, path in sources.items()}
    for name, data in files.items():
        load_json(data, str(sources[name]), name == CATALOGUE)
    backups = backup_paths(host, tag, files)
    existing = [str(p) for p in backups.values() if os.path.lexists(p)]
    require(not existing, 'Backup already exists (choose a new tag): ' + ', '.join(existing))
    for name, path in backups.items():
        write_file(host, path, (host.private / name).read_bytes(), exclusive=True)
    report = {'action': 'apply', 'tag': tag, 'backups': {name: str(p) for name, p in backups.items()}}
    return change(host, files, backups, report)


def restore(host, tag):
    backups = {name: p for name, p in backup_paths(host, tag, (CONFIG, CATALOGUE)).items() if p.is_file()}
    require(CONFIG in backups, f'No backup {backup_paths(host, tag, (CONFIG,))[CONFIG]}')
    files = {name: p.read_bytes() for name, p in backups.items()}
    for name, data in files.items():
        load_json(data, str(backups[name]), name == CATALOGUE)
    return change(host, files, None, {'action': 'restore', 'tag': tag, 'from': {name: str(p) for name, p in backups.items()}})


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='action', required=True)
    one = sub.add_parser('apply', help='back up, install the new file(s), check; restore on a failed check')
    one.add_argument('--tag', required=True)
    one.add_argument('--config', required=True)
    one.add_argument('--catalogue')
    two = sub.add_parser('restore', help='install the /root/<file>.pre-<tag> backups')
    two.add_argument('--tag', required=True)
    args = parser.parse_args(argv)
    require(os.geteuid() == 0 and os.uname().nodename == HOST, 'Run as root on ' + HOST)
    host = Host()
    report = apply(host, args.tag, args.config, args.catalogue) if args.action == 'apply' else restore(host, args.tag)
    print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as exc:
        print('config-only-change: ' + str(exc), file=sys.stderr)
        raise SystemExit(1) from None
