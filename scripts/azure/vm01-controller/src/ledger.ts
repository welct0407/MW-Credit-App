import { BlobServiceClient, type BlockBlobClient } from '@azure/storage-blob';
import { ManagedIdentityCredential } from '@azure/identity';
import type { Configuration, Ledger, LedgerData, LedgerSession } from './types.js';
import { fail } from './errors.js';
import { UUID } from './configuration.js';
import { validatedOperationUrl } from './arm.js';
export interface BlobPort {
  acquireLease(): Promise<string>;
  renewLease(leaseId: string): Promise<void>;
  releaseLease(leaseId: string): Promise<void>;
  read(): Promise<{ text: string; etag: string }>;
  write(text: string, leaseId: string, etag: string): Promise<string>;
}
export class AzureBlobPort implements BlobPort {
  constructor(private readonly blob: BlockBlobClient) {}
  async acquireLease(): Promise<string> { return (await this.blob.getBlobLeaseClient().acquireLease(60)).leaseId!; }
  async renewLease(leaseId: string): Promise<void> { await this.blob.getBlobLeaseClient(leaseId).renewLease(); }
  async releaseLease(leaseId: string): Promise<void> { await this.blob.getBlobLeaseClient(leaseId).releaseLease(); }
  async read(): Promise<{ text: string; etag: string }> {
    const response = await this.blob.download();
    if (!response.etag || !response.readableStreamBody || (response.contentLength ?? 0) > 2 * 1024 * 1024) fail(503, 'invalid_controller_ledger');
    const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of response.readableStreamBody) { const data = Buffer.from(chunk); length += data.length; if (length > 2 * 1024 * 1024) fail(503, 'invalid_controller_ledger'); chunks.push(data); }
    return { text: Buffer.concat(chunks).toString('utf8'), etag: response.etag };
  }
  async write(text: string, leaseId: string, etag: string): Promise<string> {
    if (Buffer.byteLength(text) > 2 * 1024 * 1024) fail(503, 'controller_ledger_full');
    const response = await this.blob.upload(text, Buffer.byteLength(text), { conditions: { leaseId, ifMatch: etag }, blobHTTPHeaders: { blobContentType: 'application/json' } });
    if (!response.etag) fail(503, 'controller_ledger_write_failed');
    return response.etag;
  }
}
export function ledgerBlob(config: Configuration, credential = new ManagedIdentityCredential()): BlockBlobClient {
  return new BlobServiceClient(`https://${config.storageAccount}.blob.core.windows.net`, credential, { retryOptions: { maxTries: 1, tryTimeoutInMs: 10000 } }).getContainerClient(config.ledgerContainer).getBlockBlobClient(config.ledgerBlob);
}
export function validateLedger(input: unknown, config: Configuration): LedgerData {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(503, 'invalid_controller_ledger');
  const data = input as LedgerData;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.generation) || data.generation < 1 || data.targetResourceId !== config.resourceId || data.expectedVmId !== config.expectedVmId || typeof data.admissionEnabled !== 'boolean' || (data.activeRequestId !== null && typeof data.activeRequestId !== 'string') || !data.records || typeof data.records !== 'object' || Array.isArray(data.records) || !Array.isArray(data.audit) || data.audit.length > 1000) fail(503, 'invalid_controller_ledger');
  const phases = ['dispatching', 'accepted', 'accepted_unverified', 'desired_state_observed', 'completed', 'rejected', 'unknown', 'noop'];
  for (const [key, op] of Object.entries(data.records)) {
    if (!op || key !== op.requestId || !/^\d{13}\.[0-9a-f-]{36}$/i.test(key) || !['start', 'restart', 'deallocate'].includes(op.action) || !phases.includes(op.phase) || !UUID.test(op.callerOid) || !['browser', 'application'].includes(op.callerKind) || !/^[0-9a-f]{64}$/.test(op.digest) || !Number.isFinite(Date.parse(op.createdAt)) || !Number.isFinite(Date.parse(op.updatedAt))) fail(503, 'invalid_controller_ledger');
    if (op.trackingUrl) validatedOperationUrl(op.trackingUrl, config);
    if (op.nextPollAt && !Number.isFinite(Date.parse(op.nextPollAt))) fail(503, 'invalid_controller_ledger');
    if (op.armOperationStatus && !['Succeeded', 'Failed', 'Canceled'].includes(op.armOperationStatus)) fail(503, 'invalid_controller_ledger');
    if (op.trackingKind && !['async', 'location'].includes(op.trackingKind)) fail(503, 'invalid_controller_ledger');
    if (op.armRequestId !== undefined && (typeof op.armRequestId !== 'string' || !UUID.test(op.armRequestId))) fail(503, 'invalid_controller_ledger');
    for (const value of [op.armAcceptedAt, op.armOperationStartTime, op.armOperationEndTime]) if (value !== undefined && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))) fail(503, 'invalid_controller_ledger');
    if (op.trackingIssue !== undefined && !['missing', 'rejected'].includes(op.trackingIssue)) fail(503, 'invalid_controller_ledger');
    if (op.trackingRejectedHeader !== undefined && (op.trackingIssue !== 'rejected' || !['async', 'location'].includes(op.trackingRejectedHeader))) fail(503, 'invalid_controller_ledger');
    if (op.trackingRejectionReason !== undefined && (op.trackingIssue !== 'rejected' || !['malformed', 'authority', 'encoded', 'path', 'operation_id', 'query'].includes(op.trackingRejectionReason))) fail(503, 'invalid_controller_ledger');
    if (op.trackingSource !== undefined && op.trackingSource !== 'request-id') fail(503, 'invalid_controller_ledger');
    if (op.recoveryEvidence && (![op.recoveryEvidence.reference, op.recoveryEvidence.approvalReference].every(value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value)) || ![op.recoveryEvidence.deallocateStartedEventId, op.recoveryEvidence.deallocateEventId, op.recoveryEvidence.deallocateCorrelationId, op.recoveryEvidence.recoveryStartedEventId, op.recoveryEvidence.recoveryStartEventId, op.recoveryEvidence.recoveryCorrelationId].every(id => typeof id === 'string' && UUID.test(id)) || ![op.recoveryEvidence.recoveryStartedAt, op.recoveryEvidence.recoveryCompletedAt].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value))))) fail(503, 'invalid_controller_ledger');
    if (op.armFailureCode && !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(op.armFailureCode)) fail(503, 'invalid_controller_ledger');
    if (['dispatching', 'accepted', 'accepted_unverified', 'unknown'].includes(op.phase) && data.activeRequestId !== key) fail(503, 'invalid_controller_ledger');
  }
  if (data.activeRequestId !== null && (!data.records[data.activeRequestId] || !['dispatching', 'accepted', 'accepted_unverified', 'unknown'].includes(data.records[data.activeRequestId]!.phase))) fail(503, 'invalid_controller_ledger');
  if (data.audit.some(x => !x || !Number.isFinite(Date.parse(x.at)) || !UUID.test(x.callerOid) || typeof x.event !== 'string' || typeof x.requestId !== 'string')) fail(503, 'invalid_controller_ledger');
  return data;
}
export class BlobLedger implements Ledger {
  constructor(private readonly config: Configuration, private readonly port: BlobPort = new AzureBlobPort(ledgerBlob(config))) {}
  async transaction<T>(callback: (session: LedgerSession) => Promise<T>): Promise<T> {
    let leaseId: string;
    try { leaseId = await this.port.acquireLease(); } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 409) fail(409, 'operation_in_progress');
      return fail(503, 'controller_ledger_unavailable');
    }
    let leaseLost = false; let renewal: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (!renewal) renewal = this.port.renewLease(leaseId).catch(() => { leaseLost = true; }).finally(() => { renewal = undefined; });
    }, 20000);
    timer.unref();
    try {
      const loaded = await this.port.read(); let etag = loaded.etag;
      let parsed: unknown;
      try { parsed = JSON.parse(loaded.text); } catch { return fail(503, 'invalid_controller_ledger'); }
      const data = validateLedger(parsed, this.config);
      const checkLease = (): void => { if (leaseLost) fail(503, 'controller_lease_lost'); };
      const assertLease = async (): Promise<void> => {
        checkLease();
        try { await this.port.renewLease(leaseId); } catch { leaseLost = true; }
        checkLease();
      };
      return await callback({ data, assertLease, save: async () => {
        checkLease(); validateLedger(data, this.config);
        etag = await this.port.write(JSON.stringify(data), leaseId, etag);
        checkLease();
      } });
    } finally {
      clearInterval(timer);
      await renewal;
      // An uncertain release must not replace a persisted operation result or reveal SDK errors.
      await this.port.releaseLease(leaseId).catch(() => undefined);
    }
  }
}
