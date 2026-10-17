"""backup-agent-database.py resolves PostgreSQL tools per platform and validates the dump name; no database needed."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
spec = importlib.util.spec_from_file_location('backup_agent_database', SCRIPTS / 'backup-agent-database.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class DumpNameTests(unittest.TestCase):
    def test_default_name_is_unchanged(self):
        self.assertEqual(backup.DEFAULT_DUMP_NAME, 'mw_agent-before-activation.dump')
        self.assertEqual(backup.safe_dump_name(backup.DEFAULT_DUMP_NAME), 'mw_agent-before-activation.dump')

    def test_separators_and_traversal_are_refused(self):
        for bad in ('', '.', '..', '../x.dump', 'a/b.dump', 'a\\b.dump', '/abs.dump', 'x..dump', 'C:\\x.dump'):
            with self.subTest(bad=bad), self.assertRaises(RuntimeError):
                backup.safe_dump_name(bad)


class SourceSslModeTests(unittest.TestCase):
    def test_require_is_accepted_for_any_host(self):
        for host in ('10.0.0.5', '127.0.0.1', 'db.example'):
            with self.subTest(host=host):
                self.assertEqual(backup.source_sslmode('require', host), 'require')

    def test_disable_is_only_for_a_loopback_tunnel(self):
        for host in ('127.0.0.1', '::1', 'localhost'):
            with self.subTest(host=host):
                self.assertEqual(backup.source_sslmode('disable', host), 'disable')
        for host in ('10.0.0.5', '34.1.2.3', '127.0.0.2', 'db.example', ''):
            with self.subTest(host=host), self.assertRaisesRegex(RuntimeError, 'loopback'):
                backup.source_sslmode('disable', host)

    def test_other_modes_are_refused(self):
        for mode in ('prefer', 'allow', 'verify-full', ''):
            with self.subTest(mode=mode), self.assertRaises(RuntimeError):
                backup.source_sslmode(mode, '127.0.0.1')


class ToolResolutionTests(unittest.TestCase):
    def test_windows_keeps_lab_bin_and_exe(self):
        path = backup.pg_tool('pg_dump', 'C:/lab/bin', windows=True)
        self.assertEqual(Path(path), Path('C:/lab/bin') / 'pg_dump.exe')

    def test_windows_ignores_pg_bin_and_path(self):
        with mock.patch.object(backup.shutil, 'which') as which:
            backup.pg_tool('pg_restore', 'C:/lab/bin', pg_bin='/opt/pg', windows=True)
        which.assert_not_called()

    def test_linux_uses_explicit_pg_bin(self):
        with mock.patch.object(backup.shutil, 'which', return_value='/opt/pg/pg_dump') as which:
            self.assertEqual(backup.pg_tool('pg_dump', 'C:/lab/bin', pg_bin='/opt/pg', windows=False), '/opt/pg/pg_dump')
        which.assert_called_once_with('pg_dump', path='/opt/pg')

    def test_linux_pg_bin_without_tool_is_an_error(self):
        with mock.patch.object(backup.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'not found in --pg-bin'):
                backup.pg_tool('pg_dump', 'x', pg_bin='/opt/pg', windows=False)

    def test_linux_falls_back_to_path(self):
        with mock.patch.object(backup.shutil, 'which', return_value='/usr/bin/psql') as which:
            self.assertEqual(backup.pg_tool('psql', 'x', windows=False), '/usr/bin/psql')
        which.assert_called_once_with('psql')

    def test_linux_missing_tool_gives_clear_error(self):
        with mock.patch.object(backup.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(RuntimeError, 'not found on PATH.*--pg-bin'):
                backup.pg_tool('pg_restore', 'x', windows=False)


class MainValidationTests(unittest.TestCase):
    def run_main(self, *extra, tools=True, host='h'):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            env = root / 'env.json'
            env.write_text(json.dumps({'production': {'instance': 'mw-credit-pg-20261017', 'host': host, 'port': 5432,
                                                      'user': 'u', 'passwordFile': str(root / 'pw')}}))
            lab = root / 'lab.json'
            lab.write_text(json.dumps({'host': '127.0.0.1', 'port': 55432, 'root': str(root), 'bin': str(root)}))
            args = ['--environments', str(env), '--lab', str(lab), '--private-directory', str(root),
                    '--output', str(root / 'out.json'), *extra]
            with mock.patch.object(backup.psycopg, 'connect', side_effect=AssertionError('no database access expected')), \
                    mock.patch.object(backup.shutil, 'which', return_value='/usr/bin/x' if tools else None), \
                    mock.patch.object(backup.sys, 'platform', 'linux'):
                backup.main(args)

    def test_unsafe_dump_name_is_refused_before_any_connection(self):
        with self.assertRaisesRegex(RuntimeError, 'Unsafe dump name'):
            self.run_main('--dump-name', '../escape.dump')

    def test_disable_for_a_remote_source_is_refused_before_any_connection(self):
        with self.assertRaisesRegex(RuntimeError, 'loopback'):
            self.run_main('--source-sslmode', 'disable', host='34.1.2.3')

    def test_disable_for_the_tunnel_passes_validation(self):
        # Validation passes, so the first (lab) connection is reached and the mock stops the run there.
        with self.assertRaisesRegex(AssertionError, 'no database access expected'):
            self.run_main('--source-sslmode', 'disable', host='127.0.0.1')

    def test_missing_tools_are_refused_before_any_connection(self):
        with self.assertRaisesRegex(RuntimeError, 'not found on PATH'):
            self.run_main(tools=False)


if __name__ == '__main__':
    unittest.main()
