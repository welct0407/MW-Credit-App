"""Code-only runtime deployment derivative: only code_version changes; receiver-gated engine; old updater retired."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPTS = Path(__file__).parents[1] / 'scripts'
spec = importlib.util.spec_from_file_location('deploy_runtime', SCRIPTS / 'deploy-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
base = runtime.base
COMMIT = 'a' * 40


class RuntimeDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.config = {'state_backend': 'postgres', 'code_version': 'b' * 40, 'receipt_payment_api_enabled': True,
                       'partner_review_cutoff': '2026-10-01T00:00:00+07:00', 'conversation_poll_enabled': False}
        services = {'signed_webhook_ingress': {'enabled': True, 'implemented': True},
                    'partner_oltp_gui': {'enabled': False, 'implemented': False}}
        self.catalogue = {'revision': 27, 'default_policy': 'deny', 'services': services}
        self.candidate = json.loads(json.dumps(self.catalogue))
        self.candidate['services']['signed_webhook_ingress']['enabled'] = False  # switches are the live host's

    def prepared(self, **overrides):
        args = dict(config=self.config, catalogue=self.catalogue, candidate=self.candidate, commit=COMMIT,
                    origin=None, audience=None, cutoff=None)
        args.update(overrides)
        return runtime.prepare(**args)

    def test_only_code_version_changes_and_inputs_are_not_mutated(self):
        before = json.dumps([self.config, self.catalogue], sort_keys=True)
        config, catalogue = self.prepared()
        self.assertEqual(config, dict(self.config, code_version=COMMIT))
        self.assertEqual(catalogue, self.catalogue)
        self.assertEqual(json.dumps([self.config, self.catalogue], sort_keys=True), before)
        self.assertEqual(self.prepared(config={k: v for k, v in self.config.items() if k != 'code_version'})[0]['code_version'], COMMIT)

    def test_drift_or_wrong_target_is_refused(self):
        drifted = json.loads(json.dumps(self.candidate))
        drifted['services']['partner_oltp_gui']['implemented'] = True
        for change in [{'candidate': dict(self.candidate, revision=28)},
                       {'candidate': dict(self.candidate, services={'signed_webhook_ingress': {'enabled': True, 'implemented': True}})},
                       {'candidate': drifted}, {'config': dict(self.config, state_backend='sqlite')}, {'commit': 'HEAD'}]:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                self.prepared(**change)

    def test_pointer_prefix_and_native_probe(self):
        self.assertEqual(base.POINTER, Path('/var/lib/mw-integration-agent/rollback/runtime-current'))
        self.assertEqual(base.PREFIX, 'runtime-')
        self.assertIs(base.prepare, runtime.prepare)
        self.assertIs(base.probe, runtime.probe)
        self.assertFalse(hasattr(runtime, 'native'))  # AGT-QUALITY-05: no import of the deleted R053 script
        self.assertFalse((SCRIPTS / 'deploy-native-conversations.py').exists())
        with self.assertRaisesRegex(RuntimeError, 'Unused status UUID required'):
            base.probe({}, {}, None)

    def test_probe_never_posts_command_and_failure_blocks_activation(self):
        from types import SimpleNamespace
        from unittest.mock import patch
        with patch.object(base.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='native-read-only-ok\n')) as run:
            runtime.probe({}, {}, '11111111-1111-4111-8111-111111111111')
            argv = run.call_args.args[0]
            self.assertEqual(argv[:3], ['sudo', '-u', 'mwagent'])
            self.assertIn("for scope in ('oltp','olap')", argv[-1])
            self.assertIn("'GET'", argv[-1])
            self.assertNotIn("'commands'", argv[-1])
            run.return_value = SimpleNamespace(returncode=1, stdout='')
            with self.assertRaises(RuntimeError):
                runtime.probe({}, {}, '11111111-1111-4111-8111-111111111111')

    def test_runtime_deploy_pauses_and_installs_the_wake_paths(self):
        # R082 B1 and R086: the code-only route shares the engine's unit and trigger lists.
        for name in ('mw-receipt-wake.path', 'mw-conversation-wake.path'):
            with self.subTest(unit=name):
                self.assertIn(name, base.UNIT_FILES)
                self.assertIn(name, base.TRIGGERS)

    def test_shipped_migrations_match_the_migration_runner(self):
        # The preflight compares with deployment.schema_history as state_migration.migrate writes it.
        import hashlib
        from unittest.mock import patch
        migrations = SCRIPTS.parent / 'database/migrations'
        with patch.object(base, 'CHECKOUT', SCRIPTS.parents[1]):
            shipped = base.shipped_migrations()
        expected = {int(p.name.split('__')[0][1:]): [p.name, hashlib.sha256(p.read_text(encoding='utf-8').encode()).hexdigest()]
                    for p in migrations.glob('V*__*.sql')}
        self.assertEqual(shipped, expected)
        self.assertGreaterEqual(max(shipped), 7)  # V7 partner_notices.accepted_at ships with this package

    def test_runtime_deploy_refuses_a_package_ahead_of_the_agent_schema(self):
        # deploy-runtime.py overrides only prepare/probe: the engine's schema preflight stays in force.
        self.assertIs(runtime.base.schema_preflight, base.schema_preflight)
        self.assertEqual(base.schema_preflight({'state_backend': 'sqlite'}, None), 'not applicable (sqlite state)')
        with self.assertRaisesRegex(RuntimeError, '--state-connection-file required'):
            base.schema_preflight({'state_backend': 'postgres'}, None)
        from unittest.mock import patch
        with patch.object(base, 'shipped_migrations', return_value={6: ['V6__a.sql', 'a'], 7: ['V7__b.sql', 'b']}), \
                patch.object(base, 'applied_migrations', return_value={6: ['V6__a.sql', 'a']}):
            with self.assertRaisesRegex(RuntimeError, 'missing V7'):
                base.schema_preflight({'state_backend': 'postgres'}, '/private/conn.json')
        with patch.object(base, 'shipped_migrations', return_value={7: ['V7__b.sql', 'b']}), \
                patch.object(base, 'applied_migrations', return_value={7: ['V7__b.sql', 'b']}):
            self.assertEqual(base.schema_preflight({'state_backend': 'postgres'}, '/private/conn.json'), 'applied through V7')

    def test_one_off_activation_scripts_are_deleted(self):
        # AGT-QUALITY-05: deploy-runtime.py (with its engine) is the one deploy helper.
        for name in ('activate-conversation-poll.sh', 'activate-partner-conversations.sh', 'activate-partner-review.sh',
                     'activate-receipt-automation.py', 'activate-receipt-summary.py', 'activate-reviewer-dml.sh',
                     'deploy-cash-statement.sh', 'deploy-receipt-summary.sh', 'install-cash-statement-schedule.sh',
                     'install-postgresql-config.py', 'freeze-postgresql-cutover.py', 'deploy-appsheet-retirement.py',
                     'deploy-operator-audit.py', 'deploy-receipt-audit-repair.py', 'deploy-receipt-evidence.py',
                     'verify-receipt-evidence.py', 'provision-agent-database.py', 'verify-reviewer-dml-restored.ps1',
                     'test-reviewer-dml.ps1', 'verify-dml-restored.py'):
            with self.subTest(script=name):
                self.assertFalse((SCRIPTS / name).exists())

    def test_reviewed_runtime_shell_updater_is_retired(self):
        self.assertFalse((SCRIPTS / 'update-reviewed-runtime.sh').exists())

    def test_dry_run_entry_point_reports_without_root(self):
        result = subprocess.run([sys.executable, '-I', str(SCRIPTS / 'deploy-runtime.py'), 'dry-run', '--commit', COMMIT],
                                capture_output=True, text=True, timeout=120, env={'PATH': '/usr/bin:/bin'}, cwd='/')
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report['phase'], report['pointer']['path']), ('dry-run', str(base.POINTER)))


if __name__ == '__main__':
    unittest.main()
