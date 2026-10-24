"""Central migration history (AGT-TEST-03, DB-AGENTDB-01): idempotent, checksum-pinned, in order.

Two disposable targets, each skipped without its variable:
- MW_AGENT_LAB_MANIFEST: the lab cluster from tests/lab/setup.sh, whose mw_agent is
  already migrated (rerun and tamper checks only).
- MW_AGENT_FRESH_PG_DSN: an empty loopback server (no agent roles or database) on a
  non-default port, e.g. "host=127.0.0.1 port=15611 user=postgres dbname=postgres".
  The suite runs database/setup/bootstrap.sql there, applies V1..Vn from nothing,
  reruns, checks the tamper/out-of-order/target refusals, then drops what it created.
"""
import hashlib
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict
from mw_integration_agent import state_migration
from mw_integration_agent.config import ConfigurationError

AGENT = Path(__file__).resolve().parents[1]
MIGRATIONS = AGENT / 'database/migrations'
BOOTSTRAP = AGENT / 'database/setup/bootstrap.sql'
APPROVAL = '-c mw_design.execution_approved=agent-postgresql-20260922-v1'
ROLES = ('mw_agent_owner', 'mw_agent_worker', 'mw_agent_relay', 'mw_agent_auditor', 'mw_business_audit_owner', 'mw_agent_retention', 'mw_agent_dashboard')


def history(conn):
    return conn.execute('SELECT version,name,sha256 FROM deployment.schema_history ORDER BY version').fetchall()


def version(path):
    return int(path.name.split('__')[0][1:])


