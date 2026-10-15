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
