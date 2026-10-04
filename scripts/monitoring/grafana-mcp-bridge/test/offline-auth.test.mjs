import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {application,authorize,tokenExchange,mcpRequest,subscription,signingSecret} from './helpers.mjs';
import {open} from '../dist/events.js';
import {OFFLINE_AUTHORIZATION_SECONDS} from '../dist/oauth.js';

const DAY=86400_000;
const offline={scope:'offline_access mcp:events mcp:read',prompt:'consent'};
const refresh=(app,value,extra={})=>app.call('/oauth/token',{method:'POST',cookies:false,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:app.conf.clientId,refresh_token:value,resource:app.conf.resource,...extra}).toString()});
const payloads=async(app,model)=>(await app.store.query('oauth',[['model','==',model]],100)).map(row=>JSON.parse(open(row.encrypted,app.conf.stateKey)));
const tokens=async(app,options=offline)=>{const grant=await authorize(app,options),res=await tokenExchange(app,grant.code,grant.verifier);assert.equal(res.status,200);return res.json();};
async function consentPage(app,options=offline) {
  const verifier='synthetic-pkce-verifier-012345678901234567890123456789';
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',resource:app.conf.resource,state:'synthetic',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...options});
  let res=await app.call('/oauth/auth?'+params);
  for(let i=0;i<12;i++) {
    if(res.status===200 && res.body.includes('name="csrf"'))return {res,action:res.body.match(/action="([^"]+)"/)[1],csrf:res.body.match(/name="csrf" value="([A-Za-z0-9_-]+)"/)[1]};
    const url=new URL(res.headers.location);
    res=url.hostname==='accounts.example'?await app.call('/oauth/google/callback?'+new URLSearchParams({state:app.login().state,code:'synthetic-owner-code'})):await app.follow(url);
  }
  throw new Error('Consent page unavailable');
}
const submit=(app,page,decision='allow',overrides={})=>app.call(page.action,{method:'POST',headers:{Origin:app.conf.baseUrl,'Content-Type':'application/x-www-form-urlencoded',...overrides.headers},body:new URLSearchParams({csrf:page.csrf,decision}).toString(),...overrides});

test('actual host read/event scope and missing prompt consent remain session bound; explicit offline consent survives',async t=>{
  const time=Date.now();t.mock.timers.enable({apis:['Date'],now:time});
  for(const options of [{scope:'mcp:events mcp:read'},{scope:'offline_access mcp:events mcp:read'},offline]) {
    t.mock.timers.setTime(time);
    const app=await application();
    try {
      const token=await tokens(app,options),[rt]=await payloads(app,'RefreshToken');
      const isOffline=options.prompt==='consent';
      assert.equal(rt.scope.split(' ').includes('offline_access'),isOffline);
      assert.equal(!!rt.expiresWithSession,!isOffline);
      assert.equal(token.expires_in,300);
      if(isOffline)assert.equal(rt.exp-rt.iiat,OFFLINE_AUTHORIZATION_SECONDS);
      t.mock.timers.setTime(time+DAY+1000);app.cookieJar.cookies.clear();
      const response=await refresh(app,token.refresh_token);
      assert.equal(response.status,isOffline?200:400);
    } finally {await app.close();}
  }
});

test('offline consent is owner/cookie/Origin/CSRF bound, cancellable, single use and explicit in the browser',async t=>{
  const app=await application();t.after(()=>app.close());
  const page=await consentPage(app);
  assert.match(page.res.body,/730 days/);assert.match(page.res.body,/sign out/);
  assert.equal((await payloads(app,'Grant')).some(g=>g.openid?.scope?.includes('offline_access')),false);
  assert.equal((await submit(app,{...page,csrf:'incorrect'})).status,403);
  assert.equal((await submit(app,page,'allow',{cookies:false})).status,400);
  assert.equal((await submit(app,page,'allow',{headers:{Origin:'https://attacker.example','Content-Type':'application/x-www-form-urlencoded'}})).status,403);
  const denied=await submit(app,page,'deny');assert.equal(denied.status,303);
  let response=await app.follow(denied.headers.location);
  assert.equal(new URL(response.headers.location).searchParams.get('error'),'access_denied');
  assert.notEqual((await submit(app,page)).status,200);
  assert.equal((await payloads(app,'Grant')).some(g=>g.openid?.scope?.includes('offline_access')),false);
});

