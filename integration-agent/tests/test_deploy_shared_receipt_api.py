import contextlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('deploy_r053', Path(__file__).parents[1] / 'scripts/deploy-shared-receipt-api.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.config = {'state_backend': 'postgres', 'database_name': 'loan_manager_prod', 'receipt_environment': 'prod',
                       'receipt_archive_enabled': True, 'receipt_archive_cutoff': 'old', 'legacy_secret_file': '/private/old',
                       'conversation_enabled': True, 'unrelated_cutoff': 'unchanged'}
        self.catalogue = {'revision': 25, 'default_policy': 'deny', 'services': {'existing': {'enabled': True, 'implemented': True}}}
        self.candidate = {'revision': 26, 'services': {'shared_receipt_payment_api': {'enabled': False, 'implemented': True}}}

    def prepared(self, **overrides):
        args = dict(config=self.config, catalogue=self.catalogue, candidate=self.candidate, commit='a'*40,
                    origin=deploy.ORIGIN, audience=deploy.ORIGIN, cutoff='2026-10-12T12:00:00+07:00')
        args.update(overrides)
        return deploy.prepare(**args)

    def test_only_authorized_fields_change_without_mutating_inputs(self):
        before = json.dumps([self.config, self.catalogue], sort_keys=True)
        config, cat = self.prepared()
        for key, value in self.config.items():
            self.assertEqual(config[key], value)
        self.assertEqual(cat['services']['existing'], self.catalogue['services']['existing'])
        self.assertEqual(cat['services']['shared_receipt_payment_api'], {'enabled': True, 'implemented': True})
        self.assertEqual(before, json.dumps([self.config, self.catalogue], sort_keys=True))
        self.assertEqual(set(config)-set(self.config), {'receipt_payment_api_enabled', 'receipt_payment_api_origin',
                         'receipt_payment_api_audience', 'receipt_payment_api_cutoff', 'code_version'})

    def test_wrong_target_missing_cutoff_or_candidate_denied(self):
        for change in [{'cutoff': None}, {'cutoff': '2026-10-12T12:00:00'}, {'origin': deploy.ORIGIN.replace('-prod-', '-dev-')},
                       {'commit': 'HEAD'}, {'config': dict(self.config, state_backend='sqlite')},
                       {'candidate': dict(self.candidate, revision=27)}]:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                self.prepared(**change)

    def test_backup_tamper_fails_closed(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); (root/'package').mkdir(); (root/'package/code.py').write_text('original')
            (root/'config.json').write_text('{}')
            metadata = {'package_hashes': deploy.tree(root/'package'), 'config_hashes': {'config.json': deploy.digest(root/'config.json')}}
            deploy.verify_backup(root, metadata)
            (root/'package/code.py').write_text('tampered')
            with self.assertRaises(RuntimeError): deploy.verify_backup(root, metadata)

    def test_probe_runs_as_agent_and_only_get_status_failure_never_activates(self):
        config, catalogue = self.prepared()
        request = '11111111-1111-4111-8111-111111111111'
        with patch.object(deploy.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='read-only-status-ok\n')) as run:
            deploy.probe(config, catalogue, request)
            argv = run.call_args.args[0]
            self.assertEqual(argv[:3], ['sudo', '-u', 'mwagent'])
            self.assertIn("call(p['config'],'GET'", argv[-1]); self.assertNotIn("'POST'", argv[-1])
            self.assertTrue(run.call_args.kwargs['capture_output'])
            run.return_value = SimpleNamespace(returncode=1, stdout='')
            with self.assertRaises(RuntimeError): deploy.probe(config, catalogue, request)


COMMIT, OLD = 'a' * 40, 'b' * 40
UUID = '11111111-1111-4111-8111-111111111111'
CATALOGUE = {'revision': 27, 'default_policy': 'deny', 'services': {'signed_webhook_ingress': {'enabled': True, 'implemented': True}}}
SOURCE = {'__init__.py': 'new', 'server.py': 'new server', 'added.py': 'added'}
INSTALLED = {'__init__.py': 'old', 'server.py': 'old server', 'appsheet.py': 'stale', 'assets/logo.txt': 'asset'}
MISSING_UNIT = 'mw-audit-relay.service'
MIGRATION_FILES = {'V1__base.sql': 'SELECT 1;\n', 'V2__next.sql': 'SELECT 2;\n'}


def write(root, files):
    for name, text in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(text)


def code_only(config, catalogue, candidate, commit, *_route):
    return dict(config, code_version=commit), dict(catalogue)


