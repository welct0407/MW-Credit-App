"""Read-only Debian checks; export numeric health and worker timing to GCP Monitoring.

0 DOWN, 1 UP, 2 DEGRADED, 3 PAUSED, 4 UNKNOWN. No business jobs are invoked.
Installed separately from the integration-agent package; uses its existing config.
"""
import datetime as dt
import json
import os
import re
from pathlib import Path
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CONFIG = '/etc/mw-integration-agent/config.json'
PROJECT = 'clever-oasis-508610-n7'
METRIC = 'custom.googleapis.com/mw_resource_monitoring/health'
WORKER_METRIC = 'custom.googleapis.com/mw_resource_monitoring/worker_timing'


def completion_epoch(service, monotonic_now, epoch_now):
    """Last process exit in this boot, not a receipt's business completion time."""
    ended = int(service.get('ExecMainExitTimestampMonotonic', '0')) / 1e6
    if not ended or ended > monotonic_now:
        return 0
    return int(epoch_now - (monotonic_now - ended))


def run(args, timeout=15, env=None):
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, env=env)


def native_api_status(config, scope, runner=None):
    """Native machine API only; legacy metric labels remain alert-compatible."""
    if scope not in ('oltp', 'olap'):
        raise ValueError('Invalid native probe scope')
    if 'conversation_api_enabled' not in config:
        return 4  # Missing configuration is not an intentional pause.
    if config['conversation_api_enabled'] is False:
        return 3
    if config['conversation_api_enabled'] is not True:
        return 0
    origin = 'https://mw-credit-app-command-prod-737787224638.asia-southeast1.run.app'
    if (config.get('conversation_api_environment') != 'prod'
            or config.get('database_name') != 'loan_manager_prod'
            or config.get('conversation_api_origin') != origin
            or config.get('conversation_api_audience') != origin):
        return 0
    expected = config.get('conversation_api_manifest_sha256')
    if not isinstance(expected, str) or len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected):
        return 0
    try:
        p = (runner or run)([
            '/opt/mw-integration-agent/.venv/bin/mw-integration-agent', 'native-api-probe',
            '--scope', scope, '--config', CONFIG,
            '--catalogue', '/etc/mw-integration-agent/service-catalogue.json'], 70)
        if p.returncode != 0:
            return 0
        value = json.loads(p.stdout)
        return 1 if (value.get('authenticated') is True and value.get('scope') == scope
                     and value.get('targetVersion') == expected
                     and type(value.get('count')) is int and 0 <= value['count'] <= 1) else 0
    except Exception:
        return 0


HOSTING_ORIGINS = {'dev': 'https://dev-lm.mw-credit.com', 'prod': 'https://lm.mw-credit.com'}

class NoHostingRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def hosting_fetch(url, timeout, limit):
    with urllib.request.build_opener(NoHostingRedirect()).open(
            urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=timeout) as response:
        body = response.read(limit + 1)
        if response.status != 200 or response.url != url or len(body) > limit:
            raise ValueError('Unexpected Hosting response')
        return body.decode('utf-8')


def hosting_status(environment, fetcher=None, clock=time.monotonic):
    """Single Debian vantage: canonical public shell/version only, no authentication."""
    if environment not in HOSTING_ORIGINS:
        raise ValueError('Unknown Hosting environment')
    if fetcher is None:
        # A killed/reaped fixed child bounds DNS, headers and trickling bodies,
        # not merely an individual socket's inactivity timeout.
        try:
            result = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--hosting-probe', environment],
                                    capture_output=True, text=True, timeout=10, check=False)
            value = json.loads(result.stdout)
            return value['status'] if result.returncode == 0 and type(value.get('status')) is int and value['status'] in (0, 1) else 0
        except Exception:
            return 0
    origin = HOSTING_ORIGINS[environment]
    until = clock() + 10
    def read(path, limit):
        remaining = until - clock()
        if remaining <= 0:
            raise TimeoutError('Hosting probe deadline')
        body = fetcher(origin + path, remaining, limit)
        if clock() >= until:
            raise TimeoutError('Hosting probe deadline')
        return body
    try:
        html = read('/', 262144)
        marker = json.loads(read('/build-version.json', 16384))
        if (not isinstance(marker, dict) or type(marker.get('schemaVersion')) is not int or marker.get('schemaVersion') != 1
                or not re.fullmatch('[a-f0-9]{24}', str(marker.get('version', '')))
                or not re.fullmatch('/assets/[A-Za-z0-9_-]+[.]js', str(marker.get('entry', '')))):
            return 0
        html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
        title = 'MW Credit' if environment == 'prod' else 'MW Credit Development'
        return 1 if (f'<title>{title}</title>' in html and re.search(r'<div\s+id=[\"\']root[\"\']', html)
                     and re.search(r'<script\b[^>]*\btype=[\"\']module[\"\'][^>]*\bsrc=[\"\']'
                                   + re.escape(marker['entry']) + r'[\"\']', html)) else 0
    except Exception:
        return 0


def properties(unit):
    result = run(['systemctl', 'show', unit, '-p', 'LoadState', '-p', 'ActiveState',
                  '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'ExecMainExitTimestampMonotonic',
                  '-p', 'ExecMainStartTimestampMonotonic', '-p', 'ActiveEnterTimestampMonotonic'])
    if result.returncode:
        raise RuntimeError('systemd query failed')
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def timer_status(service, timer, uptime, now, max_idle, max_run):
    if timer.get('LoadState') != 'loaded' or service.get('LoadState') != 'loaded':
        return 4
    if timer.get('ActiveState') != 'active':
        return 0
    if service.get('ActiveState') == 'failed' or service.get('Result') not in ('success', None, ''):
        return 0
    started = int(service.get('ExecMainStartTimestampMonotonic', '0')) / 1e6
    ended = int(service.get('ExecMainExitTimestampMonotonic', '0')) / 1e6
    if service.get('ActiveState') in ('active', 'activating'):
        return 1 if started and uptime - started <= max_run else 2
    if service.get('ExecMainStatus') not in ('0', None):
        return 0
    if ended:
        return 1 if uptime - ended <= max_idle else 2
    # A daily timer may correctly be waiting for its first scheduled run.
    if max_idle >= 86400 and now.hour == 0 and now.minute < 30:
        return 1
    return 4


