import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureArm } from '../dist/src/arm.js';
import { ControllerError } from '../dist/src/errors.js';
import { updateAdmission, reconcileOperation } from '../dist/src/administration.js';
import { AzureActivityReader, reconcileRecoveredDeallocation, verifyHistoricalDeallocation } from '../dist/scripts/recovery-evidence.js';
import { browser, config, fixture, ids, trackingUrl } from './helpers.mjs';

const credential = { async getToken() { return { token: 'fixture-token' }; } };
const received = Date.parse('2026-10-02T07:31:01.255Z');
const receipt = { requestId: '7edd0361-7e12-47d2-ba59-dcedeb216a9b', action: 'deallocate', submittedAt: '2026-10-02T07:31:01.096Z', acceptedAt: '2026-10-02T07:31:01.255Z' };
const liveShape = { name: receipt.requestId, status: 'Succeeded', startTime: '2026-10-02T07:31:01.1806458+00:00', endTime: '2026-10-02T07:43:04.8662441+00:00' };
const clock = Date.parse('2026-10-02T08:10:00Z');
const make = (body = liveShape, status = 200, inspect = () => {}) => new AzureArm({ ...config, operationPollingEnabled: true }, credential, async (url, init) => { inspect(url, init); return new Response(status === 204 ? null : JSON.stringify(body), { status }); }, () => clock);

test('candidate fallback verifies the observed live response format using one fixed GET', async () => {
  let calls = 0;
  const result = await make(liveShape, 200, (url, init) => {
    calls++; assert.equal(url, trackingUrl.replace(ids.operation, receipt.requestId));
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.body, undefined);
  }).pollRequest(receipt);
  assert.equal(calls, 1); assert.equal(result.status, 'Succeeded'); assert.equal(result.name, receipt.requestId); assert.equal(result.endTime, liveShape.endTime);
});

test('fallback rejects missing, wrong, stale or future evidence and inconsistent identity/action', async () => {
  for (const extra of [
    { name: ids.operation }, { name: undefined }, { startTime: undefined }, { startTime: 'invalid' },
    { startTime: '2026-10-02T07:30:00Z' }, { startTime: '2026-10-02T07:32:00Z' },
    { endTime: undefined }, { endTime: 'invalid' }, { endTime: '2026-10-02T07:30:00Z' },
    { endTime: '2026-10-02T09:00:00Z' }, { status: undefined }, { status: 'unrecognized' },
    { targetResourceId: '/wrong' }, { resourceId: '/wrong' }, { action: 'restart' }, { id: '/wrong' }
  ]) await assert.rejects(make({ ...liveShape, ...extra }).pollRequest(receipt));
  for (const body of [null, [], {}, { status: 'Succeeded' }]) await assert.rejects(make(body).pollRequest(receipt));
  for (const status of [202, 204, 302, 403, 404, 500]) await assert.rejects(make({}, status).pollRequest(receipt));
  let calls = 0;
  for (const extra of [{ requestId: '../../evil' }, { action: 'delete' }, { submittedAt: 'bad' }, { acceptedAt: '2026-10-02T07:30:00Z' }, { acceptedAt: '2026-10-02T07:35:00Z' }]) {
    await assert.rejects(make(liveShape, 200, () => calls++).pollRequest({ ...receipt, ...extra }));
  }
  assert.equal(calls, 0);
  const disabled = new AzureArm(config, credential, () => { throw new Error('must not fetch'); });
  await assert.rejects(disabled.pollRequest(receipt), e => e.code === 'operation_polling_disabled');
});