class Host:
    """Temporary host: fake systemctl/pip/git pin and a loopback receiver that reports the config loaded at restart."""
    def __init__(self, root):
        root = Path(root)
        self.checkout, self.repo = root / 'checkout', root / 'checkout/integration-agent'
        self.site, self.private, self.systemd = root / 'site/mw_integration_agent', root / 'private', root / 'systemd'
        self.pointer = root / 'rollback/runtime-current'
        write(self.repo / 'src/mw_integration_agent', SOURCE)
        write(self.repo, {'pyproject.toml': '[project]\n', 'service-catalogue.json': json.dumps(CATALOGUE)})
        write(self.repo / 'database/migrations', MIGRATION_FILES)
        self.connection_file = root / 'operator-connection.json'
        self.applied, self.schema_reads = None, []  # None: everything shipped is applied
        write(self.repo / 'systemd', {n: '[Unit]\n# ' + n + ' new\n' for n in deploy.UNIT_FILES})
        write(self.site, INSTALLED)
        write(self.systemd, {n: '[Unit]\n# ' + n + ' old\n' for n in deploy.UNIT_FILES if n != MISSING_UNIT})
        (self.private / 'secrets').mkdir(parents=True)
        self.timers = {t: 'active' for t in deploy.TRIGGERS}
        self.timers['mw-audit-relay.timer'] = 'inactive'
        self.invocation, self.modes, self.events, self.ancestry_rc = 1, [], [], 0
        # Recognizer: stopped unless a test starts it; stale code rejects the newly activated files (not the old ones).
        self.recognizer, self.recognizer_invocation, self.recognizer_stale = 'inactive', 1, False
        host = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                return

            def do_GET(self):
                host.events.append('get ' + self.path)
                if self.path == '/health':
                    status, body = 200, b'mw-instagram-webhook'
                elif host.mode == 'legacy':
                    status, body = 404, b'Not found'
                else:
                    ready = host.mode in ('normal', 'wrong')
                    status = 200 if ready else 503
                    version = 'e' * 40 if host.mode == 'wrong' else host.loaded
                    body = json.dumps({'ready': ready, 'code_version': version, 'started_at': 't',
                                       'failed': [] if ready else ['state']}).encode()
                self.send_response(status); self.end_headers(); self.wfile.write(body)
        self.httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.config = {'state_backend': 'postgres', 'listen_host': '127.0.0.1', 'listen_port': self.httpd.server_address[1],
                       'code_version': OLD, 'switch': True}
        write(self.private, {'config.json': json.dumps(self.config), 'service-catalogue.json': json.dumps(CATALOGUE)})
        self.restart(); self.events.clear()

    def close(self):
        self.httpd.shutdown(); self.httpd.server_close()

    def restart(self):
        self.invocation += 1
        self.loaded = json.loads((self.private / 'config.json').read_text()).get('code_version')
        self.mode = self.modes.pop(0) if self.modes else 'normal'
        self.events.append('restart')

    def recognizer_get(self, config):
        self.events.append('get /healthz')
        live = json.loads((self.private / 'service-catalogue.json').read_text())
        rejected = self.recognizer_stale and config.get('code_version') == COMMIT
        enabled = bool(not rejected and config.get('receipt_recognition_enabled')
                       and live['services'].get('receipt_recognition_api', {}).get('enabled'))
        return 200, json.dumps({'status': 'ok', 'enabled': enabled}).encode()

    def output(self, *args):
        if args[0] == 'git' and args[-2:] == ('rev-parse', 'HEAD'):
            return COMMIT
        if args[0] == 'git' and args[-2:] == ('status', '--porcelain'):
            return ''
        if args[:2] == ('systemctl', 'show') and args[2] == deploy.RECOGNIZER:
            return f'rec-{self.recognizer_invocation}' if 'InvocationID' in args else self.recognizer
        if args[:2] == ('systemctl', 'show') and 'InvocationID' in args:
            return f'inv-{self.invocation}'
        if args[:2] == ('systemctl', 'show'):
            return self.timers.get(args[2], 'active' if args[2] == deploy.RECEIVER else 'inactive')
        raise AssertionError(args)

    def run(self, *args):
        if args[:2] == ('systemctl', 'stop'):
            self.timers.update({t: 'inactive' for t in args[2:]}); self.events.append('stop')
        elif args[:2] == ('systemctl', 'start'):
            self.timers.update({t: 'active' for t in args[2:]}); self.events.append('start ' + ' '.join(args[2:]))
        elif args == ('systemctl', 'restart', deploy.RECEIVER):
            self.restart()
        elif args == ('systemctl', 'restart', deploy.RECOGNIZER):
            self.recognizer_invocation += 1; self.events.append('restart recognizer')
        elif args == ('systemctl', 'daemon-reload'):
            self.events.append('daemon-reload')
        elif args[1:4] == ('-m', 'pip', 'install') and '--no-deps' in args and args[-1] == str(self.repo):
            import shutil
            shutil.copytree(self.repo / 'src/mw_integration_agent', self.site, dirs_exist_ok=True)  # pip leaves stale modules
            self.events.append('pip')
        else:
            raise AssertionError(args)

    @contextlib.contextmanager
    def patched(self):
        with contextlib.ExitStack() as stack:
            for name, value in dict(CHECKOUT=self.checkout, REPO=self.repo, PRIVATE=self.private, SYSTEMD=self.systemd,
                                    POINTER=self.pointer, PREFIX='runtime-', READY_TIMEOUT=2, output=self.output, run=self.run,
                                    identity=lambda: None, installed=lambda: self.site, prepare=code_only,
                                    recognizer_get=self.recognizer_get,
                                    probe=lambda *_args: None, applied_migrations=self.applied_migrations).items():
                stack.enter_context(patch.object(deploy, name, value))
            self.chown = stack.enter_context(patch.object(deploy.shutil, 'chown'))
            self.git = stack.enter_context(patch.object(deploy.subprocess, 'run',
                                                        side_effect=lambda *a, **k: SimpleNamespace(returncode=self.ancestry_rc)))
            yield

    def applied_migrations(self, connection_file):
        self.schema_reads.append(connection_file)
        return deploy.shipped_migrations() if self.applied is None else self.applied

    def phase(self, name, connection=True):
        extra = ['--state-connection-file', str(self.connection_file)] if connection else []
        with patch.object(sys, 'argv', ['deploy', name, '--commit', COMMIT, '--probe-request-id', UUID, *extra]), \
                contextlib.redirect_stdout(io.StringIO()) as out:
            try:
                deploy.main()
                code = 0
            except SystemExit as exc:
                code = exc.code
        return code, json.loads(out.getvalue().splitlines()[-1])

    def metadata(self):
        return json.loads((Path(self.pointer.read_text()) / 'deployment.json').read_text())

    def live(self):
        return json.loads((self.private / 'config.json').read_text())


