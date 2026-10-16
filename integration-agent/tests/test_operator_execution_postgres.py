"""Synthetic two-database durable intent and read-only inspector integration."""
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import unittest
import uuid
from unittest.mock import patch
import psycopg
from mw_integration_agent import audit, state, outbox, operator_execution as oe, relay_health as rh
from mw_integration_agent.config import ConfigurationError

@unittest.skipUnless(os.environ.get('MW_AGENT_LAB_MANIFEST'), 'isolated lab required')
class DurableOperatorPostgres(unittest.TestCase):
    def test_durable_concurrent_unknown_hash_and_inspector(self):
        lab=json.loads(Path(os.environ['MW_AGENT_LAB_MANIFEST']).read_text())
        assert lab['host']=='127.0.0.1' and lab['port']!=5432 and 'agent-state-lab-' in lab['root']
        base=dict(host=lab['host'],port=lab['port'],user='postgres')
        with psycopg.connect(**base,dbname='mw_agent') as c:
            assert Path(c.execute('SHOW data_directory').fetchone()[0]).resolve()==(Path(lab['root'])/'data').resolve()
            generation=str(c.execute("SELECT active_generation FROM runtime.service_control WHERE service_name='agent'").fetchone()[0])
        config=dict(state_backend='postgres',state_generation=generation,audit_environment='test',code_version='synthetic',database_name='loan_manager_prod')
        def params(config,role='worker'):
            return dict(base,user='mw_agent_'+role,dbname='mw_agent',autocommit=True)
        @contextmanager
        def business(config):
            with psycopg.connect(**dict(base,user='mw_agent_relay'),dbname='loan_manager_prod',autocommit=True) as c:
                yield c
        request=dict(kind='interest-reallocation-v2',operation_id=str(uuid.uuid4()),database='loan_manager_prod',payment='synthetic-'+str(uuid.uuid4()),receipt={},moves=[{}],reason='synthetic test',code_version='synthetic',actor_id='operator-test',actor_login='operator-test-login',authorization_reference='synthetic-approval')
        def prepare():
            try:return oe.prepare(config,request)['prepared']
            except ConfigurationError:return False
        with patch.object(state,'parameters',params),patch.object(oe,'business',business),patch.object(outbox,'business',business),patch.object(rh,'business',business):
            with ThreadPoolExecutor(max_workers=2) as executor:
                self.assertEqual(sorted(executor.map(lambda _:prepare(),range(2))),[False,True])
            with psycopg.connect(**base,dbname='mw_agent') as c:
                row=c.execute('SELECT plan_sha256,plan FROM audit.operations WHERE operation_id=%s',(request['operation_id'],)).fetchone()
                self.assertEqual(row,(audit.digest(request),request))
            self.assertEqual(oe.observe(config,request)['state'],'UNKNOWN')
            with self.assertRaisesRegex(ConfigurationError,'SCOPE_UNCERTAIN'):
                oe.prepare(config,dict(request,operation_id=str(uuid.uuid4())))
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                c.execute('''INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s)''',(request['operation_id'],request['actor_id'],request['actor_login'],audit.digest(request),request['reason'],json.dumps([request]),request['code_version']))
            self.assertEqual(oe.observe(config,request)['state'],'COMMITTED')
            self.assertEqual(oe.observe(config,request)['state'],'COMMITTED')
            with self.assertRaisesRegex(ConfigurationError,'BUSINESS_COMMIT_EXISTS'):
                oe.prepare(config,request)
            running_id=uuid.uuid4()
            with psycopg.connect(**base,dbname='mw_agent') as c:
                intent=c.execute('SELECT plan_sha256,actor_id,actor_login,service_name,plan,actor_kind FROM audit.operations WHERE operation_id=%s',(request['operation_id'],)).fetchone()
                self.assertEqual(c.execute("SELECT count(*) FROM audit.events WHERE operation_id=%s AND event_kind='operator_commit_observed'",(request['operation_id'],)).fetchone()[0],1)
                c.execute('''INSERT INTO runtime.job_runs(run_id,operation_id,service_name,started_at,finished_at,state,summary) VALUES (%s,%s,'audit-relay',now()-interval '5 seconds',now(),'FAILED','{"exit_code":2}')''',(uuid.uuid4(),request['operation_id']))
                c.execute('''INSERT INTO runtime.job_runs(run_id,operation_id,service_name,started_at,state) VALUES (%s,%s,'audit-relay',now(),'RUNNING')''',(running_id,request['operation_id']))
            marker=oe.marker(config,request['operation_id'])
            oe.verify_marker(marker,intent)
            with self.assertRaisesRegex(ConfigurationError,'CANONICAL_MISMATCH'):
                oe.verify_marker((marker[0],'0'*64,*marker[2:]),intent)
            snapshot=rh.inspect(config)
            self.assertEqual(snapshot['status'],0)
            self.assertEqual(snapshot['running'],1)
            self.assertEqual(snapshot['inspection_failed'],0)
            # Execute the actual V58 business function against synthetic payment
            # fixtures only, after the independent durable central readback.
            sql=(Path(__file__).with_name('fixtures')/'operator_interest.sql').read_text()
            sql=sql.replace('IR57-', 'IE58-'+uuid.uuid4().hex[:8]+'-')
            account='INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name") VALUES (\'CI-DAD\',\'ch:dad\',\'Synthetic CI Dad\',\'Synthetic\'),(\'CI-LISA\',\'ch:lisa\',\'Synthetic CI Lisa\',\'Synthetic\') ON CONFLICT DO NOTHING;'
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                c.execute('''INSERT INTO "Cash Holders"("Row ID","Holder Name","Sort Order") VALUES ('ch:dad','Synthetic Dad',1),('ch:lisa','Synthetic Lisa',2) ON CONFLICT DO NOTHING''')
                c.execute(account)
                c.execute(sql)
                receipt,moves=c.execute('SELECT receipt,moves FROM ir57_request').fetchone()
                actual=dict(request,operation_id=str(uuid.uuid4()),payment=receipt['Row ID'],receipt=receipt,moves=moves)
            oe.prepare(config,actual)
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                c.execute('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
                self.assertEqual(c.execute('SELECT public.reallocate_payment_interest_audited(%s,%s)',(actual['operation_id'],audit.canonical(actual))).fetchone()[0],'applied')
            self.assertEqual(oe.observe(config,actual)['state'],'COMMITTED')
            outbox.relay(config);outbox.relay(config)
            with psycopg.connect(**base,dbname='mw_agent') as c:
                self.assertEqual(c.execute("SELECT count(*) FROM audit.events WHERE operation_id=%s AND event_kind='row_changed'",(actual['operation_id'],)).fetchone()[0],12)
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                self.assertEqual(c.execute('SELECT count(*) FROM agent_audit.exports WHERE operation_id=%s',(actual['operation_id'],)).fetchone()[0],1)
            missing_op=uuid.uuid4()
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                c.execute('''INSERT INTO agent_audit.commits(operation_id,reviewer_id,reviewer_login,plan_sha256,request_reason,direct_targets,code_version,recorded_in_transaction_at) VALUES (%s,'test','test',%s,'synthetic missing intent','[]','synthetic',now()-interval '5 minutes')''',(missing_op,'0'*64))
            self.assertGreaterEqual(rh.inspect(config)['missing_intents'],1)
            # Mark synthetic poison fixtures exported so later suite tests retain
            # their own independent backlog assumptions. Never used on live data.
            with psycopg.connect(**base,dbname='loan_manager_prod') as c:
                c.execute('INSERT INTO agent_audit.exports(operation_id,central_completion_event_id) SELECT operation_id,%s FROM agent_audit.commits WHERE operation_id=%s ON CONFLICT DO NOTHING',(uuid.uuid4(),missing_op))
            with business(config) as c:
                c.execute('SET default_transaction_read_only=on')
                with self.assertRaises(psycopg.errors.ReadOnlySqlTransaction):
                    c.execute("DELETE FROM agent_audit.commits WHERE false")
            with psycopg.connect(**base,dbname='mw_agent') as c:
                c.execute("UPDATE runtime.job_runs SET state='INTERRUPTED',finished_at=now() WHERE run_id=%s",(running_id,))