def statements(text):
    """Top-level statements of a psql-style script, dollar-quoted bodies kept whole.

    CREATE DATABASE cannot run in a multi-statement string, so each runs alone."""
    result, current, quoted = [], [], False
    for line in text.splitlines():
        if not current and (not line.strip() or line.lstrip().startswith('--')):
            continue
        current.append(line)
        if line.count('$$') % 2:
            quoted = not quoted
        if not quoted and line.rstrip().endswith(';'):
            result.append('\n'.join(current))
            current = []
    if current or quoted:
        raise ValueError('Unterminated statement in setup script')
    return result


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated PostgreSQL 18 lab required')
class CentralMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if cls.lab['host'] != '127.0.0.1' or cls.lab['port'] == 5432 or 'agent-state-lab-' not in cls.lab['root']:
            raise RuntimeError('Refusing a non-laboratory target')
        cls.admin = dict(host=cls.lab['host'], port=cls.lab['port'], dbname='mw_agent', user='postgres', autocommit=True)

    def test_second_run_applies_nothing_and_keeps_history(self):
        with psycopg.connect(**self.admin) as conn:
            before = history(conn)
            result = state_migration.migrate(conn, MIGRATIONS)
            self.assertEqual(result['applied'], [])
            self.assertEqual(result['versions'], len(list(MIGRATIONS.glob('V*__*.sql'))))
            self.assertEqual(history(conn), before)
            self.assertEqual(len(before), result['versions'])

    def test_changed_applied_file_is_refused_without_touching_history(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'migrations'
            shutil.copytree(MIGRATIONS, copy)
            first = sorted(copy.glob('V1__*.sql'))[0]
            first.write_text(first.read_text(encoding='utf-8') + ' ', encoding='utf-8')
            with psycopg.connect(**self.admin) as conn:
                before = history(conn)
                with self.assertRaisesRegex(ConfigurationError, 'CENTRAL_MIGRATION_CHECKSUM_MISMATCH'):
                    state_migration.migrate(conn, copy)
                self.assertEqual(history(conn), before)


@unittest.skipUnless(os.environ.get('MW_AGENT_FRESH_PG_DSN'), 'empty disposable PostgreSQL server required')
class FreshCentralMigrationTests(unittest.TestCase):
    """V1..Vn from an empty database, twice, then refusals; leaves the server empty again."""

    @classmethod
    def setUpClass(cls):
        server = conninfo_to_dict(os.environ['MW_AGENT_FRESH_PG_DSN'])
        if server.get('host') not in ('127.0.0.1', 'localhost') or int(server.get('port') or 5432) == 5432:
            raise RuntimeError('Refusing a non-disposable target: loopback host and non-default port required')
        cls.server = {**server, 'dbname': 'postgres'}
        with psycopg.connect(**cls.server, autocommit=True) as conn:
            if conn.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone() or \
                    conn.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)', (list(ROLES),)).fetchone():
                raise RuntimeError('Refusing a server that already has the agent database or roles')
        cls.addClassCleanup(cls.drop_created)
        with psycopg.connect(**cls.server, autocommit=True, options=APPROVAL) as conn:
            for statement in statements(BOOTSTRAP.read_text(encoding='utf-8')):
                conn.execute(statement)
        cls.agent = {**server, 'dbname': 'mw_agent', 'autocommit': True}
        cls.files = sorted(MIGRATIONS.glob('V*__*.sql'), key=version)
        with psycopg.connect(**cls.agent) as conn:
            cls.first = state_migration.migrate(conn, MIGRATIONS)
            cls.after_first = history(conn)
            cls.second = state_migration.migrate(conn, MIGRATIONS)
            cls.after_second = history(conn)

    @classmethod
    def drop_created(cls):
        with psycopg.connect(**cls.server, autocommit=True) as conn:
            conn.execute('DROP DATABASE IF EXISTS mw_agent WITH (FORCE)')
            for role in ROLES:
                conn.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))

    def test_first_run_applies_every_version_in_order_with_pinned_hashes(self):
        names = [p.name for p in self.files]
        self.assertEqual(names[:11], ['V1__audit_and_control.sql', 'V2__runtime_compatibility.sql',
                                     'V3__job_ownership.sql', 'V4__receipt_evidence.sql', 'V5__audit_retention_identity.sql',
                                     'V6__service_heartbeats.sql', 'V7__notice_accepted_at.sql', 'V8__conversation_messages.sql',
                                     'V9__recent_question_usage.sql', 'V10__recent_question_usage_match.sql',
                                     'V11__drop_conversation_journal.sql'])
        self.assertEqual(self.first, {'applied': names, 'versions': len(names)})
        expected = [(version(p), p.name, hashlib.sha256(p.read_text(encoding='utf-8').encode()).hexdigest()) for p in self.files]
        self.assertEqual([tuple(row) for row in self.after_first], expected)

    def test_second_run_applies_nothing(self):
        self.assertEqual(self.second, {'applied': [], 'versions': len(self.files)})
        self.assertEqual(self.after_second, self.after_first)

    def test_tampered_copy_is_refused_without_touching_history(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'migrations'
            shutil.copytree(MIGRATIONS, copy)
            target = copy / self.files[-1].name
            target.write_text(target.read_text(encoding='utf-8') + '\n-- synthetic tamper\n', encoding='utf-8')
            with psycopg.connect(**self.agent) as conn:
                with self.assertRaisesRegex(ConfigurationError, 'CENTRAL_MIGRATION_CHECKSUM_MISMATCH'):
                    state_migration.migrate(conn, copy)
                self.assertEqual(history(conn), self.after_first)

    def test_unapplied_lower_version_is_refused_and_not_executed(self):
        with tempfile.TemporaryDirectory() as directory:
            copy = Path(directory) / 'migrations'
            shutil.copytree(MIGRATIONS, copy)
            (copy / 'V0__synthetic_out_of_order.sql').write_text(
                'CREATE TABLE runtime.synthetic_out_of_order(id integer);\n', encoding='utf-8')
            with psycopg.connect(**self.agent) as conn:
                with self.assertRaisesRegex(ConfigurationError, 'CENTRAL_MIGRATION_OUT_OF_ORDER'):
                    state_migration.migrate(conn, copy)
                self.assertEqual(history(conn), self.after_first)
                self.assertIsNone(conn.execute("SELECT to_regclass('runtime.synthetic_out_of_order')").fetchone()[0])

    def test_wrong_database_is_refused(self):
        with psycopg.connect(**self.server, autocommit=True) as conn:
            with self.assertRaisesRegex(ConfigurationError, 'WRONG_CENTRAL_MIGRATION_TARGET'):
                state_migration.migrate(conn, MIGRATIONS)

    def test_v6_heartbeat_table_and_grants(self):
        with psycopg.connect(**self.agent) as conn:
            grants = conn.execute('''SELECT grantee,string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_table_grants
                WHERE table_schema='runtime' AND table_name='service_heartbeats' AND grantee<>'mw_agent_owner' GROUP BY grantee ORDER BY grantee''').fetchall()
            self.assertEqual(grants, [('mw_agent_auditor', 'SELECT'), ('mw_agent_retention', 'SELECT'), ('mw_agent_worker', 'INSERT,SELECT,UPDATE')])
            self.assertEqual(conn.execute("SELECT count(*) FROM pg_trigger WHERE tgrelid='runtime.service_heartbeats'::regclass AND NOT tgisinternal").fetchone()[0], 0)

    def test_v11_head_has_no_conversation_journal(self):
        with psycopg.connect(**self.agent) as conn:
            assert_conversation_journal_dropped(self, conn)

@unittest.skipUnless(os.environ.get('MW_AGENT_FRESH_PG_DSN'), 'empty disposable PostgreSQL server required')
class IncrementalV6Tests(unittest.TestCase):
    """V6 on a server already at V5 (the production path): only V6 applies and the heartbeat table appears."""

    def test_v6_applies_on_top_of_v5(self):
        server = {**conninfo_to_dict(os.environ['MW_AGENT_FRESH_PG_DSN']), 'dbname': 'postgres'}
        if server.get('host') not in ('127.0.0.1', 'localhost') or int(server.get('port') or 5432) == 5432:
            raise RuntimeError('Refusing a non-disposable target: loopback host and non-default port required')
        with psycopg.connect(**server, autocommit=True) as conn:
            if conn.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone() or \
                    conn.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)', (list(ROLES),)).fetchone():
                raise RuntimeError('Refusing a server that already has the agent database or roles')

        def drop_created():
            with psycopg.connect(**server, autocommit=True) as conn:
                conn.execute('DROP DATABASE IF EXISTS mw_agent WITH (FORCE)')
                for role in ROLES:
                    conn.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))
        self.addCleanup(drop_created)
        with psycopg.connect(**server, autocommit=True, options=APPROVAL) as conn:
            for statement in statements(BOOTSTRAP.read_text(encoding='utf-8')):
                conn.execute(statement)
        with tempfile.TemporaryDirectory(prefix='mw-agent-v5-') as directory, \
                psycopg.connect(**{**server, 'dbname': 'mw_agent'}, autocommit=True) as conn:
            for path in sorted(MIGRATIONS.glob('V[1-5]__*.sql')):
                (Path(directory) / path.name).write_bytes(path.read_bytes())
            self.assertEqual(state_migration.migrate(conn, directory)['applied'][-1], 'V5__audit_retention_identity.sql')
            self.assertIsNone(conn.execute("SELECT to_regclass('runtime.service_heartbeats')").fetchone()[0])
            self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], ['V6__service_heartbeats.sql', 'V7__notice_accepted_at.sql',
                                                                                  'V8__conversation_messages.sql', 'V9__recent_question_usage.sql', 'V10__recent_question_usage_match.sql',
                                                                                  'V11__drop_conversation_journal.sql'])
            self.assertIsNotNone(conn.execute("SELECT to_regclass('runtime.service_heartbeats')").fetchone()[0])
            self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], [])
            self.assertEqual([row[1] for row in history(conn)][-7:], ['V5__audit_retention_identity.sql', 'V6__service_heartbeats.sql',
                                                                       'V7__notice_accepted_at.sql', 'V8__conversation_messages.sql', 'V9__recent_question_usage.sql',
                                                                       'V10__recent_question_usage_match.sql', 'V11__drop_conversation_journal.sql'])