test('offline refresh and authenticated subscription renewal survive process restart and session expiry without extending grant',async t=>{
  const time=Date.now();t.mock.timers.enable({apis:['Date'],now:time});
  let app=await application();let latest=app;t.after(()=>latest.close());
  const token=await tokens(app),[initial]=await payloads(app,'RefreshToken'),grant=(await payloads(app,'Grant')).find(g=>g.jti===initial.grantId);
  const secret=signingSecret(),params=subscription(secret,{statuses:['firing','resolved']});
  const first=await mcpRequest(app,'events/subscribe',params,token.access_token);assert.ok(first.json().result);
  const oldExpiry=Date.parse(first.json().result.refreshBefore),conf=app.conf,store=app.store;
  await app.close();t.mock.timers.setTime(time+DAY+1000);
  app=await application({config:conf,store});latest=app;
  const response=await refresh(app,token.refresh_token);assert.equal(response.status,200);
  const next=response.json();assert.notEqual(next.refresh_token,token.refresh_token);assert.equal(next.expires_in,300);
  const rotated=(await payloads(app,'RefreshToken')).find(p=>!p.consumed);
  assert.equal(rotated.exp,initial.exp);assert.equal(rotated.iiat,initial.iiat);
  assert.equal((await payloads(app,'Grant')).find(p=>p.jti===initial.grantId).exp,grant.exp);
  assert.equal((await mcpRequest(app,'tools/call',{name:'get_bridge_health',arguments:{}},next.access_token)).status,200);
  const renewed=await mcpRequest(app,'events/subscribe',params,next.access_token);assert.ok(renewed.json().result);
  assert.equal(renewed.json().result.id,first.json().result.id);assert.ok(Date.parse(renewed.json().result.refreshBefore)>oldExpiry);
  assert.equal(Date.parse(renewed.json().result.refreshBefore),Date.now()+DAY);
});

test('offline refresh replay revokes descendants; concurrent rotation cannot leave usable authority',async t=>{
  for(const concurrent of [false,true]) {
    const app=await application();
    try {
      const token=await tokens(app);
      const responses=concurrent?await Promise.all([refresh(app,token.refresh_token),refresh(app,token.refresh_token)]):[await refresh(app,token.refresh_token),await refresh(app,token.refresh_token)];
      assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===400).length,1);
      const winner=responses.find(r=>r.status===200).json();
      assert.equal((await refresh(app,winner.refresh_token)).status,400);
      assert.equal((await mcpRequest(app,'events/list',{},winner.access_token)).status,401);
      const tombstones=await app.store.query('revokedGrants',[],100);assert.equal(tombstones.length,1);
      assert.ok(tombstones[0].deleteAfter.getTime()>=Date.now()+OFFLINE_AUTHORIZATION_SECONDS*1000);
    } finally {await app.close();}
  }
});

test('absolute offline expiry, owner disable and resource/client/scope limits remain enforced',async t=>{
  const time=Date.now();t.mock.timers.enable({apis:['Date'],now:time});
  const app=await application();t.after(()=>app.close());
  for(const extra of [{scope:'mcp:write'},{resource:'https://other.example/mcp'},{client_id:'other-client'}]) {const probe=await tokens(app);assert.ok([400,401].includes((await refresh(app,probe.refresh_token,extra)).status));}
  const token=await tokens(app),initial=(await payloads(app,'RefreshToken')).find(p=>!p.consumed);
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:false}));assert.equal((await refresh(app,token.refresh_token)).status,403);
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:true}));
  t.mock.timers.setTime((initial.exp-1)*1000);
  const almost=await refresh(app,token.refresh_token);assert.equal(almost.status,200);assert.equal(almost.json().expires_in,300);
  const finalSub=await mcpRequest(app,'events/subscribe',subscription(),almost.json().access_token);assert.ok(finalSub.json().result);assert.equal(Date.parse(finalSub.json().result.refreshBefore),initial.exp*1000);
  t.mock.timers.setTime(initial.exp*1000);
  assert.equal((await refresh(app,almost.json().refresh_token)).status,400);
  assert.equal((await mcpRequest(app,'events/list',{},almost.json().access_token)).status,401);
});

