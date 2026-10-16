"""Operator scripts take the private location from arguments and identify targets by instance (AGT-QUALITY-03)."""
import importlib.util
import secrets
import unittest
from pathlib import Path
from types import SimpleNamespace

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
spec = importlib.util.spec_from_file_location('configure_reviewer_dml', SCRIPTS / 'configure-reviewer-dml.py')
configure_dml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(configure_dml)


class FakeConnection:
    def __init__(self):
        self.statements = []
        self.info = SimpleNamespace(dbname='loan_manager_dev')

    def execute(self, statement, params=None):
        text = statement if isinstance(statement, str) else statement.as_string(None)
        self.statements.append((text, params))
        if 'pg_roles' in text:
            return SimpleNamespace(fetchone=lambda: None)
        if 'has_schema_privilege' in text:
            return SimpleNamespace(fetchone=lambda: (False, False))
        return SimpleNamespace(fetchone=lambda: None)


class ReviewerDmlScriptTests(unittest.TestCase):
    def test_configure_uses_the_role_of_the_requested_environment(self):
        conn = FakeConnection()
        credential = secrets.token_hex(8)  # generated per run; no fixed credential-like literal
        configure_dml.configure(conn, credential, 'mw_reviewer_dml_dev')
        texts = [t for t, _ in conn.statements]
        self.assertTrue(texts[1].startswith('CREATE ROLE "mw_reviewer_dml_dev" LOGIN NOSUPERUSER'))
        self.assertIn(f"'{credential}'", texts[1])
        self.assertIn('GRANT CONNECT ON DATABASE "loan_manager_dev" TO "mw_reviewer_dml_dev"', texts)
        self.assertFalse(any('"mw_reviewer_dml"' in t for t in texts))
        self.assertEqual(conn.statements[0][1], ('mw_reviewer_dml_dev',))
        # Reviewer DELETE retired and, since V93, no direct "Cash Ledger" DML at all: the ledger
        # projection is the ledger owner's definer; the reviewer keeps a lock-only column grant.
        self.assertFalse(any(t.startswith('GRANT') and 'DELETE' in t for t in texts))
        self.assertIn('GRANT UPDATE ("Created At") ON public."Cash Ledger" TO "mw_reviewer_dml_dev"', texts)
        table_dml = [t for t in texts if t.startswith('GRANT INSERT, UPDATE ON')]
        self.assertTrue(table_dml and all('"Cash Ledger"' not in t for t in table_dml))
        with self.assertRaisesRegex(RuntimeError, 'Unknown reviewer DML role'):
            configure_dml.configure(FakeConnection(), 'x', 'postgres')

    def test_target_is_identified_by_instance_name_only(self):
        environments = {'production': {'instance': 'mw-credit-pg-20261017', 'host': '10.0.0.5', 'database': 'loan_manager_prod', 'user': 'postgres'},
                        'development': {'instance': 'mw-credit-pg-20261017', 'host': '10.0.0.5', 'database': 'loan_manager_dev', 'user': 'postgres'}}
        self.assertEqual(configure_dml.target_for(environments, 'prod')[1], 'mw_reviewer_dml')
        target, role = configure_dml.target_for(environments, 'dev')
        self.assertEqual((target['database'], role), ('loan_manager_dev', 'mw_reviewer_dml_dev'))
        environments['development']['instance'] = 'other'
        with self.assertRaisesRegex(RuntimeError, 'Unexpected dev identity'):
            configure_dml.target_for(environments, 'dev')

    def test_no_workstation_paths_or_public_addresses_remain(self):
        for path in sorted(SCRIPTS.iterdir()):
            if path.suffix in ('.py', '.sh', '.ps1'):
                text = path.read_text(encoding='utf-8', errors='replace')
                with self.subTest(script=path.name):
                    self.assertNotIn('C:/Users/', text); self.assertNotIn('C:\\Users\\', text)
                    self.assertNotIn('136.85.127.134', text)


if __name__ == '__main__':
    unittest.main()
