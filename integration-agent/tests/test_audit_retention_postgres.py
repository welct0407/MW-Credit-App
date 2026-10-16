"""Central V5 retention identity (DB-PERF-01, R064 W4) on an empty disposable PostgreSQL server.

Gated like FreshCentralMigrationTests: MW_AGENT_FRESH_PG_DSN names a loopback server on a non-default
port with no agent roles or database, e.g. "host=127.0.0.1 port=15651 user=postgres dbname=postgres".
The class bootstraps, applies V1..V5, seeds synthetic operation trees and proves that
audit.purge_routine_trees() deletes only eligible whole trees, refuses a cutoff younger than 7 days,
keeps every protected tree, is denied to a caller without mw_agent_retention, and that the append-only
triggers still block direct deletes by other roles. The last test runs agent-db-maintenance.py
audit-retention --purge-function end to end as an IAM-shaped login. Everything created is dropped.
"""
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
from psycopg import errors, sql
from psycopg.conninfo import conninfo_to_dict
from mw_integration_agent import state_migration

AGENT = Path(__file__).resolve().parents[1]
MIGRATIONS = AGENT / 'database/migrations'
BOOTSTRAP = AGENT / 'database/setup/bootstrap.sql'
APPROVAL = '-c mw_design.execution_approved=agent-postgresql-20260922-v1'
ROLES = ('mw_agent_owner', 'mw_agent_worker', 'mw_agent_relay', 'mw_agent_auditor', 'mw_business_audit_owner',
         'mw_agent_retention')
LOGIN = 'mw_iam_lab_login'  # NOINHERIT login holding mw_agent_retention WITH INHERIT FALSE, SET TRUE (the IAM user's shape)
TABLES = ('runtime.job_runs', 'runtime.operation_state', 'audit.events', 'audit.operations')
SHA = '0' * 64


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def days_ago(days):
    return datetime.now(UTC) - timedelta(days=days)


def counts(conn):
    return {t: conn.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(*t.split('.')))).fetchone()[0] for t in TABLES}


def triggers_enabled(conn):
    rows = conn.execute("SELECT tgname,tgenabled FROM pg_trigger WHERE tgname IN ('events_append_only','operations_append_only')").fetchall()
    return dict(rows) == {'events_append_only': 'O', 'operations_append_only': 'O'}