def fetch(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=15) as r:
        return r.read().decode()


def readiness(fetch):
    """Receiver /ready: (1, code_version) only for 200 JSON with ready true and a code version; else (0, None)."""
    try:
        body = json.loads(fetch('http://127.0.0.1:8000/ready'))
    except Exception:
        return 0, None
    version = body.get('code_version') if isinstance(body, dict) else None
    if isinstance(body, dict) and body.get('ready') is True and isinstance(version, str) and version:
        return 1, version
    return 0, None


def combine(values):
    for severity in (0, 4, 2, 3):
        if severity in values:
            return severity
    return 1


def sql_uptime_snapshot(conn):
    """Use only the existing reporting transaction; never widen its privileges.

    A savepoint isolates this extra read from the original connectivity check.
    Failure emits fresh Unknown without carrying forward an old uptime value.
    """
    observed = dt.datetime.now(dt.timezone.utc).isoformat()
    try:
        with conn.transaction():
            database, role, readonly, seconds, stamp = conn.execute(
                "SELECT current_database(),current_user,"
                "current_setting('transaction_read_only'),"
                "floor(extract(epoch FROM "
                "(statement_timestamp()-pg_postmaster_start_time())))::bigint,"
                "statement_timestamp()"
            ).fetchone()
            if (database != 'loan_manager_prod' or role != 'mw_integration_agent' or
                    readonly != 'on' or type(seconds) is not int or seconds < 0 or
                    not isinstance(stamp, dt.datetime) or stamp.tzinfo is None or
                    abs((dt.datetime.now(dt.timezone.utc) - stamp).total_seconds()) > 120):
                return {'status': 4}, observed
        return {'status': 1, 'uptime_seconds': seconds}, stamp.isoformat()
    except Exception:
        return {'status': 4}, observed


PROBE_OPTIONS = '-c default_transaction_read_only=on -c statement_timeout=5000'


def database_probe(config, extras=None):
    """SELECT 1 on mw_agent as the worker and on the business database as database_user.

    Each login follows its auth key (ALL-ARCH-03): password, or the IAM user on the
    auto-iam-authn listener with SET ROLE as the first statement. Returns
    (status, (sql_uptime, observed) or None); the uptime sample uses the business read.
    R089: on loan_manager_prod the same read-only reporting connection also fills `extras`
    with the PWA ops health (monitoring.pwa_ops_health_v1) and the pg_stat_statements top share.
    """
    import psycopg
    from mw_integration_agent.config import auth_mode, iam_port, load_secret
    from mw_integration_agent.state import assume_role, open_connection
    with open_connection(config, options=PROBE_OPTIONS) as conn:
        if conn.execute('SELECT 1').fetchone() != (1,):
            return 0, None
    iam = auth_mode(config, 'database_') == 'iam'
    login = (dict(user=config['database_iam_user'], port=iam_port(config)) if iam else
             dict(user=config['database_user'], port=config['database_port'],
                  password=load_secret(config, 'database_password_file')))
    with psycopg.connect(host=config['database_host'], dbname=config['database_name'],
                         connect_timeout=8, options=PROBE_OPTIONS, **login) as conn:
        assume_role(conn, config['database_user'] if iam else None)
        if conn.execute('SELECT 1').fetchone() != (1,):
            return 0, None
        sample = sql_uptime_snapshot(conn) if config['database_name'] == 'loan_manager_prod' else None
        if extras is not None and config['database_name'] == 'loan_manager_prod':
            extras['ops_health'] = ops_health_snapshot(conn)
            extras['pg_stat'] = pg_stat_snapshot(conn)
    return 1, sample


def sql_uptime_series(snapshot, observed, resource):
    return [{'metric': {'type': WORKER_METRIC,
                        'labels': {'component': 'cloud_sql_prod', 'field': field}},
             'resource': resource, 'metricKind': 'GAUGE', 'valueType': 'INT64',
             'points': [{'interval': {'endTime': observed},
                         'value': {'int64Value': str(value)}}]}
            for field, value in snapshot.items()]


# R089 (design section A): new read-only checks. Every network call is bounded to 10 s; every value is a
# count, an age in seconds, a state code or a percentage. No identifier, amount, text or token is exported.
NEW_CALL_SECONDS = 10
PWA_API_ORIGINS = '/etc/mw-resource-monitoring/pwa-api-origins.json'
PWA_API_COMPONENTS = ('pwa_api_reader_prod', 'pwa_api_command_prod', 'pwa_api_reader_dev', 'pwa_api_command_dev')
STATE_FILE = '/var/lib/mw-resource-monitoring/last-points.json'
SQL_INSTANCE = 'mw-credit-pg-20261017'
DAILY_CHARGES_OVERDUE = 90000
RECENT_ANALYTICS_OVERDUE = 4500
PROVIDER_CODES = {'gemini': 1, 'codex': 2, 'claude': 3}


