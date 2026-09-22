"""Exercise the actual Grafana jq selectors with missing, stale and failed data."""
import datetime as dt
import json
import subprocess
import sys

d=json.load(open(sys.argv[1],encoding='utf-8-sig'))
panels={p['id']:p for p in d['panels']}
now=dt.datetime.now(dt.timezone.utc)
fresh=now.strftime('%Y-%m-%dT%H:%M:%SZ')
stale=(now-dt.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
def point(t,value):return {'interval':{'endTime':t},'value':value}
def check(panel,data,expected):
    result=subprocess.run(['jq','-c',panels[panel]['targets'][0]['root_selector']],input=json.dumps(data),text=True,capture_output=True,check=True)
    actual=json.loads(result.stdout)['value']
    assert actual==expected,(panel,expected,actual)
checks=0
for value in range(5):
    check(52,{'timeSeries':[{'points':[point(fresh,{'int64Value':str(value)})]}]},value);checks+=1
for data in ({},{'timeSeries':[{'points':[point(stale,{'int64Value':'1'})]}]}):
    check(52,data,4);checks+=1
for states,expected in (([True,True,True],1),([False,False,False],0),([True,False,True],2),([True,True],4)):
    check(51,{'timeSeries':[{'points':[point(fresh,{'boolValue':v})]} for v in states]},expected);checks+=1
check(51,{'timeSeries':[{'points':[point(stale,{'boolValue':True})]} for _ in range(3)]},4);checks+=1
check(55,{'components':[]},4);checks+=1
print(json.dumps({'passed':checks,'staleAndMissingBecomeUnknown':True,'failedExternalChecksBecomeDown':True}))
