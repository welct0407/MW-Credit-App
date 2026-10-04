"""Offline Cloud Shell seeder checks: synthetic values; no real generation or GCP."""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cloud_shell_seed', Path(__file__).with_name('cloud-shell-seed.py'))
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)
FAKE = b'SYNTHETIC-NOT-A-KEY'


def row(name, number=1, state='ENABLED'):
    return {'name': f'projects/{s.NUMBER}/secrets/{name}/versions/{number}', 'state': state,
            'createTime': '2000-01-01T00:00:00Z'}


class Terminal(io.StringIO):
    def isatty(self):
        return True


class Fixture:
    def __init__(self):
        self.seed = s.Seeder()
        self.rows = {name: [] for name in s.ALL}
        self.rows[s.GOOGLE] = [row(s.GOOGLE)]
        self.calls = []
        self.mutations = []
        self.generated = []
        self.active = s.OWNER
        self.impersonation = b'(unset)'
        self.number = s.NUMBER
        self.owner_binding = {'role': 'roles/owner', 'members': ['user:'+s.OWNER]}
        self.bad_label = None
        self.missing_container = None
        self.fail_upload = None
        self.post_upload_race = False

    def command(self, argv, data=None):
        self.calls.append((tuple(argv), data))
        if argv[0] == '/tools/node':
            if argv[-1] == s.NODE_PROBE:
                return b''
            self.generated.append(s.APPS[-1])
            return FAKE
        args = tuple(a for a in argv[1:] if not a.startswith('--'))
        if args == ('auth', 'list'):
            assert not any(a.startswith('--account=') for a in argv)
        else:
            self.assert_flags(argv)
        if args == ('auth', 'list'):
            result = [{'account': self.active, 'status': 'ACTIVE'}]
        elif args == ('config', 'get-value', 'auth/impersonate_service_account'):
            return self.impersonation
        elif args == ('projects', 'describe', s.PROJECT):
            result = {'projectId': s.PROJECT, 'projectNumber': self.number, 'lifecycleState': 'ACTIVE'}
        elif args == ('projects', 'get-iam-policy', s.PROJECT):
            result = {'bindings': [self.owner_binding]}
        elif args[:2] == ('secrets', 'describe'):
            name = args[2]
            if name == self.missing_container:
                raise s.Stop('Missing container')
            result = {'name': f'projects/{s.NUMBER}/secrets/{name}',
                      'labels': {'bridge': 'foreign' if name == self.bad_label else s.MARKER}}
        elif args[:3] == ('secrets', 'versions', 'list'):
            result = copy.deepcopy(self.rows[args[3]])
        elif args[:3] == ('secrets', 'versions', 'add'):
            name = args[3]
            assert name in s.APPS and data and '--data-file=-' in argv
            self.mutations.append(name)
            if name == self.fail_upload:
                raise s.Stop('Synthetic upload failed')
            added = row(name, len(self.rows[name])+1)
            self.rows[name].append(added)
            result = added
            if self.post_upload_race:
                self.rows[name].append(row(name, 2))
        else:
            raise AssertionError('Unexpected command: '+str(args))
        return json.dumps(result).encode()

    @staticmethod
    def assert_flags(argv):
        assert '--project='+s.PROJECT in argv and '--account='+s.OWNER in argv
        assert '--no-log-http' in argv and '--verbosity=none' in argv
        assert not any(a in ('access', 'login', 'activate-service-account', 'deploy', 'create') for a in argv)

    def generate(self, name):
        self.generated.append(name)
        return FAKE

    @contextlib.contextmanager
    def patched(self, answer=None, *, mock_generate=True):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.dict(os.environ, {}, clear=True))
            stack.enter_context(patch.object(s.os, 'name', 'posix'))
            stack.enter_context(patch.object(s.shutil, 'which', side_effect=lambda name: '/tools/'+name))
            stack.enter_context(patch.object(self.seed, 'command', side_effect=self.command))
            if mock_generate:
                stack.enter_context(patch.object(self.seed, 'generate', side_effect=self.generate))
            stack.enter_context(patch.object(s.sys, 'stdin', Terminal(answer if answer is not None else s.CONFIRM+'\n')))
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(errors))
            yield output, errors
        assert FAKE.decode() not in output.getvalue()+errors.getvalue()