def bounded_fetch(url, headers=None, timeout=NEW_CALL_SECONDS, limit=262144, clock=time.monotonic):
    """GET without redirects: (HTTP status, body). The whole call, body included, ends within `timeout`."""
    until = clock() + timeout
    request = urllib.request.Request(url, headers={'User-Agent': 'MW-Resource-Monitor/1.0', **(headers or {})})
    try:
        response = urllib.request.build_opener(NoHostingRedirect()).open(request, timeout=timeout)
    except urllib.error.HTTPError as exc:
        exc.close()
        return exc.code, ''
    with response:
        chunks, size = [], 0
        while True:
            if clock() >= until:
                raise TimeoutError('Probe deadline')
            chunk = response.read(16384)
            if not chunk:
                break
            size += len(chunk)
            if size > limit:
                raise ValueError('Probe response too large')
            chunks.append(chunk)
        return response.status, b''.join(chunks).decode('utf-8')


def load_origins(path=PWA_API_ORIGINS):
    """The four Cloud Run origins (copied from the Terraform outputs); None when missing or unreadable."""
    try:
        value = json.loads(Path(path).read_text())
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def pwa_api_status(component, origins, fetcher=bounded_fetch):
    """GET <origin>/health, no credentials, no redirects, 10 s: 200 = 1, any other answer = 0, no origin = 4."""
    if component not in PWA_API_COMPONENTS:
        raise ValueError('Unknown PWA API component')
    if origins is None:
        return 4
    _, _, service, environment = component.split('_')
    service = 'read' if service == 'reader' else service
    origin = origins.get(component)
    if not isinstance(origin, str) or not re.fullmatch(
            r'https://mw-credit-app-' + service + '-' + environment + r'-[0-9]+\.asia-southeast1\.run\.app', origin):
        return 4
    try:
        status, _ = fetcher(origin + '/health')
    except Exception:
        return 0
    return 1 if status == 200 else 0


def recognizer_health(config, fetcher=bounded_fetch):
    """GET /healthz of mw-receipt-recognition: {status: ok, enabled: true} = 1, enabled false = 3 (paused), else 0."""
    host = config.get('receipt_recognition_listen_host')
    port = config.get('receipt_recognition_listen_port', 8790)
    if not isinstance(host, str) or not host or type(port) is not int:
        return 4
    try:
        status, body = fetcher('http://' + host + ':' + str(port) + '/healthz')
        value = json.loads(body) if status == 200 else {}
    except Exception:
        return 0
    if not isinstance(value, dict) or value.get('status') != 'ok':
        return 0
    return 1 if value.get('enabled') is True else 3 if value.get('enabled') is False else 0


def unit_age(service, uptime):
    """Seconds since the unit last became active in this boot; None when not active or unknown."""
    entered = int(service.get('ActiveEnterTimestampMonotonic', '0') or 0) / 1e6
    if service.get('ActiveState') != 'active' or not entered or entered > uptime:
        return None
    return int(uptime - entered)


def recognizer_timing(config, service, uptime, counts):
    fields = {'provider': PROVIDER_CODES.get(config.get('receipt_recognition_provider', 'gemini')),
              'restart_age_seconds': unit_age(service, uptime)}
    fields.update(counts or {})
    return fields


def google_json(url, token, fetcher=bounded_fetch):
    status, body = fetcher(url, {'Authorization': 'Bearer ' + token})
    if status != 200:
        raise RuntimeError('Google API answered ' + str(status))
    return json.loads(body)


def parse_time(value):
    return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()


def cloud_sql_backup(token, now, fetcher=bounded_fetch):
    """SQL Admin backupRuns (newest five) and the instance's PITR log retention, read with the VM identity."""
    base = 'https://sqladmin.googleapis.com/v1/projects/' + PROJECT + '/instances/' + SQL_INSTANCE
    runs = google_json(base + '/backupRuns?maxResults=5', token, fetcher).get('items') or []
    instance = google_json(base, token, fetcher)
    runs = sorted((r for r in runs if isinstance(r, dict)), key=lambda r: r.get('windowStartTime') or r.get('enqueuedTime') or '', reverse=True)
    successful = [r for r in runs if r.get('status') == 'SUCCESSFUL' and r.get('endTime')]
    fields = {}
    if runs:
        newest = runs[0].get('status')
        fields['status'] = 1 if newest == 'SUCCESSFUL' else 2 if newest in ('RUNNING', 'ENQUEUED', 'PENDING') else 0
    if successful:
        fields['age_seconds'] = max(0, int(now - parse_time(successful[0]['endTime'])))
        fields['type'] = {'AUTOMATED': 1, 'ON_DEMAND': 2}.get(successful[0].get('type'))
    retention = (((instance.get('settings') or {}).get('backupConfiguration') or {}).get('transactionLogRetentionDays'))
    if type(retention) is int:
        fields['log_retention_days'] = retention
    return fields


SNAPSHOT_PAGES = 5


def debian_snapshot(token, now, fetcher=bounded_fetch, clock=time.monotonic):
    """Age of the newest READY snapshot of the agent VM's disk, read with the VM identity.

    The Compute API rejects `filter` together with `orderBy` (HTTP 400), so every page is read
    and the newest creationTimestamp is picked here. All pages share one NEW_CALL_SECONDS deadline.
    A failure returns {'error': ...}: a string, shown in the run output but never exported.
    """
    base = ('https://compute.googleapis.com/compute/v1/projects/' + PROJECT + '/global/snapshots?filter='
            + urllib.parse.quote('sourceDisk eq .*vm-mw-credit-agent') + '&maxResults=500&fields='
            + urllib.parse.quote('items(status,creationTimestamp),nextPageToken'))
    deadline = clock() + NEW_CALL_SECONDS
    ready, page_token = [], None
    try:
        for _ in range(SNAPSHOT_PAGES):
            remaining = deadline - clock()
            if remaining <= 0:
                raise TimeoutError('Snapshot list deadline')
            url = base + ('&pageToken=' + urllib.parse.quote(page_token, safe='') if page_token else '')
            status, body = fetcher(url, {'Authorization': 'Bearer ' + token}, timeout=remaining)
            if status != 200:
                return {'error': 'http_' + str(status)}
            page = json.loads(body)
            ready += [parse_time(i['creationTimestamp']) for i in page.get('items') or []
                      if isinstance(i, dict) and i.get('status') == 'READY']
            page_token = page.get('nextPageToken')
            if not page_token:
                break
        else:
            return {'error': 'too_many_pages'}
    except Exception as exc:
        return {'error': type(exc).__name__}
    return {'age_seconds': max(0, int(now - max(ready)))} if ready else {}


