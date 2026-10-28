"""The canonical PostgreSQL capture (scripts/dictionary/capture_postgresql.py) with a fake connection, tunnel and token:
route, guards and identity assertion (R103). No database or network."""
import contextlib
import importlib.util
import inspect
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('capture_postgresql', REPO / 'scripts/dictionary/capture_postgresql.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)

READ = 'codex-cloud-read@clever-oasis-508610-n7.iam'
TOKEN = 'synthetic-login-token'


class Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0]

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, identity):
        self.identity, self.statements, self.rolled_back = identity, [], False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, query):
        self.statements.append(query)
        if query == capture.IDENTITY:
            return Result([dict(self.identity)])
        if 'cron.timezone' in query:
            return Result([{'value': None}])
        if 'pg_extension' in query and query.startswith('SELECT extname AS name'):
            return Result([{'name': 'plpgsql'}])
        return Result([])

    def rollback(self):
        self.rolled_back = True


def identity(**change):
    return {'database': 'loan_manager_prod', 'role': READ, 'session_role': READ, 'server_address': '127.0.0.1', 'server_port': 5432,
            'system_identifier': '7685391508477894672', 'read_only': 'on', 'ssl': False, **change}


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.private = Path(self.tmp.name) / 'private'
        self.environ = {'MW_PRIVATE_ROOT': str(self.private)}
        self.calls = {'tunnel': 0, 'secrets': [], 'connect': []}

    def run_capture(self, ident=None, local_port=None, destination=None, environment='production', windows=False):
        connection = FakeConnection(ident or identity())

        @contextlib.contextmanager
        def tunnel(repo, environ):
            self.calls['tunnel'] += 1
            yield 15432

        def secrets(argv):
            self.calls['secrets'].append(argv)
            return TOKEN

        def connect(**options):
            self.calls['connect'].append(options)
            return connection

        destination = destination or self.private / 'dictionary' / 'production-complete.json'
        with mock.patch('builtins.print') as printed:
            result = capture.capture(environment, destination, local_port, self.environ, connect, secrets, tunnel, windows=windows)
        return result, connection, printed, destination

    def test_linux_route_tunnel_read_token_and_read_only_options(self):
        result, connection, printed, destination = self.run_capture()
        self.assertEqual(self.calls['tunnel'], 1)
        self.assertEqual(self.calls['secrets'], [['gcloud', 'sql', 'generate-login-token',
                                                  '--impersonate-service-account=codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com']])
        options = self.calls['connect'][0]
        self.assertEqual((options['host'], options['port'], options['dbname'], options['user'], options['sslmode']),
                         ('127.0.0.1', 15432, 'loan_manager_prod', READ, 'disable'))
        self.assertIn('default_transaction_read_only=on', options['options'])
        self.assertIn('statement_timeout=30000', options['options'])
        self.assertEqual(connection.statements[0], 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
        self.assertTrue(connection.rolled_back)
        saved = json.loads(destination.read_text(encoding='utf8'))
        self.assertEqual(saved['format'], 1)
        self.assertEqual(saved['target'], {'instance': 'mw-credit-pg-20261017', 'database': 'loan_manager_prod', 'route': 'cloud-sql-auth-proxy',
                                           'host': '127.0.0.1', 'port': 15432})
        self.assertEqual(saved['metadata_sha256'], capture.content_hash(saved['sections']))
        self.assertEqual(set(saved['sections']), set(capture.QUERIES) | {'jobs'})
        self.assertIs(saved['identity']['ssl'], False)  # recorded; the loopback hop to the proxy is plain
        self.assertEqual(oct(destination.stat().st_mode & 0o777), '0o600')
        self.assertNotIn(TOKEN, destination.read_text(encoding='utf8') + json.dumps([c.args for c in printed.call_args_list]))
        self.assertEqual(result['metadata_sha256'], saved['metadata_sha256'])

    def test_local_port_skips_the_tunnel(self):
        self.run_capture(local_port=15433)
        self.assertEqual(self.calls['tunnel'], 0)
        self.assertEqual(self.calls['connect'][0]['port'], 15433)

    def test_windows_requires_a_local_port(self):
        with self.assertRaisesRegex(ValueError, '--local-port'):
            self.run_capture(windows=True)
        self.run_capture(local_port=15432, windows=True)
        self.assertEqual(self.calls['tunnel'], 0)
        self.assertEqual(len(self.calls['connect']), 1)

    def test_identity_assertion_refuses_and_writes_nothing(self):
        for change in ({'database': 'loan_manager_dev'}, {'role': 'postgres'}, {'session_role': 'postgres'}, {'read_only': 'off'},
                       {'system_identifier': '1'}):
            with self.subTest(change=change), self.assertRaisesRegex(ValueError, 'identity/read-only/cluster'):
                self.run_capture(identity(**change))
        self.assertFalse((self.private / 'dictionary' / 'production-complete.json').exists())

    def test_development_targets_the_development_database(self):
        _, _, _, destination = self.run_capture(identity(database='loan_manager_dev'), environment='development',
                                                destination=self.private / 'development-complete.json')
        self.assertEqual(self.calls['connect'][0]['dbname'], 'loan_manager_dev')
        self.assertTrue(destination.exists())

    def test_destination_guards(self):
        existing = self.private / 'existing.json'
        existing.parent.mkdir(parents=True)
        existing.write_text('{}')
        for destination, pattern in ((existing, 'overwrite'), (REPO / 'project/outputs/capture.json', 'outside the repository'),
                                     (Path(self.tmp.name) / 'elsewhere.json', 'MW_PRIVATE_ROOT')):
            with self.subTest(destination=destination), self.assertRaisesRegex((ValueError, FileExistsError), pattern):
                self.run_capture(destination=destination)
        self.assertEqual(self.calls['connect'], [])
        self.assertEqual(existing.read_text(), '{}')

    def test_environment_tuple_is_pinned(self):
        repo = Path(self.tmp.name) / 'repo'
        (repo / 'database').mkdir(parents=True)
        environments = json.loads((REPO / 'database/environments.json').read_text())
        environments['production']['instance'] = 'other-instance'
        (repo / 'database/environments.json').write_text(json.dumps(environments))
        with self.assertRaisesRegex(ValueError, 'Unrecognized environment tuple'):
            capture.target('production', repo)
        self.assertEqual(capture.target('production')['database'], 'loan_manager_prod')

    def test_route_reuses_the_flyway_helpers(self):
        parameters = inspect.signature(capture.capture).parameters
        self.assertIs(parameters['tunnel_factory'].default, capture.flyway.tunnel)
        self.assertIs(parameters['secrets'].default, capture.flyway.secret_output)
        self.assertEqual(capture.flyway.READ_USER, READ)
        self.assertNotIn('LOCALAPPDATA', (REPO / 'scripts/dictionary/capture_postgresql.py').read_text(encoding='utf8'))
        self.assertNotIn('136.85.127.134', (REPO / 'scripts/dictionary/capture_postgresql.py').read_text(encoding='utf8'))

    def test_project_shim_runs_the_canonical_capture_from_the_monorepo_root(self):
        with mock.patch.dict('os.environ', {'MW_CREDIT_APP_ROOT': ''}):
            import os
            os.environ.pop('MW_CREDIT_APP_ROOT')
            shim = importlib.util.spec_from_file_location('capture_shim', REPO / 'project/scripts/dictionary/capture_postgresql.py')
            module = importlib.util.module_from_spec(shim)
            shim.loader.exec_module(module)
        self.assertEqual(module.CLUSTER_SYSTEM_IDENTIFIER, capture.CLUSTER_SYSTEM_IDENTIFIER)


if __name__ == '__main__':
    unittest.main()
