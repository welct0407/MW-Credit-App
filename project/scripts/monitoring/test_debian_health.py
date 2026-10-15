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

class RelaySnapshotTests(unittest.TestCase):
    def setUp(self):
        self.values={'status':1,'completed_at':990,'completed_success':1,'backlog':0,
                     'oldest_unexported_seconds':0,'missing_intents':0,'running':0,'inspection_failed':0}
    def test_running_systemd_success_cannot_hide_previous_failure(self):
        self.values.update(status=0,completed_success=0,running=1)
        result=health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))
        self.assertEqual(result['status'],0)
    def test_valid_completed_success_and_empty_backlog_are_healthy(self):
        self.assertEqual(health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))['status'],1)
    def test_backlog_degradation_survives_running_service(self):
        self.values.update(status=2,backlog=1,oldest_unexported_seconds=200,running=1)
        self.assertEqual(health.relay_snapshot({},Mock(return_value=1),Mock(return_value=self.values))['status'],2)
    def test_failed_missing_or_invalid_inspection_fails_closed(self):
        for inspector in (Mock(side_effect=RuntimeError()),Mock(return_value={}),
                          Mock(return_value=dict(self.values,backlog=-1))):
            self.assertEqual(health.relay_snapshot({},Mock(return_value=1),inspector),{'status':0,'inspection_failed':1})
    def test_disabled_timer_or_failed_properties_cannot_be_hidden(self):
        self.assertEqual(health.relay_snapshot({},Mock(return_value=0),Mock(return_value=self.values))['status'],0)
        self.assertEqual(health.relay_snapshot({},Mock(side_effect=RuntimeError()),Mock(return_value=self.values))['status'],0)

class NativeApiProbeTests(unittest.TestCase):
    def setUp(self):
        self.digest='a'*64
        self.config={'conversation_api_enabled':True,'conversation_api_manifest_sha256':self.digest,
                     'conversation_api_environment':'prod','database_name':'loan_manager_prod',
                     'conversation_api_origin':'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app',
                     'conversation_api_audience':'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'}
    def result(self,scope='oltp',**values):
        import json
        return Mock(returncode=0,stdout=json.dumps(dict(authenticated=True,scope=scope,count=1,targetVersion=self.digest,**values)))
    def test_disabled_never_uses_old_appsheet_switch(self):
        runner=Mock()
        self.assertEqual(health.native_api_status({'appsheet_enabled':True},'oltp',runner),4)
        runner.assert_not_called()
    def test_explicit_disabled_and_invalid_flag_are_distinct(self):
        for flag,expected in [(False,3),('true',0),(1,0),(None,0)]:
            runner=Mock()
            self.assertEqual(health.native_api_status(dict(self.config,conversation_api_enabled=flag),'oltp',runner),expected)
            runner.assert_not_called()
    def test_wrong_environment_or_binding_never_runs(self):
        for field,value in [('conversation_api_environment','dev'),('database_name','loan_manager_dev'),('conversation_api_origin','https://unreviewed.invalid'),('conversation_api_audience','other')]:
            runner=Mock()
            self.assertEqual(health.native_api_status(dict(self.config,**{field:value}),'oltp',runner),0)
            runner.assert_not_called()
    def test_both_native_scopes_have_fixed_read_only_command(self):
        for scope in ('oltp','olap'):
            runner=Mock(return_value=self.result(scope))
            self.assertEqual(health.native_api_status(self.config,scope,runner),1)
            runner.assert_called_once_with(['/opt/mw-integration-agent/.venv/bin/mw-integration-agent','native-api-probe','--scope',scope,'--config',health.CONFIG,'--catalogue','/etc/mw-integration-agent/service-catalogue.json'],70)
    def test_wrong_scope_manifest_and_unbounded_or_boolean_count_are_down(self):
        import json
        for value in [dict(authenticated=True,scope='olap',count=1,targetVersion=self.digest),dict(authenticated=True,scope='oltp',count=1,targetVersion='b'*64),dict(authenticated=True,scope='oltp',count=2,targetVersion=self.digest),dict(authenticated=True,scope='oltp',count=True,targetVersion=self.digest),dict(authenticated=False,scope='oltp',count=1,targetVersion=self.digest)]:
            self.assertEqual(health.native_api_status(self.config,'oltp',Mock(return_value=Mock(returncode=0,stdout=json.dumps(value)))),0)
    def test_missing_pin_does_not_invoke(self):
        runner=Mock()
        self.assertEqual(health.native_api_status({'conversation_api_enabled':True},'oltp',runner),0)
        runner.assert_not_called()
    def test_subprocess_failure_invalid_output_and_timeout_are_down(self):
        for runner in [Mock(return_value=Mock(returncode=1,stdout='')),Mock(return_value=Mock(returncode=0,stdout='not json')),Mock(side_effect=TimeoutError())]:
            self.assertEqual(health.native_api_status(self.config,'oltp',runner),0)
    def test_unknown_scope_refused_before_subprocess(self):
        runner=Mock()
        with self.assertRaises(ValueError):health.native_api_status(self.config,'other',runner)
        runner.assert_not_called()

if __name__=='__main__': unittest.main()