def check_recent_questions(case, agent, server):
    """V9 and V10: the latest answered turns with their question text and model_rounds usage (by message_id,
    or the first id-less event of a Partner cycle within 30 minutes and before the next turn, never a synthetic
    check's); IGNORED turns are skipped; Codex turns have no usage; the dashboard role may call only the
    function and no table."""
    import json
    from datetime import UTC, datetime
    base = datetime(2026, 10, 22, tzinfo=UTC).timestamp()
    login = 'mw_dashboard_lab_login'
    with psycopg.connect(**agent) as conn:
        case.addCleanup(lambda: psycopg.connect(**server, autocommit=True).execute('DROP ROLE IF EXISTS ' + login))
        conn.execute("INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled) "
                     "VALUES ('agent','postgres',gen_random_uuid(),true) ON CONFLICT DO NOTHING")
        turns = [('q1', 'QUEUED', 0), ('q2', 'QUEUED', 600), ('noise', 'IGNORED', 700), ('q3', 'QUEUED', 1200), ('q4', 'QUEUED', 5000)]
        for message_id, status, offset in turns:
            conn.execute("INSERT INTO runtime.ingress_messages(message_id,sender_id,event_timestamp,text,captured_at,status) "
                         "VALUES (%s,'s',%s,%s,%s,'CAPTURED_NO_PROCESSING')", (message_id, base + offset - 5, 'question ' + message_id, base + offset))
            conn.execute("INSERT INTO runtime.conversation_turns(message_id,binding,partner,sender_id,status,created_at) "
                         "VALUES (%s,'b','p','s',%s,%s)", (message_id, status, base + offset))
        def operation(service, parent=None):
            return conn.execute("""INSERT INTO audit.operations(operation_id,service_name,idempotency_key,parent_operation_id,environment,
                action,actor_kind,plan_sha256,code_version,policy_version,process_generation) VALUES (gen_random_uuid(),%s,
                gen_random_uuid()::text,%s,'test','PROCESS','system',%s,'lab','lab',gen_random_uuid()) RETURNING operation_id""",
                (service, parent, '0' * 64)).fetchone()[0]
        cycle = operation('model_turn', operation('partner-conversation-cycle'))
        synthetic = operation('model_turn', operation('conversation_synthetic_check'))
        gemini = {'provider': 'gemini', 'model': 'gemini-4-argon', 'rounds': 2, 'prompt_tokens': 1000,
                  'cached_content_tokens': 600, 'candidates_tokens': 50, 'thoughts_tokens': 20}
        usage = [  # q1: a synthetic check's id-less event first, then its own cycle's; q2 (Codex): none; q3: tagged
                   # with its id; q4 (newest): only a cycle event 31 minutes later, outside the 30-minute window
            (synthetic, 1, base + 30, dict(gemini, prompt_tokens=7)),
            (cycle, 1, base + 60, gemini),
            (cycle, 2, base + 5000 + 1860, dict(gemini, prompt_tokens=8)),
            (cycle, 3, base + 1260, {'provider': 'claude', 'model': 'claude-opus-5-5', 'message_id': 'q3', 'rounds': 1,
                                     'input_tokens': 900, 'cache_read_input_tokens': 300, 'output_tokens': 40})]
        for op, seq, at, payload in usage:
            conn.execute("""INSERT INTO audit.events(event_id,operation_id,operation_seq,event_kind,route,occurred_at,payload,payload_sha256)
                VALUES (gen_random_uuid(),%s,%s,'model_rounds','internal',to_timestamp(%s),%s::jsonb,%s)""", (op, seq, at, json.dumps(payload), '0' * 64))
        conn.execute('CREATE ROLE ' + login + ' LOGIN')
        conn.execute('GRANT mw_agent_dashboard TO ' + login)
    dashboard = {**agent, 'user': login}
    with psycopg.connect(**dashboard) as conn:
        rows = conn.execute('SELECT question,status,provider,model,rounds,input_tokens,cached_tokens,output_tokens,thinking_tokens '
                            'FROM monitoring.recent_questions_v1(10)').fetchall()
        case.assertEqual([tuple(r) for r in rows], [
            ('question q4', 'QUEUED', None, None, None, None, None, None, None),
            ('question q3', 'QUEUED', 'claude', 'claude-opus-5-5', 1, 900, 300, 40, None),
            ('question q2', 'QUEUED', None, None, None, None, None, None, None),
            ('question q1', 'QUEUED', 'gemini', 'gemini-4-argon', 2, 1000, 600, 50, 20)])
        case.assertEqual(len(conn.execute('SELECT * FROM monitoring.recent_questions_v1(1)').fetchall()), 1)
        # Settings belong to the role; the live Grafana login gets the same two (POSTGRESQL_OPERATIONS.md).
        settings = conn.execute("""SELECT s.setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
            JOIN pg_database d ON d.oid=s.setdatabase WHERE r.rolname='mw_agent_dashboard' AND d.datname='mw_agent'""").fetchone()[0]
        case.assertEqual(sorted(settings), ['default_transaction_read_only=on', 'statement_timeout=10s'])
        for table in ('runtime.ingress_messages', 'runtime.conversation_turns', 'audit.events'):
            with case.subTest(table=table), case.assertRaises(psycopg.errors.InsufficientPrivilege):
                conn.execute('SELECT 1 FROM ' + table + ' LIMIT 1')


