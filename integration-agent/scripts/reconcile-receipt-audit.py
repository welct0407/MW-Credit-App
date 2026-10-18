"""Owner-run recovery of receipt audit linkage, never a payment replay.

Default is read-only. Apply requires the exact planned count and a verified backup.
Default mode: only missing intents with immutable asset/link and exact V50 metadata effects pass.
--dispatching: closes receipt_payment operations left DISPATCHING because a terminal event was
rejected by the audit route CHECK (shared-command-api, 12 to 18 October 2026). Each must match one
POSTING claim in its job and a POSTED review, and the payment API status and SQL readback must
verify the posted payment. Nothing is resubmitted.
"""
import argparse
import json
from pathlib import Path

from mw_integration_agent import audit, receipt_api, receipt_audit
from mw_integration_agent.outbox import business
from mw_integration_agent.review_execution import readback
from mw_integration_agent.state import transaction

# The review cycle's claim; its state_change audit operation shares the job with the dispatch.
CLAIM = "UPDATE partner_reviews SET state='POSTING',payment_id=? WHERE id=? AND state='APPROVED'"


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


def close_dispatching(config, apply=False, expected=None, backup=None, status=receipt_api.status, verify=readback):
    if config['database_name'] != 'loan_manager_prod' or config['receipt_environment'] != 'prod':
        raise RuntimeError('Production receipt target required')
    if apply and (expected is None or not backup):
        raise RuntimeError('Explicit expected count and verified backup reference required')
    with transaction(config) as central:
        central.execute('SET TRANSACTION READ ONLY')
        stuck = central.execute('''SELECT o.operation_id,o.parent_operation_id FROM audit.operations o
            JOIN runtime.operation_state s USING(operation_id) WHERE o.service_name='receipt_payment' AND s.state='DISPATCHING'
            ORDER BY o.created_at,o.operation_id''').fetchall()
        claims = {audit.digest([key, review]): (review, key, proposal) for review, key, proposal in central.execute(
            "SELECT id,payment_id,proposal FROM runtime.partner_reviews WHERE state='POSTED' AND payment_id LIKE 'pwa:%'").fetchall()}
        planned = []
        for op, parent in stuck:
            found = central.execute('''SELECT plan->>'parameter_digest' FROM audit.operations
                WHERE parent_operation_id=%s AND service_name='journal' AND plan->>'statement'=%s''', (parent, CLAIM)).fetchall()
            if parent is None or len(found) != 1 or found[0][0] not in claims:
                raise RuntimeError('Dispatch without exactly one POSTED review claim; no closure applied')
            planned.append((op, *claims[found[0][0]]))
    if len({p[1] for p in planned}) != len(planned):
        raise RuntimeError('Review claimed by more than one dispatch; no closure applied')
    # Verification runs outside any transaction: status is a read-only API call.
    ready = []
    for op, review, key, proposal in planned:
        result = status(config, key, review)
        if not (receipt_api.posted(result, key) and verify(config, key, json.loads(proposal))):
            raise RuntimeError('Payment not verified as posted; no closure applied')
        ready.append((op, {'reason': 'Owner-authorized closure: terminal audit event rejected by the route CHECK',
            'review_id': review, 'payment_id': key, 'recorded_at': result['originalOutcome'].get('recordedAt'),
            'status_sha256': audit.digest(result), 'readback_verified': True, 'backup_reference': backup}))
    if expected is not None and len(ready) != expected:
        raise RuntimeError('Recovery count changed; re-plan')
    if apply:
        with transaction(config) as central:
            for op, value in ready:
                # event() locks the operation state row; anything no longer DISPATCHING stops the batch.
                if central.execute('SELECT state FROM runtime.operation_state WHERE operation_id=%s FOR UPDATE', (op,)).fetchone()[0] != 'DISPATCHING':
                    raise RuntimeError('Operation changed since the plan; no closure applied')
                audit.event(central, op, 'dispatch_reconciled', value, route='migration', state='COMMITTED',
                            key='receipt-payment-dispatch-reconciled-v1')
    return {'mode': 'applied' if apply else 'plan', 'dispatching_verified': len(ready),
            'operations': [str(op) for op, _ in ready], 'business_writes': 0, 'payment_submissions': 0}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--apply', action='store_true')
    p.add_argument('--expected', type=int)
    p.add_argument('--backup-reference')
    p.add_argument('--dispatching', action='store_true', help='close verified receipt_payment operations stuck in DISPATCHING')
    args = p.parse_args()
    config = json.loads(Path('/etc/mw-integration-agent/config.json').read_text())
    run = close_dispatching if args.dispatching else reconcile
    print(json.dumps(run(config, args.apply, args.expected, args.backup_reference)))
