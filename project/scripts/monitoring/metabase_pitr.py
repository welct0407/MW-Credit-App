"""Read Railway's live pgBackRest/archiver status without changing the database.

The Railway CLI, workspace/project token and registered SSH identity are installed
outside Git. A missing/inaccessible probe is UNKNOWN, never healthy.
"""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import time

CLI = '/opt/mw-resource-monitoring/railway'
TOKEN_FILE = Path('/etc/mw-resource-monitoring/railway-pitr-token.txt')
IDENTITY = '/var/lib/mw-integration-agent/.ssh/id_ed25519'
PROJECT = 'c8e57452-36dc-41f1-8d00-856b521a96c7'
SERVICE = '6ba627ff-bc6d-41e7-8182-6c0f1fb03998'
ENVIRONMENT = 'df3ba125-0d62-446a-b4d8-5196780982c9'


def epoch(value):
    if not value:
        return 0
    try:
        return int(dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())
    except (TypeError, ValueError):
        return 0


def classify(payload, now=None):
    now = int(now or time.time())
    live = payload.get('live') or {}
    archived = epoch(live.get('archiverLastArchivedAt'))
    result = {'status': 4, 'last_archived': archived,
              'backup_sets': int(live.get('backupSetCount') or 0),
              'archive_age_seconds': max(0, now - archived) if archived else 0}
    if not payload.get('enabled') or not payload.get('bucketWired'):
        result['status'] = 0
    elif not live.get('available') or live.get('archiverError') or live.get('backupCoverageError'):
        result['status'] = 4
    elif live.get('archiverHealthy') is False:
        result['status'] = 0
    elif live.get('archiverHealthy') is not True or not archived or result['backup_sets'] < 1 or not live.get('walMax'):
        result['status'] = 4
    elif result['archive_age_seconds'] <= 1800:
        result['status'] = 1
    elif result['archive_age_seconds'] <= 3600:
        result['status'] = 2
    else:
        result['status'] = 0
    return result


def probe():
    if not TOKEN_FILE.is_file() or not Path(CLI).is_file() or not Path(IDENTITY).is_file():
        return {'status': 4, 'last_archived': 0, 'backup_sets': 0, 'archive_age_seconds': 0}
    env = dict(os.environ, RAILWAY_TOKEN=TOKEN_FILE.read_text().strip(),
               HOME='/var/lib/mw-integration-agent')
    # The CLI performs two read-only live probes inside Postgres over Railway SSH.
    cmd = [CLI, 'postgres', '--json', '--project', PROJECT, '--service', SERVICE,
           '--environment', ENVIRONMENT, 'pitr', 'status']
    try:
        completed = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
        if completed.returncode:
            raise RuntimeError('Railway status probe failed')
        return classify(json.loads(completed.stdout))
    except (OSError, ValueError, subprocess.TimeoutExpired, RuntimeError):
        return {'status': 4, 'last_archived': 0, 'backup_sets': 0, 'archive_age_seconds': 0}
