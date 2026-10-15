import unittest
from mw_integration_agent import relay_health as rh


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
