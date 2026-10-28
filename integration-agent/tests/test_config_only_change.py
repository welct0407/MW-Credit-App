"""config-only-change.py in a temporary directory with fake systemctl, check and health runners (R103; no host needed)."""
import importlib.util
import json
import os
import stat
import tempfile
import subprocess
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
spec = importlib.util.spec_from_file_location('config_only_change', SCRIPTS / 'config-only-change.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

TIMERS = {'mw-audit-relay.timer', 'mw-audit-retention.timer', 'mw-cash-statement-email-retry.timer', 'mw-cash-statement.timer',
          'mw-conversation-poll.timer', 'mw-receipt-summary.timer', 'mw-resource-health.timer'}
OLD = {'listen_host': '127.0.0.1', 'listen_port': 8000, 'receipt_recognition_enabled': True,
       'receipt_recognition_listen_host': '10.148.0.2', 'receipt_recognition_listen_port': 8790,
       'chat_relay_enabled': False, 'chat_relay_listen_host': '10.148.0.2', 'version': 'old'}
CATALOGUE = {'revision': 33, 'services': {'receipt_recognition_api': {'enabled': True, 'implemented': True},
                                          'chat_messages_relay': {'enabled': False, 'implemented': True}}}


def mode(path):
    return stat.S_IMODE(path.stat().st_mode)


class FakeHost:
    """Systemd states, the agent CLI (check: the live config must parse and not carry "bad") and /healthz."""

    def __init__(self, root, check=None, enabled=('mw-receipt-recognition.service',), busy=1, on_restart=None, missing=(), stop_codes=None):
        self.private, self.backups = root / 'etc', root / 'root'
        self.private.mkdir(); self.backups.mkdir()
        self.calls, self.busy, self.enabled_units, self.on_restart = [], busy, set(enabled), on_restart
        self.states = {t: 'active' for t in TIMERS | {'mw-receipt-wake.path'}}
        self.states['mw-audit-retention.timer'] = 'inactive'  # an inactive trigger must stay inactive
        self.custom_check, self.missing, self.stop_codes = check, set(missing), stop_codes or {}
        for unit in self.missing | set(self.stop_codes):
            self.states[unit] = 'inactive'  # a unit missing on the host reads inactive
        for name, value in (('config.json', OLD), ('service-catalogue.json', CATALOGUE)):
            path = self.private / name
            path.write_text(json.dumps(value)); os.chmod(path, 0o640)
        self.host = helper.Host(private=self.private, backups=self.backups, systemctl=self.systemctl, agent=self.agent,
                                owner=lambda: (os.getuid(), os.getgid()), get=self.get, idle_seconds=5, ready_seconds=2,
                                sleep=lambda _seconds: None)

    def systemctl(self, *args):
        self.calls.append(args)
        if args[0] == 'show' and args[2] == '--property=LoadState':
            return 0, 'not-found' if args[1] in self.missing else 'loaded'
        if args[0] == 'show':
            unit = args[1]
            if unit.endswith('.service') and unit != 'mw-receipt-recognition.service' and self.busy:
                self.busy -= 1
                return 0, 'active'
            return 0, self.states.get(unit, 'active' if unit == 'mw-receipt-recognition.service' else 'inactive')
        if args[0] == 'is-enabled':
            return (0, 'enabled') if args[1] in self.enabled_units else (1, 'disabled')
        if args[0] == 'stop':
            if args[1] in self.stop_codes:
                return self.stop_codes[args[1]], ''
            self.states.update({u: 'inactive' for u in args[1:]})
        if args[0] == 'start':
            self.states.update({u: 'active' for u in args[1:]})
        if args[0] == 'restart' and self.on_restart:
            self.on_restart(args[1])
        return 0, ''

    def agent(self, *args):
        self.calls.append(('agent',) + args)
        if args[0] == 'check':
            if self.custom_check:
                return self.custom_check(self)
            return 0 if 'bad' not in json.loads((self.private / 'config.json').read_text()) else 1
        return 0

    def get(self, url):
        self.calls.append(('get', url))
        return 200, json.dumps({'status': 'ok', 'enabled': 'recognition' in url or ':8790/' in url}).encode()

    def verbs(self):
        verbs = [c[0] if c[0] != 'agent' else 'agent ' + c[1] for c in self.calls if c[0] not in ('show', 'is-enabled', 'get')]
        return [v for i, v in enumerate(verbs) if not (v == 'stop' and i and verbs[i - 1] == 'stop')]  # one stop per trigger

    def stopped(self):
        return {c[1] for c in self.calls if c[0] == 'stop'}


class ConfigOnlyChangeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def new_config(self, **change):
        path = self.root / 'new.json'
        path.write_text(json.dumps({**OLD, **change}))
        os.chmod(path, 0o600)
        return path

    def test_triggers_come_from_the_repository_units(self):
        found = dict(helper.worker_triggers(helper.UNIT_DIRS))
        self.assertEqual(set(found), TIMERS | {'mw-receipt-wake.path'})
        self.assertEqual(found['mw-receipt-wake.path'], 'mw-receipt-summary.service')
        self.assertEqual(found['mw-resource-health.timer'], 'mw-resource-health.service')

    def test_apply_backs_up_installs_checks_and_brings_everything_back(self):
        fake = FakeHost(self.root)
        report = helper.apply(fake.host, 'r103', self.new_config(version='new'))
        backup = fake.backups / 'config.json.pre-r103'
        self.assertEqual(json.loads(backup.read_text()), OLD)
        self.assertEqual(json.loads((fake.private / 'config.json').read_text())['version'], 'new')
        self.assertEqual((mode(backup), mode(fake.private / 'config.json')), (0o640, 0o640))
        self.assertFalse((fake.backups / 'service-catalogue.json.pre-r103').exists())
        self.assertEqual(fake.verbs(), ['stop', 'agent check', 'restart', 'agent receiver-ready', 'restart', 'start'])
        self.assertEqual(fake.stopped(), TIMERS | {'mw-receipt-wake.path'})
        self.assertEqual(report['skipped_not_installed'], [])
        restarts = [c[1] for c in fake.calls if c[0] == 'restart']
        self.assertEqual(restarts, ['mw-instagram-webhook.service', 'mw-receipt-recognition.service'])  # the relay is not enabled
        start = next(c for c in fake.calls if c[0] == 'start')
        self.assertEqual(set(start[1:]), (TIMERS - {'mw-audit-retention.timer'}) | {'mw-receipt-wake.path'})
        self.assertTrue(report['check'] and not report['problems'])
        self.assertNotIn('restored', report)
        self.assertIn(('agent', 'receiver-ready', '--config', str(fake.private / 'config.json'), '--wait', '2'), fake.calls)
        self.assertIn(('get', 'http://10.148.0.2:8790/healthz'), fake.calls)

    def test_apply_with_catalogue_and_enabled_relay(self):
        fake = FakeHost(self.root, enabled=('mw-receipt-recognition.service', 'mw-chat-relay.service'))
        catalogue = self.root / 'catalogue.json'
        catalogue.write_text(json.dumps({**CATALOGUE, 'revision': 34}))
        helper.apply(fake.host, 'cat', self.new_config(), catalogue)
        self.assertEqual(json.loads((fake.backups / 'service-catalogue.json.pre-cat').read_text()), CATALOGUE)
        self.assertEqual(json.loads((fake.private / 'service-catalogue.json').read_text())['revision'], 34)
        self.assertEqual(mode(fake.private / 'service-catalogue.json'), 0o640)
        self.assertIn(('restart', 'mw-chat-relay.service'), fake.calls)
        self.assertIn(('get', 'http://10.148.0.2:8791/healthz'), fake.calls)

    def test_failed_check_restores_the_backup_as_0640_even_when_the_backup_was_made_0600(self):
        def check(fake):
            if 'bad' in json.loads((fake.private / 'config.json').read_text()):
                os.chmod(fake.backups / 'config.json.pre-t', 0o600)  # the R102 incident: the backup turned 0600
                return 1
            return 0
        fake = FakeHost(self.root, check=check)
        with self.assertRaisesRegex(RuntimeError, 'check failed.*backup restored; check after restore passed'):
            helper.apply(fake.host, 't', self.new_config(bad=True))
        live = fake.private / 'config.json'
        self.assertEqual(json.loads(live.read_text()), OLD)
        self.assertEqual(mode(live), 0o640)
        self.assertEqual(mode(fake.backups / 'config.json.pre-t'), 0o600)
        self.assertEqual(fake.verbs(), ['stop', 'agent check', 'agent check', 'restart', 'agent receiver-ready', 'restart', 'start'])

    def test_services_come_back_when_check_raises(self):
        def check(_fake):
            raise OSError('runuser missing')
        fake = FakeHost(self.root, check=check)
        with self.assertRaisesRegex(RuntimeError, r'check could not run \(OSError\)'):
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertIn(('restart', 'mw-instagram-webhook.service'), fake.calls)
        self.assertIn(('restart', 'mw-receipt-recognition.service'), fake.calls)
        self.assertEqual(fake.verbs()[-1], 'start')
        self.assertEqual(json.loads((fake.private / 'config.json').read_text()), OLD)  # restored
        self.assertEqual(mode(fake.private / 'config.json'), 0o640)

    def test_interrupt_during_check_restores_the_backup_then_reraises(self):
        def check(fake):
            if 'version' in json.loads((fake.private / 'config.json').read_text()) and fake.interrupts:
                fake.interrupts -= 1
                os.chmod(fake.backups / 'config.json.pre-t', 0o600)
                raise KeyboardInterrupt
            return 0
        fake = FakeHost(self.root, check=check)
        fake.interrupts = 1
        with self.assertRaises(KeyboardInterrupt), mock.patch('sys.stderr') as stderr:
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertIn('interrupted: KeyboardInterrupt; backup restored', ''.join(c.args[0] for c in stderr.write.call_args_list))
        live = fake.private / 'config.json'
        self.assertEqual((json.loads(live.read_text()), mode(live)), (OLD, 0o640))
        self.assertEqual(fake.verbs(), ['stop', 'agent check', 'agent check', 'restart', 'agent receiver-ready', 'restart', 'start'])

    def test_check_after_restore_failing_names_the_backups_and_the_manual_command(self):
        fake = FakeHost(self.root, check=lambda _fake: 1)
        with self.assertRaises(RuntimeError) as caught:
            helper.apply(fake.host, 't', self.new_config(version='new'))
        backup, live = fake.backups / 'config.json.pre-t', fake.private / 'config.json'
        message = str(caught.exception)
        self.assertIn('check after restore FAILED', message)
        self.assertIn(f'backups {backup}', message)
        self.assertIn(f'recover by hand: install -m 0640 -o root -g mwagent {backup} {live}', message)
        self.assertEqual(mode(live), 0o640)
        self.assertEqual(fake.verbs()[-1], 'start')

    def test_check_output_is_captured_and_only_the_exit_code_is_reported(self):
        done = subprocess.CompletedProcess([], 2, stdout=b'', stderr=b'validation text with details')
        with mock.patch.object(helper.subprocess, 'run', return_value=done) as run:
            self.assertEqual(helper.run_agent('check', '--config', 'c'), 2)
        self.assertTrue(run.call_args.kwargs['capture_output'])
        fake = FakeHost(self.root, check=lambda fake: 2 if 'version' in json.loads((fake.private / 'config.json').read_text()) else 0)
        with self.assertRaises(RuntimeError) as caught:
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertIn('check failed (exit 2)', str(caught.exception))
        self.assertNotIn('validation text', str(caught.exception))

    def test_triggers_not_installed_on_the_host_are_skipped_and_logged(self):
        fake = FakeHost(self.root, missing={'mw-resource-health.timer'}, stop_codes={'mw-audit-relay.timer': 5})
        with mock.patch('sys.stderr') as stderr:
            report = helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertEqual(report['skipped_not_installed'], ['mw-audit-relay.timer', 'mw-resource-health.timer'])
        self.assertIn('skipped: mw-audit-relay.timer, mw-resource-health.timer', ''.join(c.args[0] for c in stderr.write.call_args_list))
        self.assertNotIn('mw-resource-health.timer', fake.stopped())
        start = next(c for c in fake.calls if c[0] == 'start')
        self.assertFalse({'mw-resource-health.timer', 'mw-audit-relay.timer'} & set(start[1:]))

    def test_any_other_stop_failure_refuses_before_the_install(self):
        fake = FakeHost(self.root, stop_codes={'mw-cash-statement.timer': 1})
        with self.assertRaisesRegex(RuntimeError, r'systemctl stop mw-cash-statement.timer failed \(1\)'):
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertEqual(json.loads((fake.private / 'config.json').read_text()), OLD)
        self.assertNotIn('agent check', fake.verbs())
        self.assertEqual(fake.verbs()[-1], 'start')

    def test_existing_backup_is_refused_before_anything_stops(self):
        fake = FakeHost(self.root)
        (fake.backups / 'config.json.pre-t').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Backup already exists'):
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertEqual(fake.calls, [])
        self.assertEqual(json.loads((fake.private / 'config.json').read_text()), OLD)

    def test_bad_input_and_tag_are_refused_before_anything_stops(self):
        fake = FakeHost(self.root)
        broken = self.root / 'broken.json'
        broken.write_text('{not json')
        for args, pattern in (((broken,), 'not JSON'), ((self.new_config(), self.new_config()), 'services object')):
            with self.subTest(pattern=pattern), self.assertRaisesRegex(RuntimeError, pattern):
                helper.apply(fake.host, 't', *args)
        for tag in ('', '../x', 'a/b', '.x'):
            with self.subTest(tag=tag), self.assertRaisesRegex(RuntimeError, 'Tag must be'):
                helper.apply(fake.host, tag, self.new_config())
        self.assertEqual(fake.calls, [])
        self.assertEqual(list(fake.backups.iterdir()), [])

    def test_final_mode_assertion_fails_loudly(self):
        def chmod(unit):
            if unit == 'mw-instagram-webhook.service':
                os.chmod(self.root / 'etc' / 'config.json', 0o600)
        fake = FakeHost(self.root, on_restart=chmod)
        with self.assertRaisesRegex(RuntimeError, r'config.json is .* 0600, expected root:mwagent 0640'):
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertEqual(fake.verbs()[-1], 'start')  # still brought back
        self.assertEqual(helper.mode_problems(fake.host, ['missing.json'])[0].split(': ')[0], str(fake.private / 'missing.json'))

    def test_workers_must_drain_before_the_install(self):
        fake = FakeHost(self.root, busy=10**6)
        with self.assertRaisesRegex(RuntimeError, 'Workers still running'):
            fake.host.idle_seconds = 0
            helper.apply(fake.host, 't', self.new_config(version='new'))
        self.assertEqual(json.loads((fake.private / 'config.json').read_text()), OLD)  # nothing installed
        self.assertNotIn('agent check', fake.verbs())
        self.assertEqual(fake.verbs()[-1], 'start')

    def test_restore_installs_the_backups_the_same_way(self):
        fake = FakeHost(self.root)
        with self.assertRaisesRegex(RuntimeError, 'No backup'):
            helper.restore(fake.host, 'gone')
        self.assertEqual(fake.calls, [])
        helper.apply(fake.host, 'r', self.new_config(version='new'))
        os.chmod(fake.backups / 'config.json.pre-r', 0o600)
        fake.calls.clear()
        report = helper.restore(fake.host, 'r')
        live = fake.private / 'config.json'
        self.assertEqual((json.loads(live.read_text()), mode(live)), (OLD, 0o640))
        self.assertEqual(report['from'], {'config.json': str(fake.backups / 'config.json.pre-r')})
        self.assertEqual(fake.verbs(), ['stop', 'agent check', 'restart', 'agent receiver-ready', 'restart', 'start'])

    def test_failed_check_on_restore_is_reported_and_services_come_back(self):
        fake = FakeHost(self.root)
        (fake.backups / 'config.json.pre-b').write_text(json.dumps({**OLD, 'bad': True}))
        with self.assertRaisesRegex(RuntimeError, 'check failed'):
            helper.restore(fake.host, 'b')
        self.assertEqual(mode(fake.private / 'config.json'), 0o640)
        self.assertEqual(fake.verbs()[-1], 'start')


if __name__ == '__main__':
    unittest.main()
