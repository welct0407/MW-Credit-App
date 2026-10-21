"""conversation_sql_read: the write/side-effect guard, output caps and the fail-closed switch (no database).

Read access is not narrowed (owner decision, 21 October 2026); these tests cover stability and write safety.
Rejected forms include Chase's probes (ts_stat with chr(), set_config, advisory locks, escape strings).
"""
from datetime import date, datetime
from decimal import Decimal
import unittest
from unittest.mock import patch

import psycopg

from mw_integration_agent import conversation_sql as sql
from mw_integration_agent.config import ConfigurationError

CONFIG = {'conversation_sql_read_enabled': True, 'database_enabled': True, 'database_host': '127.0.0.1',
          'database_port': 5432, 'database_name': 'loan_manager_dev', 'database_user': 'mw_integration_agent',
          'database_auth': 'iam', 'database_iam_user': 'vm-agent@clever-oasis-508610-n7.iam', 'iam_database_port': 5433}

ACCEPTED = [
    'SELECT 1',
    'select "Row ID", "Borrower Name" FROM "Borrowers" WHERE "Borrower Name" = \'Somchai; O\'\'Neil\'',
    'WITH t AS (SELECT sum("Amount Remaining") AS due FROM "Charges") SELECT due FROM t',
    'WITH RECURSIVE r(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM r WHERE n < 5) SELECT n FROM r',
    '  SELECT "Updated At" FROM "Loans" ORDER BY 1 LIMIT 10 OFFSET 10',
    "SELECT count(*) FILTER (WHERE \"Loan Status\" = 'ยังไม่ปิดยอด') FROM \"Loans\"",
    "SELECT 'e' AS letter, settled_at FROM reporting_settlements",
    "SELECT public.loan_close_calculation_v83('L1', current_date)",
    'SELECT "Email", "Login Email" FROM "Partners"',  # full read access (owner decision)
    'SELECT p FROM "Partners" p',
    'SELECT to_jsonb(p) AS row FROM "Partners" p',
    'SELECT * FROM pwa_push_subscriptions',
    "SELECT attname FROM pg_stats WHERE tablename = 'Loans'",
    'SELECT column_name FROM information_schema.columns',
    "SELECT g.n FROM generate_series(1, 3) AS g(n)",
    'SELECT 1\r\n',
]