class Checks(unittest.TestCase):
    def test_success_preflights_every_container_before_generation_and_writes_only_four(self):
        f = Fixture()
        with f.patched() as (out, err):
            f.seed.execute()
        self.assertEqual(f.mutations, list(s.APPS))
        self.assertEqual(f.generated, list(s.APPS))
        self.assertEqual(f.rows[s.GOOGLE], [row(s.GOOGLE)])
        first_write = next(i for i, (argv, _) in enumerate(f.calls) if 'add' in argv)
        for name in s.ALL:
            self.assertTrue(any(argv[1:4] == ('secrets', 'describe', name) for argv, _ in f.calls[:first_write]))
        self.assertEqual(out.getvalue().splitlines(), [row(name)['name'] for name in s.ALL])
        self.assertIn('SEED FOUR APP KEYS', err.getvalue())

    def test_wrong_identity_project_impersonation_or_owner_stops_before_generation(self):
        cases = [('active', 'other@example.test'), ('number', '123'),
                 ('impersonation', b'impersonated@example.test'),
                 ('owner_binding', {'role': 'roles/owner', 'members': ['user:'+s.OWNER], 'condition': {'expression': 'true'}})]
        for attr, value in cases:
            with self.subTest(attr=attr):
                f = Fixture(); setattr(f, attr, value)
                with f.patched(), self.assertRaises(s.Stop):
                    f.seed.execute()
                self.assertEqual(f.generated+f.mutations, [])

    def test_all_containers_labels_and_google_version_one_must_pass_before_writes(self):
        for mode in ('bad_label', 'missing_container', 'missing_google', 'disabled_google', 'wrong_google_version'):
            with self.subTest(mode=mode):
                f = Fixture()
                if mode in ('bad_label', 'missing_container'): setattr(f, mode, s.GOOGLE)
                if mode == 'missing_google': f.rows[s.GOOGLE] = []
                if mode == 'disabled_google': f.rows[s.GOOGLE] = [row(s.GOOGLE, state='DISABLED')]
                if mode == 'wrong_google_version': f.rows[s.GOOGLE] = [row(s.GOOGLE, 2)]
                with f.patched(), self.assertRaises(s.Stop): f.seed.execute()
                self.assertEqual(f.generated+f.mutations, [])

    def test_decline_or_noninteractive_input_does_not_generate(self):
        f = Fixture()
        with f.patched('no\n'), self.assertRaises(s.Stop): f.seed.execute()
        self.assertEqual(f.generated+f.mutations, [])
        with patch.object(s.sys, 'stdin', io.StringIO()), self.assertRaises(s.Stop): f.seed.execute()

    def test_missing_node_or_failed_crypto_probe_stops_before_mutations(self):
        f = Fixture()
        with f.patched(), patch.object(s.shutil, 'which', side_effect=lambda name: None if name == 'node' else '/tools/gcloud'), self.assertRaises(s.Stop):
            f.seed.execute()
        self.assertEqual(f.generated+f.mutations, [])
        with f.patched(), patch.object(f.seed, 'command', side_effect=s.Stop('No crypto')), self.assertRaises(s.Stop):
            f.seed.execute()
        self.assertEqual(f.generated+f.mutations, [])

    def test_read_only_check_never_generates_even_with_no_app_versions(self):
        f = Fixture()
        with f.patched() as (out, _): f.seed.execute(check_only=True)
        self.assertEqual(f.generated+f.mutations, [])
        self.assertEqual(out.getvalue(), '')

    def test_existing_disabled_destroyed_and_multiple_versions_are_preserved(self):
        f = Fixture()
        for name in s.APPS:
            f.rows[name] = [row(name, 1, 'DISABLED'), row(name, 2, 'DESTROYED')]
        before = copy.deepcopy(f.rows)
        with f.patched('no confirmation needed') as (out, _): f.seed.execute()
        self.assertEqual(f.generated+f.mutations, [])
        self.assertEqual(f.rows, before)
        self.assertEqual(len(out.getvalue().splitlines()), 9)

    def test_race_after_confirmation_or_during_generation_stops_without_upload(self):
        for during in (False, True):
            f = Fixture()
            if during:
                def generate(name):
                    f.generated.append(name); f.rows[name] = [row(name)]; return FAKE
                target, effect = 'generate', generate
            else:
                original = f.seed.unchanged
                def changed(snapshot):
                    f.rows[s.APPS[0]] = [row(s.APPS[0])]; original(snapshot)
                target, effect = 'unchanged', changed
            with f.patched(), patch.object(f.seed, target, side_effect=effect), self.assertRaises(s.Stop):
                f.seed.execute()
            self.assertEqual(f.mutations, [])

    def test_post_upload_race_stops_without_deleting_or_second_upload(self):
        f = Fixture(); f.post_upload_race = True
        with f.patched(), self.assertRaises(s.Stop): f.seed.execute()
        self.assertEqual(f.mutations, [s.APPS[0]])
        self.assertEqual(len(f.rows[s.APPS[0]]), 2)

    def test_partial_failure_keeps_prior_versions_and_does_not_retry(self):
        f = Fixture(); f.fail_upload = s.APPS[1]
        with f.patched(), self.assertRaises(s.Stop): f.seed.execute()
        self.assertEqual(f.mutations, list(s.APPS[:2]))
        self.assertEqual(len(f.rows[s.APPS[0]]), 1)
        self.assertEqual(f.rows[s.APPS[2]], [])

    def test_generation_formats_use_only_mocked_randomness_and_mocked_node(self):
        f = Fixture()
        with f.patched(mock_generate=False), patch.object(s.secrets, 'token_bytes', return_value=b'X'*32), patch.object(s.secrets, 'token_urlsafe', return_value='X'*64):
            f.seed.node = '/tools/node'
            self.assertEqual(json.loads(f.seed.generate(s.APPS[0])), ['X'*64])
            self.assertEqual(f.seed.generate(s.APPS[1]), b'WFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFg=')
            self.assertEqual(json.loads(f.seed.generate(s.APPS[2])), ['X'*64])
            self.assertEqual(f.seed.generate(s.APPS[3]), FAKE)

    def test_transport_never_puts_values_in_argv_or_logging_and_suppresses_error_output(self):
        seed = s.Seeder(); seed.gcloud = '/tools/gcloud'
        result = subprocess.CompletedProcess([], 1, stdout=FAKE, stderr=FAKE)
        with patch.object(s.subprocess, 'run', return_value=result) as run:
            with self.assertRaises(s.Stop) as error:
                seed.gc('secrets', 'versions', 'add', s.APPS[0], '--data-file=-', data=FAKE)
        args, kwargs = run.call_args
        self.assertNotIn(FAKE.decode(), repr(args))
        self.assertEqual(kwargs['input'], FAKE)
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_LOG_HTTP'], 'false')
        self.assertEqual(kwargs['env']['CLOUDSDK_CORE_DISABLE_FILE_LOGGING'], 'true')
        self.assertNotIn(FAKE.decode(), str(error.exception))

    def test_main_reports_safe_errors_without_opaque_failure_contents(self):
        for exc in (s.Stop('Known safe stop'), ValueError(FAKE.decode())):
            out, err = io.StringIO(), io.StringIO()
            with patch.object(s.sys, 'argv', ['cloud-shell-seed.py']), patch.object(s.Seeder, 'execute', side_effect=exc), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                self.assertEqual(s.main(), 1)
            self.assertEqual(out.getvalue(), '')
            self.assertNotIn(FAKE.decode(), err.getvalue())

    def test_credentials_override_stops_before_any_process_or_generation(self):
        for name in ('CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GOOGLE_APPLICATION_CREDENTIALS'):
            f = Fixture()
            with f.patched(), patch.dict(os.environ, {name: 'override'}), self.assertRaises(s.Stop):
                f.seed.execute()
            self.assertEqual(f.calls+f.generated+f.mutations, [])

    def test_foreign_version_metadata_stops_before_generation(self):
        f = Fixture(); f.rows[s.APPS[0]] = [{'name':'projects/other/secrets/foreign/versions/1','state':'ENABLED'}]
        with f.patched(), self.assertRaises(s.Stop): f.seed.execute()
        self.assertEqual(f.generated+f.mutations, [])

    def test_node_timeout_never_replays_captured_key(self):
        seed = s.Seeder()
        with patch.object(s.subprocess, 'run', side_effect=subprocess.TimeoutExpired('node', 90, output=FAKE, stderr=FAKE)):
            with self.assertRaises(s.Stop) as error: seed.command(['/tools/node', '-e', s.NODE_JWKS])
        self.assertNotIn(FAKE.decode(), str(error.exception))


if __name__ == '__main__':
    unittest.main()
