import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterFactory,validateGoogleIdentity,googleLogin} from '../dist/oauth.js';
import {OAuth2Client} from 'google-auth-library';
import {MemoryStore} from '../dist/store.js';
import {application,authorize,tokenExchange,mcpRequest,config,subscription,BrowserCookieJar,fixture,echo} from './helpers.mjs';
import {open,seal} from '../dist/events.js';
import {hash} from '../dist/security.js';

test('OAuth metadata, real provider code/PKCE/token/refresh lifecycle and authenticated MCP events',async t=>{
  const app=await application();t.after(()=>app.close());
  const metadata=await app.call('/oauth/.well-known/openid-configuration');assert.equal(metadata.status,200);assert.equal(metadata.json().issuer,app.conf.issuer);assert.deepEqual(metadata.json().code_challenge_methods_supported,['S256']);assert.equal(metadata.json().registration_endpoint,undefined);
  assert.equal(metadata.json().revocation_endpoint,app.conf.issuer+'/token/revocation');
  const challenge=await mcpRequest(app,'server/discover');assert.equal(challenge.status,401);assert.match(challenge.headers['www-authenticate'],/oauth-protected-resource\/mcp/);
  const grant=await authorize(app);assert.equal(grant.redirect.searchParams.get('iss'),app.conf.issuer);assert.equal(grant.redirect.searchParams.get('state'),'synthetic-client-state');assert.ok(grant.code);
  const exchange=await tokenExchange(app,grant.code,grant.verifier);assert.equal(exchange.status,200,exchange.body);const token=exchange.json();assert.ok(token.access_token);assert.ok(token.refresh_token);
  const discover=await mcpRequest(app,'server/discover',{},token.access_token);assert.equal(discover.status,200,discover.body);assert.deepEqual(discover.json().result.capabilities.events,{});assert.deepEqual(discover.json().result.supportedVersions,['2026-07-28']);
  const list=await mcpRequest(app,'events/list',{},token.access_token);assert.equal(list.json().result.events[0].name,'grafana.alert.transition');
  const sub=await mcpRequest(app,'events/subscribe',subscription(),token.access_token);assert.ok(sub.json().result?.id,sub.body);
  const health=await mcpRequest(app,'tools/call',{name:'get_bridge_health',arguments:{}},token.access_token);assert.equal(health.status,200,health.body);assert.ok(health.json().result?.content,health.body);
  const refreshed=await app.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:app.conf.clientId,refresh_token:token.refresh_token,resource:app.conf.resource}).toString()});assert.equal(refreshed.status,200,refreshed.body);assert.notEqual(refreshed.json().refresh_token,token.refresh_token);
});
test('browser cookie jar honors path boundary, separate paths, domain, Secure and expiration',()=>{
  const jar=new BrowserCookieJar(),origin='https://bridge.example/oauth/auth',time=1000;
  jar.receive('interaction=one; Path=/oauth/interaction/one; Secure',origin,time);
  jar.receive('interaction=two; Path=/oauth/interaction/two; Secure',origin,time);
  jar.receive('domain=yes; Domain=bridge.example; Path=/; Max-Age=1',origin,time);
  jar.receive('bad=no; Domain=attacker.example; Path=/',origin,time);
  assert.equal(jar.header('https://bridge.example/oauth/google/callback',time),'domain=yes');
  assert.equal(jar.header('https://bridge.example/oauth/interaction/one/google/callback',time),'interaction=one; domain=yes');
  assert.equal(jar.header('https://bridge.example/oauth/interaction/one-more',time),'domain=yes');
  assert.equal(jar.header('https://bridge.example/oauth/interaction/two',time),'interaction=two; domain=yes');
  assert.equal(jar.header('http://bridge.example/oauth/interaction/one',time),'domain=yes');
  assert.equal(jar.header('https://child.bridge.example/',time),'domain=yes');
  assert.equal(jar.header('https://attacker.example/',time),'');
  assert.equal(jar.header('https://bridge.example/',time+1001),'');
});
test('fresh Google callback bounces into signed interaction cookie scope and requires that browser before consuming state',async t=>{
  const app=await application();t.after(()=>app.close());
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'mcp:events',resource:app.conf.resource,state:'synthetic-client-state',code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  const start=await app.call('/oauth/auth?'+params);await app.follow(start.headers.location);
  const state=app.login().state,callback='/oauth/google/callback?'+new URLSearchParams({state,code:'synthetic-owner-code'}),cookieName=app.oauth.provider.cookieName('interaction');
  assert.equal(app.cookieJar.header(app.conf.baseUrl+callback).includes(cookieName+'='),false);
  const bounce=await app.call(callback);assert.equal(bounce.status,302);
  const destination=new URL(bounce.headers.location);assert.match(destination.pathname,/^\/oauth\/interaction\/[^/]+\/google\/callback$/);
  assert.equal(app.cookieJar.header(destination).includes(cookieName+'='),true);
  const absent=await app.call(destination.pathname+destination.search,{cookies:false});assert.equal(absent.status,400);assert.match(absent.body,/interaction_session_missing/);
  assert.ok(await app.store.get('googleStates/'+hash(state)));
  let response=await app.follow(bounce.headers.location);
  for(let i=0;i<8 && !response.headers.location?.startsWith(app.conf.redirectUri);i++) {
    if(response.status===200 && response.body.includes('name="csrf"')) {
      const csrf=response.body.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)[1],action=response.body.match(/action="([^"]+)"/)[1];
      response=await app.call(action,{method:'POST',headers:{Origin:app.conf.baseUrl,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf,decision:'session'}).toString()});
    } else response=await app.follow(response.headers.location);
  }
  assert.ok(new URL(response.headers.location).searchParams.get('code'));assert.equal(await app.store.get('googleStates/'+hash(state)),undefined);
  assert.equal((await app.call(callback)).status,400);
});
test('HTTP refresh-token revocation checks ownership without token oracle and cancels tokens plus queued callbacks',async t=>{
  let sends=0;const app=await application({send:async(url,body)=>JSON.parse(body).type==='verification'?echo(url,body):(sends++,{status:200,body:''})});t.after(()=>app.close());
  const grant=await authorize(app),tokens=(await tokenExchange(app,grant.code,grant.verifier)).json();
  const subscribe=await mcpRequest(app,'events/subscribe',subscription(),tokens.access_token);assert.ok(subscribe.json().result.id);
  await app.bridge.ingest(fixture());assert.equal((await app.store.query('deliveries',[['state','==','pending']],10)).length,1);
  const revoke=token=>app.call('/oauth/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:app.conf.clientId,token,token_type_hint:'refresh_token'}).toString()});
  const row=(await app.store.query('oauth',[['model','==','RefreshToken']],10))[0],payload=JSON.parse(open(row.encrypted,app.conf.stateKey)),path='oauth/'+hash(app.conf.issuer+':RefreshToken:'+payload.jti);
  for(const overrides of [{clientId:'other-client'},{accountId:'other-owner'}]){
    await app.store.atomic(async tx=>tx.set(path,{...row,encrypted:seal(JSON.stringify({...payload,...overrides}),app.conf.stateKey)}));
    const denied=await revoke(tokens.refresh_token);assert.equal(denied.status,200);assert.equal(denied.body,'');assert.equal(await app.store.get('revokedGrants/'+hash(payload.grantId)),undefined);
  }
  await app.store.atomic(async tx=>tx.set(path,row));
  const unknown=await revoke('synthetic-unknown-token'),result=await revoke(tokens.refresh_token),repeat=await revoke(tokens.refresh_token);
  for(const r of [unknown,result,repeat]){assert.equal(r.status,200);assert.equal(r.body,'');}
  assert.equal((await mcpRequest(app,'events/list',{},tokens.access_token)).status,401);
  const refresh=await app.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:app.conf.clientId,refresh_token:tokens.refresh_token,resource:app.conf.resource}).toString()});
  assert.equal(refresh.status,400);assert.equal(refresh.json().error,'invalid_grant');
  await app.bridge.dispatch();assert.equal(sends,0);assert.equal((await app.store.query('deliveries',[],10))[0].state,'cancelled');
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