REJECTED = {
    '': 'SQL_EMPTY',
    'x' * 8001: 'SQL_TOO_LONG',
    'SELECT 1\x00': 'SQL_NUL_NOT_ALLOWED',
    'SELECT 1 -- note': 'SQL_COMMENTS_NOT_ALLOWED',
    'SELECT /* hi */ 1': 'SQL_COMMENTS_NOT_ALLOWED',
    'SELECT $$x$$': 'SQL_DOLLAR',
    'SELECT $1': 'SQL_DOLLAR',
    "SELECT E'\\x41'": 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    "SELECT e'\\x41'": 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    'SELECT U&"d\\0061ta"': 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    "SELECT U&'d\\0061ta'": 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    'SELECT "text"E\'\\x41\'': 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    "SELECT to_jsonb(p)->>\"text\"E'Em\\x61il' FROM \"Partners\" p": 'SQL_ESCAPE_STRINGS_NOT_ALLOWED',
    'SELECT 1; SELECT 2': 'SQL_ONE_STATEMENT_WITHOUT_SEMICOLON',
    'SELECT 1;': 'SQL_ONE_STATEMENT_WITHOUT_SEMICOLON',
    'SELECT 1; DELETE FROM x': 'SQL_ONE_STATEMENT_WITHOUT_SEMICOLON',
    'SELECT 1 FROM "a;b"': 'SQL_ONE_STATEMENT_WITHOUT_SEMICOLON',
    "SELECT 'unterminated": 'SQL_UNTERMINATED_QUOTE',
    'SELECT 1\u037e': 'SQL_NON_ASCII_OUTSIDE_QUOTES',
    'SELECT\u00a01': 'SQL_NON_ASCII_OUTSIDE_QUOTES',
    'SELECT (1': 'SQL_UNBALANCED_PARENTHESES',
    'SELECT 1) FROM (SELECT 2': 'SQL_UNBALANCED_PARENTHESES',
    'EXPLAIN SELECT 1': 'SQL_MUST_START_WITH_SELECT_OR_WITH',
    'VALUES (1)': 'SQL_MUST_START_WITH_SELECT_OR_WITH',
    '(SELECT 1)': 'SQL_MUST_START_WITH_SELECT_OR_WITH',
    'TABLE "Loans"': 'SQL_MUST_START_WITH_SELECT_OR_WITH',
    'SELECT * FROM "Loans" FOR UPDATE': 'SQL_ROW_LOCKING_NOT_ALLOWED',
    'SELECT * FROM "Loans" FOR NO KEY UPDATE': 'SQL_ROW_LOCKING_NOT_ALLOWED',
    'SELECT * FROM "Loans" FOR SHARE': 'SQL_ROW_LOCKING_NOT_ALLOWED',
    'SELECT * FROM "Loans" FOR KEY SHARE': 'SQL_ROW_LOCKING_NOT_ALLOWED',
    'SELECT 1 AS "delete"': 'SQL_KEYWORD_NOT_ALLOWED: DELETE',
    'SELECT * INTO copy FROM "Loans"': 'SQL_KEYWORD_NOT_ALLOWED: INTO',
    'WITH x AS (DELETE FROM "Loans" RETURNING 1) SELECT * FROM x': 'SQL_KEYWORD_NOT_ALLOWED: DELETE',
    # Side effects, session changes, waits, file reads and functions that run SQL text.
    'SELECT pg_sleep(30)': 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT "pg_sleep"(30)': 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT set_config('role','x',true)": 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT "set_config"(1,2,3)': 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_catalog.set_config('a','b',true)": 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_advisory_lock(1)': 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_advisory_xact_lock(1)': 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_try_advisory_xact_lock(1) AS l': 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_try_advisory_lock_shared(1)': 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_notify('c','x')": 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_terminate_backend(1)': 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_cancel_backend(1)': 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT dblink('x','y')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT lo_import('/etc/passwd')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_read_file('/etc/passwd')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_read_binary_file('/x')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_ls_dir('.')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT * FROM ts_stat('select ''a''::tsvector')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT * FROM ts_stat('select ' || chr(115) || 'et_config(1)')": 'SQL_FUNCTION_NOT_ALLOWED',
    ("SELECT word FROM ts_stat('select ' || chr(115)||'et_config'||'(''role'',''chase_writer'',true)::tsvector') "
     'WHERE false UNION ALL SELECT current_user::text'): 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT * FROM ts_stat('with x as (' || 'ins'||'ert into writes values (1) returning 1) select ''a''::tsvector from x')":
        'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT ts_rewrite('a'::tsquery, 'select 1')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT query_to_xml('select 1', true, true, '')": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_logical_emit_message(false, 'x', repeat('x', 1000000))": 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT pg_catalog.\"pg_logical_emit_message\"(true, 'a', 'b')": 'SQL_FUNCTION_NOT_ALLOWED',
    'SELECT pg_export_snapshot()': 'SQL_FUNCTION_NOT_ALLOWED',
    "SELECT xpath('/a', query_to_xml('select 1',true,true,''))": 'SQL_FUNCTION_NOT_ALLOWED',
}
for word in sql.DENY_WORDS:
    REJECTED.setdefault(f'SELECT 1 FROM t WHERE {word.lower()} x', 'SQL_KEYWORD_NOT_ALLOWED: ' + word)


class Connection:
    """A fake guarded session with a named (server-side) cursor: records statements, returns a fixed result."""
    def __init__(self, columns=('n',), rows=((1,),), identity=('mw_integration_agent', 'loan_manager_dev'), error=None):
        self.columns, self.rows, self.identity, self.error = columns, list(rows), identity, error
        self.statements, self.cursors, self.rolled_back, self.closed = [], [], False, False

    def execute(self, statement, parameters=None):
        self.statements.append((statement, parameters))
        parent = self
        class Result:
            def fetchone(self):
                return parent.identity
        return Result()

    def cursor(self, name=None):
        parent = self
        class Cursor:
            description = None
            def execute(self, statement, parameters=None):
                parent.statements.append((statement, parameters))
                if parent.error:
                    raise parent.error
                self.description = [type('Column', (), {'name': c}) for c in parent.columns]
            def fetchmany(self, size):
                self.fetched = size
                return parent.rows[:size]
            def close(self):
                self.closed = True
        cursor = Cursor()
        cursor.name = name
        self.cursors.append(cursor)
        return cursor

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def with_total(columns, rows):
    """The prepared statement adds the running byte total as the last column."""
    return Connection(columns=tuple(columns) + (sql.BYTES,), rows=[tuple(r) + (1,) for r in rows])