test('HTTP revocation of an offline grant remains effective after 90 days and cancels event authority',async t=>{
  const time=Date.now();t.mock.timers.enable({apis:['Date'],now:time});
  const app=await application();t.after(()=>app.close());const token=await tokens(app);
  const result=await app.call('/oauth/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:app.conf.clientId,token:token.refresh_token,token_type_hint:'refresh_token'}).toString()});
  assert.equal(result.status,200);assert.equal(result.body,'');
  t.mock.timers.setTime(time+91*DAY);
  assert.equal((await refresh(app,token.refresh_token)).status,400);
  const tombstones=await app.store.query('revokedGrants',[],100);assert.equal(tombstones.length,1);assert.ok(tombstones[0].deleteAfter.getTime()>Date.now());
});

test('both issuer discovery documents use a plain endpoint; resource metadata/challenge keep only API scopes',async t=>{
  const app=await application();t.after(()=>app.close());
  for(const path of ['/oauth/.well-known/openid-configuration','/oauth/.well-known/oauth-authorization-server']) {
    const response=await app.call(path);assert.equal(response.status,200);const metadata=response.json();
    assert.equal(metadata.issuer,app.conf.issuer);assert.equal(metadata.authorization_endpoint,app.conf.issuer+'/auth');
    assert.equal(metadata.authorization_response_iss_parameter_supported,true);assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
    assert.ok(metadata.scopes_supported.includes('offline_access'));assert.equal(metadata.registration_endpoint,undefined);
    assert.equal(response.headers['cache-control'],'no-store');
  }
  for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])assert.deepEqual((await app.call(path)).json().scopes_supported,['mcp:events','mcp:read']);
  const challenge=await mcpRequest(app,'events/list');assert.equal(challenge.status,401);assert.equal(challenge.headers['www-authenticate'].includes('offline_access'),false);
});

test('API-only client using the plain discovered endpoint completes explicit server duration consent',async t=>{
  const time=Date.now();t.mock.timers.enable({apis:['Date'],now:time});const app=await application();t.after(()=>app.close());
  const metadata=(await app.call('/oauth/.well-known/oauth-authorization-server')).json();
  const grant=await authorize(app,{scope:'openid mcp:events mcp:read'},metadata.authorization_endpoint,'allow');
  const response=await tokenExchange(app,grant.code,grant.verifier);assert.equal(response.status,200);
  assert.ok(response.json().id_token);const [token]=await payloads(app,'RefreshToken');
  assert.equal(token.scope.split(' ').includes('offline_access'),false);assert.equal(!!token.expiresWithSession,false);
  assert.equal(token.exp-token.iiat,OFFLINE_AUTHORIZATION_SECONDS);
  t.mock.timers.setTime(time+DAY+1000);assert.equal((await refresh(app,response.json().refresh_token)).status,200);
});

