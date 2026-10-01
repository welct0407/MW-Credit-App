import test from 'node:test';
import assert from 'node:assert/strict';
import { ControllerError } from '../dist/src/errors.js';
import { browser, application, fixture, ids } from './helpers.mjs';
const rejectsCode = (promise, code) => assert.rejects(promise, error => error.code === code);
test('restart acceptance does not become success from running, and blocks a new operation', async () => {
  const f = fixture(); const request = f.request();
  assert.equal((await f.controller.action(browser, 'restart', request)).body.operation.phase, 'accepted_unverified');
  assert.equal((await f.controller.status(browser)).body.operation.phase, 'accepted_unverified');
  await rejectsCode(f.controller.action(browser, 'deallocate', f.request()), 'operation_in_progress');
  assert.deepEqual(f.arm.calls, ['restart']);
});
test('duplicates survive restart, stale request state and changed current power state', async () => {
  const f = fixture(); const request = f.request(); await f.controller.action(browser, 'restart', request);
  f.advance(3 * 86400000); f.observation.powerState = 'unknown';
  assert.equal((await f.controller.action(browser, 'restart', request)).status, 202);
  assert.equal(f.arm.calls.length, 1);
  await rejectsCode(f.controller.action(browser, 'restart', { ...request, confirmation: { ...request.confirmation, approvalReference: 'changed' } }), 'idempotency_conflict');
  await rejectsCode(f.controller.action(application, 'restart', request), 'idempotency_conflict');
});
test('concurrent identical submissions produce one dispatch, and same ID can retrieve its receipt', async () => {
  const f = fixture(); const request = f.request(); let release; let entered;
  const entry = new Promise(resolve => { entered = resolve; });
  f.arm.submitHook = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
  const first = f.controller.action(browser, 'restart', request); await entry;
  await rejectsCode(f.controller.action(browser, 'restart', request), 'operation_in_progress');
  release(); await first;
  assert.equal((await f.controller.action(browser, 'restart', request)).status, 202); assert.equal(f.arm.calls.length, 1);
});
test('concurrent different operations cannot dispatch together', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.controller.action(browser, 'restart', f.request()), f.controller.action(browser, 'deallocate', f.request())]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.arm.calls.length, 1);
});
test('write failure before dispatch leaves no ARM effect', async () => {
  const f = fixture(); f.port.failWrite = 1;
  await assert.rejects(f.controller.action(browser, 'restart', f.request())); assert.equal(f.arm.calls.length, 0); assert.equal(f.port.data.activeRequestId, null);
});
test('crash after persisted intent never replays a POST', async () => {
  const f = fixture(); const request = f.request(); f.arm.submitError = new Error('connection lost');
  const result = await f.controller.action(browser, 'restart', request); assert.equal(result.body.operation.phase, 'unknown');
  assert.equal((await f.controller.action(browser, 'restart', request)).body.operation.phase, 'unknown');
  assert.equal(f.arm.calls.length, 1); assert.equal((await f.controller.status(browser)).body.actions.start, false);
});
test('result persistence failure retains dispatching intent and converts to unknown without replay', async () => {
  const f = fixture(); const request = f.request(); f.port.failWrite = 2;
  await assert.rejects(f.controller.action(browser, 'restart', request));
  assert.equal(f.port.data.records[request.requestId].phase, 'dispatching');
  f.port.failWrite = 0; assert.equal((await f.controller.status(browser)).body.operation.phase, 'unknown');
  await f.controller.action(browser, 'restart', request); assert.equal(f.arm.calls.length, 1);
});
test('lease loss after persisted intent prevents dispatch and preserves the latch', async () => {
  const f = fixture(); const write = f.port.write.bind(f.port);
  f.port.write = async (...args) => { const etag = await write(...args); f.port.lease = null; return etag; };
  f.arm.submitError = new Error('lease lost during dispatch boundary');
  await assert.rejects(f.controller.action(browser, 'restart', f.request()));
  assert.equal(f.arm.calls.length, 0);
  // A lease renewal verifies storage fencing immediately before dispatch.
  assert.equal(f.port.data.activeRequestId !== null, true);
});
test('unknown server/redirect responses retain serialization; definitive rejection releases it', async () => {
  for (const status of [302, 500, 502]) { const f = fixture(); f.arm.outcome = { status }; assert.equal((await f.controller.action(browser, 'restart', f.request())).body.operation.phase, 'unknown'); assert.notEqual(f.port.data.activeRequestId, null); }
  for (const status of [400, 401, 403, 404, 409, 412, 422, 429]) { const f = fixture(); f.arm.outcome = { status }; assert.equal((await f.controller.action(browser, 'restart', f.request())).body.operation.phase, 'rejected'); assert.equal(f.port.data.activeRequestId, null); }
});
test('synchronous success is recorded and duplicate does not repeat it', async () => {
  const f = fixture(); f.arm.outcome = { status: 200 }; const request = f.request();
  assert.equal((await f.controller.action(browser, 'restart', request)).body.operation.phase, 'completed'); await f.controller.action(browser, 'restart', request); assert.equal(f.arm.calls.length, 1);
});
test('different request IDs from the same snapshot cannot issue two restarts after synchronous success', async () => {
  const f = fixture(); f.arm.outcome = { status: 200 }; const first = f.request(); const second = f.request();
  await f.controller.action(browser, 'restart', first);
  await rejectsCode(f.controller.action(browser, 'restart', second), 'stale_precondition'); assert.equal(f.arm.calls.length, 1);
});
test('start and deallocate can report observed desired state without claiming restart success', async () => {
  for (const [action, initial, desired] of [['start', 'deallocated', 'running'], ['deallocate', 'running', 'deallocated']]) {
    const f = fixture(); f.observation.powerState = initial; await f.controller.action(browser, action, f.request());
    f.observation.powerState = desired; const status = await f.controller.status(browser);
    assert.equal(f.port.data.activeRequestId, null); assert.equal(Object.values(f.port.data.records)[0].phase, 'desired_state_observed'); assert.equal(status.body.executorReady, null);
  }
});
test('stable already-satisfied actions are persisted no-ops', async () => {
  const f = fixture(); assert.equal((await f.controller.action(browser, 'start', f.request())).body.operation.phase, 'noop'); assert.equal(f.arm.calls.length, 0);
});
test('dangerous actions require fresh explicit work confirmation', async () => {
  for (const action of ['restart', 'deallocate']) { const f = fixture(); await rejectsCode(f.controller.action(browser, action, f.request({ confirmation: undefined })), 'interruption_confirmation_required'); assert.equal(f.arm.calls.length, 0); }
});
test('target replacement and unknown/provisioning states disable mutation', async () => {
  const f = fixture(); f.observation.vmId = ids.user; await rejectsCode(f.controller.action(browser, 'start', f.request()), 'vm_identity_mismatch');
  for (const powerState of ['starting', 'stopping', 'deallocating', 'unknown']) { const x = fixture(); x.observation.powerState = powerState; await rejectsCode(x.controller.action(browser, 'start', x.request()), 'state_not_actionable'); }
  for (const provisioningState of ['Updating', 'Failed', 'unknown']) { const x = fixture(); x.observation.provisioningState = provisioningState; await rejectsCode(x.controller.action(browser, 'restart', x.request()), 'state_not_actionable'); }
});
test('expired request and stale state are rejected before dispatch, even after records were pruned', async () => {
  const f = fixture(); const request = f.request(); f.advance(8 * 86400000); await rejectsCode(f.controller.action(browser, 'restart', request), 'expired_request'); assert.equal(f.arm.calls.length, 0);
  const x = fixture(); const old = x.request(); x.advance(121000); await rejectsCode(x.controller.action(browser, 'restart', old), 'stale_precondition');
  const y = fixture(); const changed = y.request(); y.observation.powerState = 'deallocated'; await rejectsCode(y.controller.action(browser, 'start', changed), 'stale_precondition');
});
test('missing/corrupt storage and runtime/admission switches fail closed', async () => {
  for (const breakStorage of [f => { f.port.failAcquire = true; }, f => { f.port.text = '{bad'; }, f => { f.port.text = '{}'; }, f => { f.port.failRead = true; }]) { const f = fixture(); const request = f.request(); breakStorage(f); const result = await f.controller.status(browser); assert.equal(result.status, 503); assert.deepEqual(result.body.actions, { start: false, restart: false, deallocate: false }); await assert.rejects(f.controller.action(browser, 'restart', request)); assert.equal(f.arm.calls.length, 0); }
  const f = fixture({ mutationsEnabled: false }); await rejectsCode(f.controller.action(browser, 'restart', f.request()), 'mutations_disabled');
  const x = fixture(); const data = x.port.data; data.admissionEnabled = false; x.port.text = JSON.stringify(data); await rejectsCode(x.controller.action(browser, 'restart', x.request()), 'mutations_disabled');
});
test('operation receipt is private to initiating identity', async () => {
  const f = fixture(); const request = f.request(); await f.controller.action(browser, 'restart', request);
  await rejectsCode(f.controller.status(application, request.requestId), 'operation_not_found');
});
test('polling disabled means no poll and restart remains latched', async () => {
  const f = fixture(); await f.controller.action(browser, 'restart', f.request()); f.advance(16000); f.arm.pollOutcome = { status: 'Succeeded', retryAfter: 15 }; await f.controller.status(browser); assert.equal(f.arm.polls.length, 0); assert.notEqual(f.port.data.activeRequestId, null);
});
test('approved optional polling requires terminal success plus desired state', async () => {
  const f = fixture({ operationPollingEnabled: true }); await f.controller.action(browser, 'restart', f.request());
  await f.controller.status(browser); assert.equal(f.arm.polls.length, 0);
  f.advance(16000); f.arm.pollOutcome = { status: 'Succeeded', retryAfter: 15 }; f.observation.powerState = 'starting'; await f.controller.status(browser); assert.notEqual(f.port.data.activeRequestId, null);
  f.observation.powerState = 'running'; await f.controller.status(browser); assert.equal(f.port.data.activeRequestId, null); assert.equal(Object.values(f.port.data.records)[0].phase, 'completed'); assert.equal(f.arm.calls.length, 1);
});
test('403 polling pauses commands and later resumes the same operation without another POST', async () => {
  const f = fixture({ operationPollingEnabled: true }); await f.controller.action(browser, 'restart', f.request());
  f.advance(16000); f.arm.pollError = new ControllerError(503, 'operation_read_not_authorized'); await f.controller.status(browser);
  f.advance(3600000); await f.controller.status(browser); assert.notEqual(f.port.data.activeRequestId, null); assert.equal(Object.values(f.port.data.records)[0].reason, 'operation_read_not_authorized');
  f.advance(31000); f.arm.pollError = null; f.arm.pollOutcome = { status: 'Succeeded', retryAfter: 15 }; await f.controller.status(browser); assert.equal(f.port.data.activeRequestId, null); assert.equal(f.arm.calls.length, 1);
});
test('terminal polling refreshes VM observation before clearing restart serialization', async () => {
  const f = fixture({ operationPollingEnabled: true }); await f.controller.action(browser, 'restart', f.request()); f.advance(16000);
  f.arm.poll = async () => { f.observation.powerState = 'deallocated'; return { status: 'Succeeded', retryAfter: 15 }; };
  const result = await f.controller.status(browser); assert.equal(result.body.observation.powerState, 'deallocated'); assert.equal(result.body.actions.restart, false); assert.notEqual(f.port.data.activeRequestId, null);
});
test('terminal failed/canceled operation retains details and releases serialization', async () => {
  for (const status of ['Failed', 'Canceled']) { const f = fixture({ operationPollingEnabled: true }); await f.controller.action(browser, 'restart', f.request()); f.advance(16000); f.arm.pollOutcome = { status, retryAfter: 15, failureCode: 'OperationNotAllowed' }; await f.controller.status(browser); const op = Object.values(f.port.data.records)[0]; assert.equal(op.phase, 'rejected'); assert.equal(op.armOperationStatus, status); assert.equal(op.armFailureCode, 'OperationNotAllowed'); assert.equal(f.port.data.activeRequestId, null); }
});
