import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {application,authorize,tokenExchange,mcpRequest,fixture} from './helpers.mjs';
import {open,seal} from '../dist/events.js';
import {hash} from '../dist/security.js';

test('HTTP ingress authenticates raw Grafana bytes, rejects unauthorized dispatch/hosts/oversize and never echoes secrets',async t=>{
  const app=await application();t.after(()=>app.close());
  const raw=JSON.stringify(fixture()),ts=String(Math.floor(Date.now()/1000)),sig=createHmac('sha256',app.conf.grafanaSecrets[0]).update(ts+':'+raw).digest('hex');
  const headers={'X-Grafana-Alerting-Timestamp':ts,'X-Grafana-Alerting-Signature':sig};
  assert.equal((await app.call('/health')).status,200);
  assert.equal((await app.call('/grafana',{method:'POST',body:raw,headers})).status,202);
  const bad=await app.call('/grafana',{method:'POST',body:raw+' ',headers});assert.equal(bad.status,401);assert.equal(bad.body.includes(raw),false);
  assert.equal((await app.call('/grafana',{method:'POST',body:'sentinel-secret'})).status,401);
  assert.equal((await app.call('/grafana',{method:'POST',body:'x'.repeat(262145)})).status,413);
  const failed=await app.call('/internal/dispatch',{method:'POST',headers:{Authorization:'Bearer sentinel-token'}});assert.equal(failed.status,401);assert.equal(failed.body.includes('sentinel-token'),false);
  assert.equal((await app.call('/internal/dispatch',{method:'POST',headers:{Authorization:'Bearer synthetic-scheduler'},body:{}})).status,200);
  assert.equal((await app.call('/health',{headers:{host:'evil.example'}})).status,400);
  assert.equal((await app.call('/health',{headers:{'X-Forwarded-Host':'evil.example','X-Forwarded-Proto':'http'}})).status,200);
});
test('expired/wrong-audience/wrong-scope access tokens and revoked owner/grant cannot read MCP',async t=>{
  const app=await application();t.after(()=>app.close());const grant=await authorize(app),token=(await tokenExchange(app,grant.code,grant.verifier)).json().access_token;
  const rows=await app.store.query('oauth',[['model','==','AccessToken']],10),row=rows[0],payload=JSON.parse(open(row.encrypted,app.conf.stateKey));
  const path='oauth/'+hash(app.conf.issuer+':AccessToken:'+payload.jti);
  for(const changed of [{...payload,aud:'https://evil.example'},{...payload,scope:'mcp:read'},{...payload,accountId:'other-user'}]){
    await app.store.atomic(async tx=>tx.set(path,{...row,encrypted:seal(JSON.stringify(changed),app.conf.stateKey)}));assert.equal((await mcpRequest(app,'events/list',{},token)).status,401);
  }
  await app.store.atomic(async tx=>tx.set(path,{...row,expiresAt:Date.now()-1}));assert.equal((await mcpRequest(app,'events/list',{},token)).status,401);
  await app.store.atomic(async tx=>tx.set(path,row));await app.store.atomic(async tx=>tx.set('control/owner',{enabled:false}));assert.equal((await mcpRequest(app,'events/list',{},token)).status,401);
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:true}));await app.oauth.provider.Grant.revokeByGrantId?.(payload.grantId);
  await app.oauth.provider.AccessToken.revokeByGrantId(payload.grantId);assert.equal((await mcpRequest(app,'events/list',{},token)).status,401);
});
test('Google callback needs browser interaction cookie, matching single-use state and valid identity',async t=>{
  const app=await application();t.after(()=>app.close());
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'mcp:events',resource:app.conf.resource,code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  let result=await app.call('/oauth/auth?'+params);result=await app.follow(result.headers.location);assert.ok(result.headers.location.startsWith('https://accounts.example'));
  const wrong=await app.call('/oauth/google/callback?state=wrong&code=sentinel-secret');assert.equal(wrong.status,400);assert.equal(wrong.body.includes('sentinel-secret'),false);
  const state=app.login().state;const bounce=await app.call('/oauth/google/callback?'+new URLSearchParams({state,code:'wrong'}));assert.equal(bounce.status,302);
  const denied=await app.follow(bounce.headers.location);assert.equal(denied.status,500);assert.equal(denied.body.includes('sentinel-secret'),false);
  const replay=await app.call('/oauth/google/callback?'+new URLSearchParams({state,code:'synthetic-owner-code'}));assert.equal(replay.status,400);assert.match(replay.body,/google_state_invalid/);
});