def audit_retention(service, uptime, now):
    """mw-audit-retention.service: last Result (success 1, else 0) and the age of its last exit in this boot."""
    if service.get('LoadState') != 'loaded':
        return {}
    ended = completion_epoch(service, uptime, now)
    fields = {'result': 1 if service.get('Result') == 'success' and service.get('ExecMainStatus') in ('0', None) else 0}
    if ended:
        fields['age_seconds'] = max(0, int(now - ended))
    return fields


def code_version_match(config, reported):
    """1 when the receiver's /ready code version is the deployed one in the agent config, 0 otherwise."""
    deployed = config.get('code_version')
    if not isinstance(reported, str) or not reported or not isinstance(deployed, str) or not deployed:
        return None
    return 1 if reported == deployed else 0


def ops_health_snapshot(conn):
    """One call of monitoring.pwa_ops_health_v1() (V102) in a savepoint of the reporting transaction."""
    try:
        with conn.transaction():
            row = conn.execute('SELECT * FROM monitoring.pwa_ops_health_v1()').fetchone()
        if row is None or len(row) != 10:
            return None
        return dict(zip(('pending', 'oldest_pending_seconds', 'delivered_24h', 'failed_24h', 'subscriptions',
                         'last_dispatch_age_seconds', 'daily_completed_at', 'daily_state', 'analytics_completed_at',
                         'analytics_state'), row))
    except Exception:
        return None


def pwa_ops_fields(snapshot, now):
    """worker_timing{pwa_notify} and {pwa_jobs}. Job state: 1 completed on time, 2 overdue (V94: no failed state)."""
    if snapshot is None:
        return {}, {'status': 4}
    count = lambda v: v if type(v) is int and v >= 0 else None
    notify = {'pending': count(snapshot['pending']), 'delivered_24h': count(snapshot['delivered_24h']),
              'failed_24h': count(snapshot['failed_24h']), 'subscriptions': count(snapshot['subscriptions']),
              'oldest_pending_seconds': 0 if snapshot['pending'] == 0 else count(snapshot['oldest_pending_seconds']),
              'last_dispatch_age_seconds': count(snapshot['last_dispatch_age_seconds'])}
    jobs = {}
    for name, key, bound in (('daily_charges', 'daily_completed_at', DAILY_CHARGES_OVERDUE),
                             ('recent_analytics', 'analytics_completed_at', RECENT_ANALYTICS_OVERDUE)):
        completed = snapshot[key]
        age = max(0, int(now - completed.timestamp())) if isinstance(completed, dt.datetime) else None
        jobs[name + '_age_seconds'] = age
        jobs[name + '_state'] = 1 if age is not None and age <= bound else 2
    jobs['status'] = 1 if jobs['daily_charges_state'] == jobs['recent_analytics_state'] == 1 else 2
    return notify, jobs


def pg_stat_snapshot(conn):
    """Heaviest statement by total execution time (V93 view; V102 grants queryid, calls, total_exec_time only).
    The statement text is never selected."""
    try:
        with conn.transaction():
            row = conn.execute('SELECT queryid::text,calls,total_exec_time,sum(total_exec_time) OVER () '
                               'FROM monitoring.pg_stat_statements ORDER BY total_exec_time DESC LIMIT 1').fetchone()
        if row is None:
            return {'status': 1}
        queryid, calls, top, total = row
        return {'status': 1, 'queryid': queryid, 'calls': int(calls), 'share': (100 * float(top) / float(total)) if total else None}
    except Exception:
        return {'status': 0}


def pg_stat_fields(snapshot, previous, now):
    """top1_share_percent and top1_calls_per_min (calls since the previous run of the same statement)."""
    if not snapshot:
        return {}, previous
    fields = {'status': snapshot['status']}
    if snapshot.get('share') is not None:
        fields['top1_share_percent'] = int(round(snapshot['share']))
    state = previous
    if snapshot.get('queryid') is not None:
        state = {'queryid': snapshot['queryid'], 'calls': snapshot['calls'], 'at': now}
        if (isinstance(previous, dict) and previous.get('queryid') == snapshot['queryid']
                and snapshot['calls'] >= previous.get('calls', 0) and 0 < now - previous.get('at', now) <= 900):
            fields['top1_calls_per_min'] = int(round((snapshot['calls'] - previous['calls']) * 60 / (now - previous['at'])))
    return fields, state


