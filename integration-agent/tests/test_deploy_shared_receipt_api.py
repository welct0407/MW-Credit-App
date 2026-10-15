import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
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


if __name__ == '__main__': unittest.main()