def assert_conversation_messages(case, conn):
    """V8: grants, the provider/role and JSON array checks and the statement-level append-only trigger."""
    grants = conn.execute('''SELECT grantee,string_agg(privilege_type,',' ORDER BY privilege_type) FROM information_schema.role_table_grants
        WHERE table_schema='runtime' AND table_name='conversation_messages' AND grantee<>'mw_agent_owner' GROUP BY grantee ORDER BY grantee''').fetchall()
    case.assertEqual(grants, [('mw_agent_auditor', 'SELECT'), ('mw_agent_worker', 'INSERT,SELECT')])
    binding, digest = 'a' * 64, 'b' * 64
    row = (binding, 0, 0, 'event1', 'claude', 'user', '[{"type":"text","text":"x"}]', digest)
    insert = '''INSERT INTO runtime.conversation_messages(binding,epoch,seq,message_id,provider,role,content,prompt_sha256)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)'''
    with conn.transaction():
        conn.execute('SET LOCAL ROLE mw_agent_worker')
        conn.execute(insert, row)
        stored = conn.execute('SELECT provider,content,input_tokens FROM runtime.conversation_messages WHERE binding=%s', (binding,)).fetchone()
        case.assertEqual(tuple(stored), ('claude', '[{"type":"text","text":"x"}]', None))
        # Model JSON may carry \u0000 escapes: stored verbatim (json, not jsonb, validates the array).
        nul = '[{"type":"text","text":"a\\u0000b"}]'
        conn.execute(insert, (binding, 0, 1, 'event1', 'claude', 'assistant', nul, digest))
        case.assertEqual(conn.execute('SELECT content FROM runtime.conversation_messages WHERE seq=1').fetchone()[0], nul)
        # A Gemini epoch stores user/model contents.
        parts = '[{"functionCall":{"name":"finish","args":{},"id":"call_1"},"thoughtSignature":"AY89"}]'
        conn.execute(insert, (binding, 1, 0, 'event2', 'gemini', 'user', '[{"text":"q"}]', digest))
        conn.execute(insert, (binding, 1, 1, 'event2', 'gemini', 'model', parts, digest))
    for statement in ('UPDATE runtime.conversation_messages SET role=\'assistant\'', 'DELETE FROM runtime.conversation_messages',
                      'TRUNCATE runtime.conversation_messages'):
        with case.subTest(statement=statement), case.assertRaises(psycopg.Error):
            with conn.transaction():
                conn.execute(statement)  # as the superuser: the trigger, not a grant, refuses it
    with case.assertRaises(psycopg.errors.InsufficientPrivilege), conn.transaction():
        conn.execute('SET LOCAL ROLE mw_agent_worker')
        conn.execute('UPDATE runtime.conversation_messages SET role=\'assistant\'')
    for bad in ((binding, 0, 2, 'event1', 'claude', 'user', '{"not":"an array"}', digest),
                (binding, 0, 2, 'event1', 'claude', 'user', 'not json', digest),
                (binding, 0, 2, 'event1', 'claude', 'system', '[]', digest),
                (binding, 0, 2, 'event1', 'claude', 'model', '[]', digest),
                (binding, 0, 2, 'event1', 'gemini', 'assistant', '[]', digest),
                (binding, 0, 2, 'event1', 'openai', 'user', '[]', digest),
                (binding, 0, 2, 'event1', None, 'user', '[]', digest),
                (binding, 0, 0, 'event1', 'claude', 'user', '[]', digest)):
        with case.subTest(row=bad[4:7]), case.assertRaises(psycopg.Error), conn.transaction():
            conn.execute(insert, bad)
    case.assertEqual(conn.execute('SELECT count(*) FROM runtime.conversation_messages').fetchone()[0], 4)
    case.assertEqual(conn.execute("SELECT count(*) FROM pg_trigger WHERE tgrelid='runtime.conversation_messages'::regclass AND NOT tgisinternal").fetchone()[0], 1)