class GuardTests(unittest.TestCase):
    def test_accepts_plain_reads_including_every_readable_relation(self):
        for text in ACCEPTED:
            with self.subTest(text=text):
                self.assertEqual(sql.guard(text), text)

    def test_rejects_every_listed_form_before_connecting(self):
        with patch.object(sql, 'connect_raw', side_effect=AssertionError('connection opened for a rejected query')):
            for text, code in REJECTED.items():
                with self.subTest(text=text[:60]):
                    with self.assertRaises(ConfigurationError) as caught:
                        sql.query(CONFIG, text)
                    self.assertTrue(str(caught.exception).startswith(code), str(caught.exception))

    def test_switch_fails_closed_without_connecting(self):
        with patch.object(sql, 'connect_raw', side_effect=AssertionError('connected')):
            for config in ({**CONFIG, 'conversation_sql_read_enabled': False}, {**CONFIG, 'database_enabled': False},
                           {k: v for k, v in CONFIG.items() if k != 'conversation_sql_read_enabled'}):
                with self.assertRaisesRegex(ConfigurationError, '^SQL_READ_DISABLED$'):
                    sql.query(config, 'SELECT 1')
                with self.assertRaisesRegex(ConfigurationError, '^SQL_READ_DISABLED$'):
                    sql.payoff(config, 'L1')

    def test_prepared_statement_wraps_the_query_under_a_server_side_byte_bound(self):
        statement = sql.prepare('SELECT 1 AS n')
        self.assertIn('FROM (\nSELECT 1 AS n\n) AS q', statement)
        self.assertIn(f'sum(pg_column_size(q.*)) OVER (ROWS UNBOUNDED PRECEDING) AS "{sql.BYTES}"', statement)
        self.assertIn(f'> {sql.RESULT_LIMIT}', statement)
        self.assertIn(f"'{sql.TOO_LARGE} ' || r.\"{sql.BYTES}\"", statement)
        with self.assertRaisesRegex(ConfigurationError, 'SQL_FUNCTION_NOT_ALLOWED'):
            sql.prepare('SELECT pg_sleep(1)')


