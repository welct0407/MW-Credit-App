import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('native_deployment', Path(__file__).parents[1] / 'scripts/deploy-native-conversations.py')
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class NativeDeploymentTests(unittest.TestCase):
    def test_preserves_receipt_route_cutoffs_and_all_service_flags(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(deploy.base, 'PRIVATE', Path(tmp)):
            Path(tmp, 'native-cutover.json').write_text(json.dumps({'commit': 'a'*40, 'manifestSha256': 'b'*64, 'probePartnerId': 'synthetic'}))
            config = {'state_backend': 'postgres', 'database_name': 'loan_manager_prod',
                      'receipt_payment_api_enabled': True, 'receipt_payment_api_origin': deploy.base.ORIGIN,
                      'receipt_payment_api_audience': deploy.base.ORIGIN, 'receipt_payment_api_cutoff': 'existing',
                      'partner_conversation_cutoff': 'existing', 'secret_file': '/private/preserved'}
            catalogue = {'revision': 26, 'default_policy': 'deny', 'services': {'existing': {'enabled': True, 'implemented': True}}}
            candidate = dict(catalogue, revision=27)
            before = json.dumps([config, catalogue], sort_keys=True)
            result, cat = deploy.prepare(config, catalogue, candidate, 'a'*40, deploy.base.ORIGIN, deploy.base.ORIGIN, None)
            self.assertTrue(result['conversation_api_enabled'])
            for key, value in config.items(): self.assertEqual(result[key], value)
            self.assertEqual(cat['services'], catalogue['services'])
            self.assertEqual(before, json.dumps([config, catalogue], sort_keys=True))
            with self.assertRaises(RuntimeError):
                deploy.prepare(config, catalogue, candidate, 'c'*40, deploy.base.ORIGIN, deploy.base.ORIGIN, None)
            with self.assertRaises(RuntimeError):
                deploy.prepare(config, catalogue, candidate, 'a'*40, 'https://wrong', deploy.base.ORIGIN, None)

    def test_probe_never_posts_command_and_failure_blocks_activation(self):
        with patch.object(deploy.base.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='native-read-only-ok\n')) as run:
            deploy.probe({}, {}, '11111111-1111-4111-8111-111111111111')
            argv = run.call_args.args[0]
            self.assertEqual(argv[:3], ['sudo', '-u', 'mwagent'])
            self.assertIn("for scope in ('oltp','olap')", argv[-1])
            self.assertIn("'GET'", argv[-1])
            self.assertNotIn("'commands'", argv[-1])
            run.return_value = SimpleNamespace(returncode=1, stdout='')
            with self.assertRaises(RuntimeError):
                deploy.probe({}, {}, '11111111-1111-4111-8111-111111111111')


if __name__ == '__main__': unittest.main()
