import { randomUUID } from 'node:crypto';
import { TARGET_RESOURCE_ID, TARGET_TENANT_ID } from '../dist/src/configuration.js';
import { bootstrapLedger, stateVersion } from '../dist/src/state-machine.js';
import { BlobLedger } from '../dist/src/ledger.js';
import { Controller } from '../dist/src/controller.js';
export const ids = { api: '11111111-1111-4111-8111-111111111111', browser: '22222222-2222-4222-8222-222222222222', user: '33333333-3333-4333-8333-333333333333', cloud: '44444444-4444-4444-8444-444444444444', principal: '55555555-5555-4555-8555-555555555555', vm: '66666666-6666-4666-8666-666666666666', operation: '77777777-7777-4777-8777-777777777777' };
export const config = { tenantId: TARGET_TENANT_ID, apiClientId: ids.api, browserClientId: ids.browser, browserUserIds: [ids.user], cloudClientId: ids.cloud, cloudPrincipalId: ids.principal, origin: 'https://fixture.azurewebsites.net', resourceId: TARGET_RESOURCE_ID, expectedVmId: ids.vm, storageAccount: 'fixturevm01', ledgerContainer: 'vm01-controller', ledgerBlob: 'ledger.json', mutationsEnabled: true, operationPollingEnabled: false, apiVersion: '2025-04-01' };
export const browser = { kind: 'browser', oid: ids.user, clientId: ids.browser, roles: [] };
export const application = { kind: 'application', oid: ids.principal, clientId: ids.cloud, roles: ['VM01.Status', 'VM01.Start', 'VM01.Restart', 'VM01.Deallocate'] };
export const trackingUrl = `https://management.azure.com/subscriptions/50f792fa-803e-4280-833d-1fe60fef5293/providers/Microsoft.Compute/locations/southeastasia/operations/${ids.operation}?api-version=2025-04-01`;
export class FakeBlobPort {
  constructor(data) { this.text = JSON.stringify(data); this.etag = 1; this.lease = null; this.writes = 0; this.failWrite = 0; this.failRead = false; this.failAcquire = false; }
  async acquireLease() { if (this.failAcquire) throw new Error('storage unavailable'); if (this.lease) throw { statusCode: 409 }; this.lease = randomUUID(); return this.lease; }
  async renewLease(id) { if (id !== this.lease) throw new Error('lease lost'); }
  async releaseLease(id) { if (id === this.lease) this.lease = null; }
  async read() { if (this.failRead) throw new Error('read failed'); return { text: this.text, etag: String(this.etag) }; }
  async write(text, lease, etag) { this.writes++; if (this.failWrite === this.writes) throw new Error('crash at write'); if (lease !== this.lease || etag !== String(this.etag)) throw new Error('fenced'); this.text = text; return String(++this.etag); }
  get data() { return JSON.parse(this.text); }
}
export function fixture(overrides = {}) {
  const cfg = { ...config, ...overrides }; let clock = Date.parse('2026-10-01T18:00:00Z');
  const state = bootstrapLedger(cfg); state.admissionEnabled = true;
  const port = new FakeBlobPort(state);
  const observation = { vmId: ids.vm, powerState: 'running', provisioningState: 'Succeeded', observedAt: new Date(clock).toISOString() };
  const arm = { calls: [], polls: [], outcome: { status: 202, trackingUrl, trackingKind: 'async', retryAfter: 15 }, pollOutcome: { status: 'InProgress', retryAfter: 15 }, observeError: null, submitError: null, pollError: null,
    async observe() { if (this.observeError) throw this.observeError; return { ...observation, observedAt: new Date(clock).toISOString() }; },
    async submit(action) { this.calls.push(action); if (this.submitHook) await this.submitHook(); if (this.submitError) throw this.submitError; return this.outcome; },
    async poll(url) { this.polls.push(url); if (this.pollError) throw this.pollError; return this.pollOutcome; } };
  const ledger = new BlobLedger(cfg, port); const controller = new Controller(cfg, ledger, arm, () => clock);
  return { config: cfg, controller, port, ledger, arm, observation, advance(ms) { clock += ms; }, now() { return clock; },
    request(extra = {}) { return { requestId: `${clock}.${randomUUID()}`, stateVersion: stateVersion(observation, port.data), observedAt: new Date(clock).toISOString(), confirmation: { workSaved: true, admissionHeld: true, approvalReference: 'owner-test-approval' }, ...extra }; } };
}
