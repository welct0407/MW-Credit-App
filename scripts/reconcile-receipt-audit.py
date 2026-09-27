"""Owner-run recovery of missing receipt intents, never a payment replay.

Default is read-only. Apply requires the exact planned count and a verified backup.
Only missing intents with immutable asset/link and exact V50 metadata effects pass.
"""
import argparse
import json
import uuid
from pathlib import Path

from mw_integration_agent import audit, receipt_audit
from mw_integration_agent.outbox import business
from mw_integration_agent.state import transaction


def reconcile(config, apply=False, expected=None, backup=None):
    if config['database_name'] != 'loan_manager_prod' or config['receipt_environment'] != 'prod':
        raise RuntimeError('Production receipt target required')
    if apply and (expected is None or not backup):
        raise RuntimeError('Explicit expected count and verified backup reference required')
    with business(config) as source, transaction(config) as central:
        source.execute('SET default_transaction_read_only=on')
        if not apply:
            central.execute('SET TRANSACTION READ ONLY')
        pending = source.execute('''SELECT operation_id,plan_sha256,reviewer_id,reviewer_login,
            recorded_in_transaction_at FROM agent_audit.commits c
            WHERE NOT EXISTS(SELECT 1 FROM agent_audit.exports e WHERE e.operation_id=c.operation_id)
            ORDER BY recorded_in_transaction_at,operation_id''').fetchall()
        ready = []
        for op, marker, actor, login, stamp in pending:
            if central.execute('SELECT 1 FROM audit.operations WHERE operation_id=%s', (op,)).fetchone():
                continue
            row = central.execute('''SELECT to_jsonb(l),to_jsonb(a) FROM runtime.receipt_payment_links l
                JOIN runtime.receipt_assets a USING(receipt_id) WHERE l.link_id=%s''', (str(op),)).fetchone()
            if not row:
                raise RuntimeError('Missing immutable receipt association; no recovery applied')
            link, asset = row
            value = receipt_audit.plan(config, link, asset)
            changes = source.execute('''SELECT change_id,schema_name::text,table_name::text,action,row_key::text,
                before_row::text,after_row::text FROM agent_audit.row_changes WHERE operation_id=%s ORDER BY change_id''', (op,)).fetchall()
            receipt_audit.verify_marker(op, marker, actor, login, changes, value, config['database_name'])
            ready.append((op, value, stamp))
        if expected is not None and len(ready) != expected:
            raise RuntimeError('Recovery count changed; re-plan')
        if apply:
            for op, value, stamp in ready:
                receipt_audit.begin(central, config, value)
                audit.event(central, op, 'receipt_intent_reconstructed',
                    {'reason': 'Owner-authorized repair of missing V49/V50 projector audit linkage',
                     'business_committed_at': str(stamp), 'backup_reference': backup,
                     'intent_was_missing_at_recovery': True},
                    route='migration', state='COMMITTED', key='receipt-intent-reconstructed-v1')
    return {'mode': 'applied' if apply else 'plan', 'missing_validated': len(ready),
            'pending_markers': len(pending), 'business_writes': 0}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    p.add_argument('--expected', type=int)
    p.add_argument('--backup-reference')
    args = p.parse_args()
    config = json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
    print(json.dumps(reconcile(config, args.apply, args.expected, args.backup_reference)))
