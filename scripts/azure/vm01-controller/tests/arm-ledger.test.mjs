import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureArm, trackingRejectionReason, validatedOperationUrl } from '../dist/src/arm.js';
import { validateLedger } from '../dist/src/ledger.js';
import { bootstrapLedger } from '../dist/src/state-machine.js';
import { configuration, TARGET_RESOURCE_ID, TARGET_TENANT_ID } from '../dist/src/configuration.js';
import { config, fixture, ids, trackingUrl } from './helpers.mjs';
const credential = { async getToken(scope) { assert.equal(scope, 'https://management.azure.com/.default'); return { token: 'fixture-token' }; } };
test('operation URL validation blocks SSRF, redirects, other subscriptions/regions and arbitrary endpoints', () => {
  assert.equal(validatedOperationUrl(trackingUrl, config), trackingUrl);
  for (const url of [trackingUrl.replace('https:', 'http:'), trackingUrl.replace('management.azure.com', 'evil.invalid'), trackingUrl.replace('management.azure.com', 'management.azure.com.evil.invalid'), trackingUrl.replace('management.azure.com', 'user:password@management.azure.com'), trackingUrl.replace('management.azure.com', 'management.azure.com:444'), trackingUrl.replace('50f792fa', '60f792fa'), trackingUrl.replace('southeastasia', 'eastus'), trackingUrl.replace('/operations/', '/virtualMachines/'), trackingUrl + '&secret=x', trackingUrl + '#x', trackingUrl.replace(ids.operation, '..%2f' + ids.operation), trackingUrl.replace('?api-version=', '?redirect=')]) assert.throws(() => validatedOperationUrl(url, config));
});
test('ARM POST is sent once with no body, fixed target and manual redirects', async () => {
  const calls = []; const arm = new AzureArm(config, credential, async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 202, headers: { 'Azure-AsyncOperation': trackingUrl, 'Retry-After': '1' } }); });
  const outcome = await arm.submit('restart'); assert.equal(calls.length, 1); assert.equal(calls[0].url, `https://management.azure.com${TARGET_RESOURCE_ID}/restart?api-version=2025-04-01`); assert.equal(calls[0].init.redirect, 'manual'); assert.equal(calls[0].init.body, undefined); assert.equal(outcome.trackingUrl, trackingUrl); assert.equal(outcome.retryAfter, 15);
  await assert.rejects(arm.submit('delete')); assert.equal(calls.length, 1);
});
test('invalid Azure response URL is not persisted or followed', async () => {
  let calls = 0; const arm = new AzureArm(config, credential, async () => { calls++; return new Response(null, { status: 202, headers: { 'Azure-AsyncOperation': 'https://evil.invalid?secret=x', Location: trackingUrl } }); });
  const outcome = await arm.submit('restart'); assert.equal(outcome.status, 202); assert.equal(outcome.trackingUrl, undefined); assert.equal(calls, 1);
  assert.equal(outcome.trackingRejectedHeader, 'async'); assert.equal(outcome.trackingRejectionReason, 'authority');
  assert.equal(JSON.stringify(outcome).includes('SECRET'), false);
});
test('rejected tracking links yield bounded reason codes without widening accepted URLs', async () => {
  const cases = [
    ['not a URL', 'malformed'],
    [trackingUrl.replace('https:', 'http:'), 'authority'],
    [trackingUrl.replace('management.azure.com', 'management.azure.com.evil.invalid'), 'authority'],
    [trackingUrl.replace(ids.operation, '%2F' + ids.operation), 'encoded'],
    [trackingUrl.replace('southeastasia', 'eastus'), 'path'],
    [trackingUrl.replace(ids.operation, 'not-a-guid'), 'operation_id'],
    [trackingUrl + '&secret=private', 'query']
  ];
  for (const [url, reason] of cases) {
    assert.throws(() => validatedOperationUrl(url, config));
    assert.equal(trackingRejectionReason(url, config), reason);
    const arm = new AzureArm(config, credential, async () => new Response(null, { status: 202, headers: { Location: url } }));
    const result = await arm.submit('deallocate');
    assert.equal(result.trackingRejectedHeader, 'location'); assert.equal(result.trackingRejectionReason, reason);
    assert.equal(result.trackingUrl, undefined); assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
test('optional poll verifies URL again and never follows redirects', async () => {
  let calls = 0; const arm = new AzureArm({ ...config, operationPollingEnabled: true }, credential, async (_, init) => { calls++; assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); return new Response(null, { status: 302, headers: { location: 'https://evil.invalid' } }); });
  await assert.rejects(arm.poll(trackingUrl)); assert.equal(calls, 1); await assert.rejects(arm.poll('https://evil.invalid')); assert.equal(calls, 1);
  const disabled = new AzureArm(config, credential, async () => { throw new Error('should not fetch'); }); await assert.rejects(disabled.poll(trackingUrl), error => error.code === 'operation_polling_disabled');
});
test('poll handles terminal status, safe failure codes, Location 204 and forbidden reads', async () => {
  const make = response => new AzureArm({ ...config, operationPollingEnabled: true }, credential, async () => response);
  assert.equal((await make(new Response(JSON.stringify({ status: 'Failed', error: { code: 'CapacityUnavailable', message: 'private-credential' } }))).poll(trackingUrl)).failureCode, 'CapacityUnavailable');
  assert.equal((await make(new Response(JSON.stringify({ status: 'Failed', error: { code: 'credential=private' } }))).poll(trackingUrl)).failureCode, undefined);
  assert.equal((await make(new Response(null, { status: 204 })).poll(trackingUrl, 'location')).status, 'Succeeded');
  assert.equal((await make(new Response(null, { status: 200 })).poll(trackingUrl, 'location')).status, 'Succeeded');
  assert.equal((await make(new Response(null, { status: 202, headers: { 'Retry-After': '45' } })).poll(trackingUrl, 'location')).retryAfter, 45);
  await assert.rejects(make(new Response(null, { status: 403 })).poll(trackingUrl), error => error.code === 'operation_read_not_authorized');
});
test('VM observation requires valid instance view and maps unsupported power states to unknown', async () => {
  const data = { properties: { vmId: ids.vm, provisioningState: 'Succeeded', instanceView: { statuses: [{ code: 'PowerState/running' }] } } };
  const arm = new AzureArm(config, credential, async () => new Response(JSON.stringify(data))); assert.equal((await arm.observe()).powerState, 'running');
  data.properties.instanceView.statuses = [{ code: 'PowerState/new-future-state' }]; assert.equal((await arm.observe()).powerState, 'unknown');
  data.properties.vmId = 'missing'; await assert.rejects(arm.observe());
});
test('ledger schema rejects lost active records, incompatible target and corrupted fields', () => {
  const valid = bootstrapLedger(config); assert.equal(validateLedger(valid, config).generation, 1);
  for (const data of [{ ...valid, activeRequestId: 'lost' }, { ...valid, targetResourceId: '/wrong' }, { ...valid, generation: 0 }, { ...valid, records: [] }, { ...valid, schemaVersion: 2 }, { ...valid, admissionEnabled: 'true' }]) assert.throws(() => validateLedger(data, config));
});
test('ETag/lease fencing rejects a conflicting ledger write', async () => {
  const f = fixture(); await assert.rejects(f.ledger.transaction(async session => { f.port.etag++; session.data.admissionEnabled = false; await session.save(); })); assert.equal(f.port.data.admissionEnabled, true);
});
test('configuration has no default credential fallback and rejects wrong tenant/VM or partial cloud identity', () => {
  const env = { VM01_TENANT_ID: TARGET_TENANT_ID, VM01_RESOURCE_ID: TARGET_RESOURCE_ID, VM01_API_CLIENT_ID: ids.api, VM01_BROWSER_CLIENT_ID: ids.browser, VM01_BROWSER_USER_IDS: ids.user, VM01_EXPECTED_VM_ID: ids.vm, VM01_ORIGIN: config.origin, VM01_STORAGE_ACCOUNT: config.storageAccount };
  const parsed = configuration(env); assert.equal(parsed.mutationsEnabled, false); assert.equal(parsed.operationPollingEnabled, false); assert.equal(parsed.cloudClientId, undefined);
  for (const extra of [{ VM01_TENANT_ID: ids.user }, { VM01_RESOURCE_ID: '/other' }, { VM01_CLOUD_CLIENT_ID: ids.cloud }, { VM01_ORIGIN: 'http://local' }, { VM01_ENABLE_MUTATIONS: 'yes' }]) assert.throws(() => configuration({ ...env, ...extra }));
});