@unittest.skipUnless(os.environ.get('MW_AGENT_FRESH_PG_DSN'), 'empty disposable PostgreSQL server required')
class RetentionPurgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server = conninfo_to_dict(os.environ['MW_AGENT_FRESH_PG_DSN'])
        if server.get('host') not in ('127.0.0.1', 'localhost') or int(server.get('port') or 5432) == 5432:
            raise RuntimeError('Refusing a non-disposable target: loopback host and non-default port required')
        cls.server = {**server, 'dbname': 'postgres'}
        with psycopg.connect(**cls.server, autocommit=True) as conn:
            if conn.execute("SELECT 1 FROM pg_database WHERE datname='mw_agent'").fetchone() or \
                    conn.execute('SELECT 1 FROM pg_roles WHERE rolname=ANY(%s)', (list(ROLES) + [LOGIN],)).fetchone():
                raise RuntimeError('Refusing a server that already has the agent database or roles')
        cls.addClassCleanup(cls.drop_created)
        helpers = load('state_migration_postgres_helpers', Path(__file__).with_name('test_state_migration_postgres.py'))
        with psycopg.connect(**cls.server, autocommit=True, options=APPROVAL) as conn:
            for statement in helpers.statements(BOOTSTRAP.read_text(encoding='utf-8')):
                conn.execute(statement)
        cls.admin = {**server, 'dbname': 'mw_agent', 'autocommit': True}
        with psycopg.connect(**cls.admin) as conn:
            assert state_migration.migrate(conn, MIGRATIONS)['applied'][-1] == 'V5__audit_retention_identity.sql'
            conn.execute('ALTER ROLE mw_agent_worker LOGIN')
            conn.execute('ALTER ROLE mw_agent_retention LOGIN')
            conn.execute('CREATE ROLE ' + LOGIN + ' LOGIN NOINHERIT')
            conn.execute('GRANT mw_agent_retention TO ' + LOGIN + ' WITH INHERIT FALSE, SET TRUE')
            conn.execute('GRANT CONNECT ON DATABASE mw_agent TO ' + LOGIN)
            conn.execute('''INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled)
                VALUES ('agent','postgres',%s,true)''', (uuid.uuid4(),))
        cls.retention = {**cls.admin, 'user': 'mw_agent_retention'}
        cls.worker = {**cls.admin, 'user': 'mw_agent_worker'}
        cls.cutoff = days_ago(7)

    @classmethod
    def drop_created(cls):
        with psycopg.connect(**cls.server, autocommit=True) as conn:
            conn.execute('DROP DATABASE IF EXISTS mw_agent WITH (FORCE)')
            for role in ROLES + (LOGIN,):
                conn.execute(sql.SQL('DROP ROLE IF EXISTS {}').format(sql.Identifier(role)))

    # ------------------------------------------------------------------ synthetic trees

    def operation(self, conn, *, action='JOB', service='receipt-cycle', key=None, parent=None, age=10, state='COMPLETED',
                  run=None, extra_event_age=None):
        """One operation with one event and a state row; optional job run (state, finished age) and a later event."""
        op, event = uuid.uuid4(), uuid.uuid4()
        conn.execute('''INSERT INTO audit.operations(operation_id,service_name,idempotency_key,parent_operation_id,environment,action,
            actor_kind,plan_sha256,code_version,policy_version,process_generation,created_at)
            VALUES (%s,%s,%s,%s,'test',%s,'scheduler',%s,'lab','lab',%s,%s)''',
            (op, service, key or str(uuid.uuid4()), parent, action, SHA, uuid.uuid4(), days_ago(age)))
        conn.execute('''INSERT INTO audit.events(event_id,operation_id,operation_seq,event_kind,route,occurred_at,recorded_at,payload_sha256)
            VALUES (%s,%s,1,'done','internal',%s,%s,%s)''', (event, op, days_ago(age), days_ago(age), SHA))
        seq = 2
        if extra_event_age is not None:
            conn.execute('''INSERT INTO audit.events(event_id,operation_id,operation_seq,event_kind,route,occurred_at,recorded_at,payload_sha256)
                VALUES (%s,%s,2,'late','internal',%s,%s,%s)''', (uuid.uuid4(), op, days_ago(extra_event_age), days_ago(extra_event_age), SHA))
            seq = 3
        conn.execute('''INSERT INTO runtime.operation_state(operation_id,state,next_event_seq,last_event_id,updated_at)
            VALUES (%s,%s,%s,%s,%s)''', (op, state, seq, event, days_ago(age)))
        if run:
            run_state, finished = run
            conn.execute('''INSERT INTO runtime.job_runs(run_id,operation_id,service_name,started_at,finished_at,state)
                VALUES (%s,%s,%s,%s,%s,%s)''', (uuid.uuid4(), op, service, days_ago(age), finished and days_ago(finished), run_state))
        return op

    def eligible_trees(self, conn):
        """Two eligible trees: JOB root with a PROCESS child and a finished run; a lone READ. 3 ops, 3 events, 3 states, 1 run."""
        job = self.operation(conn, action='JOB', run=('COMPLETED', 10))
        self.operation(conn, action='PROCESS', service='journal', parent=job, age=10)
        read = self.operation(conn, action='READ', service='business_read', age=9)
        return [job, read]

    def protected_trees(self, conn):
        """Eight protected roots (one rule each) and the id of the young child under 'young_child'."""
        sent = self.operation(conn, action='JOB')
        self.operation(conn, action='SEND', service='partner_notice', parent=sent, age=10)
        young_parent = self.operation(conn, action='JOB')
        child = self.operation(conn, action='JOB', parent=young_parent, age=2)
        return {
            'sent': sent,
            'deterministic_key': self.operation(conn, action='READ', key='sha256:' + uuid.uuid4().hex),
            'replay_guarding_service': self.operation(conn, action='PROCESS', service='ingress'),
            'unfinished': self.operation(conn, action='JOB', state='DISPATCHING'),
            'running_job': self.operation(conn, action='JOB', service='lab-' + uuid.uuid4().hex[:8], run=('RUNNING', None)),
            'young_child': young_parent,
            'young_event': self.operation(conn, action='READ', extra_event_age=3),
            'young_root': self.operation(conn, action='READ', age=2),
        }, child

    def purge(self, conn, roots, cutoff=...):
        cutoff = self.cutoff if cutoff is ... else cutoff
        return tuple(conn.execute('SELECT * FROM audit.purge_routine_trees(%s,%s)', (roots, cutoff)).fetchone())

    # ------------------------------------------------------------------ tests

    def test_function_deletes_only_eligible_whole_trees_and_restores_triggers(self):
        with psycopg.connect(**self.admin) as admin:
            roots = self.eligible_trees(admin)
            protected, _ = self.protected_trees(admin)
            before = counts(admin)
        with psycopg.connect(**self.retention) as conn:
            self.assertEqual(self.purge(conn, roots), (1, 3, 3, 3))
            self.assertEqual(self.purge(conn, []), (0, 0, 0, 0))
        with psycopg.connect(**self.admin) as admin:
            after = counts(admin)
            self.assertEqual(after, {'runtime.job_runs': before['runtime.job_runs'] - 1, 'runtime.operation_state': before['runtime.operation_state'] - 3,
                                     'audit.events': before['audit.events'] - 3, 'audit.operations': before['audit.operations'] - 3})
            self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (roots,)).fetchone()[0], 0)
            self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (list(protected.values()),)).fetchone()[0],
                             len(protected))
            self.assertTrue(triggers_enabled(admin))

    def test_protected_trees_are_refused_whole_and_nothing_is_deleted(self):
        with psycopg.connect(**self.admin) as admin:
            protected, child = self.protected_trees(admin)
            eligible = self.eligible_trees(admin)
            before = counts(admin)
        expectations = {'sent': 'protected', 'deterministic_key': 'protected', 'replay_guarding_service': 'protected',
                        'unfinished': 'protected', 'running_job': 'running or recent job run', 'young_child': 'protected',
                        'young_event': 'event newer than the cutoff', 'young_root': 'protected'}
        with psycopg.connect(**self.retention) as conn:
            for name, root in protected.items():
                with self.subTest(tree=name):
                    with self.assertRaisesRegex(errors.RaiseException, expectations[name]):
                        self.purge(conn, [root])
                    # Mixing one protected root into an eligible batch rejects the whole batch.
                    with self.assertRaises(errors.RaiseException):
                        self.purge(conn, eligible + [root])
            with self.assertRaisesRegex(errors.RaiseException, 'not an existing root operation'):
                self.purge(conn, [child])
            with self.assertRaisesRegex(errors.RaiseException, 'not an existing root operation'):
                self.purge(conn, [uuid.uuid4()])
        with psycopg.connect(**self.admin) as admin:
            self.assertEqual(counts(admin), before)
            self.assertTrue(triggers_enabled(admin))

    def test_cutoff_younger_than_seven_days_is_refused(self):
        with psycopg.connect(**self.admin) as admin:
            roots = self.eligible_trees(admin)
            before = counts(admin)
        with psycopg.connect(**self.retention) as conn:
            for cutoff in (days_ago(6), days_ago(6.99), datetime.now(UTC), None):
                with self.subTest(cutoff=cutoff), self.assertRaisesRegex(errors.RaiseException, 'at least 7 days old'):
                    self.purge(conn, roots, cutoff)
            # A cutoff older than the trees deletes nothing either: every row must be older than the cutoff.
            with self.assertRaisesRegex(errors.RaiseException, 'protected or not eligible'):
                self.purge(conn, roots, days_ago(30))
        with psycopg.connect(**self.admin) as admin:
            self.assertEqual(counts(admin), before)

    def test_only_the_retention_role_executes_and_nobody_deletes_directly(self):
        with psycopg.connect(**self.admin) as admin:
            roots = self.eligible_trees(admin)
            before = counts(admin)
            function = admin.execute("SELECT proowner::regrole::text,prosecdef,proconfig FROM pg_proc WHERE proname='purge_routine_trees'").fetchone()
            self.assertEqual(function, ('mw_agent_owner', True, ['search_path=pg_catalog']))
            privileged = admin.execute('''SELECT grantee FROM information_schema.routine_privileges
                WHERE routine_schema='audit' AND routine_name='purge_routine_trees' ORDER BY grantee''').fetchall()
            self.assertEqual([g for (g,) in privileged], ['mw_agent_owner', 'mw_agent_retention'])
            for index in ('runtime.operation_state_last_event_idx', 'runtime.job_runs_operation_idx'):
                self.assertIsNotNone(admin.execute('SELECT to_regclass(%s)', (index,)).fetchone()[0])
        with psycopg.connect(**self.worker) as worker:
            with self.assertRaises(errors.InsufficientPrivilege):
                self.purge(worker, roots)
            with self.assertRaises(errors.InsufficientPrivilege):
                worker.execute('DELETE FROM audit.events WHERE operation_id=ANY(%s)', (roots,))
        with psycopg.connect(**self.retention) as retention:
            for statement in ('DELETE FROM audit.events WHERE false', 'DELETE FROM audit.operations WHERE false',
                              'UPDATE runtime.operation_state SET attempts=1 WHERE false', 'DELETE FROM runtime.job_runs WHERE false'):
                with self.subTest(statement=statement), self.assertRaises(errors.InsufficientPrivilege):
                    retention.execute(statement)
            with self.assertRaises(errors.InsufficientPrivilege):
                retention.execute('ALTER TABLE audit.events DISABLE TRIGGER events_append_only')
        with psycopg.connect(**self.admin) as admin:
            # The owner has the privilege, and the append-only triggers still refuse every direct rewrite.
            admin.execute('SET ROLE mw_agent_owner')
            for statement in ('DELETE FROM audit.events WHERE false', 'DELETE FROM audit.operations WHERE false',
                              'UPDATE audit.operations SET actor_login=NULL WHERE false',
                              'TRUNCATE audit.operations, audit.events, runtime.operation_state, runtime.job_runs'):
                with self.subTest(statement=statement), self.assertRaisesRegex(errors.RaiseException, 'Append-only audit'):
                    admin.execute(statement)
            admin.execute('RESET ROLE')
            self.assertEqual(counts(admin), before)
            self.assertTrue(triggers_enabled(admin))

    def test_maintenance_script_purges_through_the_function_as_an_iam_shaped_login(self):
        script = load('agent_db_maintenance', AGENT / 'scripts' / 'agent-db-maintenance.py')
        with psycopg.connect(**self.admin) as admin:
            roots = self.eligible_trees(admin)
            protected, _ = self.protected_trees(admin)
            before = counts(admin)
            expected_roots = admin.execute('''SELECT count(*) FROM audit.operations o JOIN runtime.operation_state s USING(operation_id)
                WHERE o.parent_operation_id IS NULL AND o.created_at < %s AND o.action IN ('READ','JOB','PROCESS','HEALTH')''', (self.cutoff,)).fetchone()[0]
        with tempfile.TemporaryDirectory(prefix='mw-retention-lab-') as directory, contextlib.redirect_stdout(io.StringIO()):
            private = Path(directory)
            (private / 'work').mkdir(mode=0o700)  # the unit's /var/lib/mw-integration-agent/audit-retention exists beforehand
            (private / 'connection.json').write_text(json.dumps({**{k: v for k, v in self.admin.items() if k != 'autocommit'}, 'user': LOGIN}))
            base = ['audit-retention', '--purge-function', '--connection-file', str(private / 'connection.json'), '--expect-environment', 'test',
                    '--archive', 'local:' + str(private / 'archive'), '--work-directory', str(private / 'work'), '--actor', 'lab']
            script.main(base + ['--output', str(private / 'plan.json')])
            plan = json.loads((private / 'plan.json').read_text())
            self.assertFalse(plan['applied'])
            self.assertGreaterEqual(plan['eligible_roots'], 2)
            self.assertLessEqual(plan['eligible_roots'], expected_roots)
            with self.assertRaises(SystemExit):
                script.main(base + ['--older-than-days', '6', '--apply'])
            script.main(base + ['--apply', '--batch', '1', '--pause', '0', '--output', str(private / 'apply.json')])
            report = json.loads((private / 'apply.json').read_text())
            self.assertTrue(report['applied'])
            self.assertEqual(report['deleted'], report['rows'])
            self.assertEqual(report['deleted']['audit.operations'], plan['eligible_operations'])
            self.assertNotIn('temporary_indexes', report)
            manifest = json.loads((private / 'archive' / report['manifest_object'][len('local:' + str(private / 'archive')):].lstrip('/')).read_text())
            self.assertEqual({v['table']: v['rows'] for v in manifest['files'].values()}, report['rows'])
            script.main(base + ['--output', str(private / 'again.json')])
            self.assertEqual(json.loads((private / 'again.json').read_text())['eligible_roots'], 0)
        with psycopg.connect(**self.admin) as admin:
            after = counts(admin)
            self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (roots,)).fetchone()[0], 0)
            self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (list(protected.values()),)).fetchone()[0],
                             len(protected))
            # The run's own CONFIG record was written by the retention role and left COMPLETED.
            record = admin.execute('''SELECT o.writer_role::text,s.state,s.next_event_seq,s.last_event_id IS NOT NULL FROM audit.operations o
                JOIN runtime.operation_state s USING(operation_id) WHERE o.operation_id=%s''', (report['record_operation'],)).fetchone()
            self.assertEqual(record, (LOGIN, 'COMPLETED', 2, True))
            self.assertEqual(after['audit.operations'], before['audit.operations'] - report['deleted']['audit.operations'] + 1)
            self.assertTrue(triggers_enabled(admin))

    def test_resume_deletes_only_rows_already_in_a_verified_export(self):
        """--resume-run: replan with the export's cutoff, refuse anything not archived or a tampered archive, never re-export."""
        script = load('agent_db_maintenance_resume', AGENT / 'scripts' / 'agent-db-maintenance.py')
        with psycopg.connect(**self.admin) as admin:
            roots = self.eligible_trees(admin)
        with tempfile.TemporaryDirectory(prefix='mw-retention-resume-') as directory, contextlib.redirect_stdout(io.StringIO()):
            private = Path(directory)
            (private / 'work').mkdir(mode=0o700)
            (private / 'connection.json').write_text(json.dumps({k: v for k, v in self.admin.items() if k != 'autocommit'}))
            base = ['audit-retention', '--connection-file', str(private / 'connection.json'), '--expect-environment', 'test',
                    '--archive', 'local:' + str(private / 'archive'), '--work-directory', str(private / 'work'), '--actor', 'lab']
            script.main(base + ['--export', '--output', str(private / 'export.json')])
            exported = json.loads((private / 'export.json').read_text())
            run_dir = Path(exported['local_directory'])
            with self.assertRaises(SystemExit):  # resume never runs without --apply
                script.main(base + ['--resume-run', str(run_dir)])
            events = run_dir / 'audit.events.jsonl.gz'
            original = events.read_bytes()
            events.write_bytes(original + b'\x00')
            with self.assertRaises(SystemExit):  # archive no longer matches its verified manifest
                script.main(base + ['--apply', '--resume-run', str(run_dir)])
            events.write_bytes(original)
            with psycopg.connect(**self.admin) as admin:
                before = counts(admin)
            script.main(base + ['--apply', '--batch', '1', '--pause', '0', '--resume-run', str(run_dir), '--output', str(private / 'resume.json')])
            report = json.loads((private / 'resume.json').read_text())
            self.assertTrue(report['applied'])
            self.assertEqual(report['resumed_run'], exported['run_id'])
            self.assertEqual(report['deleted'], exported['rows'])
            self.assertNotIn('export_seconds', report)
            self.assertEqual(len(list((private / 'work').iterdir())), 1)  # no second export directory
            with psycopg.connect(**self.admin) as admin:
                self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (roots,)).fetchone()[0], 0)
                self.assertEqual(counts(admin)['audit.operations'], before['audit.operations'] - exported['rows']['audit.operations'] + 1)
                self.assertTrue(triggers_enabled(admin))
                later = self.eligible_trees(admin)  # eligible under the old cutoff but never exported
            with self.assertRaises(SystemExit):
                script.main(base + ['--apply', '--resume-run', str(run_dir)])
            with psycopg.connect(**self.admin) as admin:
                self.assertEqual(admin.execute('SELECT count(*) FROM audit.operations WHERE operation_id=ANY(%s)', (later,)).fetchone()[0], 2)
                self.assertTrue(triggers_enabled(admin))


if __name__ == '__main__':
    unittest.main()
