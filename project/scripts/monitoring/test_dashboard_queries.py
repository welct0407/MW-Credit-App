"""Synthetic jq fixtures for the R089 dashboard selectors (fresh, stale, missing,
truncated and provider-error cases). No provider reads; requires jq on PATH.
Run: python3 -B project/scripts/monitoring/test_dashboard_queries.py"""
import datetime as dt
import json
import pathlib
import subprocess
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
DASHBOARDS = ROOT.parents[2] / 'infrastructure' / 'grafana' / 'dashboards'


def stamp(age=0):
    return dt.datetime.fromtimestamp(time.time() - age, dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


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
        self.assertEqual([r['value'] for r in self.q({'timeSeries': [series([point(400, 1)])]})], [1, None])
        self.assertEqual([r['value'] for r in self.q({})], [None])
        self.assertEqual([r['value'] for r in self.q({'timeSeries': []})], [None])

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
    def q(self, data):
        return query('scheduler-attempts.jq', data, STATUS_LABEL='status', HTTP_LABEL='http_status', PERIOD='300')

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

    def test_older_run_fields_are_not_mixed_in(self):
        data = self.snapshot(0, pending=3)
        data['timeSeries'].append(series([point(120, 40)], field='age'))
        self.assertEqual(self.q(data), {'Pending': 3, 'Age': None, 'When': None})

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


class TurnPoints(unittest.TestCase):
    def test_points_split_by_provider(self):
        t1, t2 = point(600, 0)['interval'], point(0, 0)['interval']
        data = {'timeSeries': [
            series([{'interval': t1, 'value': {'int64Value': '48'}}, {'interval': t2, 'value': {'int64Value': '90'}}], field='seconds'),
            series([{'interval': t1, 'value': {'int64Value': '1'}}, {'interval': t2, 'value': {'int64Value': '2'}}], field='provider')]}
        self.assertEqual([r['value'] for r in query('turn-points.jq', data, VALUE='seconds', KEY='provider', CODE='1')], [48])
        self.assertEqual([r['value'] for r in query('turn-points.jq', data, VALUE='seconds', KEY='provider', CODE='2')], [90])
        self.assertEqual(query('turn-points.jq', {}, VALUE='seconds', KEY='provider', CODE='1'), [])
        for bad in FAILURES:
            with self.assertRaises(ValueError):
                query('turn-points.jq', bad, VALUE='seconds', KEY='provider', CODE='1')


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

    def test_openai_worst_of_two_products(self):
        sel = self.panel('mw-now', 17)['targets'][0]['root_selector']
        self.assertEqual(run(sel, {'summary': {}})[0]['status'], 4)

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

    def test_payment_stage_selectors(self):
        p = self.panel('mw-now', 4)
        scan = run(p['targets'][0]['root_selector'], {})
        self.assertEqual([r['status'] for r in scan], [None])
        done = int(time.time()) - 90
        fresh = {'timeSeries': [series([point(0, v)], field=k) for k, v in (('status', 1), ('last_completion', done), ('running', 0))]}
        self.assertEqual(run(p['targets'][0]['root_selector'], fresh), [{'details': 'Last scan completion', 'status': done * 1000}])
        stage = run(p['targets'][1]['root_selector'], {})
        self.assertEqual(stage, [{'pending_images': None}])

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

    def test_cost_budget_cell_and_line(self):
        cell = self.panel('mw-cost', 5)['targets'][5]['root_selector']
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
            self.assertEqual((d.hour, d.minute), (0, 0))
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
        key = sgt_midnight_ms(day)
        ymd = int(day.strftime('%Y%m%d'))
        azure = {'properties': {'rows': [[1.0, ymd, '/vm', 'USD'], [0.5, ymd, '/disk', 'USD']]}}
        backup = {'properties': {'rows': [[0.25, ymd, '/vault', 'USD']]}}
        gcp = {'jobComplete': True, 'rows': [{'f': [{'v': '%.7E' % (key / 1000)}, {'v': '3'}, {'v': '-1'}, {'v': v}, {'v': 'S'}, {'v': 'R'}, {'v': 'SGD'}]} for v in ('2', '0.5')]}
        start = stamp(10 * 86400)
        ts = key // 1000 + 3600
        railway = {'data': {'workspace': {'customer': {'billingPeriod': {'start': start}}},
                            'services': [{'measurement': 'CPU_USAGE', 'values': [{'ts': ts, 'value': 1}]}], 'volumes': []}}
        fx = {'base': 'USD', 'quote': 'SGD', 'rate': 1.3, 'date': str(dt.datetime.now(dt.timezone.utc).date())}
        names = {'A': 'Azure compute USD', 'B': 'Azure backup USD', 'C': 'GCP', 'D': 'Railway USD', 'E': 'SGD per USD'}
        fields = {'A': 'USD', 'B': 'USD', 'C': 'GCP', 'D': 'EstimatedUSD', 'E': 'FX'}

        def frame(ref, data):
            rows = run(targets[ref]['root_selector'], data)
            return {'fields': ['Time', names[ref]], 'rows': [{'Time': r['Time'], names[ref]: r[fields[ref]]} for r in rows]}
        frames = {ref: frame(ref, data) for ref, data in (('A', azure), ('B', backup), ('C', gcp), ('D', railway), ('E', fx))}
        for ref in 'ABCD':
            self.assertEqual([r['Time'] for r in frames[ref]['rows']], [key], ref + ' keyed by the Singapore date')
        self.assertEqual(len(frames['E']['rows']), 32)
        self.assertIn(key, [r['Time'] for r in frames['E']['rows']])
        self.assertTrue(all(r['SGD per USD'] == 1.3 for r in frames['E']['rows']), 'one current rate for every day')

        def chart(present):
            m = merge_by_time([frames[r] for r in present])
            binary(m, 'Azure USD', 'Azure compute USD', '+', 'Azure backup USD')
            binary(m, 'Azure', 'Azure USD', '*', 'SGD per USD')
            binary(m, 'Railway', 'Railway USD', '*', 'SGD per USD')
            return m, next(r for r in m['rows'] if r['Time'] == key)
        m, row = chart('ABCDE')
        self.assertAlmostEqual(row['Azure'], 1.75 * 1.3)
        self.assertAlmostEqual(row['GCP'], 2.5)
        self.assertAlmostEqual(row['Railway'], 0.00000772 * 3600 * 1.3)
        # A failed provider (its query errors, so no frame) draws no series: never a zero series.
        for missing, gone in (('B', 'Azure'), ('E', 'Azure'), ('E', 'Railway'), ('D', 'Railway')):
            m, _ = chart(''.join(r for r in 'ABCDE' if r != missing))
            self.assertNotIn(gone, m['fields'], missing + ' missing removes ' + gone)
        for ref, bad in (('A', {'properties': {'rows': [], 'nextLink': 'x'}}), ('A', {'properties': {'rows': [[1, ymd, 'x', 'EUR']]}}),
                         ('C', {'jobComplete': True, 'pageToken': 'x'}), ('C', {'jobComplete': True, 'rows': [{'f': [{'v': '1'}] * 6 + [{'v': 'USD'}]}]}),
                         ('D', {'errors': [{'message': 'x'}]}), ('E', dict(fx, rate=0)), ('E', dict(fx, base='EUR'))):
            with self.assertRaises(ValueError, msg=ref):
                run(targets[ref]['root_selector'], bad)


if __name__ == '__main__':
    unittest.main()
