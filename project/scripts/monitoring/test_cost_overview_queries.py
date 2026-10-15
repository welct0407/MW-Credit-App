"""Check real overview selectors: currencies, missing billing, and stale FX."""
import datetime as dt
import json
import subprocess
import sys

with open(sys.argv[1], encoding='utf-8-sig') as f:
    queries = next(p for p in json.load(f)['panels'] if p['id'] == 2)['targets']

def query(index, data, error=False):
    result = subprocess.run(['jq', '-c', queries[index]['root_selector']],
                            input=json.dumps(data), text=True, capture_output=True)
    if error:
        assert result.returncode != 0, result.stdout
        return
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)

assert query(0, {'properties': {'rows': [[2, 20260922, 'vm', 'USD'], [3, 20260922, 'disk', 'USD']]}})['amount'] == 5
assert query(0, {'properties': {'rows': []}})['amount'] == 0
query(0, {'properties': {'rows': [[2, 20260922, 'vm', 'SGD']]}}, error=True)
query(0, {'properties': {'rows': [], 'nextLink': 'more'}}, error=True)
query(0, {}, error=True)

def billing_row(net, currency='SGD'):
    return {'f': [{'v': None}, {'v': None}, {'v': None}, {'v': net},
                  {'v': 'Service'}, {'v': 'Resource'}, {'v': currency}]}

assert query(2, {'jobComplete': True, 'rows': [billing_row(None)]})['GCP'] is None
assert query(2, {'jobComplete': True, 'rows': []})['GCP'] is None
assert query(2, {'jobComplete': True, 'rows': [billing_row('10'), billing_row('-3')]})['GCP'] == 7
query(2, {'jobComplete': True, 'rows': [billing_row('10', 'USD')]}, error=True)
query(2, {'jobComplete': False}, error=True)
query(2, {'jobComplete': True, 'pageToken': 'more'}, error=True)
query(3, {'data': {'workspace': {'customer': {'currentUsage': None}}}}, error=True)
railway = query(3, {'data': {'workspace': {'customer': {
    'currentUsage': 2.5, 'billingPeriod': {
        'start': '2026-09-21T20:08:05.000Z', 'end': '2026-10-21T20:08:05.000Z'}}}}})
assert railway['RailwayUSD'] == 2.5 and railway['RailwayCycle'] == '22 Sep 2026 - 22 Oct 2026'

today = dt.datetime.now(dt.timezone.utc).date()
rate = {'base': 'USD', 'quote': 'SGD', 'rate': 1.2747, 'date': str(today)}
assert query(4, rate)['FX'] == 1.2747
query(4, dict(rate, date=str(today-dt.timedelta(days=8))), error=True)
query(4, dict(rate, rate=0), error=True)
query(4, dict(rate, base='EUR'), error=True)
print(json.dumps({'passed': 17, 'missingGcpRemainsNull': True, 'currencyAndFxGuards': True}))
