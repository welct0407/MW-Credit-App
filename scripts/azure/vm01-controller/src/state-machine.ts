import { createHash } from 'node:crypto';
import { fail } from './errors.js';
import type { Action, ActionRequest, Configuration, LedgerData, Operation, VmObservation } from './types.js';
export const MAX_OBSERVATION_AGE_MS = 120000;
export const MAX_NEW_REQUEST_AGE_MS = 86400000;
export const RETENTION_MS = 7 * 86400000;
export const ACCEPTED_TIMEOUT_MS = 15 * 60000;
export function validateObservation(observation: VmObservation, config: Configuration, now: number): void {
  if (observation.vmId.toLowerCase() !== config.expectedVmId) fail(503, 'vm_identity_mismatch');
  const observed = Date.parse(observation.observedAt);
  if (!Number.isFinite(observed) || observed > now + 30000 || now - observed > MAX_OBSERVATION_AGE_MS) fail(503, 'stale_vm_observation');
}
export function stateVersion(observation: VmObservation, ledger: LedgerData): string {
  return createHash('sha256').update(JSON.stringify([ledger.generation, ledger.targetResourceId, observation.vmId, observation.powerState, observation.provisioningState])).digest('hex');
}
export function actionAvailable(action: Action, observation: VmObservation): boolean {
  if (observation.provisioningState !== 'Succeeded') return false;
  if (action === 'restart') return observation.powerState === 'running';
  return ['running', 'stopped', 'deallocated'].includes(observation.powerState);
}
export function isNoop(action: Action, observation: VmObservation): boolean {
  return (action === 'start' && observation.powerState === 'running') || (action === 'deallocate' && observation.powerState === 'deallocated');
}
export function parseRequest(input: unknown): ActionRequest {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail(400, 'invalid_request');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(k => !['requestId', 'stateVersion', 'observedAt', 'confirmation'].includes(k)) || typeof body.requestId !== 'string' || !/^\d{13}\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId) || typeof body.stateVersion !== 'string' || !/^[0-9a-f]{64}$/.test(body.stateVersion) || typeof body.observedAt !== 'string' || !Number.isFinite(Date.parse(body.observedAt))) fail(400, 'invalid_request');
  const result: ActionRequest = { requestId: body.requestId, stateVersion: body.stateVersion, observedAt: body.observedAt };
  if (body.confirmation !== undefined) {
    const confirmation = body.confirmation as Record<string, unknown>;
    if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation) || Object.keys(confirmation).some(k => !['workSaved', 'admissionHeld', 'approvalReference'].includes(k)) || confirmation.workSaved !== true || confirmation.admissionHeld !== true || typeof confirmation.approvalReference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(confirmation.approvalReference)) fail(400, 'invalid_confirmation');
    result.confirmation = { workSaved: true, admissionHeld: true, approvalReference: confirmation.approvalReference };
  }
  return result;
}
export function digestRequest(action: Action, request: ActionRequest): string {
  return createHash('sha256').update(JSON.stringify([action, request.requestId, request.stateVersion, request.observedAt, request.confirmation ?? null])).digest('hex');
}
export function validateFreshRequest(request: ActionRequest, now: number): void {
  const issued = Number(request.requestId.slice(0, 13));
  if (issued > now + 30000 || now - issued > MAX_NEW_REQUEST_AGE_MS) fail(412, 'expired_request');
  const observed = Date.parse(request.observedAt);
  if (observed > now + 30000 || now - observed > MAX_OBSERVATION_AGE_MS) fail(412, 'stale_precondition');
}
export function publicOperation(operation: Operation): Record<string, unknown> {
  return { requestId: operation.requestId, action: operation.action, phase: operation.phase, createdAt: operation.createdAt, updatedAt: operation.updatedAt, ...(operation.reason ? { reason: operation.reason } : {}) };
}
export function bootstrapLedger(config: Configuration): LedgerData {
  return { schemaVersion: 1, generation: 1, targetResourceId: config.resourceId, expectedVmId: config.expectedVmId, admissionEnabled: false, activeRequestId: null, records: {}, audit: [] };
}