class EngineHelperTests(unittest.TestCase):
    def test_checkout_paths_and_package_requirement(self):
        self.assertEqual(deploy.CHECKOUT, Path('/opt/mw-integration-agent-src'))
        self.assertEqual(deploy.REPO, Path('/opt/mw-integration-agent-src/integration-agent'))
        self.assertEqual((deploy.POINTER.name, deploy.PREFIX), ('r053-current', 'r053-'))
        with tempfile.TemporaryDirectory() as name:
            host = Host(name)
            try:
                with host.patched():
                    deploy.checkout(COMMIT)
                    (host.repo / 'pyproject.toml').unlink()
                    with self.assertRaisesRegex(RuntimeError, 'Agent package not found'):
                        deploy.checkout(COMMIT)
            finally:
                host.close()

    def test_compare_tree_requires_source_and_exact_names(self):
        with tempfile.TemporaryDirectory() as name:
            source, installed = Path(name) / 'source', Path(name) / 'installed'
            write(source, {'a.py': 'a', 'old.py': 'old'})
            write(installed, {'a.py': 'a', 'old.py': 'old', '__pycache__/a.py': 'cache', 'assets/x.txt': 'x'})
            self.assertEqual(deploy.compare_tree(source, installed), ([], [], []))
            with self.assertRaisesRegex(RuntimeError, 'Empty source tree'):
                deploy.compare_tree(Path(name) / 'missing', installed)
            write(installed, {'appsheet.py': 'stale', 'a.py': 'changed'})
            self.assertEqual(deploy.compare_tree(source, installed), (['appsheet.py'], [], ['a.py']))
            (installed / 'appsheet.py').unlink(); (installed / 'a.py').write_text('a')
            self.assertEqual(deploy.compare_tree(source, installed, remove=('old.py',)), (['old.py'], [], []))
            (installed / 'old.py').unlink()
            self.assertEqual(deploy.compare_tree(source, installed, remove=('old.py',)), ([], [], []))
            self.assertEqual(deploy.compare_tree(source, installed), ([], ['old.py'], []))

    def test_ancestry_is_informational(self):
        with tempfile.TemporaryDirectory() as name:
            host = Host(name)
            try:
                with host.patched():
                    for rc, expected in ((0, 'ancestor'), (1, 'not-ancestor'), (128, 'unknown-object')):
                        host.ancestry_rc = rc
                        self.assertEqual(deploy.ancestry(OLD), expected)
                    self.assertEqual(host.git.call_args.args[0], deploy.git('merge-base', '--is-ancestor', OLD, 'HEAD'))
                    self.assertEqual(host.git.call_args.args[0][-6:], ['-C', str(host.checkout), 'merge-base', '--is-ancestor', OLD, 'HEAD'])
                    self.assertEqual([deploy.ancestry(v) for v in (None, '', 'HEAD')], ['unknown'] * 3)
            finally:
                host.close()

    def test_schema_read_is_read_only_and_never_echoes_the_connection(self):
        self.assertIn("SET TRANSACTION READ ONLY", deploy.SCHEMA_READ)
        self.assertIn("SELECT version,name,sha256 FROM deployment.schema_history", deploy.SCHEMA_READ)
        for verb in ('INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'GRANT', 'commit()'):
            self.assertNotIn(verb, deploy.SCHEMA_READ)
        with patch.object(deploy.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='', stderr='secret')) as run:
            with self.assertRaises(RuntimeError) as unreadable:
                deploy.applied_migrations('/private/conn.json')
            self.assertEqual(str(unreadable.exception), 'Agent schema history unreadable')
            with self.assertRaises(RuntimeError) as refused, \
                    patch.object(deploy, 'shipped_migrations', return_value={7: ['V7__x.sql', 'ab']}):
                deploy.schema_preflight({'state_backend': 'postgres'}, '/private/conn.json')
            self.assertEqual(str(refused.exception), 'Agent schema history unreadable; nothing installed, '
                             'workers stay paused (run migrate, then rerun, or rollback)')
            self.assertNotIn('secret', str(refused.exception))
        self.assertEqual(run.call_args.args[0][:3], [deploy.PYTHON, '-I', '-c'])
        self.assertEqual(run.call_args.kwargs['input'], '/private/conn.json')
        with patch.object(deploy.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='[[7, "V7__x.sql", "ab"]]')):
            self.assertEqual(deploy.applied_migrations('f'), {7: ['V7__x.sql', 'ab']})


class EngineFlowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.host = Host(self.directory.name)
        self.enterContext(self.host.patched())

    def tearDown(self):
        self.host.close(); self.directory.cleanup()

    def deployed(self):
        self.assertEqual(self.host.phase('freeze')[0], 0)
        self.assertEqual(self.host.phase('install')[0], 0)

    def assert_restored(self, backup):
        self.assertEqual(deploy.tree(self.host.site), deploy.tree(backup / 'package'))
        self.assertEqual((self.host.site / 'appsheet.py').read_text(), 'stale')
        self.assertFalse((self.host.site / 'added.py').exists())
        self.assertEqual(self.host.live(), self.host.config)
        self.assertFalse((self.host.systemd / MISSING_UNIT).exists())
        for name in deploy.UNIT_FILES:
            if name != MISSING_UNIT:
                self.assertTrue((self.host.systemd / name).read_text().endswith(' old\n'), name)

    def test_freeze_records_receiver_units_and_ancestry(self):
        self.host.ancestry_rc = 1
        code, result = self.host.phase('freeze')
        metadata = self.host.metadata()
        backup = Path(self.host.pointer.read_text())
        self.assertEqual((code, result['ancestry'], metadata['ancestry']), (0, 'not-ancestor', 'not-ancestor'))
        self.assertEqual(backup.name[:8], 'runtime-')
        self.assertEqual(metadata['receiver_invocation'], 'inv-2')
        self.assertEqual(metadata['installed_code_version'], OLD)
        self.assertEqual(set(metadata['unit_hashes']), set(deploy.UNIT_FILES) - {MISSING_UNIT})
        self.assertEqual(deploy.unit_hashes(backup / 'units'), metadata['unit_hashes'])
        self.assertEqual(metadata['resume_timers'], [t for t in deploy.TRIGGERS if t != 'mw-audit-relay.timer'])
        self.assertIn('mw-receipt-wake.path', metadata['resume_timers'])
        self.assertEqual(metadata['phase'], 'frozen')

    def test_install_removes_stale_modules_installs_units_and_token_backup(self):
        self.deployed()
        metadata = self.host.metadata()
        backup = Path(self.host.pointer.read_text())
        self.assertEqual(metadata['removed_files'], ['appsheet.py'])
        self.assertFalse((self.host.site / 'appsheet.py').exists())
        self.assertTrue((backup / 'package/appsheet.py').exists())
        self.assertEqual(deploy.compare_tree(self.host.repo / 'src/mw_integration_agent', self.host.site), ([], [], []))
        self.assertEqual(metadata['units_changed'], deploy.UNIT_FILES)
        for name in deploy.UNIT_FILES:
            target = self.host.systemd / name
            self.assertEqual((target.read_text(), target.stat().st_mode & 0o777), ((self.host.repo / 'systemd' / name).read_text(), 0o644))
        self.assertEqual(self.host.events[-1], 'daemon-reload')
        token = self.host.private / deploy.OAUTH_BACKUP
        self.assertEqual((metadata['oauth_backup_created'], token.stat().st_mode & 0o777), (True, 0o600))
        self.host.chown.assert_any_call(token, user='mwagent', group='mwagent')
        self.assertEqual(metadata['phase'], 'installed')

    def test_install_refuses_empty_source_before_pip(self):
        self.assertEqual(self.host.phase('freeze')[0], 0)
        for path in (self.host.repo / 'src/mw_integration_agent').glob('*.py'):
            path.unlink()
        with self.assertRaisesRegex(RuntimeError, 'Empty source tree'):
            self.host.phase('install')
        self.assertNotIn('pip', self.host.events)
        self.assertTrue((self.host.site / 'appsheet.py').exists())

    def test_activate_restarts_waits_then_resumes_timers(self):
        self.deployed(); self.host.events.clear()
        code, result = self.host.phase('activate')
        events = self.host.events
        self.assertEqual((code, result['phase']), (0, 'activated'))
        self.assertEqual(events[0], 'restart')
        self.assertEqual(events[1], 'get /ready')
        self.assertTrue(events[-1].startswith('start '))
        self.assertEqual(sum(e.startswith('start') for e in events), 1)
        metadata = self.host.metadata()
        self.assertEqual(metadata['phase'], 'activated')
        self.assertIn('receiver_ready_at', metadata)
        self.assertEqual(self.host.live(), dict(self.host.config, code_version=COMMIT))
        self.assertEqual([t for t, s in self.host.timers.items() if s == 'active'], metadata['resume_timers'])

    def failed_activation(self, *modes):
        self.deployed(); self.host.events.clear(); self.host.modes = list(modes)
        code, result = self.host.phase('activate')
        self.assertEqual(code, 1)
        self.assertEqual(result['timers_resumed'], [])
        self.assertIn('systemctl start mw-conversation-poll.timer', result['next_step'])
        self.assertEqual(result['backup'], self.host.pointer.read_text())
        self.assertFalse(any(e.startswith('start') for e in self.host.events))
        self.assertEqual(set(self.host.timers.values()), {'inactive'})
        return result

    def test_wrong_code_version_rolls_back_and_leaves_timers_stopped(self):
        result = self.failed_activation('wrong', 'normal')
        self.assertEqual(result['phase'], 'rolled-back')
        self.assertIn('Receiver not ready', result['error'])
        self.assert_restored(Path(self.host.pointer.read_text()))
        self.assertEqual(self.host.events.count('restart'), 2)
        first = self.host.events.index('restart')
        self.assertEqual(self.host.events[first + 1], 'get /ready')
        self.assertLess(first, self.host.events.index('daemon-reload'))
        self.assertLess(self.host.events.index('daemon-reload'), self.host.events.index('restart', first + 1))
        self.assertEqual(self.host.metadata()['phase'], 'rolled-back')
        self.assertIn('rolled_back_at', self.host.metadata())

    def test_readiness_timeout_rolls_back(self):
        result = self.failed_activation('down', 'normal')
        self.assertEqual(result['phase'], 'rolled-back')
        self.assert_restored(Path(self.host.pointer.read_text()))

    def test_failed_rollback_still_exits_non_zero_with_timers_stopped(self):
        result = self.failed_activation('wrong', 'down')
        self.assertEqual(result['phase'], 'rollback-failed')
        self.assertEqual(self.host.metadata()['phase'], 'rolling-back')

    def test_manual_rollback_resumes_timers_only_after_verification(self):
        self.deployed(); self.assertEqual(self.host.phase('activate')[0], 0); self.host.events.clear()
        code, result = self.host.phase('rollback')
        self.assertEqual((code, result['phase']), (0, 'rolled-back'))
        self.assert_restored(Path(self.host.pointer.read_text()))
        events = self.host.events
        self.assertLess(events.index('stop'), events.index('restart'))
        self.assertLess(events.index('restart'), events.index([e for e in events if e.startswith('start')][0]))
        self.assertEqual(result['timers_resumed'], self.host.metadata()['resume_timers'])

    def test_manual_rollback_to_package_without_ready_uses_health(self):
        self.deployed(); self.host.modes = ['legacy']
        code, result = self.host.phase('rollback')
        self.assertEqual((code, result['phase']), (0, 'rolled-back'))
        self.assertIn('get /health', self.host.events)

    def test_manual_rollback_not_verified_keeps_timers_stopped(self):
        self.deployed(); self.host.modes = ['down']
        with self.assertRaisesRegex(RuntimeError, 'Receiver not ready'):
            self.host.phase('rollback')
        self.assertEqual(set(self.host.timers.values()), {'inactive'})
        self.assertEqual(self.host.metadata()['phase'], 'rolling-back')

    def running_recognizer(self, enabled=True):
        self.host.recognizer = 'active'
        catalogue = dict(CATALOGUE, services=dict(CATALOGUE['services'],
                                                  receipt_recognition_api={'enabled': enabled, 'implemented': True}))
        self.host.config.update(receipt_recognition_enabled=True, receipt_recognition_listen_host='127.0.0.1',
                                receipt_recognition_listen_port=8790)
        write(self.host.private, {'config.json': json.dumps(self.host.config), 'service-catalogue.json': json.dumps(catalogue)})

    def test_activate_leaves_a_stopped_recognizer_stopped(self):
        self.deployed(); self.host.events.clear()
        self.assertEqual(self.host.phase('activate')[0], 0)
        self.assertNotIn('restart recognizer', self.host.events)
        self.assertEqual((self.host.recognizer, self.host.recognizer_invocation), ('inactive', 1))
        self.assertIsNone(self.host.metadata()['recognizer_health'])

    def test_activate_restarts_a_running_recognizer_before_timers(self):
        self.running_recognizer(); self.deployed(); self.host.events.clear()
        code, result = self.host.phase('activate')
        events = self.host.events
        self.assertEqual((code, result['phase']), (0, 'activated'))
        self.assertEqual(events.count('restart recognizer'), 1)
        self.assertLess(events.index('get /ready'), events.index('restart recognizer'))
        self.assertLess(events.index('get /healthz'), events.index([e for e in events if e.startswith('start')][0]))
        self.assertEqual(self.host.metadata()['recognizer_health'], {'status': 'ok', 'enabled': True})

    def test_activate_accepts_a_recognizer_disabled_by_the_files(self):
        self.running_recognizer(enabled=False); self.deployed()
        self.assertEqual(self.host.phase('activate')[0], 0)
        self.assertEqual(self.host.metadata()['recognizer_health'], {'status': 'ok', 'enabled': False})

    def test_recognizer_rejecting_the_files_rolls_back_and_leaves_timers_stopped(self):
        # 21 October 2026: the running recognizer answered "disabled" because it rejected the new catalogue.
        self.running_recognizer(); self.host.recognizer_stale = True
        result = self.failed_activation()
        self.assertEqual(result['phase'], 'rolled-back')
        self.assertIn('Recognizer not healthy with enabled=True', result['error'])
        self.assertEqual(self.host.events.count('restart recognizer'), 2)
        self.assert_restored(Path(self.host.pointer.read_text()))

    def test_manual_rollback_restarts_a_running_recognizer(self):
        self.running_recognizer(); self.deployed(); self.assertEqual(self.host.phase('activate')[0], 0); self.host.events.clear()
        code, result = self.host.phase('rollback')
        events = self.host.events
        self.assertEqual((code, result['phase']), (0, 'rolled-back'))
        self.assertLess(events.index('restart'), events.index('restart recognizer'))
        self.assertLess(events.index('get /healthz'), events.index([e for e in events if e.startswith('start')][0]))

    def recorded_stops(self):
        stops, real = [], deploy.run

        def run(*args):
            if args[:2] == ('systemctl', 'stop'):
                stops.append(args[2:])
            return real(*args)
        self.enterContext(patch.object(deploy, 'run', run))
        return stops

    def test_wake_paths_are_trigger_units(self):
        # R082 B1: installed with the units, stopped beside the worker timers, resumed like a timer (R091: receipt only).
        self.assertEqual(deploy.PATHS, ['mw-receipt-wake.path'])
        self.assertNotIn('mw-partner-conversation', deploy.UNITS)
        self.assertEqual(set(deploy.TRIGGERS), set(deploy.PATHS) | {u + '.timer' for u in deploy.UNITS})
        for name in deploy.PATHS:
            with self.subTest(unit=name):
                self.assertIn(name, deploy.UNIT_FILES)
                self.assertTrue((Path(__file__).parents[1] / 'systemd' / name).is_file())

    def test_path_unit_not_yet_installed_is_not_stopped_or_resumed(self):
        # First deployment of the path unit: absent on the host reads inactive and must not reach systemctl stop.
        del self.host.timers['mw-receipt-wake.path']
        stops = self.recorded_stops()
        self.deployed()
        self.assertNotIn('mw-receipt-wake.path', [unit for call in stops for unit in call])
        self.assertNotIn('mw-receipt-wake.path', self.host.metadata()['resume_timers'])
        self.assertEqual(self.host.phase('activate')[0], 0)
        self.assertEqual(self.host.timers.get('mw-receipt-wake.path', 'inactive'), 'inactive')

    def retired_on_host(self, active_timer=False):
        write(self.host.systemd, {n: '[Unit]\n# ' + n + ' retired\n' for n in deploy.RETIRED_UNIT_FILES})
        if active_timer:
            self.host.timers['mw-partner-conversation.timer'] = 'active'

    def test_r091_freeze_backs_up_the_retired_units_and_never_resumes_them(self):
        self.retired_on_host(active_timer=True)
        stops = self.recorded_stops()
        self.assertEqual(self.host.phase('freeze')[0], 0)
        metadata, backup = self.host.metadata(), Path(self.host.pointer.read_text())
        self.assertIn('mw-partner-conversation.timer', [unit for call in stops for unit in call])
        self.assertEqual(self.host.timers['mw-partner-conversation.timer'], 'inactive')
        self.assertNotIn('mw-partner-conversation.timer', metadata['resume_timers'])
        self.assertEqual(set(metadata['retired_unit_hashes']), set(deploy.RETIRED_UNIT_FILES))
        self.assertEqual(deploy.unit_hashes(backup / 'units', deploy.RETIRED_UNIT_FILES), metadata['retired_unit_hashes'])
        (backup / 'units' / 'mw-conversation-wake.path').write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'Retired unit backup hash mismatch'):
            self.host.phase('install')

    def test_r091_install_removes_the_retired_units_and_rollback_restores_them(self):
        self.retired_on_host()
        self.deployed()
        metadata = self.host.metadata()
        self.assertEqual(metadata['units_removed'], deploy.RETIRED_UNIT_FILES)
        for name in deploy.RETIRED_UNIT_FILES:
            self.assertFalse((self.host.systemd / name).exists())
        reset = [call.args[0] for call in self.host.git.call_args_list if call.args and call.args[0][:2] == ['systemctl', 'reset-failed']]
        self.assertEqual(reset, [['systemctl', 'reset-failed', *deploy.RETIRED_UNIT_FILES]])
        self.assertIn('daemon-reload', self.host.events)
        self.assertEqual(self.host.phase('activate')[0], 0)
        self.assertEqual(self.host.timers.get('mw-partner-conversation.timer', 'inactive'), 'inactive')
        self.assertEqual(self.host.phase('rollback')[0], 0)
        for name in deploy.RETIRED_UNIT_FILES:
            with self.subTest(unit=name):
                self.assertEqual((self.host.systemd / name).read_text(), '[Unit]\n# ' + name + ' retired\n')
        self.assertEqual(self.host.timers.get('mw-partner-conversation.timer', 'inactive'), 'inactive')  # restored disabled

    def test_r091_install_without_retired_units_on_the_host_removes_nothing(self):
        self.deployed()
        self.assertEqual(self.host.metadata()['units_removed'], [])
        self.assertFalse(any(call.args and call.args[0][:2] == ['systemctl', 'reset-failed'] for call in self.host.git.call_args_list))

    def test_active_path_unit_blocks_install_and_activation(self):
        self.assertEqual(self.host.phase('freeze')[0], 0)
        self.host.timers['mw-receipt-wake.path'] = 'active'
        with self.assertRaisesRegex(RuntimeError, 'Timers or path units not paused'):
            self.host.phase('install')
        self.assertNotIn('pip', self.host.events)
        self.host.timers['mw-receipt-wake.path'] = 'inactive'
        self.assertEqual(self.host.phase('install')[0], 0)
        self.host.timers['mw-receipt-wake.path'] = 'active'
        with self.assertRaisesRegex(RuntimeError, 'Timers or path units not paused'):
            self.host.phase('activate')
        self.assertEqual(self.host.live(), self.host.config)

    def test_manual_rollback_stops_and_resumes_the_path_unit(self):
        self.deployed(); self.assertEqual(self.host.phase('activate')[0], 0)
        self.assertEqual(self.host.timers['mw-receipt-wake.path'], 'active')
        stops = self.recorded_stops()
        self.assertEqual(self.host.phase('rollback')[0], 0)
        for name in deploy.PATHS:
            self.assertIn(name, stops[0])
            self.assertEqual(self.host.timers[name], 'active')

    def test_schema_behind_package_refuses_install_before_pip(self):
        # V7 lesson: a package needing an unapplied agent migration must not go live on PostgreSQL state.
        self.assertEqual(self.host.phase('freeze')[0], 0)
        shipped = deploy.shipped_migrations()
        self.assertEqual(sorted(shipped), [1, 2])
        self.host.applied = {1: shipped[1]}
        with self.assertRaises(RuntimeError) as refused:
            self.host.phase('install')
        self.assertEqual(str(refused.exception), 'Agent schema behind the package (missing V2); nothing installed, '
                         'workers stay paused (run migrate, then rerun, or rollback)')
        self.assertNotIn('pip', self.host.events)
        self.assertEqual(self.host.metadata()['phase'], 'frozen')
        self.host.applied = {1: shipped[1], 2: ['V2__next.sql', '0' * 64]}
        with self.assertRaisesRegex(RuntimeError, r'^Agent schema behind the package \(checksum drift V2\); nothing installed'):
            self.host.phase('install')
        self.host.applied = {**shipped, 3: ['V3__newer.sql', '1' * 64]}  # a newer database is fine
        self.assertEqual(self.host.phase('install')[0], 0)
        self.assertEqual(self.host.schema_reads, [str(self.host.connection_file)] * 3)

    def test_schema_checked_again_at_activation_and_connection_file_required(self):
        self.deployed(); self.host.events.clear()
        with self.assertRaisesRegex(RuntimeError, '--state-connection-file required'):
            self.host.phase('activate', connection=False)
        self.host.applied = {}
        with self.assertRaisesRegex(RuntimeError, r'^Agent schema behind the package \(missing V1,2\); nothing installed, workers stay paused'):
            self.host.phase('activate')
        self.host.applied = {1: ['V1__base.sql', '0' * 64]}
        with self.assertRaisesRegex(RuntimeError, r'\(missing V2; checksum drift V1\)'):
            self.host.phase('activate')
        self.assertEqual(self.host.live(), self.host.config)
        self.assertNotIn('restart', self.host.events)
        self.assertEqual(self.host.metadata()['phase'], 'installed')

    def test_sqlite_state_host_skips_the_schema_check(self):
        write(self.host.private, {'config.json': json.dumps(dict(self.host.config, state_backend='sqlite'))})
        self.host.applied = {}
        self.assertEqual(self.host.phase('freeze')[0], 0)
        self.assertEqual(self.host.phase('install', connection=False)[0], 0)
        self.assertEqual(self.host.schema_reads, [])

    def test_stale_pointer_is_archived_only_for_terminal_phases(self):
        backup = self.host.pointer.parent / 'runtime-old'
        backup.mkdir(parents=True)
        for phase in ('activated', 'rolled-back', 'pausing', 'frozen', 'installed', 'activating', 'rolling-back'):
            with self.subTest(phase=phase):
                (backup / 'deployment.json').write_text(json.dumps({'phase': phase}))
                self.host.pointer.write_text(str(backup))
                archived = set(self.host.pointer.parent.glob('runtime-current.archived-*'))
                if phase in deploy.TERMINAL:
                    code, result = self.host.phase('freeze')
                    self.assertEqual(code, 0)
                    new = set(self.host.pointer.parent.glob('runtime-current.archived-*')) - archived
                    self.assertEqual([p.read_text() for p in new], [str(backup)])
                    self.assertEqual(result['archived_pointer'], str(new.pop()))
                    for timer in self.host.timers:
                        self.host.timers[timer] = 'active'
                else:
                    with self.assertRaisesRegex(RuntimeError, 'Existing deployment pointer'):
                        self.host.phase('freeze')
                    self.assertEqual(self.host.pointer.read_text(), str(backup))


