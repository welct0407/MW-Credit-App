import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterFactory,validateGoogleIdentity} from '../dist/oauth.js';
import {MemoryStore} from '../dist/store.js';
import {application,authorize,tokenExchange,mcpRequest,config,subscription} from './helpers.mjs';

test('OAuth metadata, real provider code/PKCE/token/refresh lifecycle and authenticated MCP events',async t=>{
  const app=await application();t.after(()=>app.close());
  const metadata=await app.call('/oauth/.well-known/openid-configuration');assert.equal(metadata.status,200);assert.equal(metadata.json().issuer,app.conf.issuer);assert.deepEqual(metadata.json().code_challenge_methods_supported,['S256']);assert.equal(metadata.json().registration_endpoint,undefined);
  const challenge=await mcpRequest(app,'server/discover');assert.equal(challenge.status,401);assert.match(challenge.headers['www-authenticate'],/oauth-protected-resource\/mcp/);
  const grant=await authorize(app);assert.equal(grant.redirect.searchParams.get('iss'),app.conf.issuer);assert.equal(grant.redirect.searchParams.get('state'),'synthetic-client-state');assert.ok(grant.code);
  const exchange=await tokenExchange(app,grant.code,grant.verifier);assert.equal(exchange.status,200,exchange.body);const token=exchange.json();assert.ok(token.access_token);assert.ok(token.refresh_token);
  const discover=await mcpRequest(app,'server/discover',{},token.access_token);assert.equal(discover.status,200,discover.body);assert.deepEqual(discover.json().result.capabilities.events,{});assert.deepEqual(discover.json().result.supportedVersions,['2026-07-28']);
  const list=await mcpRequest(app,'events/list',{},token.access_token);assert.equal(list.json().result.events[0].name,'grafana.alert.transition');
  const sub=await mcpRequest(app,'events/subscribe',subscription(),token.access_token);assert.ok(sub.json().result?.id,sub.body);
  const health=await mcpRequest(app,'tools/call',{name:'get_bridge_health',arguments:{}},token.access_token);assert.equal(health.status,200,health.body);assert.ok(health.json().result?.content,health.body);
  const refreshed=await app.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:app.conf.clientId,refresh_token:token.refresh_token,resource:app.conf.resource}).toString()});assert.equal(refreshed.status,200,refreshed.body);assert.notEqual(refreshed.json().refresh_token,token.refresh_token);
});
test('wrong PKCE, redirect, resource, unknown client and reused authorization code are rejected',async t=>{
  const app=await application();t.after(()=>app.close());
  for(const [key,value] of [['redirect_uri','https://evil.example/callback'],['resource','https://evil.example/mcp'],['client_id','unknown']]) {
    const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'mcp:events',resource:app.conf.resource,state:'test',code_challenge:'A'.repeat(43),code_challenge_method:'S256',[key]:value});
    const res=await app.call('/oauth/auth?'+params);assert.ok(res.status===400 || new URL(res.headers.location).searchParams.has('error'),res.body);assert.notEqual(res.headers.location?.startsWith('https://evil.example'),true);
  }
  const wrong=await authorize(app);const denied=await tokenExchange(app,wrong.code,'wrong-verifier-'.repeat(4));assert.equal(denied.status,400);assert.equal(denied.json().error,'invalid_grant');
  const valid=await authorize(app);assert.equal((await tokenExchange(app,valid.code,valid.verifier)).status,200);const replay=await tokenExchange(app,valid.code,valid.verifier);assert.equal(replay.status,400);assert.equal(replay.json().error,'invalid_grant');
});
test('durable OAuth adapter persists encrypted state, consumes once, fences revocation and separates issuers',async()=>{
  const store=new MemoryStore(),conf=config(),Adapter=adapterFactory(store,conf.stateKey,conf.issuer),a=new Adapter('AuthorizationCode');
  await a.upsert('sentinel-token',{grantId:'grant-1',uid:'uid-1',clientId:'client',jti:'sentinel-token'},60);
  const row=(await store.query('oauth',[],10))[0];assert.equal(JSON.stringify(row).includes('sentinel-token'),false);assert.equal((await a.findByUid('uid-1')).clientId,'client');
  const results=await Promise.allSettled([a.consume('sentinel-token'),a.consume('sentinel-token')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const Other=adapterFactory(store,conf.stateKey,'https://other.example/oauth');assert.equal(await new Other('AuthorizationCode').find('sentinel-token'),undefined);assert.equal(await new Other('AuthorizationCode').findByUid('uid-1'),undefined);
  await a.revokeByGrantId('grant-1');assert.equal(await a.find('sentinel-token'),undefined);await a.upsert('late-token',{grantId:'grant-1'},60);assert.equal(await a.find('late-token'),undefined);
});
test('Google owner check rejects wrong subject/email/unverified identity or nonce',()=>{
  const conf=config(),payload={sub:conf.ownerSub,email:conf.ownerEmail,email_verified:true,nonce:'nonce'};
  assert.equal(validateGoogleIdentity(payload,conf,'nonce'),conf.ownerSub);
  for(const p of [{...payload,sub:'attacker'},{...payload,email:'attacker@example.com'},{...payload,email_verified:false},{...payload,nonce:'other'},undefined])assert.throws(()=>validateGoogleIdentity(p,conf,'nonce'));
});
