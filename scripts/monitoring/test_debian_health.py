import datetime as dt
import importlib.util
import pathlib
import unittest

spec=importlib.util.spec_from_file_location('health', pathlib.Path(__file__).with_name('debian-health.py'))
health=importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)

class TimerHealthTests(unittest.TestCase):
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

if __name__=='__main__': unittest.main()
