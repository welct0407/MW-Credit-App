"""conversation_sql_read against a disposable PostgreSQL 18 database (lab): the server enforces what the guard assumes.

Uses MW_DML_TEST_DSN (a named mw_dml_test* loopback database). Creates the NOLOGIN role mw_integration_agent
when missing, the schema mw_sql_lab and a fixture public.loan_close_calculation_v83, and drops all of them
afterwards (the role only if this suite created it). The session signs in as the DSN user and SET ROLEs to
mw_integration_agent, the IAM path of the production code.
"""
import os
import unittest
from unittest.mock import patch

import psycopg
from psycopg.conninfo import conninfo_to_dict

from mw_integration_agent import conversation_sql as sql
from mw_integration_agent.config import ConfigurationError

FIXTURE = '''
CREATE SCHEMA mw_sql_lab;
CREATE TABLE mw_sql_lab.lab_loans ("Row ID" text PRIMARY KEY, "Principal Amount" numeric NOT NULL, "Loan Date" date NOT NULL,
  "Email" text);
INSERT INTO mw_sql_lab.lab_loans VALUES ('L1', 10000, '2026-10-19', 'synthetic@example.com'), ('L2', 2500.50, '2026-10-01', NULL);
CREATE FUNCTION mw_sql_lab.sneaky_write() RETURNS integer LANGUAGE sql VOLATILE AS
  $f$ INSERT INTO mw_sql_lab.lab_loans VALUES ('L9', 1, '2026-10-21', NULL) RETURNING 1 $f$;
GRANT USAGE ON SCHEMA mw_sql_lab TO mw_integration_agent;
GRANT SELECT, INSERT ON mw_sql_lab.lab_loans TO mw_integration_agent;
CREATE FUNCTION public.loan_close_calculation_v83(p_loan text, p_day date) RETURNS jsonb LANGUAGE plpgsql STABLE AS $f$
BEGIN
  IF p_loan <> 'L1' THEN
    RAISE EXCEPTION 'Loan % is not an open auto-enabled Daily Interest loan', p_loan;
  END IF;
  RETURN jsonb_build_object('amount', 10600, 'day', p_day, 'allocations', jsonb_build_array(
    jsonb_build_object('principal', 10000, 'interest', 600)));
END $f$;
'''


