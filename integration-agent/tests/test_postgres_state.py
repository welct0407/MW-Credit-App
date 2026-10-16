"""Integration tests require an explicitly named private disposable lab manifest."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import uuid
from unittest.mock import patch

import psycopg
from mw_integration_agent import audit, state
from mw_integration_agent.config import ConfigurationError
from mw_integration_agent.journal import IngressJournal
from mw_integration_agent.receipt_journal import ReceiptJournal
from mw_integration_agent.conversation_store import ConversationStore
from mw_integration_agent.partner_notice import NoticeJournal
from mw_integration_agent.partner_review import ReviewStore
from mw_integration_agent.statement_delivery import DeliveryJournal


class DialectTests(unittest.TestCase):
    def test_notice_stream_and_percent_literal(self):
        sql=state.dialect("SELECT * FROM partner_notices WHERE message_id=? AND event_key LIKE 'review:%'",
                          state.TABLES['partner-notices.db'],'receipt')
        self.assertIn("WHERE stream='receipt' AND",sql)
        self.assertIn("'review:%%'",sql)
        self.assertEqual(sql.count('%s'),1)

    def test_no_model_or_ddl_sql(self):
        for query in ('DELETE FROM receipt_jobs','CREATE TABLE x(y int)','SELECT * FROM audit.events','SELECT * FROM secret'):
            with self.subTest(query=query),self.assertRaises(ConfigurationError):
                state.dialect(query,state.TABLES['receipt-processing.db'])

    def test_literals_not_rewritten(self):
        sql=state.dialect("UPDATE receipt_jobs SET detail='messages ?' WHERE id=?",state.TABLES['receipt-processing.db'])
        self.assertIn("'messages ?'",sql)
        self.assertIn('runtime.receipt_jobs',sql)


class FakeCursor:
    def __init__(self, rowcount):
        self.rowcount, self.description = rowcount, None

    def fetchall(self):
        return []


class AdapterUnitTests(unittest.TestCase):
    """No server: audit skipping, read-only journals, session limits and IAM parameters (AGT-STATE-01/02/04, ALL-ARCH-03)."""
    CONFIG = {'state_backend': 'postgres', 'agent_database_host': '127.0.0.1', 'agent_database_port': 5432,
              'agent_database_name': 'mw_agent', 'state_generation': '11111111-1111-4111-8111-111111111111'}

    def fake_transaction(self, rowcount, executed):
        from contextlib import contextmanager
        @contextmanager
        def transaction(config, role='worker', readonly=False):
            class Conn:
                def execute(self, sql, params=()):
                    executed.append((sql, params, readonly)); return FakeCursor(rowcount)
            yield Conn()
        return transaction

    def test_noop_statement_writes_no_audit_rows(self):
        journal = state.PostgresJournal(self.CONFIG, 'receipt-processing.db')
        for rowcount, calls in ((0, 0), (1, 1)):
            executed = []
            with self.subTest(rowcount=rowcount), patch.object(state, 'transaction', self.fake_transaction(rowcount, executed)), \
                 patch('mw_integration_agent.audit.state_change') as state_change:
                journal.execute("UPDATE receipt_jobs SET status='EXPIRED' WHERE id=?", ('absent',))
                self.assertEqual(state_change.call_count, calls)
                journal.execute('SELECT * FROM receipt_jobs WHERE id=?', ('absent',))
                self.assertEqual(state_change.call_count, calls)
            self.assertEqual(len(executed), 2)

    def test_readonly_journal_refuses_writes_before_any_connection(self):
        journal = state.connect('/var/lib/agent/instagram-ingress.db', self.CONFIG, readonly=True)
        self.assertTrue(journal.readonly)
        with patch.object(state, 'transaction', side_effect=AssertionError('connected for a refused write')):
            with self.assertRaisesRegex(ConfigurationError, 'STATE_READONLY_JOURNAL'):
                journal.execute("UPDATE messages SET text='' WHERE message_id=?", ('m',))
        executed = []
        with patch.object(state, 'transaction', self.fake_transaction(0, executed)):
            journal.execute('SELECT * FROM messages WHERE message_id=?', ('m',))
        self.assertEqual(executed[0][2], True)  # the SELECT ran inside a read-only transaction
        self.assertFalse(state.connect('/var/lib/agent/instagram-ingress.db', self.CONFIG).readonly)

    def test_connection_timeouts_match_documented_values(self):
        with patch.object(state, 'load_secret', return_value='synthetic'):
            options = state.parameters(self.CONFIG)['options']
        self.assertEqual(options, '-c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=30000')
        self.assertEqual((state.STATEMENT_TIMEOUT_MS, state.LOCK_TIMEOUT_MS, state.IDLE_IN_TRANSACTION_TIMEOUT_MS), (15000, 3000, 30000))

    def test_iam_parameters_have_no_password_and_set_role(self):
        config = dict(self.CONFIG, agent_database_auth='iam', database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam')
        with patch.object(state, 'load_secret', side_effect=AssertionError('no password file in IAM mode')):
            value = state.parameters(config, 'relay')
        self.assertEqual((value['user'], value['port'], value['dbname'], 'password' in value),
                         ('mw-integration-agent@clever-oasis-508610-n7.iam', 5433, 'mw_agent', False))
        self.assertEqual(state.session_role(config, 'relay'), 'mw_agent_relay')
        self.assertIsNone(state.session_role(self.CONFIG, 'relay'))
        with patch.object(state, 'load_secret', return_value='synthetic'):
            self.assertEqual((state.parameters(self.CONFIG)['user'], state.parameters(self.CONFIG)['port']), ('mw_agent_worker', 5432))
        class Conn:
            closed = broken = False
            statements = []
            def execute(self, sql): self.statements.append(sql)
        pool = state.Pool(config, 'worker')
        with patch('psycopg.connect', return_value=Conn()) as connect:
            with pool.connection() as conn:
                self.assertEqual(conn.statements, ['SET ROLE mw_agent_worker'])
            self.assertEqual(connect.call_args.kwargs['user'], 'mw-integration-agent@clever-oasis-508610-n7.iam')
            with pool.connection() as conn:
                pass
            self.assertEqual((len(conn.statements), connect.call_count), (1, 1))  # the pooled connection keeps its role
        with self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_AGENT_DATABASE'):
            state.parameters(dict(config, agent_database_port=5433))

    def test_assume_role_accepts_only_agent_roles_and_failed_set_role_closes(self):
        class Conn:
            closed = False
            def __init__(self): self.statements = []
            def execute(self, sql): self.statements.append(sql)
            def close(self): self.closed = True
        conn = Conn()
        self.assertIs(state.assume_role(conn, None), conn)
        state.assume_role(conn, 'mw_integration_agent')
        self.assertEqual(conn.statements, ['SET ROLE mw_integration_agent'])
        for role in ('postgres', 'mw_agent_owner', 'mw_agent_worker; RESET ROLE'):
            with self.subTest(role=role), self.assertRaisesRegex(ConfigurationError, 'UNAPPROVED_SESSION_ROLE'):
                state.assume_role(conn, role)
        refused = Conn()
        refused.execute = lambda sql: (_ for _ in ()).throw(psycopg.errors.InsufficientPrivilege('no membership'))
        config = dict(self.CONFIG, agent_database_auth='iam', database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam')
        with patch('psycopg.connect', return_value=refused), self.assertRaises(psycopg.errors.InsufficientPrivilege):
            state.open_connection(config, 'relay', options='-c statement_timeout=5000')
        self.assertTrue(refused.closed)


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'),'isolated PostgreSQL 18 lab required')
class PostgreSQLStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lab=json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if cls.lab['host']!='127.0.0.1' or cls.lab['port']==5432 or 'agent-state-lab-' not in cls.lab['root']:
            raise RuntimeError('Refusing a non-laboratory target')
        cls.admin=dict(host=cls.lab['host'],port=cls.lab['port'],dbname='mw_agent',user='postgres')
        cls.generation=str(uuid.uuid4())
        cls.config={'state_backend':'postgres','state_generation':cls.generation,'state_cutover_at':'2026-01-01T00:00:00+00:00',
                    'agent_database_host':'127.0.0.1','agent_database_port':cls.lab['port'],'agent_database_name':'mw_agent',
                    'audit_environment':'test','code_version':'synthetic-tests'}
        with psycopg.connect(**cls.admin) as c:
            c.execute('''INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled)
                VALUES ('agent','postgres',%s,true) ON CONFLICT(service_name) DO UPDATE SET active_generation=EXCLUDED.active_generation,processing_enabled=true''',(cls.generation,))
        cls.patch=patch.object(state,'parameters',side_effect=lambda config,role='worker':
            dict(cls.admin,user='mw_agent_'+role,autocommit=True))
        cls.patch.start()

    @classmethod
    def tearDownClass(cls):
        cls.patch.stop()

    def setUp(self):
        self.key='test-'+uuid.uuid4().hex

    def test_atomic_ingress_duplicate_and_changed_message(self):
        ingress=IngressJournal('instagram-ingress.db',self.config)
        event={'message_id':self.key,'sender_id':'synthetic','timestamp':time.time(),'text':'ทดสอบ','attachments':[]}
        self.assertEqual(ingress.capture(self.key,[event]),(True,1))
        self.assertEqual(ingress.capture(self.key,[event]),(False,0))
        # A changed retry no longer fails the delivery: the pending work is quarantined,
        # the other message in the same POST commits, and the mismatch is counted.
        other=dict(event,message_id=self.key+'-other')
        self.assertEqual(ingress.capture(self.key+'-changed',[dict(event,text='different'),other]),(True,1))
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT state FROM runtime.ingress_work WHERE message_id=%s',(self.key,)).fetchone()[0],'REVIEW')
            self.assertEqual(c.execute('SELECT text FROM runtime.ingress_messages WHERE message_id=%s',(self.key,)).fetchone()[0],'ทดสอบ')
            self.assertEqual(c.execute('SELECT state FROM runtime.ingress_work WHERE message_id=%s',(other['message_id'],)).fetchone()[0],'PENDING')
            self.assertIsNotNone(c.execute('SELECT 1 FROM runtime.ingress_receipts WHERE payload_sha256=%s',(self.key+'-changed',)).fetchone())
            payload=c.execute("SELECT e.payload FROM audit.events e JOIN audit.operations o ON o.operation_id=e.operation_id WHERE o.idempotency_key=%s AND e.event_kind='ingress_accepted'",(self.key+'-changed',)).fetchone()[0]
            self.assertEqual((payload['inserted'],payload['content_mismatch']),(1,1))
        # A mismatch against already-consumed work leaves that state alone.
        with psycopg.connect(**self.admin) as c:
            c.execute("UPDATE runtime.ingress_work SET state='DONE' WHERE message_id=%s",(self.key,))
        ingress.capture(self.key+'-changed-again',[dict(event,text='different again')])
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT state FROM runtime.ingress_work WHERE message_id=%s',(self.key,)).fetchone()[0],'DONE')

    def test_late_and_future_messages_are_quarantined_with_counts(self):
        ingress=IngressJournal('instagram-ingress.db',self.config)
        now=time.time()
        messages=[{'message_id':self.key,'sender_id':'synthetic','timestamp':now,'text':'','attachments':[],'quarantine':''},
                  {'message_id':self.key+'-late','sender_id':'synthetic','timestamp':now-90000,'text':'late','attachments':[],'quarantine':'LATE'},
                  {'message_id':self.key+'-future','sender_id':'synthetic','timestamp':now+60,'text':'future','attachments':[],'quarantine':'FUTURE'}]
        self.assertEqual(ingress.capture(self.key,messages,stats={'deleted':1,'late':1,'future':1}),(True,3))
        with psycopg.connect(**self.admin) as c:
            states=dict(c.execute('SELECT message_id,state FROM runtime.ingress_work WHERE message_id=ANY(%s)',([m['message_id'] for m in messages],)).fetchall())
            self.assertEqual(states,{self.key:'PENDING',self.key+'-late':'REVIEW',self.key+'-future':'REVIEW'})
            payload=c.execute("SELECT e.payload FROM audit.events e JOIN audit.operations o ON o.operation_id=e.operation_id WHERE o.idempotency_key=%s AND e.event_kind='ingress_accepted'",(self.key,)).fetchone()[0]
            self.assertEqual({k:payload[k] for k in ('inserted','quarantined','content_mismatch','deleted','late','future')},
                             {'inserted':3,'quarantined':2,'content_mismatch':0,'deleted':1,'late':1,'future':1})

    def test_health_counts_open_review_ingress_rows_since_cutover(self):
        from mw_integration_agent.receipt_health import inspect
        config=dict(self.config,state_directory='/nonexistent/state',receipt_summary_enabled=True)
        before=inspect(config)['ingress_review_open']
        ingress=IngressJournal('instagram-ingress.db',self.config)
        now=time.time()
        ingress.capture(self.key,[{'message_id':self.key,'sender_id':'synthetic','timestamp':now,'text':'','attachments':[]},
                                  {'message_id':self.key+'-late','sender_id':'synthetic','timestamp':now-90000,'text':'','attachments':[],'quarantine':'LATE'},
                                  {'message_id':self.key+'-pre','sender_id':'synthetic','timestamp':1,'text':'','attachments':[]}])
        health=inspect(config)
        # The late message counts; the pre-cutover quarantine and the pending message do not.
        self.assertEqual(health['ingress_review_open'],before+1)
        self.assertIn(health['status'],(1,2))

    def test_pending_queue_and_delayed_quarantine(self):
        ingress=IngressJournal('instagram-ingress.db',self.config)
        ingress.capture(self.key,[{'message_id':self.key,'sender_id':'synthetic','timestamp':time.time(),'text':'','attachments':[{'url':'https://example.invalid/synthetic'}]}])
        ingress.capture(self.key+'-old',[{'message_id':self.key+'-old','sender_id':'synthetic','timestamp':1,'text':'old'}])
        receipt=ReceiptJournal('receipt-processing.db',self.config)
        receipt.ingest(ingress.db,1)
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT count(*) FROM runtime.receipt_jobs WHERE message_id=%s',(self.key,)).fetchone()[0],1)
            self.assertEqual(c.execute('SELECT state FROM runtime.ingress_work WHERE message_id=%s',(self.key+'-old',)).fetchone()[0],'REVIEW')

    def test_notice_streams_are_isolated(self):
        first=NoticeJournal('partner-notices.db',self.config)
        second=NoticeJournal('conversation-notices.db',self.config)
        partner={'id':self.key}
        key=first.reserve(self.key,partner,'receipt','receipt body')
        self.assertEqual(second.reserve(self.key,partner,'conversation','conversation body'),key)
        with first.db:
            first.db.execute("UPDATE partner_notices SET ig_status='ACCEPTED' WHERE id=?",(key,))
        self.assertEqual(first.db.execute('SELECT subject FROM partner_notices WHERE id=?',(key,)).fetchone()[0],'receipt')
        self.assertEqual(second.db.execute('SELECT ig_status FROM partner_notices WHERE id=?',(key,)).fetchone()[0],'PENDING')

    def test_notice_deferral_preserves_payload_outcome_and_other_stream(self):
        first=NoticeJournal('partner-notices.db',self.config)
        second=NoticeJournal('conversation-notices.db',self.config)
        self.addCleanup(first.close);self.addCleanup(second.close)
        partner={'id':self.key}
        key=first.reserve(self.key,partner,'synthetic','immutable body')
        second.reserve(self.key,partner,'synthetic conversation','other stream')
        with first.db:
            # R058: only PENDING/WINDOW_EXPIRED Instagram outcomes stay in the email retry queue.
            first.db.execute("UPDATE partner_notices SET ig_status='WINDOW_EXPIRED',email_status='REJECTED',attempts=1,detail='synthetic failure' WHERE id=?",(key,))
        before=dict(first.db.execute('SELECT * FROM partner_notices WHERE id=?',(key,)).fetchone())
        first.defer(key)
        after=dict(first.db.execute('SELECT * FROM partner_notices WHERE id=?',(key,)).fetchone())
        self.assertGreater(after.pop('retry_after'),time.time())
        before.pop('retry_after');self.assertEqual(after,before)
        self.assertNotIn(key,{r['id'] for r in first.due()})
        self.assertIn(key,{r['id'] for r in second.due()})

    def test_memory_reviews_delivery_and_lazy_tables(self):
        store=ConversationStore('partner-conversations.db',self.config)
        store.bind(self.key,'thread-'+self.key)
        self.assertEqual(store.thread(self.key),'thread-'+self.key)
        with self.assertRaises(ConfigurationError): store.bind(self.key,'other')
        receipt=ReceiptJournal('receipt-processing.db',self.config)
        reviews=ReviewStore(receipt.db)
        reviews.reserve(self.key,{'synthetic':True})
        delivery=DeliveryJournal('cash-statement-delivery.db',self.config)
        self.assertEqual(delivery.reserve_email(self.key,'synthetic',{'text':'ไทย'}),(True,'EMAIL_UNKNOWN'))
        self.assertEqual(delivery.reserve_email(self.key,'synthetic',{'text':'ไทย'}),(False,'EMAIL_UNKNOWN'))
        with receipt.db:
            receipt.db.execute('INSERT OR REPLACE INTO conversation_poll_state VALUES (?,?)',(self.key,1.0))
            receipt.db.execute('INSERT OR REPLACE INTO conversation_poll_state VALUES (?,?)',(self.key,2.0))
        self.assertEqual(receipt.db.execute('SELECT checked_through FROM conversation_poll_state WHERE conversation_id=?',(self.key,)).fetchone()[0],2.0)

    def test_rollback_includes_audit(self):
        store=ConversationStore('partner-conversations.db',self.config)
        with self.assertRaises(RuntimeError):
            with store.db:
                store.db.execute('INSERT INTO conversations VALUES (?,?)',(self.key,self.key))
                raise RuntimeError('simulated crash before commit')
        self.assertIsNone(store.thread(self.key))

    def test_forwarded_provenance_and_automatic_decision_are_durable(self):
        receipt=ReceiptJournal('receipt-processing.db',self.config)
        review=ReviewStore(receipt.db)
        key=review.reserve(self.key,{'action':'Lump Sum','synthetic':True})
        with receipt.db:
            receipt.db.execute('INSERT OR IGNORE INTO conversation_poll_messages VALUES (?,?,?,?,?)',
                               (self.key,'synthetic-group',time.time(),time.time(),'FORWARDED'))
            receipt.db.execute("UPDATE partner_reviews SET state='APPROVED',deciding_partner=?,detail=? WHERE id=? AND state='PENDING'",
                               ('synthetic-actor','OWNER_AUTHORIZED_AUTO_PAYMENT',key))
        receipt.close()
        reopened=ReceiptJournal('receipt-processing.db',self.config)
        row=reopened.db.execute('SELECT conversation_id,outcome FROM conversation_poll_messages WHERE message_id=?',(self.key,)).fetchone()
        self.assertEqual((row['conversation_id'],row['outcome']),('synthetic-group','FORWARDED'))
        row=reopened.db.execute('SELECT state,detail,decision_message FROM partner_reviews WHERE id=?',(key,)).fetchone()
        self.assertEqual((row['state'],row['detail'],row['decision_message']),('APPROVED','OWNER_AUTHORIZED_AUTO_PAYMENT',None))
        with reopened.db:
            self.assertEqual(reopened.db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",('synthetic-payment',key)).rowcount,1)
            self.assertEqual(reopened.db.execute("UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'",('synthetic-payment',key)).rowcount,0)
        reopened.close()

    def test_audit_immutability_and_duplicate_hash(self):
        with state.transaction(self.config) as c:
            op=audit.begin(c,self.config,'test',self.key,plan={'value':1})
            audit.event(c,op,'requested',{'value':1},key='same')
            audit.event(c,op,'requested',{'value':1},key='same')
        with self.assertRaisesRegex(ConfigurationError,'MISMATCH'):
            with state.transaction(self.config) as c: audit.begin(c,self.config,'test',self.key,plan={'value':2})
        for sql in ('UPDATE audit.events SET event_kind=\'changed\'','DELETE FROM audit.events','TRUNCATE audit.events',
                    'CREATE TABLE runtime.not_allowed(x int)','UPDATE runtime.service_control SET processing_enabled=false'):
            with self.subTest(sql=sql),self.assertRaises(psycopg.errors.InsufficientPrivilege):
                with state.transaction(self.config) as c:c.execute(sql)

    def test_stale_generation_fails_closed(self):
        bad=dict(self.config,state_generation=str(uuid.uuid4()))
        with self.assertRaisesRegex(ConfigurationError,'GENERATION_INACTIVE'):
            ConversationStore('partner-conversations.db',bad).thread(self.key)

    def test_late_commit_is_not_skipped_by_queue(self):
        ingress=IngressJournal('instagram-ingress.db',self.config)
        receipt=ReceiptJournal('receipt-processing.db',self.config)
        now=time.time()
        with psycopg.connect(**self.admin) as slow:
            slow.execute("INSERT INTO runtime.ingress_messages(message_id,sender_id,event_timestamp,text,captured_at,status,attachments,reply_to) VALUES (%s,'synthetic',%s,'',%s,'CAPTURED_NO_PROCESSING','[]','')",(self.key+'-slow',now,now))
            slow.execute("INSERT INTO runtime.ingress_work(message_id,state,eligible_at) VALUES (%s,'PENDING',clock_timestamp())",(self.key+'-slow',))
            ingress.capture(self.key,[{'message_id':self.key,'sender_id':'synthetic','timestamp':now,'text':'','attachments':[]}])
            receipt.ingest(ingress.db,1)
            slow.commit()
        receipt.ingest(ingress.db,1)
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT count(*) FROM runtime.receipt_jobs WHERE message_id=ANY(%s)',([self.key,self.key+'-slow'],)).fetchone()[0],2)

    def test_readonly_transactions_are_enforced_by_the_server(self):
        # AGT-STATE-02: SET TRANSACTION READ ONLY makes the server refuse writes on a read-only journal.
        ingress=state.connect('/var/lib/agent/instagram-ingress.db',self.config,readonly=True)
        self.assertEqual(ingress.execute('SELECT * FROM messages WHERE message_id=?',(self.key,)).fetchall(),[])
        with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
            with state.transaction(self.config,readonly=True) as c:
                c.execute('INSERT INTO runtime.conversations(binding,thread_id) VALUES (%s,%s)',(self.key,self.key))
        with psycopg.connect(**self.admin) as c:
            self.assertIsNone(c.execute('SELECT 1 FROM runtime.conversations WHERE binding=%s',(self.key,)).fetchone())

    def test_noop_update_leaves_no_audit_rows(self):
        # AGT-STATE-01: a statement that changes nothing writes neither an operation nor an event.
        receipt=ReceiptJournal('receipt-processing.db',self.config)
        with psycopg.connect(**self.admin) as c:
            before=c.execute('SELECT (SELECT count(*) FROM audit.operations),(SELECT count(*) FROM audit.events)').fetchone()
        with receipt.db:
            self.assertEqual(receipt.db.execute("UPDATE receipt_jobs SET status='EXPIRED' WHERE id=?",(self.key,)).rowcount,0)
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT (SELECT count(*) FROM audit.operations),(SELECT count(*) FROM audit.events)').fetchone(),before)

    def test_unavailable_audit_prevents_provider_dispatch(self):
        called=False
        with patch.object(state,'transaction',side_effect=ConfigurationError('unavailable')):
            with self.assertRaisesRegex(ConfigurationError,'unavailable'):
                with audit.activity(self.config,'synthetic-provider',effect=True):called=True
        self.assertFalse(called)


@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'),'isolated PostgreSQL 18 lab required')
class IamLoginLabTests(unittest.TestCase):
    """ALL-ARCH-03 in the lab: a NOINHERIT login holding mw_agent_worker, mw_agent_relay and
    mw_integration_agent WITH INHERIT FALSE, SET TRUE (the live IAM user's shape; trust auth stands
    in for the proxy's auto-iam-authn listener). Every path must SET ROLE before its first query."""
    LOGIN='mw_iam_lab_login'

    @classmethod
    def setUpClass(cls):
        lab=json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text(encoding='utf-8-sig'))
        if lab['host']!='127.0.0.1' or lab['port']==5432 or 'agent-state-lab-' not in lab['root']:
            raise RuntimeError('Refusing a non-laboratory target')
        cls.port=lab['port']
        cls.admin=dict(host=lab['host'],port=lab['port'],user='postgres',autocommit=True)
        with psycopg.connect(**cls.admin,dbname='postgres') as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==(Path(lab['root'])/'data').resolve()
            for role,attributes in (('mw_integration_agent','NOLOGIN NOINHERIT'),(cls.LOGIN,'LOGIN NOINHERIT')):
                if not c.execute('SELECT 1 FROM pg_roles WHERE rolname=%s',(role,)).fetchone():
                    c.execute('CREATE ROLE '+role+' '+attributes)
            c.execute('GRANT mw_agent_worker,mw_agent_relay,mw_integration_agent TO '+cls.LOGIN+' WITH INHERIT FALSE, SET TRUE')
            c.execute('GRANT CONNECT ON DATABASE mw_agent,loan_manager_prod TO '+cls.LOGIN)
        generation=str(uuid.uuid4())
        with psycopg.connect(**cls.admin,dbname='mw_agent') as c:
            c.execute('''INSERT INTO runtime.service_control(service_name,backend,active_generation,processing_enabled)
                VALUES ('agent','postgres',%s,true) ON CONFLICT(service_name) DO UPDATE SET active_generation=EXCLUDED.active_generation,processing_enabled=true''',(generation,))
        cls.config={'state_backend':'postgres','state_generation':generation,'state_cutover_at':'2026-01-01T00:00:00+00:00',
                    'agent_database_auth':'iam','database_auth':'iam','database_iam_user':cls.LOGIN,
                    'agent_database_host':'127.0.0.1','agent_database_port':5432,'agent_database_name':'mw_agent',
                    'database_host':'127.0.0.1','database_port':5432,'database_name':'loan_manager_prod',
                    'database_user':'mw_integration_agent','audit_environment':'test','code_version':'synthetic-tests'}
        from mw_integration_agent import config as agent_config, outbox
        # The lab cluster stands in for the proxy's IAM listener (5433 in production).
        cls.patches=[patch.object(module,'iam_port',return_value=cls.port) for module in (state,outbox,agent_config)]
        for item in cls.patches:
            item.start()

    @classmethod
    def tearDownClass(cls):
        for item in cls.patches:
            item.stop()

    def test_bare_login_is_denied_and_set_role_grants_the_worker(self):
        with psycopg.connect(**dict(self.admin,user=self.LOGIN),dbname='mw_agent') as bare:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                bare.execute('SELECT count(*) FROM runtime.job_runs')
        with state.open_connection(self.config) as conn:
            self.assertEqual(conn.execute('SELECT session_user,current_user').fetchone(),(self.LOGIN,'mw_agent_worker'))
            conn.execute('SELECT count(*) FROM runtime.job_runs').fetchone()

    def test_relay_health_inspects_as_worker_and_relay(self):
        from mw_integration_agent import relay_health
        snapshot=relay_health.inspect(self.config)
        self.assertEqual(snapshot['inspection_failed'],0)

    def test_notice_acknowledgement_cli_runs_as_worker(self):
        spec=importlib.util.spec_from_file_location('notice_ack_iam',Path(__file__).parents[1]/'scripts/acknowledge-receipt-notices.py')
        ack=importlib.util.module_from_spec(spec);spec.loader.exec_module(ack)
        key=audit.digest(str(uuid.uuid4()));review=audit.digest(str(uuid.uuid4()))
        with psycopg.connect(**self.admin,dbname='mw_agent') as c:
            c.execute("INSERT INTO runtime.partner_reviews(id,job_id,proposal,state,created_at,expires_at,payment_id) VALUES (%s,%s,'{}','POSTED',1,2,'synthetic-payment')",(review,key))
            c.execute("INSERT INTO runtime.partner_notices(stream,id,event_key,partner_id,partner,subject,body,ig_status,email_status,attempts,detail) VALUES ('receipt',%s,%s,'synthetic','{}','synthetic','synthetic','UNAVAILABLE','REJECTED',3,'IG_ROUTE_OR_WINDOW_UNAVAILABLE')",(key,'review-result:'+review+':POSTED'))
        with tempfile.TemporaryDirectory() as d:
            config=Path(d)/'config.json';plan=Path(d)/'plan.json'
            config.write_text(json.dumps(self.config))
            def run(*args):
                out=io.StringIO()
                with patch('sys.argv',['acknowledge-receipt-notices.py',*args,'--config',str(config)]),contextlib.redirect_stdout(out):
                    ack.main()
                return json.loads(out.getvalue())
            observed=run('inspect','--notice-id',key)
            self.assertEqual(observed[0]['notice_id'],key)
            plan.write_text(json.dumps(observed))
            result=run('acknowledge','--plan-file',str(plan),'--operator','synthetic-operator',
                       '--reason','synthetic lab test','--authorization','synthetic lab request')
        self.assertEqual(result[0]['resolution'],'ACKNOWLEDGED_UNDELIVERED')
        with psycopg.connect(**self.admin,dbname='mw_agent') as c:
            self.assertEqual(c.execute('SELECT count(*) FROM audit.events WHERE operation_id=%s',(result[0]['operation_id'],)).fetchone()[0],1)

    def test_host_monitor_probe_sets_both_roles(self):
        spec=importlib.util.spec_from_file_location('debian_health_iam',Path(__file__).parents[2]/'project/scripts/monitoring/debian-health.py')
        health=importlib.util.module_from_spec(spec);spec.loader.exec_module(health)
        status,sample=health.database_probe(self.config)
        self.assertEqual((status,sample[0]['status']),(1,1))