# runtime.conversation_turns: RUNNING -> READY | FAILED | UNKNOWN_WRITE | INTERRUPTED (outcome held) -> QUEUED
# (READY, reply notice reserved) or <status>_NOTIFIED. QUEUED and *_NOTIFIED are terminal; IGNORED is a
# nonpartner. VERIFIED/CLARIFY/REFUSE are the model's answer in result->>'status', never the row status.
# Only that status, row status and created_at (epoch) are read; the reply text in `result` is never selected.
TURN_STATES = {'VERIFIED': 1, 'CLARIFY': 2, 'REFUSE': 2, 'FAILED': 0, 'UNKNOWN_WRITE': 0, 'INTERRUPTED': 0}
TURN_FIELDS = ('running', 'stuck_running', 'undelivered', 'turns_24h', 'verified_24h', 'failed_24h')
TURN_OUTCOME = "CASE WHEN result IS JSON OBJECT THEN result::jsonb->>'status' END"
AGENT_QUERIES = {
    'recognizer': """WITH ops AS (
 SELECT o.service_name,
  (array_agg(e.payload ORDER BY e.operation_seq DESC) FILTER (WHERE e.event_kind='result_observed'))[1] AS observed,
  bool_or(e.event_kind='completed') AS completed,
  (array_agg(e.payload->>'exception_type' ORDER BY e.operation_seq DESC) FILTER (WHERE e.event_kind='failed'))[1] AS failure
 FROM audit.operations o JOIN audit.events e ON e.operation_id=o.operation_id
 WHERE o.service_name IN ('receipt_recognition_api','receipt_image_extraction') AND o.created_at>=now()-interval '24 hours'
 GROUP BY o.operation_id,o.service_name)
SELECT count(*),
 count(*) FILTER (WHERE (service_name='receipt_recognition_api' AND observed->>'outcome'='recognized') OR (service_name='receipt_image_extraction' AND completed)),
 count(*) FILTER (WHERE (service_name='receipt_recognition_api' AND observed->>'reason'='timeout') OR (service_name='receipt_image_extraction' AND failure ILIKE '%%timeout%%')),
 count(*) FILTER (WHERE (service_name='receipt_recognition_api' AND observed->>'outcome'='rejected') OR (service_name='receipt_image_extraction' AND failure IS NOT NULL AND failure NOT ILIKE '%%timeout%%'))
FROM ops""",
    'recognizer_call': """SELECT ended_at,seconds FROM (
 SELECT max(e.occurred_at) FILTER (WHERE e.event_kind='result_observed') AS ended_at,
  max((e.payload->>'duration_ms')::numeric) FILTER (WHERE e.event_kind='result_observed')/1000 AS seconds
 FROM audit.operations o JOIN audit.events e ON e.operation_id=o.operation_id
 WHERE o.service_name='receipt_recognition_api' AND o.created_at>=now()-interval '24 hours' GROUP BY o.operation_id
 UNION ALL
 SELECT max(e.occurred_at) FILTER (WHERE e.event_kind IN ('completed','failed')),
  extract(epoch FROM max(e.occurred_at)-min(e.occurred_at))
 FROM audit.operations o JOIN audit.events e ON e.operation_id=o.operation_id
 WHERE o.service_name='receipt_image_extraction' AND o.created_at>=now()-interval '24 hours' GROUP BY o.operation_id) x
WHERE ended_at IS NOT NULL AND seconds IS NOT NULL AND ended_at>%s ORDER BY ended_at DESC LIMIT 1""",
    'turns': """SELECT count(*) FILTER (WHERE status='RUNNING'),
 count(*) FILTER (WHERE status='RUNNING' AND created_at<extract(epoch FROM now())-900),
 count(*) FILTER (WHERE status IN ('READY','FAILED','UNKNOWN_WRITE','INTERRUPTED') AND created_at<extract(epoch FROM now())-300),
 count(*) FILTER (WHERE day AND status<>'IGNORED'),
 count(*) FILTER (WHERE (CASE WHEN day THEN """ + TURN_OUTCOME + """ END)='VERIFIED'),
 count(*) FILTER (WHERE day AND status IN ('FAILED','UNKNOWN_WRITE','INTERRUPTED','FAILED_NOTIFIED','UNKNOWN_WRITE_NOTIFIED','INTERRUPTED_NOTIFIED'))
FROM (SELECT status,result,created_at,created_at>=extract(epoch FROM now())-86400 AS day FROM runtime.conversation_turns) t""",
    'last_turn': """SELECT message_id,""" + TURN_OUTCOME + """,extract(epoch FROM now())-created_at FROM runtime.conversation_turns
WHERE status NOT IN ('IGNORED','RUNNING') AND result IS NOT NULL ORDER BY created_at DESC LIMIT 1""",
    'model_turns': """SELECT o.message_id, coalesce(o.plan->>'provider','codex'), min(e.occurred_at),
 max(e.occurred_at) FILTER (WHERE e.event_kind IN ('completed','failed','unknown')),
 (array_agg(e.payload ORDER BY e.operation_seq DESC) FILTER (WHERE e.event_kind='model_rounds'))[1]->>'rounds'
FROM audit.operations o JOIN audit.events e ON e.operation_id=o.operation_id
WHERE o.service_name='model_turn' AND o.created_at>=now()-interval '24 hours'
GROUP BY o.operation_id,o.message_id,o.plan""",
    'grounding': """SELECT count(*) FROM audit.events WHERE event_kind='ungrounded_amounts' AND occurred_at>=now()-interval '24 hours'""",
    'last_send': """SELECT extract(epoch FROM now()-max(accepted_at)) FROM runtime.partner_notices WHERE stream='conversation'""",
}


def agent_reader(config, since):
    """Run AGENT_QUERIES in one READ ONLY worker transaction on mw_agent (as conversation-timing.py connects)."""
    from mw_integration_agent.state import transaction
    with transaction(config, readonly=True) as conn:
        conn.execute("SET LOCAL statement_timeout='8s'")
        out = {}
        for name, sql in AGENT_QUERIES.items():
            params = (since.get(name) or dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc),) if name == 'recognizer_call' else None
            out[name] = [tuple(r.values()) if isinstance(r, dict) else tuple(r) for r in conn.execute(sql, params).fetchall()]
        return out


def as_count(value):
    return value if type(value) is int and value >= 0 else None


