"""Synthetic jq fixtures; no provider reads or business actions."""
import datetime as dt,json,pathlib,subprocess,time,unittest
ROOT=pathlib.Path(__file__).parent
def sample(field,value,age=0,component=False):
    stamp=dt.datetime.fromtimestamp(time.time()-age,dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {'metric':{'labels':{'component' if component else 'field':field}},'points':[{'interval':{'endTime':stamp},'value':{'int64Value':str(value)}}]}
def query(file,data):
    code=(ROOT/file).read_text().replace('__FIELDS__','[{"key":"pending_images","label":"Waiting"}]')
    r=subprocess.run(['jq','-c',code],input=json.dumps(data),text=True,capture_output=True)
    if r.returncode:raise ValueError(r.stderr)
    return [json.loads(s) for s in r.stdout.splitlines()]
class Queries(unittest.TestCase):
    def test_current_waiting_and_zero_are_real_values(self):
        for value in (0,2):
            self.assertEqual(query('receipt-pipeline.jq',{'timeSeries':[sample('status',1),sample('pending_images',value)]})[0]['value'],value)
    def test_missing_stale_paused_skewed_malformed_are_unavailable(self):
        fixtures=[{}, {'timeSeries':[sample('status',1,400),sample('pending_images',0,400)]},
          {'timeSeries':[sample('status',3),sample('pending_images',0)]},
          {'timeSeries':[sample('status',1,-500),sample('pending_images',0,-500)]},
          {'timeSeries':[sample('status',1),sample('pending_images','invalid')]},
          {'timeSeries':[sample('status',0),sample('pending_images',0,120)]}]
        for data in fixtures:
            with self.subTest(data=data):self.assertIsNone(query('receipt-pipeline.jq',data)[0]['value'])
    def test_truncated_response_is_error(self):
        for name in ('receipt-pipeline.jq','receipt-trend.jq','debian-alert.jq'):
            with self.assertRaises(ValueError):query(name,{'nextPageToken':'more'})
    def test_missing_receipt_and_polling_page_but_others_preserved(self):
        result={r['component']:r['value'] for r in query('debian-alert.jq',{})}
        self.assertEqual([k for k,v in result.items() if v],['receipts','polling'])
    def test_critical_health_cases(self):
        for state,age,expected in [(0,0,1),(1,0,0),(2,0,1),(3,0,0),(4,0,1),(1,400,1),(1,-500,1),('invalid',0,1)]:
            with self.subTest(state=state,age=age):
                result={r['component']:r['value'] for r in query('debian-alert.jq',{'timeSeries':[sample('receipts',state,age,True)]})}
                self.assertEqual(result['receipts'],expected)
    def test_polling_pages_on_down_not_on_one_degraded_run(self):
        # The collector reports polling Degraded for a failed run with a success in the last 10 minutes and
        # Down once polling has stopped, so only Down, Unknown or missing telemetry page for polling.
        for state,age,expected in [(0,0,1),(1,0,0),(2,0,0),(3,0,0),(4,0,1),(1,400,1),('invalid',0,1)]:
            with self.subTest(state=state,age=age):
                result={r['component']:r['value'] for r in query('debian-alert.jq',{'timeSeries':[sample('polling',state,age,True)]})}
                self.assertEqual(result['polling'],expected)
        # Degraded still pages for every other component.
        result={r['component']:r['value'] for r in query('debian-alert.jq',{'timeSeries':[sample('tunnel',2,0,True)]})}
        self.assertEqual(result['tunnel'],1)
    def test_trend_rejects_invalid_counts(self):
        self.assertEqual(query('receipt-trend.jq',{'timeSeries':[sample('pending_images','bad')]}),[])
    def test_trend_does_not_connect_telemetry_outages(self):
        rows=query('receipt-trend.jq',{'timeSeries':[sample('pending_images',2,900),sample('pending_images',0)]})
        self.assertEqual([r['value'] for r in rows],[2,None,0])
if __name__=='__main__':unittest.main()
