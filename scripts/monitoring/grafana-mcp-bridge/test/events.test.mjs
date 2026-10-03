import test from 'node:test';
import assert from 'node:assert/strict';
import {Webhook} from 'standardwebhooks';
import {Bridge,normalizeGrafana} from '../dist/events.js';
import {MemoryStore} from '../dist/store.js';
import {adapterFactory} from '../dist/oauth.js';
import {config,echo,fixture,subscription,signingSecret} from './helpers.mjs';

function setup(send=echo){let time=Date.parse('2026-10-02T12:10:00Z');const store=new MemoryStore(),conf=config(),bridge=new Bridge(store,conf,send,()=>time,()=>0.5);return{store,conf,bridge,advance:n=>time+=n};}
test('subscription verification is signed, canonical, cached, encrypted, refreshed, rotated and idempotently removed',async()=>{
  const secret=signingSecret(),calls=[],s=setup(async(url,body,headers)=>{new Webhook(secret).verify(body,headers);calls.push(headers);return echo(url,body);});
  // Signature verifier uses its own real clock; align the fake bridge clock here.
  s.bridge.now=()=>Date.now();
  const first=await s.bridge.subscribe(subscription(secret,{components:['b','a','a']}));
  const second=await s.bridge.subscribe(subscription(secret,{components:['a','b']}));
  assert.equal(first.id,second.id);assert.equal(calls.length,1);
  const stored=await s.store.get('subscriptions/'+first.id);assert.equal(stored.secret.includes(secret),false);
  const params=subscription(secret,{components:['b','a']});delete params.delivery.secret;
  await s.bridge.unsubscribe(params);await s.bridge.unsubscribe(params);assert.equal((await s.store.get('subscriptions/'+first.id)).active,false);
  const rotation=setup();rotation.bridge.now=()=>Date.now();const initial=await rotation.bridge.subscribe(subscription(secret));const next=signingSecret();await rotation.bridge.subscribe(subscription(next));
  const row=await rotation.store.get('subscriptions/'+initial.id),body='{}',headers=rotation.bridge.headers('evt_test',row,body,Date.now());
  assert.equal(headers['webhook-signature'].split(' ').length,2);new Webhook(next).verify(body,headers);new Webhook(secret).verify(body,headers);
});
test('failed callback challenge creates no active subscription and invalid parameters are denied',async()=>{
  const s=setup(async()=>({status:200,body:'{"challenge":"wrong"}'}));await assert.rejects(()=>s.bridge.subscribe(subscription()),/challenge_failed/);assert.equal((await s.store.query('subscriptions',[],10)).length,0);
  const valid=setup();for(const secret of ['api-key','whsec_'+Buffer.alloc(16).toString('base64'),'whsec_'+Buffer.alloc(65).toString('base64')])await assert.rejects(()=>valid.bridge.subscribe(subscription(secret)));
  await assert.rejects(()=>valid.bridge.subscribe({...subscription(),cursor:'unsupported'}));
  await assert.rejects(()=>valid.bridge.subscribe({...subscription(),arguments:{unrecognized:true}}));
});
test('duplicate ingress is atomic across workers; reminders suppress, firing/resolved/recurrence remain distinct',async()=>{
  let deliveries=0;const s=setup(async(url,body)=>JSON.parse(body).type==='verification'?echo(url,body):(deliveries++,{status:200,body:''}));
  await s.bridge.subscribe(subscription());const results=await Promise.all([s.bridge.ingest(fixture()),s.bridge.ingest(fixture())]);assert.equal(results.reduce((n,r)=>n+r.created,0),1);
  await s.bridge.ingest(fixture('firing',{endsAt:'2026-10-02T12:15:00Z'}));await s.bridge.ingest(fixture('resolved'));await s.bridge.ingest(fixture('firing',{startsAt:'2026-10-02T12:09:00Z'}));
  assert.equal((await s.store.query('events',[],20)).length,3);await Promise.all([s.bridge.dispatch(),s.bridge.dispatch()]);assert.equal(deliveries,3);
});
test('filters exclude mismatches before outbox insertion; malformed/truncated groups fail atomically',async()=>{
  const s=setup();await s.bridge.subscribe(subscription(undefined,{components:['database'],statuses:['resolved']}));await s.bridge.ingest(fixture());assert.equal((await s.store.query('deliveries',[],20)).length,0);
  await s.bridge.ingest(fixture('resolved'));assert.equal((await s.store.query('deliveries',[],20)).length,1);
  await assert.rejects(()=>s.bridge.ingest({...fixture(),truncatedAlerts:1}));await assert.rejects(()=>s.bridge.ingest(fixture('resolved',{endsAt:'2026-10-01T00:00:00Z'})));
  assert.equal((await s.store.query('events',[],20)).length,2);
});
test('transient retries keep bytes/ID, refresh signatures, honor backoff and recover expired worker lease',async()=>{
  const calls=[];const s=setup(async(url,body,headers)=>{if(JSON.parse(body).type==='verification')return echo(url,body);calls.push({body,headers});return {status:calls.length===1?503:200,body:''};});
  await s.bridge.subscribe(subscription());await s.bridge.ingest(fixture());await s.bridge.dispatch();assert.equal((await s.bridge.dispatch()).attempted,0);s.advance(60000);
  const row=(await s.store.query('deliveries',[],10))[0];await s.store.atomic(async tx=>tx.set('deliveries/'+row.id,{...row,leaseUntil:s.bridge.now()+30000,leaseToken:'crashed'}));
  assert.equal((await s.bridge.dispatch()).attempted,0);s.advance(30001);await s.bridge.dispatch();assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.equal(calls[0].headers['webhook-id'],calls[1].headers['webhook-id']);assert.notEqual(calls[0].headers['webhook-timestamp'],calls[1].headers['webhook-timestamp']);
});
test('410/413 and exhausted retry budgets stop; expiry, unsubscribe, owner/grant revocation cancel queued sends',async()=>{
  for(const status of [410,413]){const s=setup(async(url,body)=>JSON.parse(body).type==='verification'?echo(url,body):({status,body:''}));await s.bridge.subscribe(subscription());await s.bridge.ingest(fixture());await s.bridge.dispatch();s.advance(3600000);assert.equal((await s.bridge.dispatch()).attempted,0);assert.equal((await s.store.query('deliveries',[],10))[0].state,'failed');}
  for(const condition of ['expiry','unsubscribe','owner','grant']){let sends=0;const s=setup(async(url,body)=>JSON.parse(body).type==='verification'?echo(url,body):(sends++,{status:200,body:''}));const params=subscription();await s.bridge.subscribe({...params,ttlMs:1000},'grant-test');await s.bridge.ingest(fixture());
    if(condition==='expiry')s.advance(1001);if(condition==='unsubscribe'){delete params.delivery.secret;await s.bridge.unsubscribe(params);}if(condition==='owner')await s.store.atomic(async tx=>tx.set('control/owner',{enabled:false}));if(condition==='grant'){const Adapter=adapterFactory(s.store,s.conf.stateKey,s.conf.issuer);await new Adapter('AccessToken').revokeByGrantId('grant-test');}
    await s.bridge.dispatch();assert.equal(sends,0,condition);assert.equal((await s.store.query('deliveries',[],10))[0].state,'cancelled');
  }
  const s=setup();await s.bridge.subscribe(subscription());await s.bridge.ingest(fixture());const row=(await s.store.query('deliveries',[],10))[0];await s.store.atomic(async tx=>tx.set('deliveries/'+row.id,{...row,attempt:12}));assert.equal((await s.bridge.dispatch()).attempted,0);assert.equal((await s.store.query('deliveries',[],10))[0].reason,'retry_exhausted');
});
test('finite TTL grants respect requested lifetime and null requests receive default expiry; subscription cap is concurrent-safe',async()=>{
  const s=setup();const a=await s.bridge.subscribe({...subscription(),ttlMs:1000});assert.equal(Date.parse(a.refreshBefore)-s.bridge.now(),1000);
  const b=await s.bridge.subscribe({...subscription(),ttlMs:null});assert.equal(Date.parse(b.refreshBefore)-s.bridge.now(),86400000);
  const results=await Promise.allSettled(Array.from({length:9},(_,i)=>s.bridge.subscribe({...subscription(),delivery:{...subscription().delivery,url:'https://callbacks.example/'+i}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,7); // refresh kept one identity + seven = eight.
});
test('a stale worker cannot overwrite a later worker delivery result',async()=>{
  let releaseFirst,started,sends=0;
  const firstStarted=new Promise(resolve=>started=resolve);
  const s=setup(async(url,body)=>{
    if(JSON.parse(body).type==='verification')return echo(url,body);
    if(++sends===1){started();return new Promise(resolve=>releaseFirst=()=>resolve({status:503,body:''}));}
    return {status:200,body:''};
  });
  await s.bridge.subscribe(subscription());await s.bridge.ingest(fixture());
  const stale=s.bridge.dispatch();await firstStarted;s.advance(30001);await s.bridge.dispatch();releaseFirst();await stale;
  const row=(await s.store.query('deliveries',[],10))[0];assert.equal(row.state,'delivered');assert.equal(row.attempt,2);assert.equal(row.reason,'http_200');
});
test('unsubscribe wins against a pending refresh challenge and expired challenges cannot grant a subscription',async()=>{
  let release,started,block=false;
  const began=new Promise(resolve=>started=resolve);
  const s=setup(async(url,body)=>{if(block){started();await new Promise(resolve=>release=resolve);}return echo(url,body);});
  const params=subscription();const initial=await s.bridge.subscribe(params);block=true;
  const pending=s.bridge.subscribe(subscription(signingSecret()));await began;
  const stop={...params,delivery:{mode:'webhook',url:params.delivery.url}};await s.bridge.unsubscribe(stop);release();
  await assert.rejects(()=>pending,/subscription_changed_retry/);assert.equal((await s.store.get('subscriptions/'+initial.id)).active,false);
  const expired=setup(async(url,body)=>{expired.advance(1001);return echo(url,body);});
  await assert.rejects(()=>expired.bridge.subscribe({...subscription(),ttlMs:1000}),/subscription_ttl_elapsed/);
  assert.equal((await expired.store.query('subscriptions',[],10)).length,0);
});
test('unsubscribe fences a delayed first challenge even without a row; later intentional subscribe succeeds without replay',async()=>{
  let release,started,block=true,sends=0;
  const began=new Promise(resolve=>started=resolve);
  const s=setup(async(url,body)=>{
    if(JSON.parse(body).type!=='verification'){sends++;return {status:200,body:''};}
    if(block){started();await new Promise(resolve=>release=resolve);}return echo(url,body);
  });
  const params=subscription(),pending=s.bridge.subscribe(params);
  await began;await s.bridge.unsubscribe({name:params.name,arguments:params.arguments,delivery:{mode:'webhook',url:params.delivery.url}});
  release();await assert.rejects(()=>pending,/subscription_changed_retry/);
  assert.equal((await s.store.query('subscriptions',[],10)).length,0);
  await s.bridge.ingest(fixture());await s.bridge.dispatch();assert.equal(sends,0);
  block=false;await s.bridge.subscribe(params);await s.bridge.dispatch();assert.equal(sends,0);
  await s.bridge.ingest(fixture('resolved'));await s.bridge.dispatch();assert.equal(sends,1);
});
test('empty allowlist rejects subscription before reading signing secret or persisting state',async()=>{
  let sends=0,secretReads=0;const conf=config();conf.callbackHosts=[];
  const store=new MemoryStore(),bridge=new Bridge(store,conf,async()=>{sends++;throw Error('must not send');});
  const params=subscription();Object.defineProperty(params.delivery,'secret',{get(){secretReads++;throw Error('must not read');}});
  await assert.rejects(()=>bridge.subscribe(params),/callback_not_allowed/);
  assert.equal(sends,0);assert.equal(secretReads,0);assert.equal((await store.query('subscriptions',[],10)).length,0);
});
