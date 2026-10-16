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
        self.assertIs(base.probe, runtime.native.probe)
        with self.assertRaisesRegex(RuntimeError, 'Unused status UUID required'):
            base.probe({}, {}, None)

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
