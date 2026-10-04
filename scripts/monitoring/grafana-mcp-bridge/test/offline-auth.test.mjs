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
async function consentPage(app) {
  const verifier='synthetic-pkce-verifier-012345678901234567890123456789';
  const params=new URLSearchParams({client_id:app.conf.clientId,redirect_uri:app.conf.redirectUri,response_type:'code',resource:app.conf.resource,state:'synthetic',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',...offline});
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
  assert.match(page.res.body,/two years \(730 days\)/);assert.match(page.res.body,/sign out/);
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