test('repeated or conflicting prompt/scope parameters fail without granting offline access; replacing consent never elevates access',async t=>{
  const app=await application();t.after(()=>app.close());
  const endpoint=(await app.call('/oauth/.well-known/openid-configuration')).json().authorization_endpoint;
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'offline_access mcp:events mcp:read',resource:app.conf.resource,state:'synthetic',code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  for(const extra of [['prompt','consent'],['prompt','none'],['prompt','login'],['scope','mcp:read']]) {
    const target=new URL(endpoint);target.searchParams.set('prompt','consent');for(const [key,value] of params)target.searchParams.append(key,value);target.searchParams.append(...extra);
    const response=await app.call(target.pathname+target.search);
    const error=response.headers.location?new URL(response.headers.location).searchParams.get('error'):undefined;
    assert.ok(response.status===400 || error==='invalid_request');
    assert.equal((await payloads(app,'Grant')).length,0);assert.equal((await payloads(app,'RefreshToken')).length,0);
  }
  // Explicit session-only consent stays session-bound even with an offline scope request.
  const overwritten=new URL(endpoint);overwritten.searchParams.set('prompt','login');
  const onlineGrant=await authorize(app,{scope:'offline_access mcp:events mcp:read'},overwritten);
  const online=await tokenExchange(app,onlineGrant.code,onlineGrant.verifier);assert.equal(online.status,200);
  const [token]=await payloads(app,'RefreshToken');assert.equal(token.scope.split(' ').includes('offline_access'),false);assert.equal(!!token.expiresWithSession,true);
});

test('API-only requests without prompt require explicit duration consent; choices do not broaden API scopes',async t=>{
  for(const decision of ['allow','session','deny']) {
    const app=await application();
    try {
      const page=await consentPage(app,{scope:'mcp:events mcp:read'});
      assert.match(page.res.body,/Continue session-only/);assert.match(page.res.body,/Cancel/);
      assert.equal((await payloads(app,'Grant')).length,0);
      const response=await submit(app,page,decision);assert.equal(response.status,303);
      const finish=await app.follow(response.headers.location);
      if(decision==='deny') {
        assert.equal(new URL(finish.headers.location).searchParams.get('error'),'access_denied');
        assert.equal((await payloads(app,'Grant')).length,0);assert.equal((await payloads(app,'OwnerConsent')).length,0);
      } else {
        const code=new URL(finish.headers.location).searchParams.get('code');
        const issued=await tokenExchange(app,code,'synthetic-pkce-verifier-012345678901234567890123456789');assert.equal(issued.status,200);
        const [rt]=await payloads(app,'RefreshToken');assert.equal(!!rt.expiresWithSession,decision==='session');
        assert.equal(rt.scope.split(' ').includes('offline_access'),false);assert.equal(rt.exp-rt.iiat,decision==='allow'?OFFLINE_AUTHORIZATION_SECONDS:30*86400);
        assert.deepEqual(issued.json().scope.split(' ').sort(),['mcp:events','mcp:read']);
        assert.equal((await payloads(app,'OwnerConsent')).length,decision==='allow'?1:0);
      }
    } finally {await app.close();}
  }
});

test('duration consent is single-use under concurrent POST, expired nonce and request binding mismatch fail',async t=>{
  const app=await application();t.after(()=>app.close());const page=await consentPage(app,{scope:'mcp:read'});
  const pair=await Promise.all([submit(app,page),submit(app,page)]);
  assert.equal(pair.filter(r=>r.status===303).length,1);assert.equal(pair.filter(r=>r.status===403).length,1);
  assert.equal((await payloads(app,'Grant')).length,1);assert.equal((await payloads(app,'OwnerConsent')).length,1);
  assert.notEqual((await submit(app,page)).status,303);
  for(const mutation of ['bindingHash','expiresAt']) {
    const other=await application();
    try {
      const p=await consentPage(other,{scope:'mcp:read'}),uid=p.action.split('/').at(-2);
      const {hash}=await import('../dist/security.js');const path='googleStates/'+hash('offline-consent:'+uid);
      await other.store.atomic(async tx=>{const row=await tx.get(path);tx.set(path,{...row,[mutation]:mutation==='bindingHash'?'incorrect':Date.now()-1});});
      assert.equal((await submit(other,p)).status,403);assert.equal((await payloads(other,'Grant')).length,0);
    } finally {await other.close();}
  }
});

