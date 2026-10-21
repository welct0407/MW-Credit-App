"""Pure diff logic of Refresh-DevCatalog.py: owner, privilege, column and fingerprint reconciliation."""
import importlib.util
from pathlib import Path
import sys
import types
import unittest

REPO = Path(__file__).resolve().parents[2]


def load():
    # The module imports psycopg at load time; a stub keeps this test independent of the pinned driver.
    if 'psycopg' not in sys.modules:
        stub = types.ModuleType('psycopg')
        stub.sql = types.ModuleType('psycopg.sql')
        sys.modules['psycopg'] = stub
        sys.modules['psycopg.sql'] = stub.sql
    spec = importlib.util.spec_from_file_location('refresh_dev_catalog', REPO / 'scripts/database/Refresh-DevCatalog.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


M = load()


def obj(kind, ident, owner, acl=(), columns=(), extension=False, linked=False):
    return {'kind': kind, 'ident': ident, 'owner': owner, 'extension': extension, 'linked': linked,
            'acl': [M.entry(*e) for e in acl], 'columns': [{'column': c[0], **M.entry(*c[1:])} for c in columns]}


class OwnerStatements(unittest.TestCase):
    def test_restores_dev_owner_and_skips_extension_and_database(self):
        before = {('TABLE', 'public.pwa_job_runs'): obj('TABLE', 'public.pwa_job_runs', 'mw_jobs_owner_dev'),
                  ('FUNCTION', 'public.sync_cash_ledger(text, text)'): obj('FUNCTION', 'public.sync_cash_ledger(text, text)', 'mw_ledger_owner_dev'),
                  ('VIEW', 'monitoring.pg_stat_statements'): obj('VIEW', 'monitoring.pg_stat_statements', 'postgres', extension=True),
                  ('DATABASE', 'loan_manager_dev'): obj('DATABASE', 'loan_manager_dev', 'postgres')}
        now = {k: dict(v, owner='postgres') for k, v in before.items()}
        now[('DATABASE', 'loan_manager_dev')]['owner'] = 'cloudsqlsuperuser'
        now[('VIEW', 'monitoring.pg_stat_statements')]['owner'] = 'other'
        statements, skipped = M.owner_statements(before, now)
        self.assertEqual(statements, ['ALTER FUNCTION public.sync_cash_ledger(text, text) OWNER TO "mw_ledger_owner_dev"',
                                      'ALTER TABLE public.pwa_job_runs OWNER TO "mw_jobs_owner_dev"'])
        self.assertEqual([s['ident'] for s in skipped], ['loan_manager_dev', 'monitoring.pg_stat_statements'])

    def test_schema_owner_is_restored_before_its_objects(self):
        before = {('FUNCTION', 'agent_audit.capture_change()'): obj('FUNCTION', 'agent_audit.capture_change()', 'mw_business_audit_owner'),
                  ('SCHEMA', 'agent_audit'): obj('SCHEMA', 'agent_audit', 'mw_business_audit_owner'),
                  ('TABLE', 'agent_audit.commits'): obj('TABLE', 'agent_audit.commits', 'mw_business_audit_owner')}
        now = {k: dict(v, owner='postgres') for k, v in before.items()}
        self.assertEqual(M.owner_statements(before, now)[0], ['ALTER SCHEMA agent_audit OWNER TO "mw_business_audit_owner"',
                                                              'ALTER FUNCTION agent_audit.capture_change() OWNER TO "mw_business_audit_owner"',
                                                              'ALTER TABLE agent_audit.commits OWNER TO "mw_business_audit_owner"'])

    def test_identity_sequence_follows_its_table(self):
        before = {('TABLE', 'public.t'): obj('TABLE', 'public.t', 'o'), ('SEQUENCE', 'public.t_id_seq'): obj('SEQUENCE', 'public.t_id_seq', 'o', linked=True)}
        now = {k: dict(v, owner='postgres') for k, v in before.items()}
        self.assertEqual(M.owner_statements(before, now)[0], ['ALTER TABLE public.t OWNER TO "o"'])

    def test_objects_only_in_one_snapshot_are_not_altered(self):
        before = {('TABLE', 'public.a'): obj('TABLE', 'public.a', 'x')}
        now = {('TABLE', 'public.b'): obj('TABLE', 'public.b', 'postgres')}
        self.assertEqual(M.owner_statements(before, now), ([], []))


class PrivilegeStatements(unittest.TestCase):
    def test_grant_revoke_and_grant_option_changes(self):
        before = M.acl_index([M.entry('mw_app_dev', 'SELECT', False), M.entry('mw_app_dev', 'INSERT', True),
                              M.entry('PUBLIC', 'SELECT', False), M.entry('reader', 'SELECT', False)])
        now = M.acl_index([M.entry('mw_app_dev', 'SELECT', True), M.entry('mw_app_dev', 'INSERT', False),
                           M.entry('mw_app_prod', 'DELETE', False), M.entry('reader', 'SELECT', False)])
        self.assertEqual(M.privilege_statements('TABLE', 'public."Loans"', before, now), [
            'GRANT SELECT ON TABLE public."Loans" TO PUBLIC',
            'GRANT INSERT ON TABLE public."Loans" TO "mw_app_dev" WITH GRANT OPTION',
            'REVOKE GRANT OPTION FOR SELECT ON TABLE public."Loans" FROM "mw_app_dev"',
            'REVOKE DELETE ON TABLE public."Loans" FROM "mw_app_prod"'])

    def test_owner_default_privileges_are_reduced_when_snapshot_had_fewer(self):
        # The journal owner holds INSERT only (no DELETE) on the command table in the snapshot;
        # after a --no-privileges restore the owner's default ACL carries everything.
        before = M.acl_index([M.entry('mw_app_dev_journal_owner', 'INSERT', False)])
        now = M.acl_index([M.entry('mw_app_dev_journal_owner', p, True) for p in ('INSERT', 'SELECT', 'DELETE')])
        statements = M.privilege_statements('TABLE', 'public.pwa_payment_commands', before, now)
        self.assertIn('REVOKE DELETE ON TABLE public.pwa_payment_commands FROM "mw_app_dev_journal_owner"', statements)
        self.assertIn('REVOKE GRANT OPTION FOR INSERT ON TABLE public.pwa_payment_commands FROM "mw_app_dev_journal_owner"', statements)
        self.assertNotIn('GRANT INSERT', ' '.join(statements))

    def test_kind_targets(self):
        before = M.acl_index([M.entry('r', 'USAGE', False)])
        self.assertEqual(M.privilege_statements('SEQUENCE', 'public.s', before, {}), ['GRANT USAGE ON SEQUENCE public.s TO "r"'])
        self.assertEqual(M.privilege_statements('FUNCTION', 'public.f(uuid)', M.acl_index([M.entry('r', 'EXECUTE', False)]), {}), ['GRANT EXECUTE ON FUNCTION public.f(uuid) TO "r"'])
        self.assertEqual(M.privilege_statements('SCHEMA', 'public', before, {}), ['GRANT USAGE ON SCHEMA public TO "r"'])
        self.assertEqual(M.privilege_statements('DOMAIN', 'public.d', before, {}), ['GRANT USAGE ON TYPE public.d TO "r"'])

    def test_column_grants(self):
        before = M.column_index([{'column': '"Borrower Name"', **M.entry('mw_notify_owner_dev', 'SELECT', False)}])
        now = M.column_index([{'column': '"Row ID"', **M.entry('mw_notify_owner_dev', 'SELECT', False)}])
        self.assertEqual(M.column_statements('public."Borrowers"', before, now), [
            'GRANT SELECT ("Borrower Name") ON TABLE public."Borrowers" TO "mw_notify_owner_dev"',
            'REVOKE SELECT ("Row ID") ON TABLE public."Borrowers" FROM "mw_notify_owner_dev"'])


class CatalogDifference(unittest.TestCase):
    def snapshot(self, **changes):
        base = {'objects': [obj('TABLE', 'public.t', 'postgres', [('r', 'SELECT', False)])],
                'triggers': [{'table': 'public.t', 'name': 'zz_t', 'enabled': 'A', 'function': 'f()'}],
                'extensions': [{'name': 'pg_stat_statements', 'schema': 'monitoring', 'version': '1.12'}],
                'flyway': [{'rank': 1, 'version': '1', 'description': 'x', 'checksum': 5, 'success': True}]}
        base.update(changes)
        return base

    def test_equal(self):
        self.assertTrue(M.catalog_difference(self.snapshot(), self.snapshot())['equal'])

    def test_reports_each_kind(self):
        now = self.snapshot(objects=[obj('TABLE', 'public.t', 'other', []), obj('TABLE', 'public.u', 'postgres')],
                            triggers=[{'table': 'public.t', 'name': 'zz_t', 'enabled': 'D', 'function': 'f()'}],
                            extensions=[], flyway=[{'rank': 1, 'version': '1', 'description': 'x', 'checksum': 6, 'success': True}])
        diff = M.catalog_difference(self.snapshot(), now)
        self.assertFalse(diff['equal'])
        self.assertEqual(diff['extraObjects'], ['TABLE public.u'])
        self.assertEqual(diff['ownerDifferences'][0]['now'], 'other')
        self.assertEqual(len(diff['privilegeDifferences']), 1)
        self.assertEqual(len(diff['triggerDifferences']), 1)
        self.assertEqual(len(diff['extensionDifferences']), 1)
        self.assertEqual(len(diff['flywayDifferences']), 2)


class WindowGrants(unittest.TestCase):
    def test_window_create_on_public_is_neither_revoked_nor_residual(self):
        before = {('SCHEMA', 'public'): obj('SCHEMA', 'public', 'pg_database_owner', [('mw_app_dev', 'USAGE', False)])}
        now_objects = [obj('SCHEMA', 'public', 'pg_database_owner', [('mw_app_dev', 'USAGE', False), ('mw_notify_owner_dev', 'CREATE', False), ('other', 'CREATE', False)])]
        stripped = {(o['kind'], o['ident']): o for o in M.strip_window_grants(now_objects, ['mw_notify_owner_dev'])}
        self.assertEqual(M.privilege_plan(before, stripped), ['REVOKE CREATE ON SCHEMA public FROM "other"'])
        self.assertEqual(M.strip_window_grants(now_objects, []), now_objects)


class LabPrepare(unittest.TestCase):
    def test_roles_memberships_and_database_owner(self):
        snapshot = {'catalog': {'objects': [obj('DATABASE', 'loan_manager_dev', 'cloudsqlsuperuser')],
                                'roles': [{'role': 'postgres', 'login': True, 'inherit': True, 'memberOf': [{'role': 'cloudsqlsuperuser', 'inherit': True, 'set': True, 'admin': False}]},
                                          {'role': 'cloudsqlsuperuser', 'login': False, 'inherit': True, 'memberOf': []},
                                          {'role': 'mw_notify_owner_dev', 'login': False, 'inherit': False, 'memberOf': []},
                                          {'role': 'pg_read_all_data', 'login': False, 'inherit': True, 'memberOf': []},
                                          {'role': 'reader@x.iam', 'login': True, 'inherit': True, 'memberOf': [{'role': 'pg_read_all_data', 'inherit': True, 'set': False, 'admin': False}]}]}}
        statements = M.lab_prepare_statements(snapshot, {'postgres', 'mw_notify_owner_dev', 'pg_read_all_data'}, set(), 'loan_manager_dev')
        self.assertEqual(statements, [
            'CREATE ROLE "cloudsqlsuperuser" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT',
            'CREATE ROLE "reader@x.iam" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT',
            'GRANT "cloudsqlsuperuser" TO "postgres" WITH INHERIT TRUE, SET TRUE, ADMIN FALSE',
            'GRANT "pg_read_all_data" TO "reader@x.iam" WITH INHERIT TRUE, SET FALSE, ADMIN FALSE',
            'ALTER DATABASE "loan_manager_dev" OWNER TO "cloudsqlsuperuser"'])
        self.assertEqual(M.lab_prepare_statements(snapshot, {'postgres', 'mw_notify_owner_dev', 'pg_read_all_data', 'cloudsqlsuperuser', 'reader@x.iam'},
                                                  {('cloudsqlsuperuser', 'postgres'), ('pg_read_all_data', 'reader@x.iam')}, 'loan_manager_dev'),
                         ['ALTER DATABASE "loan_manager_dev" OWNER TO "cloudsqlsuperuser"'])


class FingerprintDifference(unittest.TestCase):
    def test_expected_empty_tables_and_differences(self):
        expected = {'public.a': {'count': 2, 'digest': 'x'}, 'public.pwa_push_subscriptions': {'count': 3, 'digest': 'y'}}
        actual = {'public.a': {'count': 2, 'digest': 'x'}, 'public.pwa_push_subscriptions': {'count': 0, 'digest': 'z'}}
        self.assertTrue(M.fingerprint_difference(expected, actual, {'public.pwa_push_subscriptions'})['equal'])
        actual['public.pwa_push_subscriptions']['count'] = 1
        result = M.fingerprint_difference(expected, actual, {'public.pwa_push_subscriptions'})
        self.assertEqual(result['notEmptied'], ['public.pwa_push_subscriptions'])
        actual['public.a']['digest'] = 'w'
        self.assertEqual([d['table'] for d in M.fingerprint_difference(expected, actual, set())['differences']], ['public.a', 'public.pwa_push_subscriptions'])


if __name__ == '__main__':
    unittest.main()
