"""Integration tests require an explicitly named private disposable lab manifest."""
import json
import os
from pathlib import Path
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
        with self.assertRaisesRegex(ConfigurationError,'CONTENT_MISMATCH'):
            ingress.capture(self.key+'-changed',[dict(event,text='different')])
        with psycopg.connect(**self.admin) as c:
            self.assertEqual(c.execute('SELECT count(*) FROM runtime.ingress_work WHERE message_id=%s',(self.key,)).fetchone()[0],1)
            self.assertIsNone(c.execute('SELECT 1 FROM runtime.ingress_receipts WHERE payload_sha256=%s',(self.key+'-changed',)).fetchone())

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
            first.db.execute("UPDATE partner_notices SET ig_status='UNKNOWN',email_status='REJECTED',attempts=1,detail='synthetic failure' WHERE id=?",(key,))
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

    def test_unavailable_audit_prevents_provider_dispatch(self):
        called=False
        with patch.object(state,'transaction',side_effect=ConfigurationError('unavailable')):
            with self.assertRaisesRegex(ConfigurationError,'unavailable'):
                with audit.activity(self.config,'synthetic-provider',effect=True):called=True
        self.assertFalse(called)