test('prompt none fails rather than reuse either ordinary or two-year browser authorization silently',async t=>{
  for(const decision of ['session','allow']) {
    const app=await application();
    try {
      await authorize(app,{scope:'mcp:events mcp:read'},undefined,decision);
      const count=(await payloads(app,'Grant')).length;
      const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',scope:'mcp:read',resource:app.conf.resource,prompt:'none',code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
      const res=await app.call('/oauth/auth?'+params);assert.equal(res.status,303);assert.equal(new URL(res.headers.location).searchParams.get('error'),'consent_required');
      assert.equal((await payloads(app,'Grant')).length,count);
    } finally {await app.close();}
  }
});

test('explicit new two-year API-only grant never upgrades an existing session-only grant',async t=>{
  const now=Date.now();t.mock.timers.enable({apis:['Date'],now});const app=await application();t.after(()=>app.close());
  const ordinary=await authorize(app),issued=(await tokenExchange(app,ordinary.code,ordinary.verifier)).json();
  const [old]=await payloads(app,'RefreshToken'),[oldGrant]=await payloads(app,'Grant');
  const fresh=await authorize(app,{scope:'mcp:events mcp:read'},undefined,'allow');assert.equal((await tokenExchange(app,fresh.code,fresh.verifier)).status,200);
  assert.deepEqual((await payloads(app,'Grant')).find(g=>g.jti===old.grantId),oldGrant);
  assert.equal((await payloads(app,'RefreshToken')).find(r=>r.jti===old.jti).expiresWithSession,true);
  assert.notEqual((await payloads(app,'OwnerConsent'))[0].grantId,old.grantId);
  t.mock.timers.setTime(now+DAY+1000);assert.equal((await refresh(app,issued.refresh_token)).status,400);
});

test('API-only two-year consent survives restart/session expiry; rotation and subscription renewal retain original deadline',async t=>{
  const now=Date.now();t.mock.timers.enable({apis:['Date'],now});let app=await application();let latest=app;t.after(()=>latest.close());
  const auth=await authorize(app,{scope:'mcp:events mcp:read'},undefined,'allow');let token=(await tokenExchange(app,auth.code,auth.verifier)).json();
  const [rt]=await payloads(app,'RefreshToken'),[consent]=await payloads(app,'OwnerConsent');const store=app.store,conf=app.conf;
  assert.equal(consent.expiresAt,rt.exp);assert.equal(consent.expiresAt-consent.approvedAt,OFFLINE_AUTHORIZATION_SECONDS);
  const args=subscription();const first=(await mcpRequest(app,'events/subscribe',args,token.access_token)).json().result;
  await app.close();app=await application({store,config:conf});latest=app;
  for(const offset of [DAY+1000,90*DAY,OFFLINE_AUTHORIZATION_SECONDS*1000-1000]) {
    t.mock.timers.setTime(now+offset);const res=await refresh(app,token.refresh_token);assert.equal(res.status,200);token=res.json();
    const renewed=(await mcpRequest(app,'events/subscribe',args,token.access_token)).json().result;assert.equal(renewed.id,first.id);
    assert.ok(Date.parse(renewed.refreshBefore)<=consent.expiresAt*1000);
    assert.ok((await payloads(app,'RefreshToken')).every(r=>r.exp<=rt.exp));
  }
  t.mock.timers.setTime(consent.expiresAt*1000+1000);assert.equal((await refresh(app,token.refresh_token)).status,400);
  assert.equal((await mcpRequest(app,'tools/list',{},token.access_token)).status,401);
});

test('missing, corrupt, expired or differently bound durable consent denies API-only code and refresh authority',async t=>{
  const {hash}=await import('../dist/security.js'),{seal}=await import('../dist/events.js');
  for(const mutation of ['missing','accountId','clientId','resource','grantId','expiresAt','approvedAt','version','decision','corrupt']) {
    const app=await application();
    try {
      const auth=await authorize(app,{scope:'mcp:events mcp:read'},undefined,'allow'),token=(await tokenExchange(app,auth.code,auth.verifier)).json();
      const [consent]=await payloads(app,'OwnerConsent'),path='oauth/'+hash(app.conf.issuer+':OwnerConsent:'+consent.grantId);
      await app.store.atomic(async tx=>{
        const row=await tx.get(path);
        if(mutation==='missing')tx.delete(path);
        else tx.set(path,{...row,encrypted:mutation==='corrupt'?'invalid':seal(JSON.stringify({...consent,[mutation]:['expiresAt','approvedAt','version'].includes(mutation)?0:'different'}),app.conf.stateKey)});
      });
      const refreshRes=await refresh(app,token.refresh_token);assert.ok([400,500].includes(refreshRes.status));
      assert.notEqual((await mcpRequest(app,'tools/list',{},token.access_token)).status,200);
    } finally {await app.close();}
  }
});

