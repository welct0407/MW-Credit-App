"""Immutable PostgreSQL copies of exact statement snapshot text."""
from datetime import datetime, UTC
import hashlib
import json
from decimal import Decimal
from .config import ConfigurationError
from .state import enabled, transaction
from . import audit


def load(config, key):
    if not enabled(config):return None
    with transaction(config) as c:
        row=c.execute('SELECT payload_text,payload_sha256 FROM runtime.statement_snapshots WHERE snapshot_key=%s',(key,)).fetchone()
        if not row:return None
        if hashlib.sha256(row[0].encode()).hexdigest()!=row[1]:raise ConfigurationError('STATEMENT_SNAPSHOT_DIGEST_MISMATCH')
        return row[0]


def freeze(conn, key, text, source_file, frozen_at):
    report=json.loads(text,parse_float=Decimal)
    digest=hashlib.sha256(text.encode()).hexdigest()
    conn.execute('''INSERT INTO runtime.statement_snapshots(snapshot_key,period_start,period_end,basis,payload_text,payload_sha256,source_file,frozen_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
        (key,report['start'],report['end'],report['basis'],text,digest,source_file,frozen_at))
    old=conn.execute('SELECT payload_sha256 FROM runtime.statement_snapshots WHERE snapshot_key=%s',(key,)).fetchone()
    if not old or old[0]!=digest:raise ConfigurationError('STATEMENT_SNAPSHOT_CONTENT_CHANGED')


def save(config,key,text,source_file):
    if not enabled(config):return
    with transaction(config) as c:
        freeze(c,key,text,source_file,datetime.now(UTC))
        op=audit.begin(c,config,'statement_snapshot',key,plan={'payload_sha256':hashlib.sha256(text.encode()).hexdigest()})
        audit.event(c,op,'snapshot_frozen',state='COMPLETED',key='frozen')
