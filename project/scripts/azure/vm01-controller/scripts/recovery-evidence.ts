import type { Arm, Configuration, LedgerData, LedgerSession, Operation, VerifiedPollOutcome } from '../src/types.js';
import type { ArmCredential, Fetch } from '../src/arm.js';
import { UUID } from '../src/configuration.js';
import { fail } from '../src/errors.js';
import { validateObservation } from '../src/state-machine.js';

export interface ActivityEvent {
  eventDataId: string; eventTimestamp: string; resourceId: string; caller: string; correlationId: string;
  operationName: { value: string }; status: { value: string };
}
export interface RecoveryProof {
  schemaVersion: 1; requestId: string; targetResourceId: string; expectedVmId: string;
  armRequestId: string; submittedAt: string; acceptedAt: string; operationStartTime: string; operationEndTime: string;
  reference: string; recoveryApprovalReference: string;
  deallocateStarted: ActivityEvent; deallocateSucceeded: ActivityEvent;
  recoveryStarted: ActivityEvent; recoverySucceeded: ActivityEvent;
}
export interface ActivityReader { read(from: string, to: string): Promise<ActivityEvent[]> }
export class AzureActivityReader implements ActivityReader {
  constructor(private readonly config: Configuration, private readonly credential: ArmCredential, private readonly fetcher: Fetch = fetch) {}
  async read(from: string, to: string): Promise<ActivityEvent[]> {
    const start = Date.parse(from), end = Date.parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 4 * 3600000) fail(400, 'invalid_activity_window');
    const subscription = this.config.resourceId.split('/')[2]!;
    const url = new URL(`https://management.azure.com/subscriptions/${subscription}/providers/Microsoft.Insights/eventtypes/management/values`);
    url.searchParams.set('api-version', '2015-04-01');
    url.searchParams.set('$filter', `eventTimestamp ge '${new Date(start).toISOString()}' and eventTimestamp le '${new Date(end).toISOString()}' and resourceUri eq '${this.config.resourceId}'`);
    const token = await this.credential.getToken('https://management.azure.com/.default');
    if (!token) fail(503, 'operator_identity_unavailable');
    const response = await this.fetcher(url.href, { method: 'GET', headers: { authorization: `Bearer ${token.token}`, accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (response.status !== 200) { await response.body?.cancel(); fail(503, 'activity_evidence_unavailable'); }
    const body = await response.json() as { value?: ActivityEvent[]; nextLink?: unknown };
    // A partial response is insufficient; never follow a provider-supplied nextLink.
    if (!body || !Array.isArray(body.value) || body.value.length > 1000 || body.nextLink) fail(503, 'activity_evidence_incomplete');
    return body.value;
  }
}
const reference = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value);
function equalEvent(actual: ActivityEvent, expected: ActivityEvent): boolean {
  return actual.eventDataId === expected.eventDataId && actual.eventTimestamp === expected.eventTimestamp && actual.resourceId?.toLowerCase() === expected.resourceId.toLowerCase() && actual.caller?.toLowerCase() === expected.caller.toLowerCase() && actual.correlationId === expected.correlationId && actual.operationName?.value?.toLowerCase() === expected.operationName.value.toLowerCase() && actual.status?.value === expected.status.value;
}
export async function verifyHistoricalDeallocation(config: Configuration, arm: Arm, activity: ActivityReader, op: Operation, proof: RecoveryProof, audit: LedgerData['audit'], now = Date.now()): Promise<VerifiedPollOutcome> {
  if (!proof || proof.schemaVersion !== 1 || proof.targetResourceId !== config.resourceId || proof.expectedVmId !== config.expectedVmId || proof.requestId !== op.requestId || op.action !== 'deallocate' || op.armStatus !== 202 || !UUID.test(proof.armRequestId) || proof.armRequestId !== op.armRequestId || proof.submittedAt !== op.createdAt || !reference(proof.reference) || !reference(proof.recoveryApprovalReference)) fail(409, 'recovery_receipt_mismatch');
  // Legacy records use their unique preserved acceptance audit, never mutable updatedAt.
  const acceptedEvents = audit.filter(event => event.requestId === op.requestId && event.callerOid === op.callerOid && event.event === 'accepted');
  const acceptedAt = op.armAcceptedAt ?? (acceptedEvents.length === 1 ? acceptedEvents[0]!.at : undefined);
  if (!acceptedAt || proof.acceptedAt !== acceptedAt) fail(409, 'recovery_receipt_mismatch');
  const expected = [proof.deallocateStarted, proof.deallocateSucceeded, proof.recoveryStarted, proof.recoverySucceeded];
  const times = expected.map(event => Date.parse(event?.eventTimestamp));
  for (let i = 0; i < expected.length; i++) {
    const event = expected[i]!;
    if (!event || !UUID.test(event.eventDataId) || !UUID.test(event.correlationId) || event.resourceId !== config.resourceId || typeof event.caller !== 'string' || !event.caller || !Number.isFinite(times[i]) || times[i]! > now || event.operationName?.value !== `Microsoft.Compute/virtualMachines/${i < 2 ? 'deallocate' : 'start'}/action` || event.status?.value !== (i % 2 ? 'Succeeded' : 'Started')) fail(409, 'recovery_activity_mismatch');
  }
  if (new Set(expected.map(event => event.eventDataId)).size !== 4 || !UUID.test(proof.deallocateStarted.caller) || proof.deallocateStarted.caller !== proof.deallocateSucceeded.caller || proof.deallocateStarted.correlationId !== proof.deallocateSucceeded.correlationId || proof.recoveryStarted.caller !== proof.recoverySucceeded.caller || proof.recoveryStarted.correlationId !== proof.recoverySucceeded.correlationId || proof.recoveryStarted.correlationId === proof.deallocateStarted.correlationId || !(times[0]! <= times[1]! && times[1]! < times[2]! && times[2]! <= times[3]!)) fail(409, 'recovery_activity_mismatch');
  const outcome = await arm.pollRequest({ requestId: proof.armRequestId, action: 'deallocate', submittedAt: proof.submittedAt, acceptedAt: proof.acceptedAt });
  if (outcome.status !== 'Succeeded' || outcome.startTime !== proof.operationStartTime || outcome.endTime !== proof.operationEndTime || Math.abs(times[0]! - Date.parse(outcome.startTime)) > 5000 || Math.abs(times[1]! - Date.parse(outcome.endTime!)) > 10000 || times[2]! <= Date.parse(outcome.endTime!)) fail(409, 'recovery_terminal_evidence_mismatch');
  const events = await activity.read(new Date(times[0]! - 5000).toISOString(), new Date(times[3]! + 5000).toISOString());
  for (const event of expected) {
    const matches = events.filter(candidate => candidate?.eventDataId === event.eventDataId);
    if (matches.length !== 1 || !equalEvent(matches[0]!, event)) fail(409, 'recovery_activity_mismatch');
  }
  const observation = await arm.observe(); validateObservation(observation, config, now);
  if (observation.provisioningState !== 'Succeeded' || observation.powerState !== 'running') fail(409, 'recovery_running_state_not_observed');
  return outcome;
}
export async function reconcileRecoveredDeallocation(session: LedgerSession, config: Configuration, arm: Arm, activity: ActivityReader, proof: RecoveryProof, generation: number, workersFenced: boolean, now = Date.now()): Promise<void> {
  if (session.data.generation !== generation) fail(412, 'stale_generation');
  if (session.data.admissionEnabled || !workersFenced) fail(409, 'worker_fencing_required');
  if (session.data.activeRequestId !== proof.requestId) fail(409, 'active_operation_mismatch');
  const op = session.data.records[proof.requestId]!;
  if (!['accepted', 'accepted_unverified', 'unknown'].includes(op.phase)) fail(409, 'active_operation_mismatch');
  const outcome = await verifyHistoricalDeallocation(config, arm, activity, op, proof, session.data.audit, now);
  await session.assertLease();
  op.armAcceptedAt = proof.acceptedAt; op.armOperationStatus = 'Succeeded';
  op.trackingSource = 'request-id'; op.armOperationStartTime = outcome.startTime; op.armOperationEndTime = outcome.endTime!;
  op.phase = 'completed'; op.reason = 'historical_deallocate_completed_then_recovery_start'; op.updatedAt = new Date(now).toISOString();
  op.recoveryEvidence = { reference: proof.reference, approvalReference: proof.recoveryApprovalReference, deallocateStartedEventId: proof.deallocateStarted.eventDataId, deallocateEventId: proof.deallocateSucceeded.eventDataId, deallocateCorrelationId: proof.deallocateSucceeded.correlationId, recoveryStartedEventId: proof.recoveryStarted.eventDataId, recoveryStartEventId: proof.recoverySucceeded.eventDataId, recoveryCorrelationId: proof.recoverySucceeded.correlationId, recoveryStartedAt: proof.recoveryStarted.eventTimestamp, recoveryCompletedAt: proof.recoverySucceeded.eventTimestamp };
  session.data.audit.push({ at: op.updatedAt, event: `historical-reconciliation:${proof.reference}`, requestId: op.requestId, callerOid: op.callerOid });
  session.data.audit = session.data.audit.slice(-1000);
  session.data.activeRequestId = null; session.data.generation += 1;
  // Caller saves under the existing lease/ETag. Admission remains disabled.
}
