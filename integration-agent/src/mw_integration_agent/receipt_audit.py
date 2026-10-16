"""Receipt projector's explicit V49/V50 audit contract; no business writes.

Business markers use the receipt identity digest, not the canonical plan digest.
Keep both checks and bind the exact operation, actor and metadata-only effect.
"""
import json
import uuid
from datetime import datetime, UTC

from . import audit
from .business_time import BANGKOK
from .config import DATABASES, ConfigurationError

SERVICE = 'receipt_projection'
ACTOR = {'kind': 'system', 'id': 'receipt-projector', 'login': 'service:receipt-projector'}
FIELDS = ('IG Receipt ID', 'Receipt Image', 'Receipt Received At')


def plan(config, link, asset):
    source = json.loads(asset['source'])
    environment = config['receipt_environment']
    identity = ['receipt-v1', environment, config['instagram_account_id'], asset['job_id']]
    expected_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mw-receipt:'+asset['receipt_id']+':'+link['payment_id']))
    if (audit.digest(identity) != asset['receipt_id'] or link['receipt_id'] != asset['receipt_id']
            or link['link_id'] != expected_id or link['business_environment'] != environment
            or source['environment'] != environment or source['instagram_account_id'] != config['instagram_account_id']
            or asset['archive_state'] != 'ARCHIVED' or not asset['generation']
            or audit.digest(json.loads(link['verification'])) != link['verification_digest']):
        raise ConfigurationError('RECEIPT_AUDIT_IDENTITY_MISMATCH')
    captured = datetime.fromtimestamp(source['captured_at'], UTC).astimezone(BANGKOK).replace(tzinfo=None)
    return {'contract': 'receipt-projection-v1', 'operation_id': expected_id,
            'database': DATABASES[environment],
            'payment_id': link['payment_id'], 'receipt_id': asset['receipt_id'],
            'object_key': asset['object_key'], 'generation': asset['generation'],
            'verification_digest': link['verification_digest'],
            'after': {'IG Receipt ID': asset['receipt_id'], 'Receipt Image': '//'+asset['object_key'],
                      'Receipt Received At': captured.isoformat()}}


def begin(conn, config, value):
    return audit.begin(conn, config, SERVICE, value['operation_id'], action='UPDATE',
                       plan=value, actor=ACTOR, operation=uuid.UUID(value['operation_id']))


def verify_marker(op, receipt_hash, actor, login, rows, value, database):
    try:
        if (value['contract'] != 'receipt-projection-v1' or value['operation_id'] != str(op)
                or value['database'] != database or value['receipt_id'] != receipt_hash
                or (actor, login) != (ACTOR['id'], ACTOR['login']) or len(rows) != 1):
            raise ValueError()
        _, schema, table, action, key, before, after = rows[0]
        if (schema, table, action) != ('public', 'Payments', 'UPDATE'):
            raise ValueError()
        if json.loads(key) != {'Row ID': value['payment_id']} or json.loads(before) != dict.fromkeys(FIELDS):
            raise ValueError()
        observed = json.loads(after)
        # PostgreSQL serializes timestamps with T; normalize only timestamp spelling.
        expected = dict(value['after'])
        observed['Receipt Received At'] = datetime.fromisoformat(observed['Receipt Received At']).isoformat()
        expected['Receipt Received At'] = datetime.fromisoformat(expected['Receipt Received At']).isoformat()
        if observed != expected:
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise ConfigurationError('OUTBOX_RECEIPT_EFFECT_MISMATCH') from None