class DryRunTests(unittest.TestCase):
    READ_ONLY_GIT = {'rev-parse', 'status', 'cat-file', 'ls-tree', 'show', 'merge-base'}

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.host = Host(self.directory.name)
        git = ['git', '-C', str(self.host.checkout), '-c', 'user.email=t@example.invalid', '-c', 'user.name=t']
        subprocess.run(['git', 'init', '-q', str(self.host.checkout)], check=True)
        source = self.host.repo / 'src/mw_integration_agent'
        new = {p.name: p.read_text() for p in source.glob('*.py')}
        units = {p.name: p.read_text() for p in (self.host.repo / 'systemd').iterdir()}
        for path in source.glob('*.py'):
            path.unlink()
        write(source, {k: v for k, v in INSTALLED.items() if k.endswith('.py') and k != 'appsheet.py'})
        write(self.host.repo / 'systemd', {p.name: p.read_text() for p in self.host.systemd.iterdir()})
        subprocess.run(git + ['add', '-A'], check=True); subprocess.run(git + ['commit', '-qm', 'old'], check=True)
        self.first = subprocess.check_output(['git', '-C', str(self.host.checkout), 'rev-parse', 'HEAD'], text=True).strip()
        write(source, new); write(self.host.repo / 'systemd', units)
        subprocess.run(git + ['add', '-A'], check=True); subprocess.run(git + ['commit', '-qm', 'new'], check=True)
        self.head = subprocess.check_output(['git', '-C', str(self.host.checkout), 'rev-parse', 'HEAD'], text=True).strip()
        self.host.pointer.parent.mkdir(parents=True)

    def tearDown(self):
        self.host.close(); self.directory.cleanup()

    def snapshot(self):
        root = Path(self.directory.name)
        return {str(p): (p.stat().st_mtime_ns, p.read_bytes() if p.is_file() else None) for p in sorted(root.rglob('*'))
                if '.git' not in p.relative_to(root).parts}

    def dry(self, commit, python_missing=False, connection_file=None):
        calls, real_output, real_run = [], subprocess.check_output, subprocess.run

        def check_output(args, **kwargs):
            args = list(args); calls.append(args)
            if args[0] == 'git':
                return real_output(args, **kwargs)
            if args[:2] == ['systemctl', 'show']:
                return 'inv-7\n' if 'InvocationID' in args else 'active\n'
            if args[:2] == [deploy.PYTHON, '-c'] and not python_missing:
                return str(self.host.site) + '\n'
            raise FileNotFoundError(args[0])

        def run(args, **kwargs):
            calls.append(list(args)); self.assertEqual(args[0], 'git')
            return real_run(args, **kwargs)
        side_effects = Mock()
        with contextlib.ExitStack() as stack:
            for name, value in dict(CHECKOUT=self.host.checkout, REPO=self.host.repo, PRIVATE=self.host.private,
                                    SYSTEMD=self.host.systemd, POINTER=self.host.pointer, PREFIX='runtime-', run=side_effects,
                                    identity=side_effects, vm_metadata=Mock(side_effect=OSError('no metadata'))).items():
                stack.enter_context(patch.object(deploy, name, value))
            stack.enter_context(patch.object(deploy.subprocess, 'check_output', check_output))
            stack.enter_context(patch.object(deploy.subprocess, 'run', run))
            stack.enter_context(patch.object(deploy.shutil, 'chown', side_effects))
            before = self.snapshot()
            extra = ['--state-connection-file', connection_file] if connection_file else []
            with patch.object(sys, 'argv', ['deploy', 'dry-run', '--commit', commit, *extra]), \
                    contextlib.redirect_stdout(io.StringIO()) as out:
                deploy.main()
            self.assertEqual(self.snapshot(), before)
        side_effects.assert_not_called()
        for args in calls:
            # The git subcommand follows '-C <checkout>'; a non-root run also adds '-c safe.directory=…' first.
            allowed = ((args[0] == 'git' and args[args.index('-C') + 2] in self.READ_ONLY_GIT) or args[:2] == ['systemctl', 'show']
                       or args[:2] == [deploy.PYTHON, '-c'])
            self.assertTrue(allowed, args)
        return json.loads(out.getvalue())

    def test_dry_run_at_head_reports_without_side_effects(self):
        report = self.dry(self.head)
        self.assertEqual(report['checkout'], {'path': str(self.host.checkout), 'head': self.head, 'commit_matches': True,
                                              'commit_in_checkout': True, 'dirty': False, 'shallow': False, 'pyproject': True})
        self.assertEqual(report['installed_package'], str(self.host.site))
        self.assertEqual(report['installed_vs_checkout'], {'extras': ['appsheet.py'], 'missing': ['added.py'],
                                                           'changed': ['__init__.py', 'server.py']})
        self.assertNotIn('installed_vs_commit', report)
        self.assertEqual((report['installed_code_version'], report['ancestry']), (OLD, 'unknown-object'))
        self.assertEqual(report['pointer'], {'path': str(self.host.pointer), 'phase': 'absent'})
        self.assertEqual(report['receiver'], {'invocation_id': 'inv-7', 'active_state': 'active'})
        self.assertEqual(report['recognizer'], {'invocation_id': 'inv-7', 'active_state': 'active'})
        self.assertEqual(report['units']['compared_with'], 'checkout')
        self.assertEqual(report['units']['files'], {n: 'missing-on-host' if n == MISSING_UNIT else 'changed' for n in deploy.UNIT_FILES})
        self.assertEqual(report['timers_to_pause_and_resume'], deploy.TRIGGERS)
        self.assertEqual(set(report['identity'].values()), {'unreadable'})
        self.assertEqual([step.split(':')[0] for step in report['plan']], ['freeze', 'install', 'activate', 'on activation failure'])
        self.assertEqual(report['agent_schema']['shipped_through'], 2)
        self.assertIn('not run', report['agent_schema']['check'])

    def test_dry_run_for_other_commit_compares_that_commit(self):
        report = self.dry(self.first)
        self.assertFalse(report['checkout']['commit_matches'])
        self.assertEqual(report['installed_vs_commit'], {'extras': ['appsheet.py'], 'missing': [], 'changed': []})
        self.assertEqual(report['units']['compared_with'], 'commit')
        self.assertEqual(report['units']['files'], {n: 'missing-on-host' if n == MISSING_UNIT else 'unchanged' for n in deploy.UNIT_FILES})
        report = self.dry('f' * 40)
        self.assertEqual((report['checkout']['commit_in_checkout'], report['installed_vs_commit']), (False, 'commit not in checkout'))
        self.assertEqual(report['units']['compared_with'], 'not compared (commit not in checkout)')
        self.assertEqual(set(report['units']['files'].values()), {'unknown'})

    def test_dry_run_compares_the_schema_when_given_a_connection_file(self):
        with patch.object(deploy, 'applied_migrations', side_effect=lambda f: {1: deploy.shipped_migrations()[1]}):
            report = self.dry(self.head, connection_file='conn.json')
        self.assertEqual(report['agent_schema'], {'state_backend': 'postgres', 'shipped_through': 2, 'applied_through': 1,
                                                  'missing': [2], 'drift': [], 'check': 'install would refuse'})
        with patch.object(deploy, 'applied_migrations', side_effect=lambda f: deploy.shipped_migrations()):
            self.assertEqual(self.dry(self.first, connection_file='conn.json')['agent_schema']['check'], 'ok')

    def test_dry_run_reports_unreadable_items(self):
        (self.host.private / 'config.json').unlink(); (self.host.private / 'config.json').mkdir()
        (self.host.systemd / deploy.RECEIVER).unlink(); (self.host.systemd / deploy.RECEIVER).mkdir()
        self.host.pointer.write_text('x')
        with patch.object(deploy, 'current', side_effect=PermissionError('private')):
            report = self.dry(self.head, python_missing=True)
        self.assertEqual((report['installed_code_version'], report['ancestry']), ('unreadable', 'unknown'))
        self.assertEqual((report['installed_package'], report['installed_vs_checkout']), ('unreadable', 'unreadable'))
        self.assertEqual(report['units']['files'][deploy.RECEIVER], 'unreadable')
        self.assertEqual(report['pointer']['phase'], 'unreadable')

    def test_engine_dry_run_from_stdin_as_unprivileged_user(self):
        engine = Path(__file__).parents[1] / 'scripts/deploy-shared-receipt-api.py'
        user = 'nobody' if os.geteuid() == 0 else None
        with engine.open('rb') as stdin:
            result = subprocess.run(['/usr/bin/python3', '-I', '-', 'dry-run', '--commit', COMMIT], stdin=stdin, cwd='/',
                                    capture_output=True, text=True, timeout=120, user=user,
                                    env={'PATH': '/usr/bin:/bin', 'HOME': '/'})
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report['phase'], report['commit']), ('dry-run', COMMIT))
        if user:
            self.assertNotEqual(report['euid'], 0)


if __name__ == '__main__': unittest.main()
