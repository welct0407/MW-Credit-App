"""Synthetic PostgreSQL acknowledgement: immutable failures, exact scope, rollback."""
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid
import psycopg
from mw_integration_agent import audit, state
from mw_integration_agent.config import ConfigurationError

spec=importlib.util.spec_from_file_location('notice_ack',Path(__file__).parents[1]/'scripts/acknowledge-receipt-notices.py')
ack=importlib.util.module_from_spec(spec);spec.loader.exec_module(ack)

class FakeConnection:
    def __init__(self):
        self.statements=[]
    def execute(self,sql,params=None):
        self.statements.append(sql);return self
    def fetchone(self):
        return None
    @contextmanager
    def transaction(self):
        yield
    def close(self):
        pass
    def __enter__(self):
        return self
    def __exit__(self,*exc):
        self.close()


class ConnectionUnitTests(unittest.TestCase):
    """ALL-ARCH-03: the operator CLI runs as mw_agent_worker, never as the bare NOINHERIT IAM login."""
    def run_main(self,**auth):
        conn=FakeConnection()
        with tempfile.TemporaryDirectory() as d:
            config=Path(d)/'config.json'
            config.write_text(json.dumps(dict(agent_database_host='127.0.0.1',agent_database_port=5432,agent_database_name='mw_agent',
                state_generation='11111111-1111-4111-8111-111111111111',**auth)))
            argv=['acknowledge-receipt-notices.py','inspect','--config',str(config),'--notice-id','a'*64]
            with patch('sys.argv',argv),patch('psycopg.connect',return_value=conn) as connect, \
                 patch.object(state,'load_secret',return_value='synthetic'):
                with self.assertRaisesRegex(ConfigurationError,'STATE_GENERATION_INACTIVE'):
                    ack.main()
        return conn.statements,connect.call_args.kwargs

    def test_iam_sets_worker_role_before_any_query(self):
        statements,kwargs=self.run_main(agent_database_auth='iam',database_iam_user='mw-integration-agent@clever-oasis-508610-n7.iam')
        self.assertEqual(statements[0],'SET ROLE mw_agent_worker')
        self.assertEqual((kwargs['user'],kwargs['port'],'password' in kwargs),('mw-integration-agent@clever-oasis-508610-n7.iam',5433,False))

    def test_password_login_is_the_worker_role_itself(self):
        statements,kwargs=self.run_main()
        self.assertFalse([s for s in statements if s.startswith('SET ROLE')])
        self.assertEqual((kwargs['user'],kwargs['port']),('mw_agent_worker',5432))


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