def agent_snapshot(config, last_points, reader=agent_reader):
    """Recognizer counts and the newest extraction, conversation loop counts and the newest model turn.

    Returns {'recognizer': {...}, 'recognizer_call': (end, {...}) or None, 'conversation': {...},
    'conversation_turn': (end, {...}) or None}; an unreadable agent database yields empty sections.
    """
    since = {'recognizer_call': parse_iso(last_points.get('recognizer_call'))}
    try:
        rows = reader(config, since)
    except Exception:
        return {'recognizer': {}, 'recognizer_call': None, 'conversation': {}, 'conversation_turn': None}
    out = {'recognizer': {}, 'recognizer_call': None, 'conversation': {}, 'conversation_turn': None}
    if rows.get('recognizer'):
        values = rows['recognizer'][0]
        out['recognizer'] = dict(zip(('extractions_24h', 'valid_24h', 'timeouts_24h', 'unreadable_24h'), map(as_count, values)))
    if rows.get('recognizer_call'):
        ended, seconds = rows['recognizer_call'][0]
        if isinstance(ended, dt.datetime) and seconds is not None and float(seconds) >= 0:
            out['recognizer_call'] = (ended, {'seconds': int(round(float(seconds)))})
    conversation = {}
    if rows.get('turns'):
        conversation.update(zip(TURN_FIELDS, map(as_count, rows['turns'][0])))
    turns = []
    for message_id, provider, started, ended, rounds in rows.get('model_turns') or []:
        seconds = (ended - started).total_seconds() if isinstance(ended, dt.datetime) and isinstance(started, dt.datetime) else None
        try:
            rounds = int(rounds) if rounds is not None else None
        except ValueError:
            rounds = None
        turns.append({'message_id': message_id, 'provider': PROVIDER_CODES.get(provider), 'ended': ended, 'seconds': seconds, 'rounds': rounds})
    timed = [t['seconds'] for t in turns if t['seconds'] is not None]
    if timed:
        conversation['median_turn_seconds'] = int(round(statistics.median(timed)))
    counted = [t['rounds'] for t in turns if t['rounds'] is not None]
    if counted:
        conversation['median_rounds'] = int(round(statistics.median(counted)))
    if rows.get('last_turn'):
        message_id, outcome, age = rows['last_turn'][0]
        conversation['last_turn_state'] = TURN_STATES.get(outcome, 4)
        if age is not None:
            conversation['last_turn_age_seconds'] = max(0, int(age))
        match = [t for t in turns if t['message_id'] == message_id]
        if match:
            conversation['last_turn_rounds'] = match[-1]['rounds']
            if match[-1]['seconds'] is not None:
                conversation['last_turn_seconds'] = int(round(match[-1]['seconds']))
    if rows.get('grounding'):
        conversation['grounding_rejections_24h'] = as_count(rows['grounding'][0][0])
    if rows.get('last_send') and rows['last_send'][0][0] is not None:
        conversation['last_send_age_seconds'] = max(0, int(rows['last_send'][0][0]))
    out['conversation'] = conversation
    previous = parse_iso(last_points.get('conversation_turn'))
    finished = [t for t in turns if isinstance(t['ended'], dt.datetime) and t['seconds'] is not None and (previous is None or t['ended'] > previous)]
    if finished:
        newest = max(finished, key=lambda t: t['ended'])
        out['conversation_turn'] = (newest['ended'], {'seconds': int(round(newest['seconds'])), 'rounds': newest['rounds'],
                                                      'provider': newest['provider']})
    return out


def conversation_loop(config, polling_timing, poll_state, wake, timer, now):
    """Loop fields from systemd: poll age (last mw-conversation-poll exit), wake path, worker timer, provider."""
    fields = {'poll_state': poll_state,
              'wake_path_active': None if wake is None else int(wake.get('ActiveState') == 'active'),
              'timer_ok': None if timer is None else int(timer.get('LoadState') == 'loaded' and timer.get('ActiveState') == 'active'),
              'provider': PROVIDER_CODES.get(config.get('conversation_provider', 'codex'))}
    if polling_timing.get('last_completion', 0) > 0:
        fields['poll_age_seconds'] = max(0, int(now - polling_timing['last_completion']))
    return fields


def parse_iso(value):
    try:
        return dt.datetime.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def load_points(path=STATE_FILE):
    try:
        value = json.loads(Path(path).read_text())
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def save_points(points, path=STATE_FILE):
    """Atomic replace; saved before the export so a point is never written twice (a lost point is acceptable)."""
    target = Path(path)
    temporary = target.with_name(target.name + '.tmp')
    temporary.write_text(json.dumps(points, sort_keys=True))
    os.replace(temporary, target)


def timing_series(component, fields, resource, end_time):
    """INT64 worker_timing gauges; a missing (None) value is not exported, so the dashboard shows No report."""
    return [{'metric': {'type': WORKER_METRIC, 'labels': {'component': component, 'field': field}},
             'resource': resource, 'metricKind': 'GAUGE', 'valueType': 'INT64',
             'points': [{'interval': {'endTime': end_time}, 'value': {'int64Value': str(int(value))}}]}
            for field, value in fields.items() if value is not None and type(value) in (int, bool)]


def safely(future, fallback):
    try:
        return future.result()
    except Exception:
        return fallback


def receipt_snapshot(config, job, inspector=None):
    if not config.get('receipt_summary_enabled'):
        return {'status':3}
    try:
        if inspector is None:
            from mw_integration_agent.receipt_health import inspect
            inspector=inspect
        values=inspector(config)
        required=('status','pending_images','validated_receipts','held_receipts','pending_reviews',
                  'approved_payments','completed_payments','oldest_pending_seconds','stalled_jobs',
                  'unnotified_holds','unconfirmed_postings','undelivered_reviews','overdue_reviews','failed_notifications')
        if any(type(values.get(k)) is not int or values[k]<0 for k in required) or values['status'] not in (1,2):
            raise ValueError('Invalid queue snapshot')
    except Exception:
        values={'status':0,'inspection_failed':1}
    try:values['status']=combine([job('mw-receipt-summary',180,600),values['status']])
    except Exception:values['status']=0
    return values


