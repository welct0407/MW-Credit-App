import datetime as dt
import importlib.util
import pathlib
import unittest
from unittest.mock import Mock,patch

spec=importlib.util.spec_from_file_location('health', pathlib.Path(__file__).with_name('debian-health.py'))
health=importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)

class TimerHealthTests(unittest.TestCase):
    def test_completion_timestamp_uses_monotonic_age(self):
        self.assertEqual(health.completion_epoch({'ExecMainExitTimestampMonotonic':'950000000'},1000,1800000000),1799999950)
    def test_missing_or_future_completion_is_unavailable(self):
        self.assertEqual(health.completion_epoch({},1000,1800000000),0)
        self.assertEqual(health.completion_epoch({'ExecMainExitTimestampMonotonic':'2000000000'},1000,1800000000),0)
    def test_group_cannot_hide_failed_member(self):
        self.assertEqual(health.combine([0,1]),0)
        self.assertEqual(health.combine([1,4]),4)
    def test_idle_success_is_healthy(self):
        self.assertEqual(self.check(), 1)
    def test_failed_job_is_down(self):
        self.assertEqual(self.check(Result='exit-code'), 0)
    def test_stale_success_is_degraded(self):
        self.assertEqual(self.check(ExecMainExitTimestampMonotonic='1000000'), 2)
    def test_disabled_timer_is_down(self):
        self.assertEqual(self.check(timer={'LoadState':'loaded','ActiveState':'inactive'}), 0)
    def test_running_job_not_marked_down(self):
        self.assertEqual(self.check(ActiveState='activating',ExecMainStartTimestampMonotonic='950000000'), 1)
    def test_stuck_job_is_degraded(self):
        self.assertEqual(self.check(ActiveState='activating',ExecMainStartTimestampMonotonic='1000000'), 2)
    def test_unseen_unit_is_unknown(self):
        self.assertEqual(self.check(LoadState='not-found'), 4)
    def check(self,timer=None,**kw):
        service=dict(LoadState='loaded',ActiveState='inactive',Result='success',ExecMainStatus='0',ExecMainExitTimestampMonotonic='950000000')
        service.update(kw)
        return health.timer_status(service,timer or {'LoadState':'loaded','ActiveState':'active'},1000,dt.datetime(2026,9,22,12),180,300)

class ReceiptSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.values={k:0 for k in ('pending_images','validated_receipts','held_receipts','pending_reviews','approved_payments','completed_payments','oldest_pending_seconds','stalled_jobs','unnotified_holds','unconfirmed_postings','undelivered_reviews','overdue_reviews','failed_notifications')}
        self.values['status']=1
    def test_recent_queue_is_not_failure(self):
        self.values['pending_images']=2
        self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=1),Mock(return_value=self.values))['status'],1)
    def test_database_and_import_failure_are_down_not_empty(self):
        c={'receipt_summary_enabled':True};job=Mock(return_value=1)
        result=health.receipt_snapshot(c,job,Mock(side_effect=RuntimeError()))
        self.assertEqual(result,{'status':0,'inspection_failed':1})
        with patch.dict('sys.modules',{'mw_integration_agent.receipt_health':None}):
            self.assertEqual(health.receipt_snapshot(c,job),result)
    def test_paused_has_no_queue_counts_and_does_not_inspect(self):
        inspector=Mock();job=Mock()
        self.assertEqual(health.receipt_snapshot({},job,inspector),{'status':3})
        inspector.assert_not_called();job.assert_not_called()
    def test_missing_or_invalid_fields_fail_closed(self):
        for value in ({'status':1},dict(self.values,pending_images=-1),dict(self.values,status=99)):
            self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=1),Mock(return_value=value))['status'],0)
    def test_service_failure_cannot_be_hidden_by_healthy_queue(self):
        self.assertEqual(health.receipt_snapshot({'receipt_summary_enabled':True},Mock(return_value=0),Mock(return_value=self.values))['status'],0)

if __name__=='__main__': unittest.main()
