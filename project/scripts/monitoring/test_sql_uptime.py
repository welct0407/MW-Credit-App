import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import MagicMock

spec=importlib.util.spec_from_file_location('health',Path(__file__).with_name('debian-health.py'))
health=importlib.util.module_from_spec(spec);spec.loader.exec_module(health)

class SqlUptimeTests(unittest.TestCase):
    def connection(self, **changes):
        values=dict(database='loan_manager_prod',role='mw_integration_agent',readonly='on',seconds=1294391,stamp=dt.datetime.now(dt.timezone.utc));values.update(changes)
        conn=MagicMock();conn.execute.return_value.fetchone.return_value=tuple(values.values());return conn,values

    def test_existing_reporting_read_exports_matching_pair(self):
        conn,v=self.connection();snapshot,stamp=health.sql_uptime_snapshot(conn)
        self.assertEqual(snapshot,{'status':1,'uptime_seconds':1294391})
        self.assertEqual(stamp,v['stamp'].isoformat())
        points=health.sql_uptime_series(snapshot,stamp,{'type':'gce_instance','labels':{'instance_id':'synthetic'}})
        self.assertEqual(len(points),2)
        self.assertTrue(all(p['points'][0]['interval']['endTime']==stamp for p in points))
        self.assertTrue(all(p['metric']['labels']['component']=='cloud_sql_prod' for p in points))
        self.assertEqual({p['metric']['labels']['field'] for p in points},{'status','uptime_seconds'})

    def test_failure_has_fresh_unknown_and_no_old_value(self):
        conn,_=self.connection();conn.execute.side_effect=RuntimeError('synthetic permission failure')
        snapshot,stamp=health.sql_uptime_snapshot(conn)
        self.assertEqual(snapshot,{'status':4})
        self.assertEqual(len(health.sql_uptime_series(snapshot,stamp,{})),1)
        self.assertLess(abs((dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(stamp)).total_seconds()),10)

    def test_wrong_binding_or_invalid_sample_is_unknown(self):
        for invalid in [dict(database='mw_agent'),dict(role='mw_agent_worker'),dict(readonly='off'),dict(seconds=-1),dict(seconds=1.5),dict(stamp=dt.datetime.now()),dict(stamp=dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=3))]:
            with self.subTest(invalid=invalid):
                conn,_=self.connection(**invalid);self.assertEqual(health.sql_uptime_snapshot(conn)[0],{'status':4})

if __name__=='__main__':unittest.main()
