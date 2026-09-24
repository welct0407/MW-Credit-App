"""Read-only Debian checks; export numeric health and worker timing to GCP Monitoring.

0 DOWN, 1 UP, 2 DEGRADED, 3 PAUSED, 4 UNKNOWN. No business jobs are invoked.
Installed separately from the integration-agent package; uses its existing config.
"""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
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


def combine(values):
    for severity in (0, 4, 2, 3):
        if severity in values:
            return severity
    return 1


def main():
    config = json.loads(Path(CONFIG).read_text())
    result = {'heartbeat': 1}
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
    check('receipts', lambda: job('mw-receipt-summary', 180, 1260) if config.get('receipt_summary_enabled') else 3)
    polling_timing = {'last_completion': 0, 'running': -1}
    def polling():
        service = properties('mw-conversation-poll.service')
        timer = properties('mw-conversation-poll.timer')
        polling_timing['last_completion'] = completion_epoch(service, time.monotonic(), time.time())
        polling_timing['running'] = int(service.get('ActiveState') in ('active', 'activating'))
        return timer_status(service, timer, uptime, now, 600, 600)
    check('polling', lambda: polling() if config.get('conversation_poll_enabled') else 3)
    check('audit_relay', lambda: job('mw-audit-relay', 180, 180))
    check('daily_jobs', lambda: combine([job('mw-cash-statement', 90000, 3600),
                                     job('mw-cash-statement-email-retry', 600, 600)])
          if config.get('cash_statement_schedule_enabled') else 3)
    check('webhook_local', lambda: (1 if fetch('http://127.0.0.1:8000/health').strip() == 'mw-instagram-webhook' else 0)
          if config.get('receiver_enabled') else 3)
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
        import psycopg
        from mw_integration_agent.state import parameters
        from mw_integration_agent.config import load_secret
        if properties('cloud-sql-auth-proxy.service').get('ActiveState') != 'active':
            return 0
        connections = [parameters(config), dict(host=config['database_host'], port=config['database_port'],
            dbname=config['database_name'], user=config['database_user'],
            password=load_secret(config, 'database_password_file'), connect_timeout=8)]
        for args in connections:
            args['options'] = '-c default_transaction_read_only=on -c statement_timeout=5000'
            with psycopg.connect(**args) as conn:
                if conn.execute('SELECT 1').fetchone() != (1,):
                    return 0
        return 1
    check('database', database)
    def codex():
        env = dict(os.environ, HOME='/var/lib/mw-integration-agent', CODEX_HOME=config['codex_home'])
        version = run([config['codex_executable'], '--version'], env=env)
        login = run([config['codex_executable'], 'login', 'status'], env=env)
        return 1 if version.returncode == login.returncode == 0 else 0
    check('codex_ready', codex)
    for app in ('oltp', 'olap'):
        def probe(app=app):
            if not config.get('appsheet_enabled'):
                return 3
            p = run(['/opt/mw-integration-agent/.venv/bin/mw-integration-agent', 'appsheet-probe',
                     '--app', app, '--config', CONFIG, '--catalogue', '/etc/mw-integration-agent/service-catalogue.json'], 70)
            return 1 if p.returncode == 0 and json.loads(p.stdout).get('authenticated') is True else 0
        check(app, probe)
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
    req = urllib.request.Request(f'https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries',
          data=json.dumps({'timeSeries': series}).encode(), method='POST',
          headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        response.read()
    print(json.dumps({'checkedAt': timestamp, 'health': result, 'exported': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Never serialize provider response bodies or private configuration.
        print(json.dumps({'exported': False, 'errorType': type(exc).__name__}))
        raise SystemExit(1)