class SessionTests(unittest.TestCase):
    def run_query(self, connection, text='SELECT 1 AS n', config=CONFIG):
        with patch.object(sql, 'connect_raw', return_value=connection) as raw:
            return sql.query(config, text), raw

    def test_iam_session_is_read_only_guarded_server_cursor_and_always_rolled_back(self):
        connection = with_total(('n',), [(1,)])
        result, raw = self.run_query(connection)
        self.assertEqual(result, {'columns': ['n'], 'rows': [{'n': 1}], 'row_count': 1, 'complete': True})
        login = raw.call_args.kwargs
        self.assertEqual((login['host'], login['port'], login['user'], login['dbname']),
                         ('127.0.0.1', 5433, 'vm-agent@clever-oasis-508610-n7.iam', 'loan_manager_dev'))
        self.assertEqual(login['options'], '-c default_transaction_read_only=on')
        self.assertNotIn('password', login)
        statements = [s for s, _ in connection.statements]
        self.assertEqual(statements[:9], ['SET ROLE mw_integration_agent', 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
                                          "SET LOCAL statement_timeout = '20s'", "SET LOCAL lock_timeout = '2s'",
                                          "SET LOCAL idle_in_transaction_session_timeout = '30s'",
                                          'SET LOCAL search_path = pg_catalog, public', "SET LOCAL timezone = 'Asia/Bangkok'",
                                          'SET LOCAL standard_conforming_strings = on',
                                          'SELECT current_user, current_database()'])
        self.assertEqual(statements[9], sql.prepare('SELECT 1 AS n'))
        cursor = connection.cursors[0]
        self.assertEqual((cursor.name, cursor.fetched, cursor.closed), (sql.CURSOR, 501, True))
        self.assertTrue(connection.rolled_back and connection.closed)

    def test_password_session_uses_the_role_password_file(self):
        config = {**CONFIG, 'database_auth': 'password', 'database_password_file': '/etc/mw/secrets/pg.txt',
                  'secrets_directory': '/etc/mw/secrets'}
        with patch.object(sql, 'load_secret', return_value='synthetic-password'):
            _, raw = self.run_query(with_total(('n',), [(1,)]), config=config)
        self.assertEqual((raw.call_args.kwargs['port'], raw.call_args.kwargs['user']), (5432, 'mw_integration_agent'))

    def test_identity_mismatch_stops_before_the_query(self):
        for identity in (('postgres', 'loan_manager_dev'), ('mw_integration_agent', 'loan_manager_prod')):
            connection = Connection(identity=identity)
            with self.assertRaisesRegex(ConfigurationError, 'SQL_READ_IDENTITY_MISMATCH'):
                self.run_query(connection)
            self.assertEqual(connection.cursors, [])
            self.assertTrue(connection.rolled_back)

    def test_unapproved_target_is_refused(self):
        for change in ({'database_host': '10.0.0.5'}, {'database_user': 'postgres'}):
            with patch.object(sql, 'connect_raw', side_effect=AssertionError('connected')):
                with self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_SQL_READ_DATABASE'):
                    sql.query({**CONFIG, **change}, 'SELECT 1')

    def test_row_cap_cell_cap_and_size_limit(self):
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ROW_CAP_NARROW_QUERY'):
            self.run_query(with_total(('n',), [(i,) for i in range(600)]))
        result, _ = self.run_query(with_total(('n',), [(i,) for i in range(500)]))
        self.assertEqual(result['row_count'], 500)
        with self.assertRaisesRegex(ConfigurationError, '^SQL_RESULT_TOO_LARGE: a value'):
            self.run_query(with_total(('big',), [('x' * (sql.CELL_LIMIT + 1),)]))
        with self.assertRaisesRegex(ConfigurationError, '^SQL_RESULT_TOO_LARGE: a value'):
            self.run_query(with_total(('doc',), [({'k': 'x' * sql.CELL_LIMIT},)]))
        with self.assertRaisesRegex(ConfigurationError, '^SQL_RESULT_TOO_LARGE: select'):
            self.run_query(with_total(('x',), [('x' * 1000,) for _ in range(300)]))
        with self.assertRaisesRegex(ConfigurationError, '^SQL_DUPLICATE_COLUMN_NAMES'):
            self.run_query(with_total(('?column?', '?column?'), [(1, 2)]))

    def test_values_are_json_safe(self):
        nested = {'partner': {'Email': 'a@example.com', 'name': 'A'}}
        connection = with_total(('amount', 'day', 'at', 'detail'),
                                [(Decimal('10600.00'), date(2026, 10, 21), datetime(2026, 10, 21, 14, 5), nested)])
        result, _ = self.run_query(connection)
        row = result['rows'][0]
        self.assertEqual((row['amount'], row['day'], row['at']), ('10600.00', '2026-10-21', '2026-10-21T14:05:00'))
        self.assertEqual(row['detail'], nested)  # no redaction: full read access (owner decision)

    def test_server_errors_are_bounded_messages(self):
        with self.assertRaisesRegex(ConfigurationError, '^SQL_STATEMENT_TIMEOUT'):
            self.run_query(Connection(error=psycopg.errors.QueryCanceled()))
        with self.assertRaisesRegex(ConfigurationError, '^SQL_ERROR 42703'):
            self.run_query(Connection(error=psycopg.errors.UndefinedColumn()))
        with self.assertRaises(psycopg.OperationalError):
            self.run_query(Connection(error=psycopg.OperationalError('server closed the connection')))

    def test_payoff_eligible_and_ineligible(self):
        calculation = {'amount': 10600, 'allocations': [], 'planHash': 'x'}
        connection = Connection(columns=('loan_close_calculation_v83',), rows=[(calculation,)])
        with patch.object(sql, 'connect_raw', return_value=connection):
            value = sql.payoff(CONFIG, 'L1')
        self.assertEqual(value, {'loan_id': 'L1', 'eligible': True, 'calculation': calculation, 'complete': True})
        statement, parameters = connection.statements[9]
        self.assertEqual(statement, "SELECT public.loan_close_calculation_v83(%s, (now() AT TIME ZONE 'Asia/Bangkok')::date)")
        self.assertEqual(parameters, ('L1',))
        with patch.object(sql, 'connect_raw', return_value=Connection(error=psycopg.errors.RaiseException())):
            value = sql.payoff(CONFIG, 'L2')
        self.assertEqual((value['eligible'], value['loan_id']), (False, 'L2'))
        for bad in ('', ' ', 'x' * 201, 'a\x00b', None):
            with self.assertRaisesRegex(ConfigurationError, 'INVALID_LOAN_ID'):
                sql.payoff(CONFIG, bad)


if __name__ == '__main__':
    unittest.main()