def relay_snapshot(config, job, inspector=None):
    """An activating service cannot erase the last completed failure."""
    try:
        if inspector is None:
            from mw_integration_agent.relay_health import inspect
            inspector = inspect
        values = inspector(config)
        required = ('status','completed_at','completed_success','backlog',
                    'oldest_unexported_seconds','missing_intents','running','inspection_failed')
        if (any(type(values.get(k)) is not int or values[k] < 0 for k in required)
                or values['status'] not in (0,1,2,4) or values['completed_success'] not in (0,1)
                or values['running'] not in (0,1) or values['inspection_failed'] not in (0,1)
                or values['missing_intents'] > values['backlog']):
            raise ValueError('Invalid relay snapshot')
    except Exception:
        return {'status':0,'inspection_failed':1}
    try:
        values['status'] = combine([job('mw-audit-relay',180,180),values['status']])
    except Exception:
        values.update(status=0,inspection_failed=1)
    return values


def collect_r089(config, token, uptime, now, result, polling_timing, extras, reported_version, points,
                 metabase_collect, fetcher=bounded_fetch, props=None, origins_loader=load_origins, reader=agent_reader):
    """R089 additions, network checks in the same concurrent block as the Metabase probes (each bounded to 10 s).

    Returns {'metabase', 'health', 'timing': [(component, fields, end_time or None)], 'points'}.
    `now` is epoch seconds; `result` holds this run's existing health codes (polling, conversations).
    """
    props = props or properties
    origins = origins_loader()
    with ThreadPoolExecutor(max_workers=10) as pool:
        metabase = pool.submit(metabase_collect)
        api = {c: pool.submit(pwa_api_status, c, origins, fetcher) for c in PWA_API_COMPONENTS}
        recognizer = pool.submit(recognizer_health, config, fetcher)
        backup = pool.submit(cloud_sql_backup, token, now, fetcher)
        snapshot = pool.submit(debian_snapshot, token, now, fetcher)
        agent = pool.submit(agent_snapshot, config, points, reader)
    health = {c: safely(f, 0) for c, f in api.items()}
    health['recognizer'] = safely(recognizer, 0)
    agent = safely(agent, {'recognizer': {}, 'recognizer_call': None, 'conversation': {}, 'conversation_turn': None})
    unit = lambda name: safely_call(lambda: props(name), None)
    timing = []
    recognizer_unit = unit('mw-receipt-recognition.service') or {}
    timing.append(('recognizer', recognizer_timing(config, recognizer_unit, uptime, agent['recognizer']), None))
    loop = conversation_loop(config, polling_timing, result.get('polling'), unit('mw-conversation-wake.path'),
                             unit('mw-partner-conversation.timer'), now)
    timing.append(('conversation', dict(agent['conversation'], **loop), None))
    notify, jobs = pwa_ops_fields((extras or {}).get('ops_health'), now)
    timing.append(('pwa_notify', notify, None))
    timing.append(('pwa_jobs', jobs, None))
    timing.append(('cloud_sql_backup', safely(backup, {}), None))
    timing.append(('debian_snapshot', safely(snapshot, {}), None))
    retention = unit('mw-audit-retention.service')
    timing.append(('audit_retention', audit_retention(retention, uptime, now) if retention else {}, None))
    stat, stat_state = pg_stat_fields((extras or {}).get('pg_stat'), points.get('pg_stat'), now)
    timing.append(('pg_stat', stat, None))
    timing.append(('webhook_local', {'code_version_match': code_version_match(config, reported_version)}, None))
    new_points = dict(points)
    if stat_state is not None:
        new_points['pg_stat'] = stat_state
    for component in ('recognizer_call', 'conversation_turn'):
        if agent.get(component):
            ended, fields = agent[component]
            if now - ended.timestamp() <= 86400:
                timing.append((component, fields, ended.astimezone(dt.timezone.utc).isoformat()))
                new_points[component] = ended.isoformat()
    return {'metabase': safely(metabase, {}), 'health': health, 'timing': timing, 'points': new_points}


def safely_call(fn, fallback):
    try:
        return fn()
    except Exception:
        return fallback