@unittest.skipUnless(os.environ.get('MW_DML_TEST_DSN'), 'disposable PostgreSQL fixture required')
class ConversationSqlLabTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dsn = os.environ['MW_DML_TEST_DSN']
        cls.database = conninfo_to_dict(cls.dsn).get('dbname', '')
        with psycopg.connect(cls.dsn, autocommit=True) as conn:
            if conn.info.host not in ('127.0.0.1', 'localhost') or not conn.info.dbname.startswith('mw_dml_test'):
                raise RuntimeError('Synthetic tests require a named disposable loopback database')
            if conn.execute("SELECT to_regnamespace('mw_sql_lab') IS NOT NULL OR "
                            "to_regprocedure('public.loan_close_calculation_v83(text,date)') IS NOT NULL").fetchone()[0]:
                raise RuntimeError('Refusing a database that already has the conversation SQL fixtures')
            cls.created_role = not conn.execute("SELECT 1 FROM pg_roles WHERE rolname='mw_integration_agent'").fetchone()
            if cls.created_role:
                conn.execute('CREATE ROLE mw_integration_agent NOLOGIN')
        cls.addClassCleanup(cls.drop_fixtures)
        with psycopg.connect(cls.dsn, autocommit=True) as conn:
            conn.execute(FIXTURE)

    @classmethod
    def drop_fixtures(cls):
        with psycopg.connect(cls.dsn, autocommit=True) as conn:
            conn.execute('DROP SCHEMA IF EXISTS mw_sql_lab CASCADE')
            conn.execute('DROP FUNCTION IF EXISTS public.loan_close_calculation_v83(text, date)')
            if cls.created_role:
                conn.execute('DROP ROLE IF EXISTS mw_integration_agent')

    def setUp(self):
        self.config = {'conversation_sql_read_enabled': True, 'database_enabled': True, 'database_host': '127.0.0.1',
                       'database_port': 5432, 'database_name': self.database, 'database_user': 'mw_integration_agent',
                       'database_auth': 'iam', 'database_iam_user': 'vm-agent@clever-oasis-508610-n7.iam',
                       'iam_database_port': 5433}
        dsn = self.dsn
        def connect_raw(**kwargs):
            # Same session options as production; the lab signs in with the DSN instead of the IAM listener.
            return psycopg.connect(dsn, options=kwargs['options'], autocommit=kwargs['autocommit'],
                                   application_name=kwargs['application_name'], connect_timeout=kwargs['connect_timeout'])
        raw = patch.object(sql, 'connect_raw', side_effect=connect_raw)
        raw.start()
        self.addCleanup(raw.stop)

    def count(self):
        with psycopg.connect(self.dsn, autocommit=True) as conn:
            return conn.execute('SELECT count(*) FROM mw_sql_lab.lab_loans').fetchone()[0]

    def test_session_runs_as_the_integration_role_in_the_configured_database(self):
        result = sql.query(self.config, "SELECT current_user AS role_name, current_database() AS database_name, "
                                        "current_setting('transaction_read_only') AS read_only, "
                                        "current_setting('transaction_isolation') AS isolation, "
                                        "current_setting('TimeZone') AS zone, current_setting('statement_timeout') AS timeout, "
                                        "current_setting('standard_conforming_strings') AS strings")
        self.assertEqual(result['rows'], [{'role_name': 'mw_integration_agent', 'database_name': self.database, 'read_only': 'on',
                                           'isolation': 'repeatable read', 'zone': 'Asia/Bangkok', 'timeout': '20s',
                                           'strings': 'on'}])
        with self.assertRaisesRegex(ConfigurationError, 'SQL_READ_IDENTITY_MISMATCH'):
            sql.query(dict(self.config, database_name='loan_manager_prod'), 'SELECT 1 AS n')

    def test_read_only_transaction_refuses_a_write_disguised_as_a_select(self):
        before = self.count()
        self.assertEqual(sql.guard('SELECT mw_sql_lab.sneaky_write()'), 'SELECT mw_sql_lab.sneaky_write()')
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ERROR 25006'):
            sql.query(self.config, 'SELECT mw_sql_lab.sneaky_write()')
        self.assertEqual(self.count(), before)

    def test_statement_timeout_fires(self):
        with patch.object(sql, 'STATEMENT_TIMEOUT', '300ms'):
            with self.assertRaisesRegex(ConfigurationError, '^SQL_STATEMENT_TIMEOUT'):
                sql.query(self.config, 'SELECT count(*) AS n FROM generate_series(1, 100000) a, generate_series(1, 100000) b')

    def test_row_cap_values_and_full_read_access(self):
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ROW_CAP_NARROW_QUERY'):
            sql.query(self.config, 'SELECT g AS n FROM generate_series(1, 501) g')
        result = sql.query(self.config, 'SELECT g AS n FROM generate_series(1, 500) g ORDER BY g')
        self.assertEqual((result['row_count'], result['rows'][0], result['rows'][-1]), (500, {'n': 1}, {'n': 500}))
        result = sql.query(self.config, 'SELECT "Row ID" AS id, "Principal Amount" AS principal, "Loan Date" AS day, '
                                        '"Email" AS email, to_jsonb(t) AS detail FROM mw_sql_lab.lab_loans t ORDER BY 1')
        self.assertEqual(result['columns'], ['id', 'principal', 'day', 'email', 'detail'])
        first = result['rows'][0]
        self.assertEqual((first['id'], first['principal'], first['day']), ('L1', '10000', '2026-10-19'))
        # Owner decision, 21 October 2026: read access is not narrowed or redacted.
        self.assertEqual((first['email'], first['detail']['Email']), ('synthetic@example.com', 'synthetic@example.com'))
        self.assertEqual(result['rows'][1]['principal'], '2500.50')
        like = sql.query(self.config, "SELECT count(*) AS n FROM mw_sql_lab.lab_loans WHERE \"Row ID\" LIKE 'L%'")
        self.assertEqual(like['rows'], [{'n': 2}])
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ERROR 42703'):
            sql.query(self.config, 'SELECT missing_column FROM mw_sql_lab.lab_loans')

    def test_named_cursor_holds_client_memory_at_the_caps(self):
        import resource
        before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ROW_CAP_NARROW_QUERY'):
            sql.query(self.config, 'SELECT g AS n, md5(g::text) AS pad FROM generate_series(1, 4000000) g')
        # One oversized cell is refused by the server-side byte bound before it is sent (not the client check).
        with self.assertRaisesRegex(ConfigurationError, '^SQL_RESULT_TOO_LARGE: select fewer'):
            sql.query(self.config, "SELECT repeat('x', 30000000) AS big")
        with self.assertRaisesRegex(ConfigurationError, '^SQL_RESULT_TOO_LARGE: select fewer'):
            sql.query(self.config, "SELECT g AS n, repeat('x', 2000) AS pad FROM generate_series(1, 400) g")
        grown_mb = (resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - before) / 1024
        self.assertLess(grown_mb, 64)

    def test_query_text_functions_are_refused_before_the_server(self):
        for text in ("SELECT * FROM ts_stat('select ' || chr(115) || 'et_config(1)')",
                     "SELECT word FROM ts_stat('SELECT to_tsvector(''simple'', \"Email\") FROM mw_sql_lab.lab_loans')",
                     "SELECT query_to_xml('select 1', true, true, '')", "SELECT set_config('role', 'postgres', true)",
                     'SELECT pg_try_advisory_xact_lock(1) AS l',
                     "SELECT pg_logical_emit_message(false, 'mw', 'x')", 'SELECT pg_export_snapshot()'):
            with self.subTest(text=text), patch.object(sql, 'connect_raw', side_effect=AssertionError('connected')):
                with self.assertRaisesRegex(ConfigurationError, '^SQL_FUNCTION_NOT_ALLOWED'):
                    sql.query(self.config, text)

    def test_payoff_eligible_and_raised_ineligible(self):
        value = sql.payoff(self.config, 'L1')
        self.assertTrue(value['eligible'])
        self.assertEqual(value['calculation']['amount'], 10600)
        self.assertEqual(len(value['calculation']['day']), 10)
        value = sql.payoff(self.config, 'L2')
        self.assertEqual((value['eligible'], value['loan_id']), (False, 'L2'))
        self.assertIn('not an open auto-enabled Daily Interest loan', value['reason'])


if __name__ == '__main__':
    unittest.main()
