import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, constants, X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { spawnSync } from 'node:child_process';
import { createCloudClient, CloudClientError, loadCertificateCredential, parseStatusArguments, CLOUD_CLIENT_ID, CLOUD_TOKEN_URL, CLOUD_STATUS_URL, CLOUD_SCOPE, PRIVATE_KEY_VARIABLE, CERTIFICATE_VARIABLE } from '../dist/scripts/cloud-client.js';

// Ephemeral mock signing keys only. No certificate is generated or registered.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
const now = Date.parse('2026-10-04T00:00:00Z');
const requestId = `${now}.11111111-1111-4111-8111-111111111111`;
const thumbprint = 'mock-certificate-sha256';
const statusData = () => ({ vm: 'VM-01', observation: { vmId: '0af4bbf5-ce75-43d7-931f-9e8c4a13dfe9', powerState: 'deallocated', provisioningState: 'Succeeded', observedAt: new Date(now).toISOString() }, stateVersion: 'a'.repeat(64), generation: 12, actions: { start: true, restart: false, deallocate: false }, privateDetail: 'DO_NOT_RETURN', authorization: 'DO_NOT_RETURN' });
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const tokenResponse = () => json({ token_type: 'Bearer', access_token: 'mock-only-token', expires_in: 3600 });
function fixture(options = {}) {
  const calls = [];
  const client = createCloudClient({ VM01_ORIGIN: 'https://evil.invalid', VM01_TENANT_ID: 'evil', VM01_CLOUD_CLIENT_ID: 'evil' }, {
    now: () => now,
    loadCredential: () => ({ privateKey, thumbprint, expiresAt: now + 90 * 86400000 }),
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (url === CLOUD_TOKEN_URL) return options.token ? options.token(init) : tokenResponse();
      return options.status ? options.status(init) : json(statusData());
    }, ...options.dependencies
  });
  return { client, calls };
}
function sanitized(code, httpStatus) {
  return error => error instanceof CloudClientError && error.code === code && error.message === code && !error.cause && (httpStatus === undefined || error.httpStatus === httpStatus) && !JSON.stringify(error).includes('DO_NOT_RETURN');
}
test('client signs a short PS256 assertion and sends it only to the fixed token endpoint', async () => {
  const f = fixture(); const result = await f.client.status();
  assert.equal(f.calls.length, 2);
  const [token, status] = f.calls;
  assert.equal(token.url, CLOUD_TOKEN_URL); assert.equal(token.init.method, 'POST');
  assert.equal(token.init.body.get('client_id'), CLOUD_CLIENT_ID); assert.equal(token.init.body.get('scope'), CLOUD_SCOPE);
  assert.equal(token.init.body.get('grant_type'), 'client_credentials');
  assert.equal(token.init.body.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  const [header, claims, signature] = token.init.body.get('client_assertion').split('.');
  const h = JSON.parse(Buffer.from(header, 'base64url')); const c = JSON.parse(Buffer.from(claims, 'base64url'));
  assert.equal(h.alg, 'PS256'); assert.equal(h['x5t#S256'], thumbprint);
  assert.equal(c.aud, CLOUD_TOKEN_URL); assert.equal(c.iss, CLOUD_CLIENT_ID); assert.equal(c.sub, CLOUD_CLIENT_ID);
  assert.equal(c.exp - c.nbf, 300); assert.equal(c.iat, now / 1000); assert.match(c.jti, /^[0-9a-f-]{36}$/);
  assert.ok(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(signature, 'base64url')));
  assert.equal(status.url, CLOUD_STATUS_URL); assert.equal(status.init.method, 'GET'); assert.equal(status.init.body, undefined);
  assert.ok(status.init.headers.authorization === 'Bearer mock-only-token');
  for (const call of f.calls) { assert.equal(call.init.redirect, 'error'); assert.equal(call.init.cache, 'no-store'); assert.ok(call.init.signal); }
  assert.equal(result.observation.powerState, 'deallocated'); assert.equal(result.executorReady, null);
  assert.equal(result.certificate.renewalDue, false); assert.ok(!JSON.stringify(result).includes('DO_NOT_RETURN')); assert.ok(!JSON.stringify(result).includes('mock-only-token'));
  assert.deepEqual(Object.keys(f.client), ['status']);
});
test('accepted saved requests are reconciled by a single status GET without a power POST', async () => {
  const f = fixture({ status: () => json({ ...statusData(), operation: { requestId, action: 'deallocate', phase: 'accepted', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), reason: 'DO_NOT_RETURN', trackingUrl: 'https://evil.invalid/DO_NOT_RETURN' } }) });
  const result = await f.client.status(requestId);
  assert.equal(f.calls[1].url, `${CLOUD_STATUS_URL}?requestId=${requestId}`);
  assert.equal(result.operation.phase, 'accepted'); assert.equal(result.observation.powerState, 'deallocated');
  assert.ok(!JSON.stringify(result).includes('DO_NOT_RETURN')); assert.equal(f.calls.filter(x => x.url.startsWith(CLOUD_STATUS_URL) && x.init.method !== 'GET').length, 0);
});
test('successive explicit checks create fresh assertions without a token cache', async () => {
  const f = fixture(); await f.client.status(); await f.client.status();
  assert.equal(f.calls.length, 4);
  const assertions = f.calls.filter(call => call.url === CLOUD_TOKEN_URL).map(call => call.init.body.get('client_assertion'));
  const identifiers = assertions.map(assertion => JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url')).jti);
  assert.notEqual(identifiers[0], identifiers[1]);
});
test('argument validation happens before credential access or networking', async () => {
  for (const args of [[], ['start'], ['status', '--url', 'https://evil.invalid'], ['status', '--request-id', `${requestId}\n`], ['status', '--request-id', requestId, 'extra']]) assert.throws(() => parseStatusArguments(args), sanitized('invalid_arguments'));
  assert.equal(parseStatusArguments(['status']), undefined); assert.equal(parseStatusArguments(['status', '--request-id', requestId]), requestId);
  const f = fixture({ dependencies: { loadCredential: () => { throw new Error('DO_NOT_RETURN'); } } });
  await assert.rejects(f.client.status('https://evil.invalid'), sanitized('invalid_arguments')); assert.equal(f.calls.length, 0);
  const run = spawnSync(process.execPath, ['dist/scripts/cloud-status.js', 'deallocate'], { encoding: 'utf8', env: {} });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr, '{"error":"invalid_arguments"}\n');
});
test('missing, malformed, mismatched and noncurrent certificate material fails locally', async () => {
  assert.throws(() => loadCertificateCredential({}, now), sanitized('credential_unavailable'));
  assert.throws(() => loadCertificateCredential({ [PRIVATE_KEY_VARIABLE]: 'DO_NOT_RETURN', [CERTIFICATE_VARIABLE]: 'DO_NOT_RETURN' }, now), sanitized('credential_invalid'));
  // Node's public CA bundle supplies a real X.509 parser fixture; no private CA key is accessed.
  const certificate = rootCertificates.map(pem => new X509Certificate(pem)).find(cert => cert.publicKey.asymmetricKeyType === 'rsa' && Date.parse(cert.validFrom) < now && Date.parse(cert.validTo) > now + 300000);
  assert.ok(certificate);
  const env = { [PRIVATE_KEY_VARIABLE]: privateKey.export({ format: 'pem', type: 'pkcs8' }), [CERTIFICATE_VARIABLE]: certificate.toString() };
  assert.throws(() => loadCertificateCredential(env, now), sanitized('credential_invalid'));
  assert.throws(() => loadCertificateCredential(env, Date.parse(certificate.validFrom) - 1), sanitized('certificate_not_current'));
  assert.throws(() => loadCertificateCredential(env, Date.parse(certificate.validTo)), sanitized('certificate_not_current'));
  const f = fixture({ dependencies: { loadCredential: () => { throw new Error('DO_NOT_RETURN'); } } });
  await assert.rejects(f.client.status(), sanitized('credential_invalid')); assert.equal(f.calls.length, 0);
});
test('redirects, rejected auth and token transport failures expose no raw details and never reach status', async t => {
  for (const [name, token, code, httpStatus] of [
    ['redirect', () => new Response('DO_NOT_RETURN', { status: 302, headers: { location: 'https://evil.invalid' } }), 'token_rejected', 302],
    ['rejected', () => new Response('DO_NOT_RETURN', { status: 400 }), 'token_rejected', 400],
    ['transport', () => { throw new Error('DO_NOT_RETURN'); }, 'token_transport_failed'],
    ['malformed', () => new Response('DO_NOT_RETURN', { headers: { 'content-type': 'application/json' } }), 'token_response_invalid', 200],
    ['wrong-type', () => new Response('{}'), 'token_response_invalid', 200],
    ['missing-token', () => json({ token_type: 'Bearer', expires_in: 3600 }), 'token_response_invalid'],
    ['short-token', () => json({ token_type: 'Bearer', access_token: 'fixture', expires_in: 1 }), 'token_response_invalid'],
    ['oversized', () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }), 'token_response_invalid', 200]
  ]) await t.test(name, async () => { const f = fixture({ token }); await assert.rejects(f.client.status(), sanitized(code, httpStatus)); assert.equal(f.calls.length, 1); });
});
test('status failures are bounded, sanitized and never retried', async t => {
  for (const [name, status, code, httpStatus] of [
    ['forbidden', () => new Response('DO_NOT_RETURN', { status: 403 }), 'status_rejected', 403],
    ['transport', () => { throw new Error('DO_NOT_RETURN'); }, 'status_transport_failed'],
    ['redirect', () => new Response('', { status: 307 }), 'status_rejected', 307],
    ['invalid', () => json(null), 'status_response_invalid', 200],
    ['wrong-vm', () => json({ ...statusData(), vm: 'DO_NOT_RETURN' }), 'status_response_invalid'],
    ['stale', () => json({ ...statusData(), observation: { ...statusData().observation, observedAt: new Date(now - 120001).toISOString() } }), 'status_response_invalid'],
    ['future', () => json({ ...statusData(), observation: { ...statusData().observation, observedAt: new Date(now + 30001).toISOString() } }), 'status_response_invalid'],
    ['leaky-field', () => json({ ...statusData(), observation: { ...statusData().observation, provisioningState: 'DO_NOT_RETURN' } }), 'status_response_invalid']
  ]) await t.test(name, async () => { const f = fixture({ status }); await assert.rejects(f.client.status(), sanitized(code, httpStatus)); assert.equal(f.calls.length, 2); });
});
test('receipt lookup rejects absent or mismatched receipts; renewal output contains public expiry only', async () => {
  const f = fixture(); await assert.rejects(f.client.status(requestId), sanitized('status_response_invalid'));
  const wrong = fixture({ status: () => json({ ...statusData(), operation: { requestId: `${now}.22222222-2222-4222-8222-222222222222`, action: 'start', phase: 'completed', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } }) });
  await assert.rejects(wrong.client.status(requestId), sanitized('status_response_invalid'));
  const soon = fixture({ dependencies: { loadCredential: () => ({ privateKey, thumbprint, expiresAt: now + 29 * 86400000 }) } });
  assert.equal((await soon.client.status()).certificate.renewalDue, true);
});
test('a timed-out request aborts at the fixed deadline with sanitized failure and no retry', async () => {
  let calls = 0; let aborted = false;
  const f = fixture({ dependencies: { fetch: async (_url, init) => {
    calls++;
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('DO_NOT_RETURN')); }, { once: true }));
  } } });
  await assert.rejects(f.client.status(), sanitized('token_transport_failed'));
  assert.equal(calls, 1); assert.equal(aborted, true);
});
