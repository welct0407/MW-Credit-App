"""Read-only Debian checks; export numeric health and worker timing to GCP Monitoring.

0 DOWN, 1 UP, 2 DEGRADED, 3 PAUSED, 4 UNKNOWN. No business jobs are invoked.
Installed separately from the integration-agent package; uses its existing config.
"""
import datetime as dt
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

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
                  '-p', 'ExecMainStartTimestampMonotonic'])
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


def database_probe(config):
    """SELECT 1 on mw_agent as the worker and on the business database as database_user.

    Each login follows its auth key (ALL-ARCH-03): password, or the IAM user on the
    auto-iam-authn listener with SET ROLE as the first statement. Returns
    (status, (sql_uptime, observed) or None); the uptime sample uses the business read.
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
    return 1, sample


def sql_uptime_series(snapshot, observed, resource):
    return [{'metric': {'type': WORKER_METRIC,
                        'labels': {'component': 'cloud_sql_prod', 'field': field}},
             'resource': resource, 'metricKind': 'GAUGE', 'valueType': 'INT64',
             'points': [{'interval': {'endTime': observed},
                         'value': {'int64Value': str(value)}}]}
            for field, value in snapshot.items()]


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
    def database():
        nonlocal sql_uptime, sql_observed
        if properties('cloud-sql-auth-proxy.service').get('ActiveState') != 'active':
            return 0
        status, sample = database_probe(config)
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
    metabase = collect()
    timestamp = dt.datetime.now(dt.timezone.utc).isoformat()
    meta = {'Metadata-Flavor': 'Google'}
    instance = fetch('http://metadata.google.internal/computeMetadata/v1/instance/id', meta).strip()
    token = json.loads(fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', meta))['access_token']
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
    req = urllib.request.Request(f'https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries',
          data=json.dumps({'timeSeries': series}).encode(), method='POST',
          headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        response.read()
    print(json.dumps({'checkedAt': timestamp, 'health': result, 'receipt_pipeline':receipt_pipeline,
                     'audit_relay':audit_relay,'webhook_code_version':webhook['code_version'],'sql_uptime':sql_uptime,'sql_uptime_observed_at':sql_observed,
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
