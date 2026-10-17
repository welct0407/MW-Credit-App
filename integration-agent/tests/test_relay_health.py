from contextlib import contextmanager
import unittest
from unittest.mock import patch
from mw_integration_agent import relay_health as rh, state
from mw_integration_agent.config import ConfigurationError

IAM_USER='mw-integration-agent@clever-oasis-508610-n7.iam'


class FakeConnection:
    """Records statements; every query returns no row, so the fence stops inspect()."""
    def __init__(self):
        self.statements=[]
    def execute(self,sql,params=None):
        self.statements.append(sql)
        return self
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


class CompletedRelayHealthTests(unittest.TestCase):
    def snapshot(self,**kw):
        value={'completed':(990,'COMPLETED',0),'running':None,'backlog':0,'oldest':None,'missing_intents':0}
        value.update(kw);return value
    def check(self,**kw):return rh.assess(self.snapshot(**kw),1000)
    def test_recent_success_and_empty_checked_queue_are_healthy(self):
        self.assertEqual(self.check()['status'],1)
    def test_running_retry_cannot_erase_failed_completion(self):
        self.assertEqual(self.check(completed=(990,'FAILED',2),running=999)['status'],0)
    def test_running_without_completion_is_never_healthy(self):
        self.assertNotEqual(self.check(completed=None,running=999)['status'],1)
    def test_fresh_completed_success_can_recover_failure(self):
        self.assertEqual(self.check(completed=(999,'COMPLETED',0))['status'],1)
    def test_failed_exit_or_interrupted_run_is_down(self):
        for result in ((990,'COMPLETED',2),(990,'INTERRUPTED',None),(990,'FAILED',None)):
            self.assertEqual(self.check(completed=result)['status'],0)
    def test_old_completion_and_stuck_running_job_are_degraded(self):
        self.assertEqual(self.check(completed=(700,'COMPLETED',0))['status'],2)
        self.assertEqual(self.check(running=700)['status'],2)
    def test_young_queue_can_drain_but_old_queue_never_hides(self):
        self.assertEqual(self.check(backlog=1,oldest=990)['status'],1)
        self.assertEqual(self.check(backlog=1,oldest=700)['status'],2)
        self.assertEqual(self.check(backlog=1,oldest=990,missing_intents=1)['status'],0)
    def test_invalid_future_missing_or_negative_inspection_is_not_zero_queue(self):
        for changes in ({'oldest':None,'backlog':1},{'backlog':-1},{'completed':(1500,'COMPLETED',0)},
                        {'oldest':1500,'backlog':1},{'missing_intents':1},{'completed':('invalid','COMPLETED',0)}):
            with self.subTest(changes=changes):
                self.assertEqual(self.check(**changes)['inspection_failed'],1)
                self.assertEqual(self.check(**changes)['status'],0)


class ScriptedConnection:
    """Answers each query with the next scripted row (fetchone) in order: heartbeat, latest run, running runs."""
    def __init__(self,*rows):
        self.rows=list(rows);self.statements=[]
    def execute(self,sql,params=None):
        self.statements.append((sql,params));self.current=self.rows.pop(0);return self
    def fetchone(self):
        return self.current


class HeartbeatFreshnessTests(unittest.TestCase):
    """V6: audit-relay freshness comes from runtime.service_heartbeats, job_runs stays the fallback (mixed versions)."""
    def freshness(self,beat,latest,running):
        conn=ScriptedConnection(beat,latest,(running,))
        result=rh.freshness(conn)
        self.assertTrue(all(p==('audit-relay',) for _,p in conn.statements))
        return result

    def test_heartbeat_completion_wins_when_newer(self):
        self.assertEqual(self.freshness((990.0,'COMPLETED',0,None),(900.0,'COMPLETED',0),None),((990.0,'COMPLETED',0),None))
        self.assertEqual(self.freshness((990.0,'FAILED',2,None),None,None),((990.0,'FAILED',2),None))

    def test_newer_job_run_wins_over_an_older_heartbeat(self):
        # An older binary finishing after the heartbeat's last run (deploy window) is the fresher evidence.
        self.assertEqual(self.freshness((900.0,'COMPLETED',0,None),(950.0,'FAILED',2),None),((950.0,'FAILED',2),None))

    def test_no_heartbeat_row_falls_back_to_job_runs(self):
        self.assertEqual(self.freshness(None,(900.0,'COMPLETED',0),880.0),((900.0,'COMPLETED',0),880.0))
        self.assertEqual(self.freshness(None,None,None),(None,None))
        self.assertEqual(self.freshness((None,None,None,None),(900.0,'COMPLETED',0),None),((900.0,'COMPLETED',0),None))

    def test_running_is_the_oldest_of_heartbeat_and_job_runs(self):
        self.assertEqual(self.freshness((990.0,'COMPLETED',0,995.0),None,None)[1],995.0)
        self.assertEqual(self.freshness((990.0,'COMPLETED',0,995.0),None,970.0)[1],970.0)
        self.assertEqual(self.freshness((990.0,'COMPLETED',0,960.0),None,970.0)[1],960.0)

    def test_assessment_of_heartbeat_evidence(self):
        complete,running=self.freshness((990.0,'COMPLETED',0,None),None,None)
        snapshot={'completed':complete,'running':running,'backlog':0,'oldest':None,'missing_intents':0}
        self.assertEqual(rh.assess(snapshot,1000)['status'],1)
        complete,running=self.freshness((990.0,'INTERRUPTED',None,None),None,None)
        self.assertEqual(rh.assess(dict(snapshot,completed=complete),1000)['status'],0)


class InspectConnectionTests(unittest.TestCase):
    """ALL-ARCH-03: the central read runs as mw_agent_worker, never as the bare NOINHERIT IAM login."""
    CONFIG={'state_backend':'postgres','agent_database_host':'127.0.0.1','agent_database_port':5432,
            'agent_database_name':'mw_agent','state_generation':'11111111-1111-4111-8111-111111111111'}

    def inspect(self,config):
        central=FakeConnection()
        @contextmanager
        def business(config):
            yield FakeConnection()
        with patch('psycopg.connect',return_value=central) as connect,patch.object(rh,'business',business), \
             patch.object(state,'load_secret',return_value='synthetic'):
            with self.assertRaisesRegex(ConfigurationError,'STATE_GENERATION_INACTIVE'):
                rh.inspect(config)
        return central.statements,connect.call_args.kwargs

    def test_iam_sets_worker_role_before_any_query(self):
        statements,kwargs=self.inspect(dict(self.CONFIG,agent_database_auth='iam',database_iam_user=IAM_USER))
        self.assertEqual(statements[0],'SET ROLE mw_agent_worker')
        self.assertEqual((kwargs['user'],kwargs['port'],'password' in kwargs),(IAM_USER,5433,False))
        self.assertIn('default_transaction_read_only=on',kwargs['options'])

    def test_password_login_is_the_worker_role_itself(self):
        statements,kwargs=self.inspect(self.CONFIG)
        self.assertFalse([s for s in statements if s.startswith('SET ROLE')])
        self.assertEqual((kwargs['user'],kwargs['port']),('mw_agent_worker',5432))
