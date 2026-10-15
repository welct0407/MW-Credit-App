"""Synthetic PostgreSQL acknowledgement: immutable failures, exact scope, rollback."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
import uuid
import psycopg
from mw_integration_agent import audit
from mw_integration_agent.config import ConfigurationError

spec=importlib.util.spec_from_file_location('notice_ack',Path(__file__).parents[1]/'scripts/acknowledge-receipt-notices.py')
ack=importlib.util.module_from_spec(spec);spec.loader.exec_module(ack)

@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'),'private PostgreSQL lab required')
class AcknowledgementTests(unittest.TestCase):
    def setUp(self):
        lab=json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text())
        assert lab['host']=='127.0.0.1' and lab['port']!=5432 and 'agent-state-lab-' in lab['root']
        self.conn=psycopg.connect(host=lab['host'],port=lab['port'],user='mw_agent_worker',dbname='mw_agent',autocommit=True)
        self.addCleanup(self.conn.close)
        generation=self.conn.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()[0]
        self.config=dict(state_generation=str(generation),audit_environment='test',code_version='synthetic')
        self.key=audit.digest(str(uuid.uuid4()));self.review=audit.digest(str(uuid.uuid4()))
        self.conn.execute("INSERT INTO runtime.partner_reviews(id,job_id,proposal,state,created_at,expires_at,payment_id) VALUES (%s,%s,'{}','POSTED',1,2,'synthetic-payment')",(self.review,self.key))
        self.conn.execute("INSERT INTO runtime.partner_notices(stream,id,event_key,partner_id,partner,subject,body,ig_status,email_status,attempts,detail) VALUES ('receipt',%s,%s,'synthetic','{}','synthetic','immutable failure payload','UNAVAILABLE','REJECTED',3,'IG_ROUTE_OR_WINDOW_UNAVAILABLE')",(self.key,'review-result:'+self.review+':POSTED'))
        self.item=ack.snapshot(self.conn,self.key)
    def run_ack(self,items=None):
        with self.conn.transaction():
            return ack.acknowledge(self.conn,self.config,items or [self.item],'synthetic-operator','Notification waived; payment confirmed','synthetic explicit request')
    def test_idempotent_append_only_and_failures_unchanged(self):
        before=self.conn.execute("SELECT row_to_json(n) FROM runtime.partner_notices n WHERE stream='receipt' AND id=%s",(self.key,)).fetchone()[0]
        first=self.run_ack();second=self.run_ack()
        self.assertEqual(first,second)
        self.assertEqual(self.conn.execute("SELECT row_to_json(n) FROM runtime.partner_notices n WHERE stream='receipt' AND id=%s",(self.key,)).fetchone()[0],before)
        self.assertEqual(self.conn.execute('SELECT count(*) FROM audit.events WHERE operation_id=%s',(first[0]['operation_id'],)).fetchone()[0],1)
    def test_stale_observation_rejected_without_audit_append(self):
        self.conn.execute("UPDATE runtime.partner_notices SET detail='changed' WHERE id=%s",(self.key,))
        with self.assertRaisesRegex(ConfigurationError,'CHANGED_SINCE'):self.run_ack()
        self.assertIsNone(self.conn.execute("SELECT 1 FROM audit.operations WHERE plan->'observation'->>'notice_id'=%s",(self.key,)).fetchone())
    def test_pending_unknown_success_and_required_review_refused(self):
        for field,value in [('email_status','UNKNOWN'),('email_status','SENT'),('ig_status','ACCEPTED'),('event_key','review:'+self.review)]:
            with self.subTest(field=field,value=value):
                with self.conn.transaction(force_rollback=True):
                    self.conn.execute('UPDATE runtime.partner_notices SET '+field+'=%s WHERE id=%s',(value,self.key))
                    with self.assertRaises(ConfigurationError):ack.snapshot(self.conn,self.key)
    def test_whole_batch_rolls_back_for_invalid_second_item(self):
        bad=dict(self.item,notice_id='0'*64)
        with self.assertRaises(ConfigurationError):self.run_ack([self.item,bad])
        self.assertIsNone(self.conn.execute("SELECT 1 FROM audit.operations WHERE plan->'observation'->>'notice_id'=%s",(self.key,)).fetchone())
    def test_read_only_inspection_cannot_acknowledge(self):
        with self.conn.transaction():
            self.conn.execute('SET TRANSACTION READ ONLY')
            self.assertEqual(ack.snapshot(self.conn,self.key),self.item)
            with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
                ack.acknowledge(self.conn,self.config,[self.item],'operator','reason','authority')
    def test_removed_posted_evidence_refused(self):
        self.conn.execute("UPDATE runtime.partner_reviews SET state='UNKNOWN' WHERE id=%s",(self.review,))
        with self.assertRaisesRegex(ConfigurationError,'POSTED_REVIEW'):self.run_ack()