def main():
    config = json.loads(Path(CONFIG).read_text())
    result = {'heartbeat': 1}
    sql_uptime = {'status': 4}
    sql_observed = dt.datetime.now(dt.timezone.utc).isoformat()
    def check(name, fn):
        try:
            result[name] = int(fn())
        except Exception:
            result[name] = 4
    uptime = float(Path('/proc/uptime').read_text().split()[0])
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=7)))
    def job(name, idle, duration):
        return timer_status(properties(name+'.service'), properties(name+'.timer'), uptime, now, idle, duration)
    check('conversations', lambda: job('mw-partner-conversation', 180, 1260)
          if config.get('partner_conversations_enabled') else 3)
    receipt_pipeline=receipt_snapshot(config,job)
    result['receipts']=receipt_pipeline['status']
    polling_timing = {'last_completion': 0, 'running': -1}
    def polling():
        service = properties('mw-conversation-poll.service')
        timer = properties('mw-conversation-poll.timer')
        polling_timing['last_completion'] = completion_epoch(service, time.monotonic(), time.time())
        polling_timing['running'] = int(service.get('ActiveState') in ('active', 'activating'))
        return timer_status(service, timer, uptime, now, 600, 600)
    check('polling', lambda: polling() if config.get('conversation_poll_enabled') else 3)
    audit_relay = relay_snapshot(config, job)
    result['audit_relay'] = audit_relay['status']
    check('daily_jobs', lambda: combine([job('mw-cash-statement', 90000, 3600),
                                     job('mw-cash-statement-email-retry', 600, 600)])
          if config.get('cash_statement_schedule_enabled') else 3)
    webhook = {'code_version': None}
    def webhook_local():
        status, webhook['code_version'] = readiness(fetch)
        return status
    check('webhook_local', lambda: webhook_local() if config.get('receiver_enabled') else 3)
    def tunnel():
        if properties('mw-cloudflared-instagram.service').get('ActiveState') != 'active':
            return 0
        metrics = fetch('http://127.0.0.1:20241/metrics')
        values = [float(line.split()[-1]) for line in metrics.splitlines()
                  if line.startswith('cloudflared_tunnel_ha_connections ')]
        return 4 if not values else (1 if values[0] >= 4 else (2 if values[0] > 0 else 0))
    check('tunnel', tunnel)
    def tailscale():
        p = run(['tailscale', 'status', '--json'])
        if p.returncode:
            return 4
        s = json.loads(p.stdout)
        if s.get('BackendState') != 'Running' or s.get('Self', {}).get('Online') is not True:
            return 0
        return 2 if s.get('Health') else 1
    check('tailscale_node', tailscale)
    extras = {}
    def database():
        nonlocal sql_uptime, sql_observed
        if properties('cloud-sql-auth-proxy.service').get('ActiveState') != 'active':
            return 0
        status, sample = database_probe(config, extras)
        if sample:
            sql_uptime, sql_observed = sample
        return status
    check('database', database)
    def codex():
        env = dict(os.environ, HOME='/var/lib/mw-integration-agent', CODEX_HOME=config['codex_home'])
        version = run([config['codex_executable'], '--version'], env=env)
        login = run([config['codex_executable'], 'login', 'status'], env=env)
        return 1 if version.returncode == login.returncode == 0 else 0
    check('codex_ready', codex)
    # Keep oltp/olap labels for the existing 12-instance rule; their meaning is native API.
    for scope in ('oltp', 'olap'):
        check(scope, lambda scope=scope: native_api_status(config, scope))
    for environment in ('dev', 'prod'):
        check('pwa_hosting_' + environment, lambda environment=environment: hosting_status(environment))
    from metabase_probes import collect
    meta = {'Metadata-Flavor': 'Google'}
    instance = fetch('http://metadata.google.internal/computeMetadata/v1/instance/id', meta).strip()
    token = json.loads(fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', meta))['access_token']
    points = load_points()
    added = collect_r089(config, token, uptime, time.time(), result, polling_timing, extras, webhook['code_version'], points, collect)
    metabase = added['metabase']
    result.update(added['health'])
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
    series = [{'metric': {'type': METRIC, 'labels': {'component': k}}, 'resource': {'type': 'gce_instance',
               'labels': {'project_id': PROJECT, 'instance_id': instance, 'zone': 'asia-southeast1-a'}},
               'metricKind': 'GAUGE', 'valueType': 'INT64',
               'points': [{'interval': {'endTime': timestamp}, 'value': {'int64Value': str(v)}}]} for k,v in result.items()]
    # Separate numeric metric avoids timestamp-valued labels and preserves alert identities.
    for field, value in dict(polling_timing, status=result['polling']).items():
        series.append({'metric': {'type': WORKER_METRIC, 'labels': {'component': 'polling', 'field': field}},
                       'resource': series[0]['resource'], 'metricKind': 'GAUGE', 'valueType': 'INT64',
                       'points': [{'interval': {'endTime': timestamp}, 'value': {'int64Value': str(value)}}]})
    for field,value in audit_relay.items():
        series.append({'metric': {'type': WORKER_METRIC, 'labels': {'component':'audit_relay','field':field}},
                       'resource':series[0]['resource'],'metricKind':'GAUGE','valueType':'INT64',
                       'points':[{'interval':{'endTime':timestamp},'value':{'int64Value':str(value)}}]})
    series.extend(sql_uptime_series(sql_uptime, sql_observed, series[0]['resource']))
    # One low-cardinality numeric snapshot; no borrower/payment identifiers or amounts.
    for field,value in dict(receipt_pipeline,status=result['receipts']).items():
        series.append({'metric': {'type':'custom.googleapis.com/mw_resource_monitoring/receipt_pipeline',
                       'labels':{'field':field}}, 'resource':series[0]['resource'],
                       'metricKind':'GAUGE','valueType':'INT64',
                       'points':[{'interval':{'endTime':timestamp},'value':{'int64Value':str(value)}}]})
    for component, fields in metabase.items():
        for field, value in fields.items():
            series.append({'metric': {'type': 'custom.googleapis.com/mw_resource_monitoring/metabase_probe',
                           'labels': {'component': component, 'field': field}},
                           'resource': series[0]['resource'], 'metricKind': 'GAUGE', 'valueType': 'INT64',
                           'points': [{'interval': {'endTime': timestamp}, 'value': {'int64Value': str(value)}}]})
    for component, fields, end_time in added['timing']:
        series.extend(timing_series(component, fields, series[0]['resource'], end_time or timestamp))
    # Saved before the export: a point is never sent twice out of order (losing one is acceptable).
    try:
        save_points(added['points'])
    except Exception:
        pass
    req = urllib.request.Request(f'https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries',
          data=json.dumps({'timeSeries': series}).encode(), method='POST',
          headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        response.read()
    print(json.dumps({'checkedAt': timestamp, 'health': result, 'receipt_pipeline':receipt_pipeline,
                     'audit_relay':audit_relay,'webhook_code_version':webhook['code_version'],'sql_uptime':sql_uptime,'sql_uptime_observed_at':sql_observed,
                     'timing':{c:f for c,f,_ in added['timing']},
                     'exported': True}))


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3 and sys.argv[1] == '--hosting-probe' and sys.argv[2] in HOSTING_ORIGINS:
            print(json.dumps({'status': hosting_status(sys.argv[2], fetcher=hosting_fetch)}))
        elif len(sys.argv) == 1:
            main()
        else:
            raise ValueError('Unknown monitoring command')
    except Exception as exc:
        # Never serialize provider response bodies or private configuration.
        print(json.dumps({'exported': False, 'errorType': type(exc).__name__}))
        raise SystemExit(1)