test('candidate progress is not terminal and failure text is sanitized', async () => {
  assert.equal((await make({ ...liveShape, status: 'InProgress', endTime: undefined }).pollRequest(receipt)).status, 'InProgress');
  const result = await make({ ...liveShape, status: 'Failed', error: { code: 'CapacityUnavailable', message: 'PRIVATE' } }).pollRequest(receipt);
  assert.equal(result.status, 'Failed'); assert.equal(result.failureCode, 'CapacityUnavailable'); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('missing and rejected response headers persist only safe diagnostic categories', async () => {
  for (const [headers, issue] of [[{}, 'missing'], [{ 'Azure-AsyncOperation': 'https://evil.invalid/?SECRET=private', Location: trackingUrl }, 'rejected']]) {
    const arm = new AzureArm(config, credential, async () => new Response(null, { status: 202, headers }));
    const result = await arm.submit('deallocate');
    assert.equal(result.trackingIssue, issue); assert.equal(result.trackingUrl, undefined); assert.equal(JSON.stringify(result).includes('SECRET'), false);
  }
});

function fallbackFixture() {
  const f = fixture({ operationPollingEnabled: true });
  f.arm.outcome = { status: 202, requestId: ids.operation, trackingIssue: 'missing', retryAfter: 15 };
  f.arm.pollRequest = async value => { f.arm.polls.push(value); return { name: value.requestId, startTime: value.submittedAt, endTime: new Date(f.now()).toISOString(), status: 'Succeeded', retryAfter: 15 }; };
  return f;
}

test('fallback completes only after matched terminal evidence and a fresh desired VM state; no replay', async () => {
  const f = fallbackFixture(), request = f.request();
  const accepted = await f.controller.action(browser, 'deallocate', request);
  assert.equal(accepted.body.operation.reason, 'operation_tracking_header_missing');
  const acceptedAt = f.port.data.records[request.requestId].armAcceptedAt;
  f.advance(16000);
  let status = await f.controller.status(browser);
  assert.equal(status.body.operation.phase, 'accepted'); assert.notEqual(f.port.data.activeRequestId, null);
  f.observation.powerState = 'deallocated'; status = await f.controller.status(browser, request.requestId);
  assert.equal(status.body.operation.phase, 'completed'); assert.equal(f.port.data.activeRequestId, null);
  assert.equal(f.arm.polls.length, 1); assert.equal(f.port.data.records[request.requestId].armAcceptedAt, acceptedAt);
  await f.controller.action(browser, 'deallocate', request); assert.deepEqual(f.arm.calls, ['deallocate']);
});

test('fallback mismatch/not-found/malformed evidence preserves latch even at desired state and never repeats POST', async () => {
  for (const code of ['operation_candidate_mismatch', 'operation_candidate_not_found', 'invalid_operation_status', 'operation_receipt_invalid']) {
    const f = fallbackFixture(), request = f.request();
    f.arm.pollRequest = async () => { throw new ControllerError(503, code); };
    await f.controller.action(browser, 'deallocate', request); f.observation.powerState = 'deallocated'; f.advance(16000);
    let status = await f.controller.status(browser); assert.equal(status.body.operation.reason, code); assert.equal(status.body.operation.phase, 'accepted');
    f.advance(16 * 60000); status = await f.controller.status(browser); assert.equal(status.body.operation.phase, 'unknown');
    assert.notEqual(f.port.data.activeRequestId, null); assert.deepEqual(status.body.actions, { start: false, restart: false, deallocate: false });
    await f.controller.action(browser, 'deallocate', request); assert.equal(f.arm.calls.length, 1);
  }
});

test('missing UUID or immutable legacy acceptance receipt cannot invent a fallback or completion', async () => {
  for (const legacy of [false, true]) {
    const f = fallbackFixture(), request = f.request();
    if (!legacy) delete f.arm.outcome.requestId;
    await f.controller.action(browser, 'deallocate', request);
    if (legacy) { const data = f.port.data; delete data.records[request.requestId].armAcceptedAt; f.port.text = JSON.stringify(data); }
    f.observation.powerState = 'deallocated'; f.advance(16000);
    const status = await f.controller.status(browser);
    assert.equal(status.body.operation.phase, 'unknown'); assert.equal(status.body.operation.reason, 'operation_tracking_unavailable');
    assert.equal(f.arm.polls.length, 0); assert.notEqual(f.port.data.activeRequestId, null);
  }
});

async function recoveryFixture() {
  const f = fallbackFixture(), request = f.request(); await f.controller.action(browser, 'deallocate', request);
  const op = f.port.data.records[request.requestId], t = Date.parse(op.createdAt), at = offset => new Date(t + offset).toISOString();
  const event = (n, action, status, offset, caller, correlationId) => ({ eventDataId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, eventTimestamp: at(offset), resourceId: config.resourceId, caller, correlationId, operationName: { value: `Microsoft.Compute/virtualMachines/${action}/action` }, status: { value: status } });
  const proof = { schemaVersion: 1, requestId: op.requestId, targetResourceId: config.resourceId, expectedVmId: ids.vm, armRequestId: ids.operation, submittedAt: op.createdAt, acceptedAt: op.armAcceptedAt, operationStartTime: at(0), operationEndTime: at(60000), reference: 'incident-reviewed', recoveryApprovalReference: 'owner-recovery-approved',
    deallocateStarted: event(1, 'deallocate', 'Started', 0, ids.principal, ids.operation), deallocateSucceeded: event(2, 'deallocate', 'Succeeded', 61000, ids.principal, ids.operation), recoveryStarted: event(3, 'start', 'Started', 120000, 'fixture@example.invalid', ids.user), recoverySucceeded: event(4, 'start', 'Succeeded', 180000, 'fixture@example.invalid', ids.user) };
  const events = structuredClone([proof.deallocateStarted, proof.deallocateSucceeded, proof.recoveryStarted, proof.recoverySucceeded]);
  const activity = { async read() { return events; } };
  f.advance(200000); f.arm.pollRequest = async () => ({ name: ids.operation, status: 'Succeeded', startTime: proof.operationStartTime, endTime: proof.operationEndTime, retryAfter: 15 });
  await f.ledger.transaction(async s => { updateAdmission(s, s.data.generation, false); await s.save(); });
  const run = (overrides = {}) => f.ledger.transaction(async s => { await reconcileRecoveredDeallocation(s, f.config, f.arm, activity, proof, overrides.generation ?? s.data.generation, overrides.fenced ?? true, f.now()); await s.save(); });
  return { f, op, proof, events, activity, run };
}

test('historical success preserves deduplication/audit with current running state and leaves admission closed', async () => {
  const { f, proof, run } = await recoveryFixture(), before = f.port.data;
  // Ordinary success still requires deallocated: its guard is unchanged.
  await assert.rejects(f.ledger.transaction(s => reconcileOperation(s, f.config, f.arm, { generation: s.data.generation, workersFenced: true, requestId: proof.requestId, result: 'succeeded', evidence: 'ordinary' }, f.now())), e => e.code === 'desired_state_not_observed');
  await run(); const after = f.port.data, op = after.records[proof.requestId];
  assert.equal(op.phase, 'completed'); assert.equal(op.armOperationStatus, 'Succeeded'); assert.equal(op.reason, 'historical_deallocate_completed_then_recovery_start');
  assert.equal(op.digest, before.records[proof.requestId].digest); assert.equal(op.createdAt, before.records[proof.requestId].createdAt); assert.deepEqual(after.audit.slice(0, -1), before.audit);
  assert.equal(after.activeRequestId, null); assert.equal(after.admissionEnabled, false); assert.equal(after.generation, before.generation + 1);
  assert.equal(op.recoveryEvidence.recoveryStartEventId, proof.recoverySucceeded.eventDataId); assert.deepEqual(f.arm.calls, ['deallocate']);
  await assert.rejects(run());
});

test('historical recovery rejects stale generation, unfenced workers, enabled admission, wrong target/action and evidence mismatches without writes', async () => {
  const cases = [
    x => { x.proof.targetResourceId = '/wrong'; }, x => { x.proof.expectedVmId = ids.user; }, x => { x.proof.armRequestId = ids.user; },
    x => { x.proof.acceptedAt = new Date(Date.parse(x.proof.acceptedAt) + 1).toISOString(); }, x => { x.events[1].caller = ids.user; },
    x => { x.events[1].status.value = 'Failed'; }, x => { x.events[1].resourceId = '/wrong'; }, x => { x.events[1].operationName.value = 'Microsoft.Compute/virtualMachines/start/action'; },
    x => { x.events.pop(); }, x => { x.events.push(structuredClone(x.events[0])); },
    x => { x.proof.recoveryStarted.eventTimestamp = x.proof.deallocateStarted.eventTimestamp; },
    x => { x.f.arm.pollRequest = async () => ({ status: 'InProgress' }); }, x => { x.f.observation.vmId = ids.user; }, x => { x.f.observation.powerState = 'deallocated'; },
    x => { const data = x.f.port.data; data.records[x.proof.requestId].action = 'restart'; x.f.port.text = JSON.stringify(data); },
    x => { const data = x.f.port.data; data.admissionEnabled = true; x.f.port.text = JSON.stringify(data); }
  ];
  for (const change of cases) { const x = await recoveryFixture(); change(x); const before = x.f.port.text; await assert.rejects(x.run()); assert.equal(x.f.port.text, before); }
  for (const override of [{ generation: 999 }, { fenced: false }]) { const x = await recoveryFixture(); const before = x.f.port.text; await assert.rejects(x.run(override)); assert.equal(x.f.port.text, before); }
});

test('historical read-only verification and activity adapter perform bounded fixed-target GETs, reject redirects and pagination', async () => {
  const x = await recoveryFixture(), before = x.f.port.text;
  await verifyHistoricalDeallocation(x.f.config, x.f.arm, x.activity, x.f.port.data.records[x.proof.requestId], x.proof, x.f.port.data.audit, x.f.now());
  assert.equal(x.f.port.text, before);
  let calls = 0;
  const fetcher = async (url, init) => { calls++; const parsed = new URL(url); assert.equal(parsed.hostname, 'management.azure.com'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.ok(parsed.searchParams.get('$filter').includes(config.resourceId)); return new Response(JSON.stringify({ value: x.events })); };
  const reader = new AzureActivityReader(config, credential, fetcher);
  assert.equal((await reader.read('2026-10-02T07:25:00Z', '2026-10-02T08:02:00Z')).length, 4);
  await assert.rejects(reader.read('bad', 'bad')); assert.equal(calls, 1);
  for (const response of [new Response(null, { status: 302 }), new Response(JSON.stringify({ value: [], nextLink: 'https://evil.invalid' })), new Response('{}')]) await assert.rejects(new AzureActivityReader(config, credential, async () => response).read('2026-10-02T07:25:00Z', '2026-10-02T08:02:00Z'));
});

test('legacy historical recovery uses preserved acceptance audit after a later unknown-state refresh', async () => {
  const x = await recoveryFixture(); const data = x.f.port.data;
  delete data.records[x.proof.requestId].armAcceptedAt;
  data.records[x.proof.requestId].updatedAt = new Date(x.f.now()).toISOString();
  data.records[x.proof.requestId].phase = 'unknown'; x.f.port.text = JSON.stringify(data);
  await x.run(); assert.equal(x.f.port.data.records[x.proof.requestId].phase, 'completed');
  const missing = await recoveryFixture(); const broken = missing.f.port.data;
  delete broken.records[missing.proof.requestId].armAcceptedAt; broken.audit = broken.audit.filter(event => event.event !== 'accepted'); missing.f.port.text = JSON.stringify(broken);
  await assert.rejects(missing.run(), error => error.code === 'recovery_receipt_mismatch');
});
