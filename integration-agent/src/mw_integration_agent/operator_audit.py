"""Retrospective operator SQL linkage; never execute or replay business DML.

The legacy operator marker hashes PostgreSQL jsonb text. Central audit hashes
sorted compact JSON. Both are verified independently, never substituted.
"""
import hashlib
import json
import uuid

from . import audit
from .config import ConfigurationError

SERVICE = 'operator_sql_reconciliation'
CONTRACT = 'operator-sql-reconciliation-v1'


def snapshot(source, operation):
    source.execute("SET TIME ZONE 'UTC'")
    marker = source.execute('''SELECT operation_id::text,plan_sha256,reviewer_id,reviewer_login,
        database_txid::text,recorded_in_transaction_at::text,request_reason,direct_targets::text,code_version
        FROM agent_audit.commits WHERE operation_id=%s''', (operation,)).fetchone()
    if not marker:
        raise ConfigurationError('OPERATOR_MARKER_MISSING')
    rows = source.execute('''SELECT change_id,schema_name::text,table_name::text,action,row_key::text,
        before_row::text,after_row::text,database_txid::text FROM agent_audit.row_changes
        WHERE operation_id=%s ORDER BY change_id''', (operation,)).fetchall()
    original = source.execute('SELECT (direct_targets->0)::text FROM agent_audit.commits WHERE operation_id=%s',
                              (operation,)).fetchone()[0]
    return marker, rows, original


def plan(captured, database, evidence):
    marker, rows, original = captured
    try:
        op, marker_hash, actor, login, txid, recorded, reason, targets, revision = marker
        if (database != 'loan_manager_prod' or str(uuid.UUID(op)) != op or not actor or not login
                or not txid.isdecimal() or not revision or not reason or not recorded
                or not 1 <= len(rows) <= 1000 or any(r[7] != txid for r in rows)
                or not isinstance(json.loads(targets), list) or len(json.loads(targets)) != 1
                or json.loads(targets)[0] != json.loads(original) or not isinstance(json.loads(original), dict)
                or not isinstance(evidence, dict) or set(evidence) != {'origin_reference', 'authorization_reference'}
                or any(not isinstance(v, str) or not v.strip() for v in evidence.values())):
            raise ValueError()
        pg_hash = hashlib.sha256(original.encode('utf-8')).hexdigest()
        if marker_hash != pg_hash:
            raise ValueError()
        return {'contract': CONTRACT, 'operation_id': op, 'database': database,
            'original_plan': json.loads(original), 'original_plan_canonical_sha256': audit.digest(json.loads(original)),
            'source': {'hash_format': 'postgresql-jsonb-text-utf8-no-newline', 'plan_sha256': pg_hash,
                'marker_sha256': audit.digest(marker), 'effects_sha256': audit.digest(rows),
                'effect_count': len(rows), 'transaction_id': txid, 'recorded_in_transaction_at': recorded,
                'actor_id': actor, 'actor_login': login, 'code_version': revision},
            'evidence': dict(evidence), 'retrospective': True}
    except (ValueError, TypeError, KeyError, IndexError):
        raise ConfigurationError('OPERATOR_SOURCE_CONTRACT_MISMATCH') from None


def verify(captured, database, intent):
    """Bind central canonical content, operator identity and immutable source."""
    try:
        central_hash, actor, login, service, value, kind = intent
        expected = plan(captured, database, value['evidence'])
        if (service != SERVICE or kind != 'operator' or value != expected
                or central_hash != audit.digest(value)
                or (actor, login) != (expected['source']['actor_id'], expected['source']['actor_login'])):
            raise ValueError()
    except (ValueError, TypeError, KeyError, IndexError):
        raise ConfigurationError('OUTBOX_OPERATOR_CONTRACT_MISMATCH') from None


def check_manifest(value, manifest):
    expected = {'operation_id': value['operation_id'], 'plan_sha256': value['source']['plan_sha256'],
        'original_plan_canonical_sha256': value['original_plan_canonical_sha256'],
        'marker_sha256': value['source']['marker_sha256'], 'effects_sha256': value['source']['effects_sha256'],
        'effect_count': value['source']['effect_count']}
    if any(manifest.get(k) != v for k, v in expected.items()):
        raise ConfigurationError('OPERATOR_RECOVERY_EVIDENCE_CHANGED')


def recover(config, manifest, apply=False, backup_reference=None):
    from .outbox import business
    from .state import transaction
    if apply and (not isinstance(backup_reference, str) or not backup_reference.strip()):
        raise ConfigurationError('OPERATOR_VERIFIED_BACKUP_REQUIRED')
    with business(config) as source:
        source.execute('SET default_transaction_read_only=on')
        captured = snapshot(source, manifest['operation_id'])
        value = plan(captured, config['database_name'], manifest['evidence'])
        check_manifest(value, manifest)
        with transaction(config) as central:
            if apply:
                central.execute('SELECT pg_advisory_xact_lock(%s)', (int(audit.digest(value['operation_id'])[:15], 16),))
            else:
                central.execute('SET TRANSACTION READ ONLY')
            old = central.execute('''SELECT plan_sha256,actor_id,actor_login,service_name,plan,actor_kind
                FROM audit.operations WHERE operation_id=%s''', (value['operation_id'],)).fetchone()
            state = central.execute('SELECT state FROM runtime.operation_state WHERE operation_id=%s',
                                    (value['operation_id'],)).fetchone()
            if old:
                verify(captured, config['database_name'], old)
                if old[4] != value:
                    raise ConfigurationError('OPERATOR_RECOVERY_CONTENT_CONFLICT')
                if not state:
                    raise ConfigurationError('OPERATOR_STATE_MISSING')
            elif state:
                raise ConfigurationError('OPERATOR_STATE_CONFLICT')
            if apply:
                actor = {'kind': 'operator', 'id': value['source']['actor_id'],
                    'login': value['source']['actor_login'], 'authorization': value['evidence']}
                audit.begin(central, config, SERVICE, value['operation_id'], action='RECONCILE',
                    plan=value, actor=actor, operation=uuid.UUID(value['operation_id']))
                audit.event(central, uuid.UUID(value['operation_id']), 'operator_linkage_reconstructed',
                    {'retrospective': True, 'prior_central_intent_existed': False,
                     'original_recorded_in_transaction_at': value['source']['recorded_in_transaction_at'],
                     'original_transaction_id': value['source']['transaction_id'],
                     'source_marker_sha256': value['source']['marker_sha256'],
                     'source_effects_sha256': value['source']['effects_sha256'],
                     'origin_reference': value['evidence']['origin_reference'],
                     'authorization_reference': value['evidence']['authorization_reference'],
                     'backup_reference': backup_reference}, route='migration',
                    state=None if old else 'COMMITTED', key='operator-linkage-reconstructed-v1')
    return {'mode': 'applied' if apply else 'plan', 'already_present': bool(old),
            'effect_count': value['source']['effect_count'], 'business_writes': 0}