@unittest.skipUnless(os.environ.get('MW_AGENT_FRESH_PG_DSN'), 'empty disposable PostgreSQL server required')
class IncrementalV8Tests(unittest.TestCase):
    """V8 on a server already at V7 (the production path): only V8 applies and history becomes append-only."""

    def test_v8_applies_on_top_of_v7(self):
        server = {**conninfo_to_dict(os.environ['MW_AGENT_FRESH_PG_DSN']), 'dbname': 'postgres'}
        if server.get('host') not in ('127.0.0.1', 'localhost') or int(server.get('port') or 5432) == 5432:
            raise RuntimeError('Refusing a non-disposable target: loopback host and non-default port required')
        with psycopg.connect(**server, autocommit=True) as conn:
            if conn.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone() or \
                    conn.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)', (list(ROLES),)).fetchone():
                raise RuntimeError('Refusing a server that already has the agent database or roles')

        def drop_created():
            with psycopg.connect(**server, autocommit=True) as conn:
                conn.execute('DROP DATABASE IF EXISTS mw_agent WITH (FORCE)')
                for role in ROLES:
                    conn.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))
        self.addCleanup(drop_created)
        with psycopg.connect(**server, autocommit=True, options=APPROVAL) as conn:
            for statement in statements(BOOTSTRAP.read_text(encoding='utf-8')):
                conn.execute(statement)
        with tempfile.TemporaryDirectory(prefix='mw-agent-v7-') as directory, \
                psycopg.connect(**{**server, 'dbname': 'mw_agent'}, autocommit=True) as conn:
            for path in sorted(MIGRATIONS.glob('V[1-7]__*.sql')):
                (Path(directory) / path.name).write_bytes(path.read_bytes())
            self.assertEqual(state_migration.migrate(conn, directory)['applied'][-1], 'V7__notice_accepted_at.sql')
            self.assertIsNone(conn.execute("SELECT to_regclass('runtime.conversation_messages')").fetchone()[0])
            (Path(directory) / 'V8__conversation_messages.sql').write_bytes((MIGRATIONS / 'V8__conversation_messages.sql').read_bytes())
            self.assertEqual(state_migration.migrate(conn, directory)['applied'], ['V8__conversation_messages.sql'])
            assert_conversation_messages(self, conn)  # V8 as it was, before V11 dropped the table
            self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], ['V9__recent_question_usage.sql', 'V10__recent_question_usage_match.sql',
                                                                                  'V11__drop_conversation_journal.sql'])
            self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], [])
            assert_conversation_journal_dropped(self, conn)


