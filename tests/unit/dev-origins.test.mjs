import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBusinessConfig } from '../../services/production/business-config.mjs';
import { businessEnv } from './business-env-fixture.mjs';
import { createReadHandler } from '../../services/api/read-handler.mjs';
const fallback = 'https://mw-credit-app-dev-737787224638.web.app';
const custom = 'https://dev-lm.mw-credit.com';
// The DEV reader runs the business runtime with the DEV profile (ALL-ARCH-01); the canonical DEV host is required.
const env = value => ({ ...businessEnv('dev', 'reader'), ALLOWED_WEB_ORIGINS: value });
const loadDevReadConfig = loadBusinessConfig;
async function invoke(handler, headers = {}, method = 'GET') {
  const saved = {};
  let body;
  const res = { setHeader: (key, value) => { saved[key] = value; }, end: value => { body = value; } };
  await handler({ method, url: '/api/session', headers }, res);
  return { status: res.statusCode, headers: saved, body: body ? JSON.parse(body) : null };
}
test('DEV origin configuration permits only the required custom host with optional exact fallback', () => {
  for (const values of [[custom], [fallback, custom], [custom, fallback]]) {
    const config = loadDevReadConfig(env(JSON.stringify(values)));
    assert.deepEqual(config.origins, values);
    assert.ok(Object.isFrozen(config) && Object.isFrozen(config.origins));
    assert.throws(() => config.origins.push('https://other.example.test'));
  }
  const invalid = [undefined, '', 'not-json', 'null', '{}', JSON.stringify(custom), '[]', '[null]', JSON.stringify([fallback]), JSON.stringify(['https://lm.mw-credit.com']), JSON.stringify([fallback, fallback]), JSON.stringify([fallback, custom, custom]), ...['*', 'null', 'http://dev-lm.mw-credit.com', 'https://DEV-LM.mw-credit.com', custom + '/', custom + ':443', custom + ':8443', custom + '/path', custom + '?q=1', custom + '#fragment', 'https://user@dev-lm.mw-credit.com', 'https://dev-lm.mw-credit.com.evil.test', ' https://dev-lm.mw-credit.com', 1, 'https://mw-credit-prod-737787224638.web.app'].map(value => JSON.stringify([custom, value]))];
  for (const value of invalid) assert.throws(() => loadDevReadConfig(env(value)), String(value));
  assert.throws(() => loadDevReadConfig({ ...env(JSON.stringify([custom])), ALLOWED_WEB_ORIGIN: custom }));
});
test('CORS echoes only an exact permitted origin, retains no-store/Vary and authenticates no-Origin callers', async () => {
  let verifies = 0, reads = 0;
  const handler = createReadHandler({ config: loadDevReadConfig(env(JSON.stringify([fallback, custom]))), verifyPrincipal: async authorization => { verifies++; return authorization === 'Bearer synthetic' ? { ok: true, email: 'synthetic@example.test', subject: 'synthetic' } : { ok: false, status: 401, code: 'sign_in_required' }; }, store: { session: async () => { reads++; return { ok: true, source: 'dev' }; } } });
  for (const origin of [fallback, custom]) {
    const preflight = await invoke(handler, { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'Authorization' }, 'OPTIONS');
    assert.equal(preflight.status, 204); assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
    const result = await invoke(handler, { origin, authorization: 'Bearer synthetic' });
    assert.equal(result.status, 200); assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(result.headers.Vary, 'Origin'); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(result.headers['Access-Control-Allow-Credentials'], undefined);
  }
  const prior = verifies;
  for (const origin of ['', 'null', custom + '/', custom + ':443', 'https://evil.test', [custom]]) {
    const result = await invoke(handler, { origin, authorization: 'Bearer synthetic' });
    assert.equal(result.status, 403); assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  }
  for (const headers of [{ origin: custom, 'access-control-request-method': 'POST' }, { origin: custom, 'access-control-request-method': 'GET', 'access-control-request-headers': 'Authorization, X-Other' }, { 'access-control-request-method': 'GET' }]) assert.equal((await invoke(handler, headers, 'OPTIONS')).status, 403);
  assert.equal(verifies, prior);
  assert.equal((await invoke(handler)).status, 401);
  const noOrigin = await invoke(handler, { authorization: 'Bearer synthetic' });
  assert.equal(noOrigin.status, 200); assert.equal(noOrigin.headers['Access-Control-Allow-Origin'], undefined); assert.equal(reads, 3);
  const customOnly = createReadHandler({ config: loadDevReadConfig(env(JSON.stringify([custom]))), verifyPrincipal: async () => { throw new Error('must not verify disallowed origin'); }, store: {} });
  assert.equal((await invoke(customOnly, { origin: fallback })).status, 403);
});

