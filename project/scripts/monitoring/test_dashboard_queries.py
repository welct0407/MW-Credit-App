"""Synthetic jq fixtures for the R089 dashboard selectors (fresh, stale, missing,
truncated and provider-error cases). No provider reads; requires jq on PATH.
Run: python3 -B project/scripts/monitoring/test_dashboard_queries.py"""
import datetime as dt
import json
import pathlib
import subprocess
import time
import unittest
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
DASHBOARDS = ROOT.parents[2] / 'infrastructure' / 'grafana' / 'dashboards'


def stamp(age=0):
    return dt.datetime.fromtimestamp(time.time() - age, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def ict(epoch):
    """HH:MM in the dashboards' Asia/Bangkok time."""
    return time.strftime('%H:%M', time.gmtime(epoch + 25200))


def stamp_s(text):
    return dt.datetime.strptime(text, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc).timestamp()


def point(age, value, kind='int64Value'):
    return {'interval': {'endTime': stamp(age)}, 'value': {kind: value if kind == 'boolValue' else str(value)}}


def series(points, **labels):
    return {'metric': {'labels': labels}, 'points': points}


def run(code, data):
    r = subprocess.run(['jq', '-c', code], input=json.dumps(data), text=True, capture_output=True)
    if r.returncode:
        raise ValueError(r.stderr)
    return [json.loads(line) for line in r.stdout.splitlines()]


def query(file, data, **subs):
    code = (ROOT / file).read_text()
    for key, value in subs.items():
        code = code.replace('__' + key + '__', value if isinstance(value, str) else json.dumps(value))
    return run(code, data)


FAILURES = ({'nextPageToken': 'more'}, {'error': {'code': 403, 'message': 'denied'}})


class StateTimeline(unittest.TestCase):
    def q(self, data, expected=1, stale=360):
        return query('state-timeline.jq', data, EXPECTED=str(expected), STALE=str(stale))

    def test_fresh_points_keep_their_state_without_tail(self):
        rows = self.q({'timeSeries': [series([point(240, 1), point(120, 2), point(0, 0)])]})
        self.assertEqual([r['value'] for r in rows], [1, 2, 0])

    def test_stale_and_missing_end_in_null_never_healthy(self):
        self.assertEqual([r['value'] for r in self.q({'timeSeries': [series([point(400, 1)])]})], [1, None, None])
        self.assertEqual([r['value'] for r in self.q({})], [None])
        self.assertEqual([r['value'] for r in self.q({'timeSeries': []})], [None])

    def test_stale_tail_ends_at_its_freshness_bound_then_unknown_to_now(self):
        rows = self.q({'timeSeries': [series([point(1200, 1)])]})
        times = [dt.datetime.strptime(r['time'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc).timestamp() for r in rows]
        self.assertEqual([r['value'] for r in rows], [1, None, None])
        self.assertEqual(times[1] - times[0], 360, 'state ends 360 s after the last point')
        self.assertAlmostEqual(times[2], time.time(), delta=2)
        # Aligned rows (720 s bound) likewise; a fresh newest point has no tail.
        aligned = self.q({'timeSeries': [series([point(1200, True, 'boolValue')])]}, stale=720)
        self.assertEqual(stamp_s(aligned[1]['time']) - stamp_s(aligned[0]['time']), 720)
        self.assertEqual([r['value'] for r in self.q({'timeSeries': [series([point(100, 1)])]})], [1])

    def test_gap_longer_than_stale_bound_is_broken(self):
        rows = self.q({'timeSeries': [series([point(1000, 1), point(0, 1)])]})
        self.assertEqual([r['value'] for r in rows], [1, None, 1])

    def test_aligned_bound_allows_five_minute_points(self):
        rows = self.q({'timeSeries': [series([point(600, True, 'boolValue'), point(300, False, 'boolValue')])]}, stale=720)
        self.assertEqual([r['value'] for r in rows], [1, 0])

    def test_worst_member_wins_and_missing_member_is_unknown(self):
        t = point(0, 1)['interval']
        members = [series([{'interval': t, 'value': {'int64Value': v}}]) for v in ('1', '2', '1')]
        self.assertEqual(self.q({'timeSeries': members}, expected=3)[0]['value'], 2)
        self.assertEqual(self.q({'timeSeries': members[:2]}, expected=3)[0]['value'], 4)
        down = members + [series([{'interval': t, 'value': {'int64Value': '0'}}])]
        self.assertEqual(self.q({'timeSeries': down}, expected=4)[0]['value'], 0)

    def test_invalid_and_future_samples(self):
        self.assertEqual(self.q({'timeSeries': [series([point(0, 9)])]})[0]['value'], 4)
        self.assertEqual([r['value'] for r in self.q({'timeSeries': [series([point(-600, 1)])]})], [None])

    def test_truncated_and_provider_error_fail_visibly(self):
        for data in FAILURES:
            with self.assertRaises(ValueError):
                self.q(data)


class SchedulerAttempts(unittest.TestCase):
    def q(self, data, hold=0):
        return query('scheduler-attempts.jq', data, STATUS_LABEL='status', HTTP_LABEL='http_status', PERIOD='300', HOLD=str(hold))

    def bucket(self, age, n, **labels):
        return series([point(age, n)], **labels)

    def test_successful_failed_and_blank_buckets(self):
        rows = self.q({'timeSeries': [self.bucket(600, 3, status='', http_status='200'), self.bucket(300, 1, status='', http_status='200')]})
        self.assertEqual([r['value'] for r in rows], [1, 1, None])
        self.assertEqual(self.q({'timeSeries': [self.bucket(0, 1, status='UNAVAILABLE', http_status='503'),
                                                self.bucket(0, 2, status='', http_status='200')]})[0]['value'], 0)
        self.assertEqual(self.q({'timeSeries': [self.bucket(0, 1, status='', http_status='503')]})[0]['value'], 0)
        self.assertEqual(self.q({'timeSeries': [self.bucket(0, 1, status='OK', http_status='204')]})[0]['value'], 1)

    def test_no_attempt_is_no_row_not_success(self):
        self.assertEqual(self.q({}), [])
        self.assertEqual(self.q({'timeSeries': [self.bucket(0, 0, status='', http_status='200')]}), [])

    def test_state_holds_until_the_next_expected_run(self):
        ok = dict(status='', http_status='200')
        # Hourly job (hold 3 900 s): runs an hour apart stay one continuous state, then empty 65 min after the last.
        rows = self.q({'timeSeries': [self.bucket(7500, 1, **ok), self.bucket(3900, 1, **ok)]}, hold=3900)
        self.assertEqual([r['value'] for r in rows], [1, 1, None])
        self.assertEqual(stamp_s(rows[2]['time']) - stamp_s(rows[1]['time']), 300 + 3900)
        # Still within the hold: no closing null, the state reaches now.
        self.assertEqual([r['value'] for r in self.q({'timeSeries': [self.bucket(600, 1, **ok)]}, hold=3900)], [1])
        # Every-minute job (hold 120 s): a 10-minute pause leaves an empty gap 2 minutes after the last attempt.
        rows = self.q({'timeSeries': [self.bucket(900, 1, **ok), self.bucket(0, 1, **ok)]}, hold=120)
        self.assertEqual([r['value'] for r in rows], [1, None, 1])
        self.assertEqual(stamp_s(rows[1]['time']) - stamp_s(rows[0]['time']), 300 + 120)

    def test_gap_between_buckets_is_blank(self):
        rows = self.q({'timeSeries': [self.bucket(3600, 1, status='', http_status='200'), self.bucket(0, 1, status='', http_status='200')]})
        self.assertEqual([r['value'] for r in rows], [1, None, 1, None])

    def test_truncated_and_provider_error_fail_visibly(self):
        for data in FAILURES:
            with self.assertRaises(ValueError):
                self.q(data)


class OpsHealth(unittest.TestCase):
    FIELDS = [{'key': 'pending', 'label': 'Pending'}, {'key': 'age', 'label': 'Age', 'state_key': 'state'},
              {'key': 'epoch', 'label': 'When', 'scale': 1000}]

    def q(self, data):
        return query('ops-health.jq', data, FIELDS=self.FIELDS)[0]

    def snapshot(self, sample_age, **values):
        t = point(sample_age, 0)['interval']
        return {'timeSeries': [series([{'interval': t, 'value': {'int64Value': str(v)}}], field=k) for k, v in values.items()]}

    def test_fresh_values_including_real_zero(self):
        self.assertEqual(self.q(self.snapshot(30, pending=0, age=50, state=1, epoch=10)), {'Pending': 0, 'Age': 50, 'When': 10000})

    def test_state_failed_and_overdue_become_codes(self):
        self.assertEqual(self.q(self.snapshot(0, pending=1, age=50, state=0, epoch=1))['Age'], -1)
        self.assertEqual(self.q(self.snapshot(0, pending=1, age=50, state=2, epoch=1))['Age'], -2)

    def test_missing_state_sample_makes_the_age_null(self):
        fields = [{'key': 'daily_charges_age_seconds', 'label': 'Daily charges', 'state_key': 'daily_charges_state'}]
        data = self.snapshot(0, daily_charges_age_seconds=5)
        self.assertEqual(query('ops-health.jq', data, FIELDS=fields)[0], {'Daily charges': None})
        data = self.snapshot(0, daily_charges_age_seconds=5, daily_charges_state=1)
        self.assertEqual(query('ops-health.jq', data, FIELDS=fields)[0], {'Daily charges': 5})

    def test_stale_missing_future_and_invalid_are_null(self):
        for data in (self.snapshot(400, pending=0, age=1, state=1, epoch=1), {}, self.snapshot(-300, pending=0, age=1, state=1, epoch=1)):
            with self.subTest(data=data):
                self.assertEqual(set(self.q(data).values()), {None})
        self.assertIsNone(self.q(self.snapshot(0, pending='x', age=1, state=1, epoch=1))['Pending'])
        self.assertIsNone(self.q(self.snapshot(0, pending=-1, age=1, state=1, epoch=1))['Pending'])

    def test_field_missing_from_the_newest_run_keeps_its_newest_fresh_sample(self):
        # FINAL3-1: Poll age is left out of a run while a poll is running; its sample of 2 minutes ago still shows.
        data = self.snapshot(0, pending=3)
        data['timeSeries'] += self.snapshot(120, age=40, state=1, epoch=7)['timeSeries']
        self.assertEqual(self.q(data), {'Pending': 3, 'Age': 40, 'When': 7000})
        # Older than 360 s: no report, never a stretched value.
        stale = self.snapshot(0, pending=3)
        stale['timeSeries'] += self.snapshot(400, age=40, state=1, epoch=7)['timeSeries']
        self.assertEqual(self.q(stale), {'Pending': 3, 'Age': None, 'When': None})

    def test_newest_fresh_sample_wins_and_state_comes_from_its_run(self):
        t_new, t_old = point(0, 0)['interval'], point(120, 0)['interval']
        rows = [series([{'interval': t_old, 'value': {'int64Value': '9'}}, {'interval': t_new, 'value': {'int64Value': '5'}}], field='pending'),
                series([{'interval': t_old, 'value': {'int64Value': '50'}}], field='age'),
                series([{'interval': t_new, 'value': {'int64Value': '0'}}], field='state')]
        # Pending: the newest of its own samples. Age: its run has no state sample (the state is from a newer run), so null.
        self.assertEqual(self.q({'timeSeries': rows}), {'Pending': 5, 'Age': None, 'When': None})

    def test_truncated_and_provider_error_fail_visibly(self):
        for data in FAILURES:
            with self.assertRaises(ValueError):
                self.q(data)


class GcpStatus(unittest.TestCase):
    def incident(self, product='Cloud Run', locations=(), end=None):
        return {'external_desc': 'Elevated errors', 'end': end, 'affected_products': [{'title': product}],
                'currently_affected_locations': [{'id': x} for x in locations],
                'most_recent_update': {'status': 'SERVICE_DISRUPTION', 'when': '2026-10-22T03:00:00+00:00'}}

    def status(self, data):
        return query('gcp-status.jq', data)[0]['status']

    def test_fresh_feed(self):
        self.assertEqual(self.status([]), 1)
        self.assertEqual(self.status([self.incident()]), 2)
        self.assertEqual(self.status([self.incident('Google Cloud SQL', ['asia-southeast1'])]), 2)
        self.assertEqual(self.status([self.incident('Vertex AI Gemini API', ['global'])]), 2)

    def test_unrelated_closed_or_elsewhere_is_no_incident(self):
        self.assertEqual(self.status([self.incident('BigQuery')]), 1)
        self.assertEqual(self.status([self.incident(end='2026-10-22T04:00:00+00:00')]), 1)
        self.assertEqual(self.status([self.incident(locations=['us-central1'])]), 1)

    def test_unreadable_feed_is_unknown(self):
        for data in ({}, {'error': 'unavailable'}, [{'affected_products': 'x'}], ['x']):
            with self.subTest(data=data):
                self.assertEqual(self.status(data), 4)


class BackupAge(unittest.TestCase):
    ROWS = [{'component': 'cloud_sql_backup', 'label': 'SQL', 'age': 'age_seconds', 'status': 'status', 'red': 108000},
            {'component': 'metabase_pitr', 'label': 'PITR', 'age': 'archive_age_seconds', 'status': 'status', 'status_is_state': True}]

    def q(self, data):
        return {r['Source']: (r['Age'], r['State']) for r in query('backup-age.jq', data, ROWS=self.ROWS)}

    def sample(self, component, age, **values):
        t = point(age, 0)['interval']
        return [series([{'interval': t, 'value': {'int64Value': str(v)}}], component=component, field=k) for k, v in values.items()]

    def test_fresh_within_and_beyond_grace(self):
        data = {'timeSeries': self.sample('cloud_sql_backup', 0, age_seconds=25200, status=1) + self.sample('metabase_pitr', 0, archive_age_seconds=720, status=2)}
        self.assertEqual(self.q(data), {'SQL': (25200, 1), 'PITR': (720, 2)})
        self.assertEqual(self.q({'timeSeries': self.sample('cloud_sql_backup', 0, age_seconds=120000, status=1)})['SQL'], (120000, 0))
        self.assertEqual(self.q({'timeSeries': self.sample('cloud_sql_backup', 0, age_seconds=100, status=0)})['SQL'], (100, 0))

    def test_stale_and_missing_are_unknown(self):
        self.assertEqual(self.q({'timeSeries': self.sample('cloud_sql_backup', 400, age_seconds=10, status=1)})['SQL'], (None, 4))
        self.assertEqual(self.q({}), {'SQL': (None, 4), 'PITR': (None, 4)})
        # A reported Unknown state (PITR status 4) or a missing status field shows no age.
        self.assertEqual(self.q({'timeSeries': self.sample('metabase_pitr', 0, archive_age_seconds=720, status=4)})['PITR'], (None, 4))
        self.assertEqual(self.q({'timeSeries': self.sample('cloud_sql_backup', 0, age_seconds=100)})['SQL'], (None, 4))

    def test_truncated_and_provider_error_fail_visibly(self):
        for data in FAILURES:
            with self.assertRaises(ValueError):
                self.q(data)


class Freshness(unittest.TestCase):
    def test_age_of_newest_point_and_missing(self):
        rows = query('freshness.jq', {'timeSeries': [series([point(400, 1), point(42, 1)])]}, LABEL='Collector')
        self.assertEqual(rows[0]['Source'], 'Collector')
        self.assertTrue(41 <= rows[0]['Age'] <= 44)
        self.assertEqual(query('freshness.jq', {}, LABEL='Collector')[0]['Age'], None)
        self.assertTrue(query('freshness.jq', {'timeSeries': [series([point(900, 1)])]}, LABEL='x')[0]['Age'] >= 900)

    def test_truncated_and_provider_error_fail_visibly(self):
        for data in FAILURES:
            with self.assertRaises(ValueError):
                query('freshness.jq', data, LABEL='x')


class Counters(unittest.TestCase):
    def test_sum_points(self):
        self.assertEqual(query('sum-points.jq', {'timeSeries': [series([point(0, 2), point(300, 3)]), series([point(0, 1)])]}), [{'value': 6}])
        self.assertEqual(query('sum-points.jq', {}), [])
        for data in FAILURES:
            with self.assertRaises(ValueError):
                query('sum-points.jq', data)

    def test_sum_by_label_uses_the_data_vocabulary(self):
        data = {'timeSeries': [series([point(0, 4)], warning='none'), series([point(0, 1), point(300, 1)], warning='non_thb'),
                               series([point(0, 1)], warning='none')]}
        self.assertEqual(query('sum-by-label.jq', data, LABEL='warning'), [{'Outcome': 'none', 'Count': 5}, {'Outcome': 'non_thb', 'Count': 2}])
        self.assertEqual(query('sum-by-label.jq', {}, LABEL='warning'), [])
        for data in FAILURES:
            with self.assertRaises(ValueError):
                query('sum-by-label.jq', data, LABEL='warning')


class CloudRunByService(unittest.TestCase):
    def data(self):
        def s(name, pts):
            return {'resource': {'labels': {'service_name': name}}, 'points': [{'interval': {'endTime': stamp(a)}, 'value': {'doubleValue': v}} for a, v in pts]}
        return {'timeSeries': [s('mw-credit-app-read-prod', [(600, 0.2), (0, 0.4)]), s('mw-credit-app-jobs-dev', [])]}

    def test_last_sum_and_absent_services(self):
        self.assertEqual(query('cloudrun-by-service.jq', self.data(), COLUMN='CPU p95', MODE='last'), [{'Service': 'read-prod', 'CPU p95': 0.4}])
        self.assertAlmostEqual(query('cloudrun-by-service.jq', self.data(), COLUMN='Billable', MODE='sum')[0]['Billable'], 0.6)
        self.assertEqual(query('cloudrun-by-service.jq', {}, COLUMN='x', MODE='last'), [])
        for bad in FAILURES:
            with self.assertRaises(ValueError):
                query('cloudrun-by-service.jq', bad, COLUMN='x', MODE='last')


class CostQueries(unittest.TestCase):
    def test_prior_azure_counts_days_up_to_today(self):
        today = dt.datetime.now(dt.timezone.utc)
        prev = (today.replace(day=1) - dt.timedelta(days=1))
        def day(d):
            return int(prev.strftime('%Y%m') + '%02d' % d)
        rows = [[1.5, day(1), 'vm', 'USD'], [2.0, day(min(today.day, 28)), 'vm', 'USD'], [9.0, day(28) if today.day < 28 else day(1), 'disk', 'USD']]
        expected = 1.5 + 2.0 + (0 if today.day < 28 else 9.0)
        self.assertAlmostEqual(query('cost-prior-azure.jq', {'properties': {'rows': rows}})[0]['amount'], expected)
        # The shifted Bangkok window can reach the last UTC day of the month before: never counted.
        older = (prev.replace(day=1) - dt.timedelta(days=1))
        stray = [[50.0, int(older.strftime('%Y%m%d')), 'vm', 'USD'], [60.0, int(today.strftime('%Y%m%d')), 'vm', 'USD']]
        self.assertAlmostEqual(query('cost-prior-azure.jq', {'properties': {'rows': rows + stray}})[0]['amount'], expected)
        self.assertEqual(query('cost-prior-azure.jq', {'properties': {'rows': []}})[0]['amount'], 0)
        for bad in ({'properties': {'nextLink': 'x', 'rows': []}}, {'properties': {}}, {'properties': {'rows': [[1, day(1), 'vm', 'EUR']]}}):
            with self.assertRaises(ValueError):
                query('cost-prior-azure.jq', bad)

    def test_gcp_by_service(self):
        def row(*values):
            return {'f': [{'v': v} for v in values]}
        data = {'jobComplete': True, 'rows': [row('Cloud Run', '1.5', '-0.5', 'SGD'), row('Cloud SQL', '4.0', '0', 'SGD')]}
        self.assertEqual(query('gcp-by-service.jq', data),
                         [{'Service': 'Cloud SQL', 'SGD': 4.0}, {'Service': 'Cloud Run', 'SGD': 1.5}, {'Service': 'Credits', 'SGD': -0.5}])
        self.assertEqual(query('gcp-by-service.jq', {'jobComplete': True, 'rows': [row(None, None, None, 'SGD')]}), [])
        for bad in ({'jobComplete': False}, {'jobComplete': True, 'pageToken': 'x'}, {'jobComplete': True, 'rows': [row('Cloud Run', '1', '0', 'USD')]}):
            with self.assertRaises(ValueError):
                query('gcp-by-service.jq', bad)


def budget(name='Budget-GCP', projects=None, amount=None, period='MONTH'):
    """Shape of the live list response (22 Oct 2026): no projects filter, units a string, nanos absent when 0."""
    f = {'calendarPeriod': period, 'creditTypesTreatment': 'INCLUDE_ALL_CREDITS'}
    if projects is not None:
        f['projects'] = list(projects)
    return {'name': 'billingAccounts/0125EC-78CB0F-A74AAD/budgets/026a78dc-' + name.lower(), 'displayName': name, 'budgetFilter': f,
            'amount': amount or {'specifiedAmount': {'currencyCode': 'SGD', 'units': '20'}},
            'thresholdRules': [{'spendBasis': 'CURRENT_SPEND', 'thresholdPercent': p} for p in (0.5, 0.9, 1)]}


class BudgetQuery(unittest.TestCase):
    """budget.jq on the Cloud Billing Budget API v1 list response."""
    def q(self, data):
        return query('budget.jq', data)

    def test_specified_monthly_budget(self):
        self.assertEqual(self.q({'budgets': [budget()]}), [{'Name': 'Budget-GCP', 'Kind': 'specified', 'SGD': 20, 'Scope': 'whole billing account'}])
        cents = budget(amount={'specifiedAmount': {'currencyCode': 'SGD', 'units': '20', 'nanos': 500000000}}, projects=['projects/737787224638'])
        self.assertEqual(self.q({'budgets': [cents]})[0], {'Name': 'Budget-GCP', 'Kind': 'specified', 'SGD': 20.5, 'Scope': 'projects projects/737787224638'})

    def test_two_budgets_keep_budget_gcp(self):
        other = budget('Other', amount={'specifiedAmount': {'currencyCode': 'SGD', 'units': '99'}})
        self.assertEqual(self.q({'budgets': [other, budget()]})[0]['SGD'], 20)
        with self.assertRaises(ValueError):
            self.q({'budgets': [budget(), budget()]})

    def test_none_is_no_budget_not_zero(self):
        for data in ({}, {'budgets': []}, {'budgets': [budget('Other')]}):
            self.assertEqual(self.q(data), [{'Name': None, 'Kind': 'none', 'SGD': None, 'Scope': None}])

    def test_last_period_amount_has_no_fixed_amount(self):
        self.assertEqual(self.q({'budgets': [budget(amount={'lastPeriodAmount': {}})]}),
                         [{'Name': 'Budget-GCP', 'Kind': 'last period', 'SGD': None, 'Scope': 'whole billing account'}])

    def test_non_sgd_non_monthly_truncated_and_error_fail_visibly(self):
        bad = ({'budgets': [budget(amount={'specifiedAmount': {'currencyCode': 'USD', 'units': '20'}})]},
               {'budgets': [budget(amount={'specifiedAmount': {'units': '20'}})]},
               {'budgets': [budget(period='QUARTER')]},
               {'budgets': [budget()], 'nextPageToken': 'more'},
               {'error': {'code': 403, 'message': 'denied', 'status': 'PERMISSION_DENIED'}},
               {'budgets': {}}, [])
        for data in bad:
            with self.assertRaises(ValueError, msg=data):
                self.q(data)


class RailwayStatus(unittest.TestCase):
    """railway-status.jq on railway.instatus.com/summary.json (live shape when healthy: page only)."""
    UP = {'page': {'name': 'Railway', 'url': 'https://status.railway.com', 'status': 'UP'}}

    def q(self, data):
        return query('railway-status.jq', data)[0]['status']

    def test_up_is_no_incident(self):
        self.assertEqual(self.q(self.UP), 1)
        self.assertEqual(self.q(dict(self.UP, activeIncidents=[], activeMaintenances=[{'name': 'Later', 'status': 'NOTSTARTEDYET'}])), 1)

    def test_has_issues_and_incidents(self):
        partial = {'name': 'Builds delayed', 'impact': 'PARTIALOUTAGE', 'status': 'INVESTIGATING'}
        self.assertEqual(self.q({'page': dict(self.UP['page'], status='HASISSUES')}), 2)
        self.assertEqual(self.q(dict(self.UP, activeIncidents=[partial])), 2)
        rows = query('railway-status.jq', {'page': dict(self.UP['page'], status='HASISSUES'), 'activeIncidents': [partial]})
        self.assertEqual(rows[0]['details'], 'Builds delayed · PARTIALOUTAGE')
        self.assertEqual(self.q({'page': dict(self.UP['page'], status='HASISSUES'), 'activeIncidents': [dict(partial, impact='MAJOROUTAGE')]}), 0)

    def test_maintenance(self):
        self.assertEqual(self.q({'page': dict(self.UP['page'], status='UNDERMAINTENANCE')}), 3)
        self.assertEqual(self.q(dict(self.UP, activeMaintenances=[{'name': 'DB upgrade', 'status': 'INPROGRESS'}])), 3)

    def test_unreadable_feed(self):
        up = self.UP
        for data in ({}, [], {'page': {}}, {'page': {'status': 1}}, dict(up, activeIncidents={}), {'page': dict(up['page'], status='SOMETHINGNEW')}):
            self.assertEqual(self.q(data), 4, data)


class ProviderModel(unittest.TestCase):
    """provider-model.jq: newest run's provider code and its model:<id> field as one text value."""
    @staticmethod
    def data(code, model=None, age=0, model_age=None):
        rows = [series([point(age, code)], field='provider')]
        if model:
            rows.append(series([point(age if model_age is None else model_age, 1)], field='model:' + model))
        return {'timeSeries': rows}

    def q(self, data):
        return query('provider-model.jq', data)[0]['Provider']

    def test_provider_and_model(self):
        self.assertEqual(self.q(self.data(1, 'gemini-3.5-flash-lite')), 'Gemini · gemini-3.5-flash-lite')
        self.assertEqual(self.q(self.data(2, 'gpt-5.5')), 'Codex · gpt-5.5')
        self.assertEqual(self.q(self.data(3)), 'Claude')

    def test_model_of_an_older_run_is_not_shown(self):
        self.assertEqual(self.q(self.data(1, 'gemini-2.5-flash', age=0, model_age=600)), 'Gemini')

    def test_stale_unknown_and_failures(self):
        self.assertIsNone(self.q(self.data(1, 'gemini-3.5-flash-lite', age=400)))
        self.assertIsNone(self.q(self.data(9)))
        self.assertIsNone(self.q({}))
        for bad in FAILURES:
            with self.assertRaises(ValueError):
                query('provider-model.jq', bad)


def sgt_midnight_ms(date):
    return int(dt.datetime(date.year, date.month, date.day, tzinfo=dt.timezone(dt.timedelta(hours=8))).timestamp()) * 1000


def merge_by_time(frames):
    """Grafana merge on the shared Time field: one row per date, null where a frame has no row."""
    names = [n for f in frames for n in f['fields']]
    rows = {}
    for f in frames:
        for r in f['rows']:
            rows.setdefault(r['Time'], {n: None for n in names}).update(r)
    return {'fields': ['Time'] + [n for n in names if n != 'Time'], 'rows': [rows[t] for t in sorted(rows)]}


def binary(frame, alias, left, op, right):
    """Grafana calculateField binary: no field when an input field is missing; JS null arithmetic otherwise."""
    if left not in frame['fields'] or right not in frame['fields']:
        return
    frame['fields'].append(alias)
    for r in frame['rows']:
        a, b = r[left] or 0, r[right] or 0
        r[alias] = a + b if op == '+' else a * b


class GeneratedSelectors(unittest.TestCase):
    """Composite selectors exactly as the builder wrote them into the dashboards."""
    def panel(self, uid, pid):
        spec = json.loads((DASHBOARDS / (uid + '.json')).read_text())['spec']
        for p in spec['panels']:
            if p['id'] == pid:
                return p
            for c in p.get('panels', []):
                if c['id'] == pid:
                    return c
        raise KeyError(pid)

    def test_provider_status_reads_railway_not_openai(self):
        for uid, pid in (('mw-now', 17), ('mw-agent', 11)):
            t = self.panel(uid, pid)['targets']
            self.assertEqual((t[0]['url'], t[0]['datasource']['uid']), ('https://railway.instatus.com/summary.json', 'cfz10a9eaokjkd'))
            self.assertEqual(run(t[0]['root_selector'], RailwayStatus.UP)[0]['status'], 1)
            self.assertEqual(t[1]['url'], 'https://status.cloud.google.com/incidents.json')
        for uid in ('mw-now', 'mw-agent', 'mw-pwa', 'mw-infra', 'mw-cost'):
            self.assertNotIn('openai', (DASHBOARDS / (uid + '.json')).read_text().lower(), uid)

    def test_metabase_charts_send_one_railway_call(self):
        # R090: one call per chart (both services aliased, usage and limit together), one row per timestamp.
        data = {'data': {
            'Metabase': [{'measurement': 'MEMORY_USAGE_GB', 'values': [{'ts': 200, 'value': 1.8}, {'ts': 100, 'value': 1.7}]},
                         {'measurement': 'MEMORY_LIMIT_GB', 'values': [{'ts': 100, 'value': 2}, {'ts': 200, 'value': 2}]}],
            'Postgres': [{'measurement': 'MEMORY_USAGE_GB', 'values': [{'ts': 100, 'value': 0.3}]},
                         {'measurement': 'MEMORY_LIMIT_GB', 'values': [{'ts': 100, 'value': 0.5}]}]}}
        for pid, usage, limit in ((14, 'CPU_USAGE', 'CPU_LIMIT'), (15, 'MEMORY_USAGE_GB', 'MEMORY_LIMIT_GB')):
            targets = self.panel('mw-infra', pid)['targets']
            self.assertEqual(len(targets), 1, pid)
            query = json.loads(targets[0]['url_options']['data'])['query']
            self.assertEqual(query.count('metrics('), 2, pid)
            self.assertEqual(query.count('measurements:[' + usage + ',' + limit + ']'), 2, pid)
            self.assertEqual([c['text'] for c in targets[0]['columns']], ['Time', 'Metabase', 'Postgres', 'Metabase limit', 'Postgres limit'])
        rows = run(targets[0]['root_selector'], data)
        self.assertEqual(rows, [{'time': 100000, 'Metabase': 1.7, 'Metabase limit': 2, 'Postgres': 0.3, 'Postgres limit': 0.5},
                                {'time': 200000, 'Metabase': 1.8, 'Metabase limit': 2}])
        with self.assertRaises(ValueError):
            run(targets[0]['root_selector'], {'errors': [{'message': 'rate limited'}]})

    def test_recognizer_shows_provider_and_model(self):
        for uid, pid, component in (('mw-pwa', 33, 'recognizer'), ('mw-agent', 12, 'recognizer')):
            p = self.panel(uid, pid)
            t = next(x for x in p['targets'] if x['columns'][0]['selector'] == 'Provider')
            self.assertIn('metric.labels.component = "' + component + '"', urllib.parse.unquote(t['url']))
            self.assertEqual(run(t['root_selector'], ProviderModel.data(1, 'gemini-3.5-flash-lite')), [{'Provider': 'Gemini · gemini-3.5-flash-lite'}])
            self.assertRegex('Provider', p['options']['reduceOptions']['fields'].strip('/'))

    def test_notifications_age_from_scheduler_buckets(self):
        sel = self.panel('mw-now', 7)['targets'][1]['root_selector']
        self.assertEqual(run(sel, {}), [{'Notifications': None}])
        ok = {'timeSeries': [series([point(0, 1)], status='', http_status='200')]}
        self.assertIsInstance(run(sel, ok)[0]['Notifications'], int)
        bad = {'timeSeries': [series([point(0, 1)], status='UNAVAILABLE', http_status='503')]}
        self.assertEqual(run(sel, bad)[0]['Notifications'], -1)
        with self.assertRaises(ValueError):
            run(sel, {'nextPageToken': 'x'})

    def test_prod_only_panels_are_empty_on_dev(self):
        sel = self.panel('mw-pwa', 21)['targets'][0]['root_selector']
        self.assertEqual(run(sel.replace('${env}', 'dev'), {}), [])
        self.assertEqual(set(run(sel.replace('${env}', 'prod'), {})[0].values()), {None})

    def test_scan_keeps_the_newest_completion_in_the_window(self):
        sel = self.panel('mw-now', 4)['targets'][0]['root_selector']
        self.assertEqual(sel, self.panel('mw-agent', 1)['targets'][0]['root_selector'])
        done = int(time.time()) - 720
        # A scan is running now (last_completion 0 in the newest run); the previous completion 12 minutes ago is kept.
        data = {'timeSeries': [series([point(240, 1), point(0, 1)], field='status'),
                               series([point(240, done), point(0, 0)], field='last_completion')]}
        self.assertEqual(run(sel, data), [{'details': 'Last scan completion', 'status': '1|' + ict(done)}])
        # Freshness unchanged: a stale status sample gives no time; no positive completion gives none either.
        stale = {'timeSeries': [series([point(400, 1)], field='status'), series([point(400, done)], field='last_completion')]}
        self.assertEqual(run(sel, stale)[0]['status'], None)
        self.assertEqual(run(sel, {'timeSeries': [series([point(0, 1)], field='status'), series([point(0, 0)], field='last_completion')]})[0]['status'], '1|no run')
        with self.assertRaises(ValueError):
            run(sel, {'nextPageToken': 'x'})

    def test_metabase_backup_rows_carry_their_age(self):
        targets = {t['refId']: t for t in self.panel('mw-now', 19)['targets']}
        targets = [targets['S'], targets['B'], targets['C']]
        created = stamp(5 * 3600)
        data = {'data': {'volumeInstanceBackupScheduleList': [{'id': 'd', 'kind': 'DAILY', 'cron': '0 3 * * *', 'retentionSeconds': 604800, 'createdAt': stamp(864000)},
                                                              {'id': 'w', 'kind': 'WEEKLY', 'cron': '0 4 * * 0', 'retentionSeconds': 2419200, 'createdAt': stamp(864000)}],
                         'volumeInstanceBackupList': [{'scheduleId': 'd', 'createdAt': created}, {'scheduleId': 'w', 'createdAt': stamp(3 * 86400)}]}}
        daily, weekly = run(targets[1]['root_selector'], data)[0], run(targets[2]['root_selector'], data)[0]
        self.assertEqual((daily['Source'], daily['State']), ('Metabase daily', 1))
        self.assertAlmostEqual(daily['Age'], 5 * 3600, delta=5)
        self.assertEqual(weekly['Source'], 'Metabase weekly')
        self.assertAlmostEqual(weekly['Age'], 3 * 86400, delta=5)
        # No scheduled snapshot or an API error: no age, and the state says why (never OK without an age).
        none = run(targets[1]['root_selector'], {'data': {'volumeInstanceBackupScheduleList': data['data']['volumeInstanceBackupScheduleList'], 'volumeInstanceBackupList': []}})[0]
        self.assertEqual((none['Age'], none['State']), (None, 0))
        err = run(targets[1]['root_selector'], {'errors': [{'message': 'x'}]})[0]
        self.assertEqual((err['Age'], err['State']), (None, 4))

    def test_backup_rows_stay_when_the_railway_read_fails(self):
        # FINAL4-4: the fixed source list merges with the frames by Source; a failed query (no frame) leaves
        # its row with no age and no state (shown as — and Unknown), in the fixed order.
        targets = {t['refId']: t for t in self.panel('mw-now', 19)['targets']}
        sources = run(targets['S']['root_selector'], json.loads(targets['S']['data']))
        collector = run(targets['A']['root_selector'], {'timeSeries': [series([point(0, 3600)], component='cloud_sql_backup', field='age_seconds'),
                                                                        series([point(0, 1)], component='cloud_sql_backup', field='status')]})
        rows = {r['Source']: dict(r) for r in sources}
        for frame in (collector,):  # B and C (Railway) failed: no frames
            for r in frame:
                rows[r['Source']].update(r)
        self.assertEqual(list(rows), ['Cloud SQL backup', 'Debian snapshot', 'Metabase daily', 'Metabase weekly', 'PITR archive', 'Audit retention'])
        self.assertEqual(rows['Metabase daily'], {'Source': 'Metabase daily'})
        self.assertEqual(rows['Metabase weekly'], {'Source': 'Metabase weekly'})
        mappings = next(o for o in self.panel('mw-now', 19)['fieldConfig']['overrides'] if o['matcher']['options'] == 'State')['properties']
        null_text = [m['options']['result']['text'] for p in mappings if p['id'] == 'mappings' for m in p['value'] if m['type'] == 'special']
        self.assertEqual(null_text, ['Unknown'])

    def test_payment_stage_selectors(self):
        p = self.panel('mw-now', 4)
        scan = run(p['targets'][0]['root_selector'], {})
        self.assertEqual([r['status'] for r in scan], [None])
        done = int(time.time()) - 90
        fresh = {'timeSeries': [series([point(0, v)], field=k) for k, v in (('status', 1), ('last_completion', done), ('running', 0))]}
        self.assertEqual(run(p['targets'][0]['root_selector'], fresh), [{'details': 'Last scan completion', 'status': '1|' + ict(done)}])
        stage = run(p['targets'][1]['root_selector'], {})
        self.assertEqual(stage, [{'2 · Extract · waiting': None}])

    def test_pipeline_stages_are_coloured_by_their_rules(self):
        # COLOUR-2: "<state code>|<value>"; 0 red, 1 green, 2 orange, shown on its state colour.
        def snap(**fields):
            return {'timeSeries': [series([point(30, v)], field=k) for k, v in dict(status=1, **fields).items()]}
        def stage(uid, pid, ref, data):
            return list(run(self.rows(uid, pid)[ref]['root_selector'], data)[0].values())[0]
        # Extraction waiting: green unless the oldest waiting image is older than 600 s (stalled).
        self.assertEqual(stage('mw-now', 4, 'B', snap(pending_images=3, oldest_pending_seconds=120)), '1|3')
        self.assertEqual(stage('mw-agent', 1, 'B', snap(pending_images=3, oldest_pending_seconds=900)), '2|3')
        # Holds, unconfirmed postings, notification failures: green at 0, red above.
        self.assertEqual(stage('mw-now', 4, 'C', snap(unnotified_holds=0)), '1|0')
        self.assertEqual(stage('mw-agent', 1, 'F', snap(failed_notifications=2)), '0|2')
        # Reviews: overdue count orange above 0 (Now); waiting green unless one is overdue (Agent).
        self.assertEqual(stage('mw-now', 4, 'D', snap(overdue_reviews=1)), '2|1')
        self.assertEqual(stage('mw-agent', 1, 'D', snap(pending_reviews=4, overdue_reviews=0)), '1|4')
        self.assertEqual(stage('mw-agent', 1, 'D', snap(pending_reviews=4, overdue_reviews=1)), '2|4')
        # Paused or stale telemetry: no value (shown as —), never green.
        self.assertIsNone(stage('mw-now', 4, 'C', {'timeSeries': [series([point(30, 3)], field='status'), series([point(30, 0)], field='unnotified_holds')]}))
        self.assertIsNone(stage('mw-now', 4, 'C', {'timeSeries': [series([point(400, 1)], field='status'), series([point(400, 0)], field='unnotified_holds')]}))
        # Scan: the IG polling state colours the time.
        scan = self.rows('mw-now', 4)['A']['root_selector']
        degraded = {'timeSeries': [series([point(0, 2)], field='status'), series([point(0, 1761100000)], field='last_completion')]}
        self.assertEqual(run(scan, degraded)[0]['status'], '2|' + ict(1761100000))
        self.assertEqual(run(scan, {'timeSeries': [series([point(0, 0)], field='status')]})[0]['status'], '0|no run')

    def test_metabase_probe_details_are_one_line(self):
        targets = self.panel('mw-infra', 17)['targets']
        fresh = {'timeSeries': [series([point(0, v)], field=k) for k, v in (('status', 1), ('http_code', 200), ('duration_ms', 412))]}
        platform = run(targets[0]['root_selector'], fresh)[0]
        self.assertEqual(platform, {'status': 1, 'details': '▦ Platform — Healthy · HTTP 200 · 412 ms'})
        self.assertEqual(run(targets[0]['root_selector'], {})[0]['details'], '▦ Platform — Unknown · HTTP Unavailable · Unavailable')
        pitr = {'timeSeries': [series([point(0, v)], field=k) for k, v in
                               (('status', 1), ('last_archived', int(time.time()) - 120), ('archive_age_seconds', 120), ('backup_sets', 2))]}
        self.assertEqual(run(targets[6]['root_selector'], pitr)[0]['details'], '🛡 PITR archive — Healthy · lag 2 minutes')
        backups = {'data': {'volumeInstanceBackupScheduleList': [{'id': 's', 'kind': 'DAILY', 'cron': '0 3 * * *', 'retentionSeconds': 604800, 'createdAt': stamp(864000)}],
                            'volumeInstanceBackupList': [{'scheduleId': 's', 'createdAt': stamp(7300)}]}}
        self.assertEqual(run(targets[4]['root_selector'], backups)[0]['details'], '💾 Daily backup — Healthy · 2 hours old')
        for t in targets:
            self.assertNotIn('\n', run(t['root_selector'], {})[0]['details'])

    def rows(self, uid, pid):
        return {t['refId']: t for t in self.panel(uid, pid)['targets']}

    def at(self, sel, start, data):
        """Run a row selector with ${__from} = start (epoch s); times back as epoch s."""
        out = run(sel.replace('${__from}', str(start * 1000)), data)
        return [(int(dt.datetime.strptime(r['time'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc).timestamp()), r['value']) for r in out]

    def assert_starts_at(self, events, start):
        self.assertEqual(events[0][0], start, 'row starts exactly at the range start')
        self.assertTrue(all(start <= t <= time.time() + 1 for t, _ in events), 'no event before the start or after now')

    def test_state_rows_start_at_the_range_start(self):
        rows = self.rows('mw-now', 1)
        start = int(time.time()) - 3 * 3600
        def p(t, v, kind='int64Value'):
            return {'interval': {'endTime': dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
                    'value': {kind: v if kind == 'boolValue' else str(v)}}
        # Collector row (Hosting): the last report before the start is carried to the start.
        ev = self.at(rows['A']['root_selector'], start, {'timeSeries': [series([p(start - 100, 1), p(start - 40, 2), p(start + 20, 1)])]})
        self.assertEqual(ev[:2], [(start, 2), (start + 20, 1)])
        self.assert_starts_at(ev, start)
        # Aligned Cloud SQL row: the 300 s bucket ending 4 min after the start would otherwise start the row late.
        sql = self.at(rows['F']['root_selector'], start, {'timeSeries': [series([p(start - 60, True, 'boolValue'), p(start + 240, True, 'boolValue')])]})
        self.assertEqual(sql[:2], [(start, 1), (start + 240, 1)])
        self.assert_starts_at(sql, start)
        # Stale carried state becomes null, never a stretched old state; nothing before the start is null too.
        stale = self.at(rows['A']['root_selector'], start, {'timeSeries': [series([p(start - 1000, 1), p(start + 600, 1)])]})
        self.assertEqual(stale[:2], [(start, None), (start + 600, 1)])
        empty = self.at(rows['A']['root_selector'], start, {'timeSeries': [series([p(start + 60, 0)])]})
        self.assertEqual(empty[:2], [(start, None), (start + 60, 0)])
        self.assertEqual(self.at(rows['A']['root_selector'], start, {})[0], (start, None))
        # Generated row, stale tail: a last report 20 minutes old ends 360 s later, Unknown from there to now.
        tail = self.at(rows['A']['root_selector'], start, {'timeSeries': [series([p(int(time.time()) - 1200, 1)])]})
        self.assertEqual([v for _, v in tail], [None, 1, None, None])
        self.assertEqual(tail[2][0] - tail[1][0], 360)
        self.assertAlmostEqual(tail[3][0], time.time(), delta=2)
        # Webhook (raw 5-minute checks, 720 s bound): a check 5 minutes before the start carries in.
        edge = self.rows('mw-now', 16)
        hook = self.at(edge['A']['root_selector'], start, {'timeSeries': [series([p(start - 290, True, 'boolValue'), p(start + 10, True, 'boolValue')])]})
        self.assertEqual(hook[:2], [(start, 1), (start + 10, 1)])
        with self.assertRaises(ValueError):
            run(rows['A']['root_selector'].replace('${__from}', str(start * 1000)), {'nextPageToken': 'x'})

    def test_notify_worker_bucket_straddling_the_start_aligns(self):
        sel = self.rows('mw-now', 1)['D']['root_selector']
        start = int(time.time()) - 3 * 3600
        def bucket(end, status=''):
            return series([{'interval': {'endTime': dt.datetime.fromtimestamp(end, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
                            'value': {'int64Value': '5'}}], status=status, http_status='200')
        # The bucket ending 3 minutes after the start begins 2 minutes before it: moved to the start, not sticking out left.
        # The every-minute job's state holds 2 minutes past its last bucket, then the lane is empty (TIMELINE-GAP).
        ev = self.at(sel, start, {'timeSeries': [bucket(start + 180), bucket(start + 480)]})
        self.assertEqual(ev, [(start, 1), (start + 180, 1), (start + 600, None)])
        # A bucket whose hold ended before the start carries nothing: its closing null is the carried event.
        old = self.at(sel, start, {'timeSeries': [bucket(start - 600), bucket(start + 420, 'UNAVAILABLE')]})
        self.assertEqual(old, [(start, None), (start + 120, 0), (start + 540, None)])
        self.assert_starts_at(old, start)
        # A bucket starting exactly at the start is the carried event itself.
        self.assertEqual(self.at(sel, start, {'timeSeries': [bucket(start + 300)]}), [(start, 1), (start + 420, None)])

    def test_daily_and_hourly_jobs_carry_their_last_run_into_the_range(self):
        rows = self.rows('mw-pwa', 20)
        start = int(time.time()) - 3 * 3600
        def bucket(end):
            return series([{'interval': {'endTime': dt.datetime.fromtimestamp(end, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
                            'value': {'int64Value': '1'}}], status='', http_status='200')
        # Daily charges ran 20 h before the range: its state holds (25 h) through the whole range, no gap, no label.
        daily = self.at(rows['B']['root_selector'].replace('${env}', 'prod'), start, {'timeSeries': [bucket(start - 72000)]})
        self.assertEqual(daily, [(start, 1)])
        # Recent analytics ran 70 min before the range: past its 65-minute hold, so the lane starts empty.
        hourly = self.at(rows['C']['root_selector'].replace('${env}', 'prod'), start, {'timeSeries': [bucket(start - 4200), bucket(start + 600)]})
        self.assertEqual(hourly[:2], [(start, None), (start + 300, 1)])

    def test_cost_budget_cell_and_line(self):
        cell = self.panel('mw-cost', 8)['targets'][0]['root_selector']
        self.assertEqual(run(cell, {'budgets': [budget()]}), [{'Category': 'Reported costs', 'Budget': 'S$20.00 / month · Budget-GCP · whole billing account'}])
        cents = budget(amount={'specifiedAmount': {'currencyCode': 'SGD', 'units': '12', 'nanos': 50000000}})
        self.assertEqual(run(cell, {'budgets': [cents]})[0]['Budget'], 'S$12.05 / month · Budget-GCP · whole billing account')
        self.assertEqual(run(cell, {})[0]['Budget'], 'no budget')
        self.assertEqual(run(cell, {'budgets': [budget(amount={'lastPeriodAmount': {}})]})[0]['Budget'], 'last period amount · Budget-GCP · whole billing account')
        line = next(t for t in self.panel('mw-cost', 6)['targets'] if t['refId'] == 'F')['root_selector']
        rows = run(line, {'budgets': [budget()]})
        self.assertEqual(len(rows), 32)
        for r in rows:
            d = dt.datetime.fromtimestamp(r['Time'] / 1000, dt.timezone(dt.timedelta(hours=8)))
            self.assertEqual((d.hour, d.minute), (12, 0), 'bars at Singapore noon')
            first = d.date().replace(day=1)
            days = ((first + dt.timedelta(days=32)).replace(day=1) - first).days
            self.assertAlmostEqual(r['Budget'], 20 / days)
        self.assertEqual(run(line, {}), [])
        self.assertEqual(run(line, {'budgets': [budget(amount={'lastPeriodAmount': {}})]}), [])
        for bad in ({'nextPageToken': 'x'}, {'error': {'message': 'denied'}}, {'budgets': [budget(amount={'specifiedAmount': {'currencyCode': 'USD', 'units': '1'}})]}):
            for sel in (cell, line):
                with self.assertRaises(ValueError):
                    run(sel, bad)
        # The line is labelled billing account: a budget narrowed to a project fails visibly, the cell names its scope.
        narrowed = {'budgets': [budget(projects=['projects/737787224638'])]}
        with self.assertRaises(ValueError):
            run(line, narrowed)
        self.assertEqual(run(cell, narrowed)[0]['Budget'], 'S$20.00 / month · Budget-GCP · projects projects/737787224638')

    def test_cost_daily_chart_joins_by_singapore_date_and_converts_at_tiles_fx(self):
        targets = {t['refId']: t for t in self.panel('mw-cost', 6)['targets']}
        today = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
        day = today - dt.timedelta(days=3)
        midnight = sgt_midnight_ms(day)
        key = midnight + 12 * 3600 * 1000  # FINAL2-8: each date at Singapore noon, so the first bar is not cut
        ymd = int(day.strftime('%Y%m%d'))
        azure = {'properties': {'rows': [[1.0, ymd, '/vm', 'USD'], [0.5, ymd, '/disk', 'USD']]}}
        backup = {'properties': {'rows': [[0.25, ymd, '/vault', 'USD']]}}
        gcp = {'jobComplete': True, 'rows': [{'f': [{'v': '%.7E' % (midnight / 1000)}, {'v': '3'}, {'v': '-1'}, {'v': v}, {'v': 'S'}, {'v': 'R'}, {'v': 'SGD'}]} for v in ('2', '0.5')]}
        fx = {'base': 'USD', 'quote': 'SGD', 'rate': 1.3, 'date': str(dt.datetime.now(dt.timezone.utc).date())}
        names = {'A': 'Azure compute USD', 'B': 'Azure backup USD', 'C': 'GCP', 'E': 'SGD per USD'}
        fields = {'A': 'USD', 'B': 'USD', 'C': 'GCP', 'E': 'FX'}
        self.assertEqual(sorted(targets), ['A', 'B', 'C', 'E', 'F'], 'Azure, GCP, FX and the budget line; no Railway query')

        def frame(ref, data):
            rows = run(targets[ref]['root_selector'], data)
            return {'fields': ['Time', names[ref]], 'rows': [{'Time': r['Time'], names[ref]: r[fields[ref]]} for r in rows]}
        frames = {ref: frame(ref, data) for ref, data in (('A', azure), ('B', backup), ('C', gcp), ('E', fx))}
        for ref in 'ABC':
            self.assertEqual([r['Time'] for r in frames[ref]['rows']], [key], ref + ' keyed by the Singapore date')
        self.assertEqual(len(frames['E']['rows']), 32)
        self.assertIn(key, [r['Time'] for r in frames['E']['rows']])
        self.assertTrue(all(r['SGD per USD'] == 1.3 for r in frames['E']['rows']), 'one current rate for every day')

        def chart(present):
            m = merge_by_time([frames[r] for r in present])
            binary(m, 'Azure USD', 'Azure compute USD', '+', 'Azure backup USD')
            binary(m, 'Azure', 'Azure USD', '*', 'SGD per USD')
            return m, next(r for r in m['rows'] if r['Time'] == key)
        m, row = chart('ABCE')
        self.assertAlmostEqual(row['Azure'], 1.75 * 1.3)
        self.assertAlmostEqual(row['GCP'], 2.5)
        # A failed provider (its query errors, so no frame) draws no series: never a zero series.
        for missing, gone in (('B', 'Azure'), ('E', 'Azure'), ('C', 'GCP')):
            m, _ = chart(''.join(r for r in 'ABCE' if r != missing))
            self.assertNotIn(gone, m['fields'], missing + ' missing removes ' + gone)
        for ref, bad in (('A', {'properties': {'rows': [], 'nextLink': 'x'}}), ('A', {'properties': {'rows': [[1, ymd, 'x', 'EUR']]}}),
                         ('C', {'jobComplete': True, 'pageToken': 'x'}), ('C', {'jobComplete': True, 'rows': [{'f': [{'v': '1'}] * 6 + [{'v': 'USD'}]}]}),
                         ('E', dict(fx, rate=0)), ('E', dict(fx, base='EUR'))):
            with self.assertRaises(ValueError, msg=ref):
                run(targets[ref]['root_selector'], bad)

if __name__ == '__main__':
    unittest.main()