test('Google exchange diagnostics allow only fixed categories and never expose upstream payloads',async t=>{
  const marker='sentinel-private-code-cookie-token-url';let output='';
  const originalWrite=process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout,'write',(chunk,...args)=>{if(typeof chunk==='string' && chunk.startsWith('{"event":')){output+=chunk;return true;}return originalWrite(chunk,...args);});
  const getToken=t.mock.method(OAuth2Client.prototype,'getToken');
  for(const [upstream,expected] of [['invalid_client','invalid_client'],['invalid_grant','invalid_grant'],[marker,'unexpected']]) {
    getToken.mock.mockImplementation(async()=>{throw Object.assign(new Error(marker),{response:{data:{error:upstream,error_description:marker}},config:{url:marker,headers:{cookie:marker}}});});
    await assert.rejects(()=>googleLogin(config()).complete(marker,marker,marker),error=>error.reason==='google_sign_in_exchange_failed' && error.status===502);
    assert.ok(output.includes('oauth_google_exchange_'+expected));
  }
  assert.equal(output.includes(marker),false);
});

test('Google ID-token verification failure stays closed with credential-free diagnostics',async t=>{
  const marker='sentinel-private-id-token';let output='';
  const originalWrite=process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout,'write',(chunk,...args)=>{if(typeof chunk==='string' && chunk.startsWith('{"event":')){output+=chunk;return true;}return originalWrite(chunk,...args);});
  t.mock.method(OAuth2Client.prototype,'getToken',async()=>({tokens:{id_token:marker}}));
  t.mock.method(OAuth2Client.prototype,'verifyIdToken',async()=>{throw new Error(marker);});
  await assert.rejects(()=>googleLogin(config()).complete('synthetic','synthetic','synthetic'),error=>error.reason==='google_sign_in_verify_failed' && error.status===502);
  assert.ok(output.includes('oauth_google_verify_unexpected'));assert.equal(output.includes(marker),false);
});

test('full advertised OIDC and MCP scope set completes the synthetic provider flow',async t=>{
  const app=await application();t.after(()=>app.close());
  const grant=await authorize(app,{scope:'openid offline_access mcp:events mcp:read'});
  const response=await tokenExchange(app,grant.code,grant.verifier);
  assert.equal(response.status,200);assert.ok(response.json().id_token);assert.ok(response.json().refresh_token);
});

test('interaction storage failure identifies its phase without leaking exception details',async t=>{
  const app=await application();t.after(()=>app.close());let output='';
  const originalWrite=process.stdout.write.bind(process.stdout);
  t.mock.method(process.stdout,'write',(chunk,...args)=>{if(typeof chunk==='string' && chunk.startsWith('{"event":')){output+=chunk;return true;}return originalWrite(chunk,...args);});
  t.mock.method(app.store,'get',async()=>{throw Object.assign(new Error('sentinel-private-storage-context'),{code:7});});
  const response=await app.call('/oauth/interaction/synthetic');
  assert.equal(response.status,500);assert.deepEqual(response.json(),{error:'request_failed'});
  assert.ok(output.includes('oauth_owner_check_datastore_permission'));
  assert.equal(output.includes('sentinel-private-storage-context'),false);
});
