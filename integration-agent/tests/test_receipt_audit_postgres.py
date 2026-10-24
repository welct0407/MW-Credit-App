"""Real PostgreSQL roles, receipt relay, missing-intent recovery and retry."""
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch
import psycopg
from mw_integration_agent import audit, state, outbox, receipt_audit as ra
from mw_integration_agent.config import ConfigurationError


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated lab required')
class ReceiptRelayPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        assert lab['host'] == '127.0.0.1' and lab['port'] != 5432 and 'agent-state-lab-' in lab['root']
        cls.base = dict(host=lab['host'], port=lab['port'], user='postgres')
        with psycopg.connect(**cls.base, dbname='mw_agent') as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == (Path(lab['root'])/'data').resolve()
            cls.generation = str(c.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()[0])

    def setUp(self):
        self.config = dict(state_backend='postgres', state_generation=self.generation, audit_environment='test',
            code_version='synthetic-audit-repair', database_name='loan_manager_prod', receipt_environment='prod',
            instagram_account_id='synthetic')
        job = uuid.uuid4().hex
        receipt = audit.digest(['receipt-v1', 'prod', 'synthetic', job])
        self.link = dict(link_id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'mw-receipt:'+receipt+':synthetic-payment')),
            receipt_id=receipt, payment_id='synthetic-payment', business_environment='prod', verification='{}',
            verification_digest=audit.digest({}))
        self.asset = dict(receipt_id=receipt, job_id=job, archive_state='ARCHIVED', generation='1',
            object_key='receipts/prod/synthetic.png', source=json.dumps(dict(environment='prod',
                instagram_account_id='synthetic', captured_at=1790481600)))
        self.value = ra.plan(self.config, self.link, self.asset)
        self.op = uuid.UUID(self.link['link_id'])
        @contextmanager
        def business(config):
            with psycopg.connect(**dict(self.base,user='mw_agent_relay'),dbname='loan_manager_prod',autocommit=True) as c:
                yield c
        self.business = business
        self.patches = [patch.object(state,'parameters',side_effect=lambda config,role='worker':
            dict(self.base,user='mw_agent_'+role,dbname='mw_agent',autocommit=True)), patch.object(outbox,'business',business)]
        for p in self.patches: p.start(); self.addCleanup(p.stop)

    def marker(self):
        with psycopg.connect(**self.base,dbname='loan_manager_prod') as c:
            c.execute('''INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,
                request_reason,direct_targets,code_version) VALUES (%s,%s,%s,%s,'atomic: synthetic receipt',%s::jsonb,'test')''',
                (self.op,ra.ACTOR['id'],ra.ACTOR['login'],self.asset['receipt_id'],json.dumps([{'table':'Payments','key':'synthetic-payment'}])))
            c.execute('''INSERT INTO agent_audit.row_changes(operation_id,schema_name,table_name,action,row_key,before_row,after_row)
                VALUES (%s,'public','Payments','UPDATE',%s::jsonb,%s::jsonb,%s::jsonb)''',
                (self.op,'{"Row ID":"synthetic-payment"}',json.dumps(dict.fromkeys(ra.FIELDS)),json.dumps(self.value['after'])))

    def test_review_settlement_update_with_and_without_a_note_prepares_and_runs(self):
        # R095 root cause (Cloud SQL log, both receipt-cycle failures): "could not determine data type of parameter $2"
        # on the review settlement UPDATE when the note is None. The adapter's exact statement, as the worker, with no
        # note keeps the detail and with a note replaces it, prepared by the server and sent unprepared.
        from mw_integration_agent import review_cycle
        sql = state.dialect(review_cycle.SETTLE_REVIEW_SQL, state.TABLES['receipt-processing.db'])
        self.assertIn('runtime.partner_reviews', sql)
        with psycopg.connect(**dict(self.base, user='mw_agent_worker'), dbname='mw_agent') as c:
            for prepare in (True, False):
                for note, detail in ((None, 'kept detail'), ('policy: synthetic note', 'policy: synthetic note')):
                    with self.subTest(prepare=prepare, note=note), c.transaction(force_rollback=True):
                        review = audit.digest(str(uuid.uuid4()))
                        c.execute("""INSERT INTO runtime.partner_reviews(id,job_id,proposal,state,created_at,expires_at,payment_id,detail)
                            VALUES (%s,%s,'{}','POSTING',1,2,'synthetic-payment','kept detail')""", (review, audit.digest(str(uuid.uuid4()))))
                        try:
                            done = c.execute(sql, ('UNKNOWN', note, note, review), prepare=prepare).rowcount
                        except psycopg.errors.IndeterminateDatatype as exc:
                            self.fail('parameter type not determined: ' + str(exc))
                        self.assertEqual(done, 1)
                        self.assertEqual(c.execute('SELECT state,detail FROM runtime.partner_reviews WHERE id=%s', (review,)).fetchone(), ('UNKNOWN', detail))

    def test_attachment_call_with_no_object_key_and_empty_verification_prepares_and_runs(self):
        # R095 hardening (the 42P18 failures were the review settlement UPDATE, tested above): the projector's exact,
        # fully cast statement, with the values a receipt can carry (no object key, verification {}), is prepared by
        # the server (and sent unprepared) and runs as the dedicated projector into the function's own checks: no key is
        # "Invalid receipt object key", a well-formed key of an unknown payment "Receipt payment missing" (both P0001),
        # never a parameter type error. The projector login is operator-provisioned, so the test creates it in a
        # transaction that is rolled back.
        from psycopg.types.json import Jsonb
        from mw_integration_agent import receipt_projection
        receipt, at = self.asset['receipt_id'], receipt_projection.datetime.fromtimestamp(1790481600, receipt_projection.UTC)
        key = 'receipts/prod/2026/09/27/' + receipt + '/' + 'a' * 64 + '.png'
        with psycopg.connect(**self.base, dbname='loan_manager_prod') as c:
            for object_key, message in ((None, 'Invalid receipt object key'), (key, 'Receipt payment missing')):
                for prepare in (True, False):
                    with self.subTest(object_key=object_key, prepare=prepare), c.transaction(force_rollback=True):
                        c.execute("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mw_receipt_projector') THEN "
                                  "CREATE ROLE mw_receipt_projector LOGIN; END IF; END $$")
                        c.execute('GRANT USAGE ON SCHEMA public TO mw_receipt_projector')
                        c.execute('GRANT EXECUTE ON FUNCTION public.attach_payment_receipt_evidence(text,text,text,timestamptz,jsonb,uuid,text) TO mw_receipt_projector')
                        c.execute('SET LOCAL SESSION AUTHORIZATION mw_receipt_projector')
                        c.execute('SET LOCAL ROLE mw_receipt_projector')
                        values = ('synthetic-payment', receipt, object_key, at, Jsonb({}), uuid.UUID(self.link['link_id']), 'synthetic-r095')
                        with self.assertRaises(psycopg.errors.RaiseException) as raised:
                            c.execute(receipt_projection.ATTACH_SQL, values, prepare=prepare)
                        self.assertEqual(raised.exception.diag.message_primary, message)

    def test_receipt_intent_export_retry_and_missing_intent_denial(self):
        self.marker()
        with self.assertRaisesRegex(ConfigurationError,'OUTBOX_INTENT_MISMATCH'):
            outbox.relay(self.config)
        with psycopg.connect(**self.base,dbname='mw_agent') as c:
            c.execute("INSERT INTO runtime.receipt_jobs(id,message_id,sender_id,url,created_at) VALUES (%s,'synthetic','synthetic','https://example.invalid',1)",(self.asset['job_id'],))
            c.execute('''INSERT INTO runtime.receipt_assets(receipt_id,job_id,source,archive_state,generation,object_key,raw_sha256)
                VALUES (%s,%s,%s,'ARCHIVED','1',%s,%s)''',
                (self.asset['receipt_id'],self.asset['job_id'],self.asset['source'],self.asset['object_key'],'0'*64))
            c.execute('''INSERT INTO runtime.receipt_payment_links(link_id,receipt_id,business_environment,payment_id,
                verification,verification_digest,verified_at) VALUES (%s,%s,'prod','synthetic-payment','{}',%s,1)''',
                (self.link['link_id'],self.asset['receipt_id'],audit.digest({})))
        spec=importlib.util.spec_from_file_location('receipt_recovery',Path(__file__).parents[1]/'scripts/reconcile-receipt-audit.py')
        recovery=importlib.util.module_from_spec(spec);spec.loader.exec_module(recovery)
        with patch.object(recovery,'business',self.business):
            self.assertEqual(recovery.reconcile(self.config)['missing_validated'],1)
            with self.assertRaisesRegex(RuntimeError,'count changed'):
                recovery.reconcile(self.config,True,2,'synthetic-restored-backup')
            self.assertEqual(recovery.reconcile(self.config,True,1,'synthetic-restored-backup')['missing_validated'],1)
            self.assertEqual(recovery.reconcile(self.config,True,0,'synthetic-restored-backup')['missing_validated'],0)
        outbox.relay(self.config)
        outbox.relay(self.config)
        with state.transaction(self.config) as c:
            self.assertEqual(c.execute("SELECT count(*) FROM audit.events WHERE operation_id=%s AND event_kind='row_changed'",(self.op,)).fetchone()[0],1)
            self.assertEqual(c.execute("SELECT count(*) FROM audit.events WHERE operation_id=%s AND event_kind='business_committed'",(self.op,)).fetchone()[0],1)
        with self.business(self.config) as c:
            self.assertEqual(c.execute('SELECT count(*) FROM agent_audit.exports WHERE operation_id=%s',(self.op,)).fetchone()[0],1)


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated lab required')
class DispatchingClosurePostgres(unittest.TestCase):
    """receipt_payment operations left DISPATCHING by a rejected route are closed only when verified."""
    @classmethod
    def setUpClass(cls):
        lab = json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        assert lab['host'] == '127.0.0.1' and lab['port'] != 5432 and 'agent-state-lab-' in lab['root']
        cls.base = dict(host=lab['host'], port=lab['port'], user='postgres', dbname='mw_agent')
        with psycopg.connect(**cls.base) as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve() == (Path(lab['root'])/'data').resolve()
            cls.generation = str(c.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()[0])
        spec = importlib.util.spec_from_file_location('receipt_recovery', Path(__file__).parents[1]/'scripts/reconcile-receipt-audit.py')
        cls.recovery = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.recovery)

    def setUp(self):
        self.config = dict(state_backend='postgres', state_generation=self.generation, audit_environment='test',
            code_version='synthetic-dispatch-closure', database_name='loan_manager_prod', receipt_environment='prod')
        p = patch.object(state, 'parameters', side_effect=lambda config, role='worker': dict(self.base, user='mw_agent_'+role, autocommit=True))
        p.start()
        self.addCleanup(p.stop)
        with psycopg.connect(**self.base) as c:
            # Earlier cases leave verified closures behind; this case owns only its own fixture.
            c.execute('''UPDATE runtime.operation_state s SET state='FAILED' FROM audit.operations o WHERE o.operation_id=s.operation_id
                AND o.service_name='receipt_payment' AND s.state='DISPATCHING' ''')

    def dispatch(self, review_state='POSTED'):
        review, key = uuid.uuid4().hex, 'pwa:'+str(uuid.uuid4())
        with psycopg.connect(**self.base) as c:
            c.execute('''INSERT INTO runtime.partner_reviews(id,job_id,proposal,state,created_at,expires_at,payment_id)
                VALUES (%s,%s,'{"receipt":{}}',%s,1,2,%s)''', (review, review, review_state, key))
        with state.transaction(self.config) as conn:
            job = audit.begin(conn, self.config, 'synthetic_review_cycle', str(uuid.uuid4()), 'JOB')
            token = audit.PARENT.set(job)
            try:
                audit.state_change(conn, self.config, 'partner-review.db', self.recovery.CLAIM, (key, review), 1)
                op = audit.begin(conn, self.config, 'receipt_payment', str(uuid.uuid4()), 'INSERT')
                audit.event(conn, op, 'dispatch_started', state='DISPATCHING')
            finally:
                audit.PARENT.reset(token)
        return op, review, key

    def status(self, posted=True):
        def read(config, key, review):
            return {'kind': 'recorded', 'reviewId': review, 'financialMatch': posted,
                    'originalOutcome': {'status': 'posted', 'paymentId': key, 'recordedAt': '2026-10-18T00:00:00.000Z'}}
        return read

    def close(self, *args, posted=True, verified=True):
        return self.recovery.close_dispatching(self.config, *args, status=self.status(posted), verify=lambda *_: verified)

    def state_of(self, op):
        with psycopg.connect(**self.base) as c:
            return c.execute('SELECT state FROM runtime.operation_state WHERE operation_id=%s', (op,)).fetchone()[0]

    def test_plan_is_read_only_and_apply_needs_count_and_backup(self):
        op, _, _ = self.dispatch()
        self.assertEqual(self.close()['dispatching_verified'], 1)
        self.assertEqual(self.state_of(op), 'DISPATCHING')
        for args in ((True, None, 'backup'), (True, 1, None)):
            with self.assertRaisesRegex(RuntimeError, 'expected count'):
                self.close(*args)
        with self.assertRaisesRegex(RuntimeError, 'count changed'):
            self.close(True, 2, 'synthetic-restored-backup')
        self.assertEqual(self.state_of(op), 'DISPATCHING')

    def test_apply_closes_verified_dispatch_once(self):
        op, review, key = self.dispatch()
        result = self.close(True, 1, 'synthetic-restored-backup')
        self.assertEqual((result['operations'], result['payment_submissions']), ([str(op)], 0))
        self.assertEqual(self.state_of(op), 'COMMITTED')
        with psycopg.connect(**self.base) as c:
            kind, route, payload = c.execute('''SELECT event_kind,route,payload FROM audit.events WHERE operation_id=%s
                ORDER BY operation_seq DESC LIMIT 1''', (op,)).fetchone()
        self.assertEqual((kind, route, payload['review_id'], payload['payment_id']), ('dispatch_reconciled', 'migration', review, key))
        self.assertEqual(self.close(True, 0, 'synthetic-restored-backup')['dispatching_verified'], 0)

    def test_unverified_or_unmatched_dispatch_closes_nothing(self):
        op, _, _ = self.dispatch()
        for kwargs in ({'posted': False}, {'verified': False}):
            with self.subTest(**kwargs), self.assertRaisesRegex(RuntimeError, 'not verified'):
                self.close(True, 1, 'synthetic-restored-backup', **kwargs)
        other, _, _ = self.dispatch(review_state='UNKNOWN')
        with self.assertRaisesRegex(RuntimeError, 'exactly one POSTED review'):
            self.close(True, 2, 'synthetic-restored-backup')
        self.assertEqual((self.state_of(op), self.state_of(other)), ('DISPATCHING', 'DISPATCHING'))