def assert_conversation_journal_dropped(case, conn):
    """V11: the conversation-only tables, the monitoring schema and the dashboard's CONNECT are gone; the group poll,
    receipt notices and every receipt table stay; the notice stream accepts only receipts."""
    gone = ('conversations', 'conversation_turns', 'conversation_tool_calls', 'conversation_operations', 'conversation_dml',
            'conversation_dml_inserts', 'conversation_messages')
    for name in gone:
        with case.subTest(table=name):
            case.assertIsNone(conn.execute('SELECT to_regclass(%s)', ('runtime.' + name,)).fetchone()[0])
    case.assertIsNone(conn.execute("SELECT to_regnamespace('monitoring')").fetchone()[0])
    case.assertFalse(conn.execute("SELECT has_database_privilege('mw_agent_dashboard','mw_agent','CONNECT')").fetchone()[0])
    for name in ('conversation_poll_state', 'conversation_poll_messages', 'partner_notices', 'ingress_messages', 'receipt_jobs',
                 'partner_reviews', 'cash_statement_sends', 'service_heartbeats'):
        with case.subTest(kept=name):
            case.assertIsNotNone(conn.execute('SELECT to_regclass(%s)', ('runtime.' + name,)).fetchone()[0])
    checks = [r[0] for r in conn.execute("""SELECT pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid='runtime.partner_notices'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%stream%'""")]
    case.assertEqual(checks, ["CHECK ((stream = 'receipt'::text))"])
    with case.assertRaises(psycopg.errors.CheckViolation), conn.transaction():
        conn.execute("INSERT INTO runtime.partner_notices(stream,id,event_key,partner_id,partner,subject,body) "
                     "VALUES ('conversation','v11-check','e','p','{}','s','b')")