test('independent origin negatives and paired new-image fallback rollback fail closed',async()=>{
 for(const value of [custom+'.','https://dev-lm.mw-credit.com:443','https://dev-lm.mw-credit.com%2Fevil','https://evil-dev-lm.mw-credit.com','https://dev-lm.mw-credit.com@evil.test','https://dev-lm.mw-credit.com\\evil',null,true,{origin:custom}])assert.throws(()=>loadDevReadConfig(env(JSON.stringify([custom,value]))));
 for(const legacy of ['',null,fallback])assert.throws(()=>loadDevReadConfig({...env(JSON.stringify([fallback,custom])),ALLOWED_WEB_ORIGIN:legacy}));
 const oldOnly=env(undefined);delete oldOnly.ALLOWED_WEB_ORIGINS;oldOnly.ALLOWED_WEB_ORIGIN=custom;assert.throws(()=>loadDevReadConfig(oldOnly));
 let verifies=0,reads=0;const handler=createReadHandler({config:loadDevReadConfig(env(JSON.stringify([custom]))),verifyPrincipal:async()=>{verifies++;return{ok:true,email:'synthetic@example.test'}},store:{session:async()=>{reads++;return{ok:true}}}});
 assert.equal((await invoke(handler,{origin:fallback,authorization:'Bearer synthetic'})).status,403);assert.equal(verifies,0);assert.equal(reads,0);
 const result=await invoke(handler,{origin:custom,authorization:'Bearer synthetic'});assert.equal(result.status,200);assert.equal(result.headers['Access-Control-Allow-Origin'],custom);
});

test('real loopback HTTP preserves exact CORS on denied bearer and failed mapping without cookies',async()=>{
 const {createServer}=await import('node:http');let verifies=0,reads=0;
 const handler=createReadHandler({config:loadDevReadConfig(env(JSON.stringify([fallback,custom]))),verifyPrincipal:async authorization=>{verifies++;return authorization==='Bearer synthetic-verified'?{ok:true,email:'synthetic@example.test'}:{ok:false,status:401,code:'session_invalid'}},store:{session:async()=>{reads++;return{ok:false,status:403,code:'access_denied'}}}});
 const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/session';
 try{
  for(const origin of [fallback,custom]){
   let response=await fetch(url,{headers:{Origin:origin,Authorization:'Bearer revoked-synthetic'}});assert.equal(response.status,401);assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.get('vary'),'Origin');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('access-control-allow-credentials'),null);
   response=await fetch(url,{headers:{Origin:origin,Authorization:'Bearer synthetic-verified'}});assert.equal(response.status,403);assert.equal((await response.json()).code,'access_denied');
   response=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'}});assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-methods'),'GET');
  }
  const before=verifies;for(const origin of ['null',custom+'/',custom+':443',custom+', '+fallback]){const response=await fetch(url,{headers:{Origin:origin,Authorization:'Bearer synthetic-verified'}});assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),null)}assert.equal(verifies,before);assert.equal(reads,2);
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{Authorization:'Bearer synthetic-verified'}})).status,403);assert.equal(reads,3);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
