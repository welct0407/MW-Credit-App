import type { Arm, Configuration, LedgerSession } from './types.js';
import { fail } from './errors.js';
import { validateObservation } from './state-machine.js';
export function updateAdmission(session: LedgerSession, generation: number, enable: boolean): void {
  if (session.data.generation !== generation) fail(412, 'stale_generation');
  if (enable && session.data.activeRequestId) fail(409, 'operation_in_progress');
  session.data.admissionEnabled = enable; session.data.generation += 1;
}
export interface Reconciliation {
  generation: number; workersFenced: boolean; requestId: string;
  result: 'succeeded' | 'failed' | 'canceled' | 'not-dispatched'; evidence: string;
}
export async function reconcileOperation(session: LedgerSession, config: Configuration, arm: Arm, reconciliation: Reconciliation, now = Date.now()): Promise<void> {
  if (session.data.generation !== reconciliation.generation) fail(412, 'stale_generation');
  if (session.data.admissionEnabled || !reconciliation.workersFenced) fail(409, 'worker_fencing_required');
  if (session.data.activeRequestId !== reconciliation.requestId) fail(409, 'active_operation_mismatch');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(reconciliation.evidence) || !['succeeded', 'failed', 'canceled', 'not-dispatched'].includes(reconciliation.result)) fail(400, 'invalid_reconciliation');
  const op = session.data.records[reconciliation.requestId]!;
  if (reconciliation.result === 'succeeded') {
    const observation = await arm.observe(); validateObservation(observation, config, now);
    if (observation.provisioningState !== 'Succeeded' || observation.powerState !== (op.action === 'deallocate' ? 'deallocated' : 'running')) fail(409, 'desired_state_not_observed');
  }
  op.phase = reconciliation.result === 'succeeded' ? 'completed' : 'rejected'; op.reason = `administrator_reconciled_${reconciliation.result}`; op.updatedAt = new Date(now).toISOString();
  session.data.audit.push({ at: op.updatedAt, event: `reconciled:${reconciliation.evidence}`, requestId: op.requestId, callerOid: op.callerOid }); session.data.audit = session.data.audit.slice(-1000);
  session.data.activeRequestId = null; session.data.generation += 1;
}
