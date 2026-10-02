"""Bounded offline tests for privileged bootstrap guardrails; never calls GCP."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('bootstrap', Path(__file__).with_name('owner-bootstrap.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)


def empty():
    return {key: [] for key in b.APIS}


class Guards(unittest.TestCase):
    def baseline_fixture(self, owner, *, active=None, project_number=None, project_id=None, bindings=None):
        b.OWNER = owner
        member = ('serviceAccount:' if owner.endswith('.gserviceaccount.com') else 'user:') + owner
        def run(argv, data=None):
            return json.dumps([{'account': active or owner, 'status': 'ACTIVE'}]) if argv[1:3] == ['auth', 'list'] else '(unset)'
        def gc(*args):
            if args[:2] == ('projects', 'describe'):
                return {'projectId': project_id or b.PROJECT, 'projectNumber': project_number or b.NUMBER, 'lifecycleState': 'ACTIVE'}
            if args[:3] == ('billing', 'projects', 'describe'):
                return {'billingEnabled': True}
            if args[:2] == ('services', 'list'):
                return []
            if args[:2] == ('org-policies', 'describe'):
                return {'spec': {'rules': [{'enforce': False}]}}
            if args[:2] == ('projects', 'get-iam-policy'):
                return {'bindings': bindings if bindings is not None else [{'role': 'roles/owner', 'members': [member]}]}
            self.fail(f'Unexpected operation {args}')
        return run, gc

    def test_approved_service_account_and_human_owner_use_correct_iam_member(self):
        for owner, member in [(b.APPROVED_DEPLOYER, 'serviceAccount:'+b.APPROVED_DEPLOYER),
                              ('verified-owner@example.test', 'user:verified-owner@example.test')]:
            run, gc = self.baseline_fixture(owner)
            with self.subTest(owner=owner), patch.dict(os.environ, {}, clear=True), patch.object(b, 'run', side_effect=run), patch.object(b, 'gc', side_effect=gc):
                b.baseline()
                self.assertEqual(b.principal_member(owner), member)

    def test_other_service_account_is_rejected_before_any_cli_call(self):
        b.OWNER = 'other@'+b.PROJECT+'.iam.gserviceaccount.com'
        with patch.dict(os.environ, {}, clear=True), patch.object(b, 'run') as run:
            with self.assertRaisesRegex(RuntimeError, 'approved fixed'):
                b.baseline()
            run.assert_not_called()

    def test_wrong_active_account_or_project_stops_read_only_baseline(self):
        for overrides, error in [({'active': 'wrong@example.test'}, 'active account'),
                                 ({'project_number': '123'}, 'Wrong/inactive project'),
                                 ({'project_id': 'another-project'}, 'Wrong/inactive project')]:
            run, gc = self.baseline_fixture(b.APPROVED_DEPLOYER, **overrides)
            with self.subTest(error=error), patch.dict(os.environ, {}, clear=True), patch.object(b, 'run', side_effect=run), patch.object(b, 'gc', side_effect=gc):
                with self.assertRaisesRegex(RuntimeError, error):
                    b.baseline()

    def test_owner_binding_requires_selected_principal_type_role_and_no_condition(self):
        for binding in [
            {'role': 'roles/owner', 'members': ['user:'+b.APPROVED_DEPLOYER]},
            {'role': 'roles/editor', 'members': ['serviceAccount:'+b.APPROVED_DEPLOYER]},
            {'role': 'roles/owner', 'members': ['serviceAccount:'+b.APPROVED_DEPLOYER], 'condition': {'expression': 'true'}},
        ]:
            run, gc = self.baseline_fixture(b.APPROVED_DEPLOYER, bindings=[binding])
            with self.subTest(binding=binding), patch.dict(os.environ, {}, clear=True), patch.object(b, 'run', side_effect=run), patch.object(b, 'gc', side_effect=gc):
                with self.assertRaisesRegex(RuntimeError, 'unconditional project Owner'):
                    b.baseline()

    def test_configured_adapter_changes_launcher_only(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(b, 'GCLOUD_EXECUTABLE', None):
            adapter = Path(directory)/'reviewed-adapter'
            adapter.write_text('synthetic fixture')
            adapter.chmod(0o700)
            b.configure_gcloud(str(adapter))
            result = subprocess.CompletedProcess([], 0, b'{}', b'')
            with patch.object(b.subprocess, 'run', return_value=result) as run:
                b.run(['gcloud', 'auth', 'list', '--format=json'])
                self.assertEqual(run.call_args.args[0], [str(adapter.resolve()), 'auth', 'list', '--format=json'])
            # A configured launcher never authorizes an arbitrary service account.
            with self.assertRaisesRegex(RuntimeError, 'approved fixed'):
                b.principal_member('other@project.iam.gserviceaccount.com')

    def test_project_owner_without_verified_domain_stops_before_mapping(self):
        with patch.object(b, 'gc', return_value=[]) as command:
            with self.assertRaisesRegex(RuntimeError, 'verify mw-credit.com'):
                b.domain()
            self.assertEqual(command.call_count, 1)

    @unittest.skipIf(os.name == 'nt', 'Linux adapter argument contract')
    def test_linux_adapter_receives_visible_exact_flags_and_pinned_selectors(self):
        b.OWNER = b.APPROVED_DEPLOYER
        condition = 'expression=resource.name=="projects/p/databases/bridge",title=Bridge'
        with patch.object(b, 'GCLOUD_EXECUTABLE', '/reviewed/adapter'), patch.object(b, 'run', return_value='{}') as command:
            b.gcloud_output('projects', 'get-iam-policy', b.PROJECT, '--condition='+condition)
        argv = command.call_args.args[0]
        self.assertIn('--condition='+condition, argv)
        self.assertIn('--account='+b.APPROVED_DEPLOYER, argv)
        self.assertIn('--project='+b.PROJECT, argv)
        self.assertFalse(any(a.startswith('--flags-file') for a in argv))

    def test_docker_auth_adapter_is_used_without_gcloud_auth_configuration(self):
        digest = 'sha256:'+'a'*64
        calls = []
        def gc(*args):
            calls.append(args)
            if args[:3] == ('run', 'services', 'list'):
                return []
            if args[:4] == ('artifacts', 'docker', 'images', 'describe'):
                return {'image_summary': {'digest': digest}}
            if args[:3] == ('run', 'services', 'describe'):
                return {'metadata': {'annotations': {'run.googleapis.com/invoker-iam-disabled': 'true'}},
                        'spec': {'template': {'spec': {'serviceAccountName': b.RUNTIME}}},
                        'status': {'url': 'https://actual.example.run.app'}}
            return None
        with patch.object(b, 'DOCKER_EXECUTABLE', '/reviewed/docker-adapter'), patch.object(b, 'gc', side_effect=gc), patch.object(b, 'run', return_value='') as run, patch.object(b, 'gcloud_output') as configure:
            b.inert()
            configure.assert_not_called()
            self.assertEqual([c.args[0][1] for c in run.call_args_list], ['build', 'push'])
        self.assertFalse(any(c[0] == 'auth' for c in calls))

    def test_impersonation_and_credential_override_guards_remain_enforced(self):
        for name in ('CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE'):
            run, gc = self.baseline_fixture(b.APPROVED_DEPLOYER)
            with self.subTest(override=name), patch.dict(os.environ, {name: 'synthetic-override'}, clear=True), patch.object(b, 'run', side_effect=run) as command:
                with self.assertRaises(RuntimeError):
                    b.baseline()
                command.assert_not_called()
        run, gc = self.baseline_fixture(b.APPROVED_DEPLOYER)
        def impersonated(argv, data=None):
            return run(argv, data) if argv[1:3] == ['auth', 'list'] else 'other@project.iam.gserviceaccount.com'
        with patch.dict(os.environ, {}, clear=True), patch.object(b, 'run', side_effect=impersonated), patch.object(b, 'gc') as cloud:
            with self.assertRaisesRegex(RuntimeError, 'configured impersonation'):
                b.baseline()
            cloud.assert_not_called()

    def test_resource_collisions_stop(self):
        rows = empty()
        rows['run.googleapis.com'] = [{'metadata': {'name': b.SERVICE, 'labels': {}}}]
        with self.assertRaisesRegex(RuntimeError, 'Conflicting Cloud Run'):
            b.validate(rows, False)
        rows = empty()
        rows['secretmanager.googleapis.com'] = [{'name': 'projects/x/secrets/mw-grafana-state-key'}]
        with self.assertRaisesRegex(RuntimeError, 'Conflicting secret'):
            b.validate(rows, False)

    def test_existing_database_requires_explicit_resume_and_exact_configuration(self):
        rows = empty()
        rows['firestore.googleapis.com'] = [{'name': f'projects/{b.PROJECT}/databases/{b.DATABASE}',
            'locationId': b.REGION, 'type': 'FIRESTORE_NATIVE', 'databaseEdition': 'STANDARD',
            'deleteProtectionState': 'DELETE_PROTECTION_ENABLED'}]
        with self.assertRaisesRegex(RuntimeError, '--resume'):
            b.validate(rows, False)
        b.validate(rows, True)
        rows['firestore.googleapis.com'][0]['locationId'] = 'us-central1'
        with self.assertRaisesRegex(RuntimeError, 'Conflicting database'):
            b.validate(rows, True)

    def test_failed_read_is_never_treated_as_absence(self):
        with patch.object(b, 'check_sdk'), patch.object(b, 'gc', side_effect=RuntimeError('PERMISSION_DENIED')) as command:
            with self.assertRaisesRegex(RuntimeError, 'PERMISSION_DENIED'):
                b.resources(set(b.APIS), 'exact-condition', False)
            self.assertEqual(command.call_count, 1)

    def test_inert_rerun_never_redeploys_existing_service(self):
        existing = {'metadata': {'name': b.SERVICE, 'labels': {'bridge': b.MARKER}},
                    'status': {'url': 'https://actual.example.run.app'}}
        with patch.object(b, 'gc', return_value=[existing]) as command, patch.object(b, 'run') as shell:
            b.inert()
            self.assertEqual(command.call_count, 1)
            shell.assert_not_called()

    def test_domain_collision_never_creates_or_overrides_mapping(self):
        service = {'metadata': {'labels': {'bridge': b.MARKER}}}
        mapping = {'metadata': {'name': b.DOMAIN}, 'spec': {'routeName': 'another-service'}}
        with patch.object(b, 'gc', side_effect=[['mw-credit.com'], service, [mapping]]) as command:
            with self.assertRaisesRegex(RuntimeError, 'another service'):
                b.domain()
            self.assertEqual(command.call_count, 3)

    def test_resource_plan_scopes_database_secrets_and_excludes_live_endpoints(self):
        calls = []
        def fake(*args):
            calls.append(args)
            if args[:4] == ('firestore', 'indexes', 'composite', 'list'):
                return []
            return None
        condition = f'resource.name=="projects/{b.PROJECT}/databases/{b.DATABASE}"'
        with patch.object(b, 'check_sdk'), patch.object(b, 'oauth_log_exclusion'), patch.object(b, 'inventory', return_value=empty()), patch.object(b, 'gc', side_effect=fake):
            b.resources(set(b.APIS), condition, False)
        grant = next(c for c in calls if c[:2] == ('projects', 'add-iam-policy-binding'))
        self.assertIn('--role=roles/datastore.user', grant)
        self.assertIn(f'--condition=expression={condition},title=mw-grafana-database,description=Bridge database only', grant)
        secret_grants = [c for c in calls if c[:2] == ('secrets', 'add-iam-policy-binding')]
        self.assertEqual({c[2] for c in secret_grants}, set(b.SECRETS))
        self.assertFalse(any(c[0] in ('run', 'scheduler') for c in calls))
        self.assertFalse(any('delete' in c or 'versions' in c for c in calls))
        self.assertTrue(all(f'--database={b.DATABASE}' in c for c in calls if c[0] == 'firestore'))

    def test_launcher_resolves_windows_cmd_and_does_not_use_shell_true(self):
        launcher = r'C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.CMD'
        result = subprocess.CompletedProcess([], 0, b'{}', b'')
        with patch.object(b.shutil, 'which', return_value=launcher), patch.object(b.subprocess, 'run', return_value=result) as command:
            self.assertEqual(b.run(['gcloud', 'version']), '{}')
        self.assertEqual(command.call_args.args[0][0], launcher)
        self.assertNotIn('shell', command.call_args.kwargs)

    def test_missing_launcher_stops_cleanly(self):
        with patch.object(b.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'not found'):
                b.run(['gcloud', 'version'])

    def test_complex_and_repeated_flags_stay_in_private_file_and_stdin(self):
        b.OWNER = 'verified-owner@example.test'
        condition = 'expression=resource.name=="projects/p/databases/bridge",title=Bridge'
        log_filter = 'filter=logName="projects/p/logs/run.googleapis.com%2Frequests" AND url =~ "(/|[?]|$)"'
        retained = []
        def fake(argv, data=None):
            self.assertEqual(argv[:5], ['gcloud', 'logging', 'sinks', 'update', '_Default'])
            path = Path(argv[5].split('=', 1)[1])
            retained.append(path)
            values = json.loads(path.read_text())
            self.assertIn({'--condition': condition}, values)
            self.assertIn({'--add-exclusion': log_filter}, values)
            self.assertEqual([v['--field-config'] for v in values if '--field-config' in v], ['first', 'second'])
            self.assertIn({'--quiet': None}, values)
            self.assertNotIn('synthetic-stdin-value', path.read_text())
            self.assertEqual(data, b'synthetic-stdin-value')
            return '{}'
        with patch.object(b, 'run', side_effect=fake):
            b.gcloud_output('logging', 'sinks', 'update', '_Default', '--condition='+condition,
                            '--add-exclusion='+log_filter, '--field-config=first', '--field-config=second', data=b'synthetic-stdin-value')
        self.assertFalse(retained[0].exists())

    @unittest.skipUnless(os.name == 'nt', 'Actual CMD launch runs in the Windows CI job')
    def test_actual_windows_cmd_receives_flags_file_without_shell_reinterpretation(self):
        b.OWNER = 'verified-owner@example.test'
        with tempfile.TemporaryDirectory(prefix='mw launcher spaces ') as directory:
            root = Path(directory)
            probe = root / 'probe.py'
            probe.write_text('import json,sys\nfrom pathlib import Path\np=next(a.split("=",1)[1] for a in sys.argv if a.startswith("--flags-file="))\nprint(json.dumps(json.loads(Path(p).read_text())))\n')
            launcher = root / 'gcloud.CMD'
            launcher.write_text(f'@echo off\n@"{sys.executable}" "{probe}" %*\n')
            condition = 'expression=resource.name=="projects/p/databases/bridge",title=Bridge'
            with patch.object(b.shutil, 'which', return_value=str(launcher)):
                values = json.loads(b.gcloud_output('projects', 'get-iam-policy', 'p', '--condition='+condition))
            self.assertIn({'--condition': condition}, values)

    def test_sink_add_preserves_all_unrelated_configuration_and_exclusions(self):
        before = {'name': '_Default', 'destination': 'logging.googleapis.com/projects/p/buckets/_Default',
                  'filter': 'severity>=DEFAULT', 'writerIdentity': 'serviceAccount:existing',
                  'exclusions': [{'name': 'unrelated', 'filter': 'severity=DEBUG'}]}
        calls = []
        def fake(*args):
            calls.append(args)
            if args[2] == 'update':
                self.assertEqual(args[:4], ('logging', 'sinks', 'update', '_Default'))
                self.assertEqual(len(args), 5)
                self.assertTrue(args[4].startswith('--add-exclusion='))
                self.assertNotIn('disabled=', args[4])
                return None
            if len(calls) == 1:
                return before
            value = calls[1][4]
            return {**before, 'exclusions': [*before['exclusions'], {'name': 'mw-grafana-oauth-requests', 'filter': value.split(',filter=', 1)[1]}]}
        with patch.object(b, 'gc', side_effect=fake):
            b.oauth_log_exclusion()
        self.assertEqual(len(calls), 3)

    def test_sink_readback_conflict_stops_without_overwriting_unrelated_filter(self):
        before = {'name': '_Default', 'filter': 'existing'}
        with patch.object(b, 'gc', side_effect=[before, None, {'name': '_Default', 'filter': 'changed', 'exclusions': []}]):
            with self.assertRaisesRegex(RuntimeError, 'readback failed'):
                b.oauth_log_exclusion()

    def test_successful_add_still_rejects_unrelated_sink_changes(self):
        before = {'destination': 'original', 'filter': 'existing',
                  'exclusions': [{'name': 'unrelated', 'filter': 'severity=DEBUG'}]}
        for change in ('destination', 'unrelated-exclusion'):
            calls = []
            def fake(*args):
                calls.append(args)
                if len(calls) == 1:
                    return before
                if args[2] == 'update':
                    return None
                added = {'name': 'mw-grafana-oauth-requests', 'filter': calls[1][4].split(',filter=', 1)[1]}
                after = {**before, 'exclusions': [*before['exclusions'], added]}
                if change == 'destination':
                    after['destination'] = 'changed'
                else:
                    after['exclusions'] = [added]
                return after
            with self.subTest(change=change), patch.object(b, 'gc', side_effect=fake):
                with self.assertRaisesRegex(RuntimeError, 'Unrelated sink'):
                    b.oauth_log_exclusion()

    def test_existing_named_exclusion_is_idempotent_and_conflict_is_rejected(self):
        captured = []
        def fake(*args):
            if args[2] == 'update':
                captured.append(args[4].split(',filter=', 1)[1])
                return None
            return {'exclusions': []} if not captured else {'exclusions': [{'name': 'mw-grafana-oauth-requests', 'filter': captured[0]}]}
        with patch.object(b, 'gc', side_effect=fake):
            b.oauth_log_exclusion()
        with patch.object(b, 'gc', return_value={'exclusions': [{'name': 'mw-grafana-oauth-requests', 'filter': captured[0]}]}) as command:
            b.oauth_log_exclusion()
            self.assertEqual(command.call_count, 1)
        with patch.object(b, 'gc', return_value={'exclusions': [{'name': 'mw-grafana-oauth-requests', 'filter': 'conflict'}]}) as command:
            with self.assertRaisesRegex(RuntimeError, 'Conflicting'):
                b.oauth_log_exclusion()
            self.assertEqual(command.call_count, 1)


if __name__ == '__main__':
    unittest.main()
