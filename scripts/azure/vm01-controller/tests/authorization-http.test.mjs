import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { authenticate } from '../dist/src/authorization.js';
import { createApiHandler } from '../dist/src/http.js';
import { config, fixture, ids } from './helpers.mjs';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
const claims = { tid: config.tenantId, ver: '2.0', oid: ids.user, azp: ids.browser, scp: 'vm01.control' };
const sign = async (overrides = {}, options = {}) => new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256' }).setIssuer(options.issuer ?? issuer).setAudience(options.audience ?? ids.api).setIssuedAt().setNotBefore('0s').setExpirationTime(options.expiry ?? '5m').sign(privateKey);
const verify = async token => (await jwtVerify(token, publicKey, { issuer, audience: ids.api, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'nbf', 'oid', 'tid', 'azp'] })).payload;
const bearer = token => new Headers({ authorization: `Bearer ${token}` });
test('cryptographic bearer validation rejects unsigned, wrong audience/issuer and expired tokens', async () => {
  for (const token of ['junk', await sign({}, { audience: ids.browser }), await sign({}, { issuer: 'https://evil.invalid' }), await sign({}, { expiry: '-1m' })]) await assert.rejects(authenticate(bearer(token), config, verify), error => error.status === 401);
});
test('cookie/Function key/principal headers cannot replace a bearer token', async () => {
  const headers = new Headers({ cookie: 'AppServiceAuthSession=fake', 'x-functions-key': 'fake', 'x-ms-client-principal': Buffer.from(JSON.stringify(claims)).toString('base64') });
  await assert.rejects(authenticate(headers, config, verify), error => error.code === 'bearer_token_required');
});
test('browser uses exact object identity, delegated scope and SPA client', async () => {
  assert.equal((await authenticate(bearer(await sign()), config, verify)).kind, 'browser');
  for (const override of [{ tid: ids.user }, { oid: ids.principal }, { azp: ids.cloud }, { scp: 'User.Read' }, { ver: '1.0' }, { idtyp: 'app' }]) await assert.rejects(authenticate(bearer(await sign(override)), config, verify), error => error.status === 403);
});
test('application caller requires explicit app identity and route role', async () => {
  const f = fixture(); const handler = createApiHandler(config, f.controller, verify);
  const applicationClaims = { scp: undefined, idtyp: 'app', azp: ids.cloud, oid: ids.principal, roles: ['VM01.Status'] };
  const token = await sign(applicationClaims);
  assert.equal((await handler(new Request(`${config.origin}/api/vm01/status`, { headers: bearer(token) }))).status, 200);
  const headers = bearer(token); headers.set('content-type', 'application/json');
  assert.equal((await handler(new Request(`${config.origin}/api/vm01/restart`, { method: 'POST', headers, body: JSON.stringify(f.request()) }))).status, 403); assert.equal(f.arm.calls.length, 0);
  for (const override of [{ idtyp: undefined }, { oid: ids.user }, { azp: ids.browser }, { roles: undefined }]) await assert.rejects(authenticate(bearer(await sign({ ...applicationClaims, ...override })), config, verify));
});
test('foreign origins, form posts, GET actions and extra target fields never reach ARM', async () => {
  const f = fixture(); const handler = createApiHandler(config, f.controller, verify); const token = await sign();
  const cases = [
    ['/api/vm01/restart', 'POST', { origin: 'https://evil.invalid', 'content-type': 'application/json' }, f.request(), 403],
    ['/api/vm01/restart', 'POST', { 'content-type': 'application/x-www-form-urlencoded' }, 'action=restart', 415],
    ['/api/vm01/restart', 'GET', {}, undefined, 405],
    ['/api/vm01/start', 'POST', { 'content-type': 'application/json' }, { ...f.request(), targetResourceId: '/other/vm' }, 400],
    ['/api/vm01/start?target=other', 'POST', { 'content-type': 'application/json' }, f.request(), 400],
    ['/api/vm01/status?requestId=x&requestId=y', 'GET', {}, undefined, 400],
    ['/api/vm01/delete', 'POST', { 'content-type': 'application/json' }, f.request(), 404],
    ['/api/vm01/restart', 'POST', { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' }, f.request(), 403]
  ];
  for (const [path, method, extra, body, status] of cases) { const headers = bearer(token); for (const [key, value] of Object.entries(extra)) headers.set(key, value); const request = new Request(`${config.origin}${path}`, { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }); assert.equal((await handler(request)).status, status); }
  assert.equal(f.arm.calls.length, 0);
});
test('JSON body size is bounded even without content-length', async () => {
  const f = fixture(); const handler = createApiHandler(config, f.controller, verify); const headers = bearer(await sign()); headers.set('content-type', 'application/json');
  const result = await handler(new Request(`${config.origin}/api/vm01/restart`, { method: 'POST', headers, body: ' '.repeat(5000) })); assert.equal(result.status, 413); assert.equal(f.arm.calls.length, 0);
});
test('authorized originless application uses JSON and same-origin browser succeeds', async () => {
  const f = fixture(); const handler = createApiHandler(config, f.controller, verify); const headers = bearer(await sign()); headers.set('origin', config.origin); headers.set('content-type', 'application/json');
  const result = await handler(new Request(`${config.origin}/api/vm01/restart`, { method: 'POST', headers, body: JSON.stringify(f.request()) })); assert.equal(result.status, 202); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.has('access-control-allow-origin'), false);
});
test('errors and receipts omit raw tokens, ARM error text and private operation URLs', async () => {
  const f = fixture(); f.arm.submitError = new Error('Bearer private-token at https://evil.invalid?secret=secret');
  const handler = createApiHandler(config, f.controller, verify); const token = await sign(); const headers = bearer(token); headers.set('content-type', 'application/json');
  const response = await handler(new Request(`${config.origin}/api/vm01/restart`, { method: 'POST', headers, body: JSON.stringify(f.request()) })); const text = await response.text();
  assert.equal(text.includes(token), false); assert.equal(text.includes('private-token'), false); assert.equal(text.includes('management.azure.com'), false); assert.equal(f.port.text.includes('secret='), false);
});