test('API-only two-year rotation concurrency/replay, owner disable, foreign targets and revocation deny descendants',async t=>{
  const app=await application();t.after(()=>app.close());const auth=await authorize(app,{scope:'mcp:events mcp:read'},undefined,'allow');
  const token=(await tokenExchange(app,auth.code,auth.verifier)).json();
  for(const extra of [{client_id:'foreign'},{resource:'https://foreign.example/mcp'},{scope:'mcp:write'}]) {
    const fresh=await authorize(app,{scope:'mcp:events mcp:read'},undefined,'allow'),probe=(await tokenExchange(app,fresh.code,fresh.verifier)).json();
    assert.ok([400,401].includes((await refresh(app,probe.refresh_token,extra)).status));
  }
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:false}));assert.equal((await refresh(app,token.refresh_token)).status,403);
  await app.store.atomic(async tx=>tx.set('control/owner',{enabled:true}));
  const pair=await Promise.all([refresh(app,token.refresh_token),refresh(app,token.refresh_token)]);const winner=pair.find(r=>r.status===200);
  assert.equal(pair.filter(r=>r.status===200).length,1);assert.ok(winner);
  assert.equal((await refresh(app,winner.json().refresh_token)).status,400);
  assert.equal((await mcpRequest(app,'tools/list',{},winner.json().access_token)).status,401);
  const other=await application();t.after(()=>other.close());const next=await authorize(other,{scope:'mcp:events mcp:read'},undefined,'allow');
  const active=(await tokenExchange(other,next.code,next.verifier)).json();
  const revoke=await other.call('/oauth/token/revocation',{method:'POST',cookies:false,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:other.conf.clientId,token:active.refresh_token,token_type_hint:'refresh_token'}).toString()});
  assert.equal(revoke.status,200);assert.equal((await refresh(other,active.refresh_token)).status,400);assert.equal((await mcpRequest(other,'tools/list',{},active.access_token)).status,401);
});

test('two-year authorization code cannot be exchanged if durable consent disappears before issuance',async t=>{
  const app=await application();t.after(()=>app.close());const auth=await authorize(app,{scope:'mcp:read'},undefined,'allow');
  const [consent]=await payloads(app,'OwnerConsent'),{hash}=await import('../dist/security.js');
  await app.store.atomic(async tx=>tx.delete('oauth/'+hash(app.conf.issuer+':OwnerConsent:'+consent.grantId)));
  assert.equal((await tokenExchange(app,auth.code,auth.verifier)).status,400);
  assert.equal((await payloads(app,'RefreshToken')).length,0);assert.equal((await payloads(app,'AccessToken')).length,0);
});


test('consent form preserves a canonical browser Origin without accepting null or exposing interaction referrers',async t=>{
  const app=await application();t.after(()=>app.close());const page=await consentPage(app,{scope:'mcp:events mcp:read'});
  assert.equal(page.res.headers['referrer-policy'],'strict-origin');
  assert.equal((await app.call('/health')).headers['referrer-policy'],'no-referrer');
  assert.equal((await submit(app,page,'allow',{headers:{Origin:'null'}})).status,403);
  assert.equal((await payloads(app,'Grant')).length,0);assert.equal((await payloads(app,'OwnerConsent')).length,0);
  assert.equal((await submit(app,page)).status,303);
  assert.equal((await payloads(app,'Grant')).length,1);assert.equal((await payloads(app,'OwnerConsent')).length,1);
});