@unittest.skipUnless(os.environ.get('MW_AGENT_FRESH_PG_DSN'), 'empty disposable PostgreSQL server required')
class IncrementalV11Tests(unittest.TestCase):
    """V11 on a server at V10 holding conversation data (the production path): V9/V10 behave as before, then V11
    deletes the conversation journal and conversation notices and keeps receipts, the group poll and audit."""

    def test_v11_deletes_the_conversation_journal_on_top_of_v10(self):
        server = {**conninfo_to_dict(os.environ['MW_AGENT_FRESH_PG_DSN']), 'dbname': 'postgres'}
        if server.get('host') not in ('127.0.0.1', 'localhost') or int(server.get('port') or 5432) == 5432:
            raise RuntimeError('Refusing a non-disposable target: loopback host and non-default port required')
        with psycopg.connect(**server, autocommit=True) as conn:
            if conn.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone() or \
                    conn.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)', (list(ROLES),)).fetchone():
                raise RuntimeError('Refusing a server that already has the agent database or roles')

        def drop_created():
            with psycopg.connect(**server, autocommit=True) as conn:
                conn.execute('DROP DATABASE IF EXISTS mw_agent WITH (FORCE)')
                for role in ROLES:
                    conn.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))
        self.addCleanup(drop_created)
        with psycopg.connect(**server, autocommit=True, options=APPROVAL) as conn:
            for statement in statements(BOOTSTRAP.read_text(encoding='utf-8')):
                conn.execute(statement)
        agent = {**server, 'dbname': 'mw_agent', 'autocommit': True}
        with tempfile.TemporaryDirectory(prefix='mw-agent-v10-') as directory:
            for path in sorted(MIGRATIONS.glob('V*__*.sql'), key=version):
                if version(path) <= 10:
                    (Path(directory) / path.name).write_bytes(path.read_bytes())
            with psycopg.connect(**agent) as conn:
                self.assertEqual(state_migration.migrate(conn, directory)['applied'][-1], 'V10__recent_question_usage_match.sql')
            check_recent_questions(self, agent, server)  # V9/V10 at V10, seeding turns, ingress and usage events
            with psycopg.connect(**agent) as conn:
                conn.execute("INSERT INTO runtime.conversations(binding,thread_id) VALUES ('b','t')")
                conn.execute("INSERT INTO runtime.conversation_dml(id,message_id,actor,request,state) VALUES ('d','q1','a','{}','UNKNOWN')")
                conn.execute("INSERT INTO runtime.conversation_poll_state(conversation_id,checked_through) VALUES ('group-1',1)")
                for stream in ('receipt', 'conversation'):
                    conn.execute("INSERT INTO runtime.partner_notices(stream,id,event_key,partner_id,partner,subject,body) "
                                 "VALUES (%s,'n1','e','p','{}','s','b')", (stream,))
                events = conn.execute('SELECT count(*) FROM audit.events').fetchone()[0]
                self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], ['V11__drop_conversation_journal.sql'])
                self.assertEqual(state_migration.migrate(conn, MIGRATIONS)['applied'], [])
                assert_conversation_journal_dropped(self, conn)
                self.assertEqual([tuple(r) for r in conn.execute('SELECT stream,id FROM runtime.partner_notices')], [('receipt', 'n1')])
                self.assertEqual(conn.execute("SELECT checked_through FROM runtime.conversation_poll_state WHERE conversation_id='group-1'").fetchone()[0], 1)
                self.assertEqual(conn.execute('SELECT count(*) FROM audit.events').fetchone()[0], events)  # audit is not journal
                self.assertEqual(conn.execute("SELECT count(*) FROM runtime.ingress_messages WHERE message_id LIKE 'q%'").fetchone()[0], 4)


if __name__ == '__main__':
    unittest.main()
