import type { Action, ActionRequest, Arm, Configuration, Ledger, LedgerSession, Operation, Principal, ResponseData, VmObservation } from './types.js';
import { ControllerError, fail } from './errors.js';
import { ACCEPTED_TIMEOUT_MS, RETENTION_MS, actionAvailable, digestRequest, isNoop, parseRequest, publicOperation, stateVersion, validateFreshRequest, validateObservation } from './state-machine.js';
import { authorize } from './authorization.js';
export class Controller {
  constructor(private readonly config: Configuration, private readonly ledger: Ledger, private readonly arm: Arm, private readonly now: () => number = Date.now) {}
  private timestamp(): string { return new Date(this.now()).toISOString(); }
  private async observation(): Promise<VmObservation> { const value = await this.arm.observe(); validateObservation(value, this.config, this.now()); return value; }
  private audit(session: LedgerSession, op: Operation, event: string): void {
    session.data.audit.push({ at: this.timestamp(), event, requestId: op.requestId, callerOid: op.callerOid });
    session.data.audit = session.data.audit.slice(-1000);
  }
  private receipt(op: Operation): ResponseData {
    return { status: ['completed', 'noop', 'desired_state_observed'].includes(op.phase) ? 200 : op.phase === 'rejected' ? 409 : 202,
      body: { operation: publicOperation(op), executorReady: null, readiness: 'not_verified_in_v1' }, retryAfter: 15 };
  }
  private async reconcile(session: LedgerSession, observation: VmObservation): Promise<VmObservation> {
    const id = session.data.activeRequestId;
    if (!id) return observation;
    const op = session.data.records[id]!;
    if (op.phase === 'dispatching') { op.phase = 'unknown'; op.reason = 'dispatch_outcome_unknown'; op.updatedAt = this.timestamp(); this.audit(session, op, 'unknown'); await session.save(); return observation; }
    if (!['accepted', 'accepted_unverified'].includes(op.phase)) return observation;
    if (this.config.operationPollingEnabled && op.trackingUrl && !op.armOperationStatus && (!op.nextPollAt || Date.parse(op.nextPollAt) <= this.now())) {
      try {
        const outcome = await this.arm.poll(op.trackingUrl, op.trackingKind);
        if (outcome.status !== 'InProgress') op.armOperationStatus = outcome.status;
        if (outcome.failureCode) op.armFailureCode = outcome.failureCode;
        op.nextPollAt = new Date(this.now() + outcome.retryAfter * 1000).toISOString();
        delete op.reason;
      } catch (error) {
        op.reason = error instanceof ControllerError && error.code === 'operation_read_not_authorized' ? 'operation_read_not_authorized' : 'operation_poll_unavailable';
        op.nextPollAt = new Date(this.now() + 30000).toISOString();
      }
      op.updatedAt = this.timestamp(); await session.save();
    }
    // Completion must use a VM sample taken after terminal operation verification.
    if (op.armOperationStatus === 'Succeeded') observation = await this.observation();
    if (Date.parse(observation.observedAt) < Date.parse(op.createdAt)) return observation;
    const desired = op.action === 'deallocate' ? 'deallocated' : 'running';
    const stable = observation.provisioningState === 'Succeeded';
    if (op.armOperationStatus === 'Failed' || op.armOperationStatus === 'Canceled') {
      op.phase = 'rejected'; op.reason = op.armOperationStatus === 'Failed' ? 'arm_operation_failed' : 'arm_operation_canceled';
    } else if (stable && observation.powerState === desired && (op.armOperationStatus === 'Succeeded' || (op.action !== 'restart' && !this.config.operationPollingEnabled))) {
      op.phase = op.armOperationStatus === 'Succeeded' ? 'completed' : 'desired_state_observed'; delete op.reason;
    } else if (!this.config.operationPollingEnabled && this.now() - Date.parse(op.createdAt) > ACCEPTED_TIMEOUT_MS) { op.phase = 'unknown'; op.reason = 'operation_wait_expired'; }
    else return observation;
    if (op.phase !== 'unknown') session.data.activeRequestId = null;
    op.updatedAt = this.timestamp(); this.audit(session, op, op.phase); await session.save();
    return observation;
  }
  async status(principal: Principal, requestId?: string): Promise<ResponseData> {
    authorize(principal, 'status');
    let observation: VmObservation;
    try { observation = await this.observation(); } catch { return { status: 503, body: { vm: 'VM-01', error: 'vm_observation_unavailable', actions: { start: false, restart: false, deallocate: false }, executorReady: null, readiness: 'not_verified_in_v1' } }; }
    try {
      return await this.ledger.transaction(async session => {
        observation = await this.observation();
        observation = await this.reconcile(session, observation);
        const operation = requestId ? session.data.records[requestId] : session.data.activeRequestId ? session.data.records[session.data.activeRequestId] : undefined;
        if (requestId && (!operation || operation.callerOid !== principal.oid)) fail(404, 'operation_not_found');
        const enabled = this.config.mutationsEnabled && session.data.admissionEnabled && session.data.activeRequestId === null;
        return { status: 200, body: { vm: 'VM-01', observation, stateVersion: stateVersion(observation, session.data), generation: session.data.generation,
          actions: Object.fromEntries((['start', 'restart', 'deallocate'] as const).map(action => [action, enabled && actionAvailable(action, observation) && (principal.kind === 'browser' || principal.roles.includes(`VM01.${action[0]!.toUpperCase()}${action.slice(1)}`))])),
          ...(operation ? { operation: publicOperation(operation) } : {}), executorReady: null, readiness: 'not_verified_in_v1' }, retryAfter: 15 };
      });
    } catch (error) {
      if (error instanceof ControllerError && error.status === 404) throw error;
      return { status: 503, body: { vm: 'VM-01', observation, error: 'controller_ledger_unavailable', actions: { start: false, restart: false, deallocate: false }, executorReady: null, readiness: 'not_verified_in_v1' } };
    }
  }
  async action(principal: Principal, action: Action, input: unknown): Promise<ResponseData> {
    authorize(principal, action);
    const request: ActionRequest = parseRequest(input); const digest = digestRequest(action, request);
    return this.ledger.transaction(async session => {
      const previous = session.data.records[request.requestId];
      if (previous) {
        if (previous.callerOid !== principal.oid || previous.callerKind !== principal.kind || previous.action !== action || previous.digest !== digest) fail(409, 'idempotency_conflict');
        return this.receipt(previous);
      }
      validateFreshRequest(request, this.now());
      if (!this.config.mutationsEnabled || !session.data.admissionEnabled) fail(409, 'mutations_disabled');
      if (session.data.activeRequestId) fail(409, 'operation_in_progress');
      const observation = await this.observation();
      if (request.stateVersion !== stateVersion(observation, session.data)) fail(412, 'stale_precondition');
      if (!actionAvailable(action, observation)) fail(409, 'state_not_actionable');
      if (action !== 'start' && !isNoop(action, observation) && !request.confirmation) fail(412, 'interruption_confirmation_required');
      for (const [id, record] of Object.entries(session.data.records)) if (this.now() - Date.parse(record.createdAt) > RETENTION_MS) delete session.data.records[id];
      const op: Operation = { requestId: request.requestId, action, callerOid: principal.oid, callerKind: principal.kind, digest,
        createdAt: this.timestamp(), updatedAt: this.timestamp(), phase: isNoop(action, observation) ? 'noop' : 'dispatching', ...(request.confirmation ? { approvalReference: request.confirmation.approvalReference } : {}) };
      // A different request must fetch a new snapshot even if VM power remains running.
      session.data.generation += 1;
      session.data.records[request.requestId] = op;
      if (op.phase === 'dispatching') session.data.activeRequestId = request.requestId;
      this.audit(session, op, op.phase); await session.save();
      if (op.phase === 'noop') return this.receipt(op);
      await session.assertLease();
      try {
        const result = await this.arm.submit(action);
        op.armStatus = result.status;
        if (result.requestId) op.armRequestId = result.requestId;
        if (result.status === 202) {
          op.phase = action === 'restart' ? 'accepted_unverified' : 'accepted';
          if (result.trackingUrl) op.trackingUrl = result.trackingUrl;
          if (result.trackingKind) op.trackingKind = result.trackingKind;
          op.nextPollAt = new Date(this.now() + (result.retryAfter ?? 15) * 1000).toISOString();
        } else if ([200, 204].includes(result.status)) { op.phase = 'completed'; session.data.activeRequestId = null; }
        else if ([400, 401, 403, 404, 409, 412, 422, 429].includes(result.status)) { op.phase = 'rejected'; op.reason = 'arm_request_rejected'; session.data.activeRequestId = null; }
        else { op.phase = 'unknown'; op.reason = 'arm_response_ambiguous'; }
      } catch { op.phase = 'unknown'; op.reason = 'dispatch_outcome_unknown'; }
      op.updatedAt = this.timestamp(); this.audit(session, op, op.phase); await session.save();
      return this.receipt(op);
    });
  }
}
