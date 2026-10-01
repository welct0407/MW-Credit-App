export type Action = 'start' | 'restart' | 'deallocate';
export type PowerState = 'running' | 'stopped' | 'deallocated' | 'starting' | 'stopping' | 'deallocating' | 'unknown';
export interface Principal { kind: 'browser' | 'application'; oid: string; clientId: string; roles: readonly string[] }
export interface VmObservation { vmId: string; powerState: PowerState; provisioningState: string; observedAt: string }
export interface Configuration {
  tenantId: string; apiClientId: string; browserClientId: string; browserUserIds: readonly string[];
  cloudClientId: string | undefined; cloudPrincipalId: string | undefined;
  origin: string; resourceId: string; expectedVmId: string;
  storageAccount: string; ledgerContainer: string; ledgerBlob: string;
  mutationsEnabled: boolean; operationPollingEnabled: boolean; apiVersion: string;
}
export interface Confirmation { workSaved: true; admissionHeld: true; approvalReference: string }
export interface ActionRequest {
  requestId: string; stateVersion: string; observedAt: string; confirmation?: Confirmation;
}
export type OperationPhase = 'dispatching' | 'accepted' | 'accepted_unverified' | 'desired_state_observed' | 'completed' | 'rejected' | 'unknown' | 'noop';
export interface Operation {
  requestId: string; action: Action; callerOid: string; callerKind: Principal['kind']; digest: string;
  createdAt: string; updatedAt: string; phase: OperationPhase;
  armStatus?: number; armRequestId?: string; reason?: string;
  trackingUrl?: string; nextPollAt?: string; armOperationStatus?: 'Succeeded' | 'Failed' | 'Canceled';
  approvalReference?: string;
  trackingKind?: 'async' | 'location'; armFailureCode?: string;
}
export interface LedgerData {
  schemaVersion: 1; generation: number; targetResourceId: string; expectedVmId: string;
  admissionEnabled: boolean; activeRequestId: string | null;
  records: Record<string, Operation>;
  audit: { at: string; event: string; requestId: string; callerOid: string }[];
}
export interface LedgerSession { data: LedgerData; save(): Promise<void>; assertLease(): Promise<void> }
export interface Ledger { transaction<T>(callback: (session: LedgerSession) => Promise<T>): Promise<T> }
export interface ArmOutcome { status: number; requestId?: string; trackingUrl?: string; trackingKind?: 'async' | 'location'; retryAfter?: number }
export interface PollOutcome { status: 'InProgress' | 'Succeeded' | 'Failed' | 'Canceled'; retryAfter: number; failureCode?: string }
export interface Arm { observe(): Promise<VmObservation>; submit(action: Action): Promise<ArmOutcome>; poll(url: string, kind?: 'async' | 'location'): Promise<PollOutcome> }
export interface ResponseData { status: number; body: Record<string, unknown>; retryAfter?: number }
