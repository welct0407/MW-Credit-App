import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createECDH,randomBytes,createPublicKey,verify} from 'node:crypto';
import webpush from 'web-push';
import ece from 'http_ece';
import {createWebPushTransport,validateSubscription} from '../../services/notifications/web-push.mjs';
import {createNotificationWorker} from '../../services/notifications/worker.mjs';
import {createCanonicalJobRunner} from '../../services/jobs/runner.mjs';

test('maintained web-push actually encrypts generic payload and binds VAPID; provider outcomes never leak bodies',async()=>{
 const receiver=createECDH('prime256v1');receiver.generateKeys();const auth=randomBytes(16).toString('base64url');
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/independent-synthetic',expirationTime:null,keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth}};
 const vapid=webpush.generateVAPIDKeys(),requests=[];let status=201;
 const request=(url,options,callback)=>{
  const req=new EventEmitter(),chunks=[];req.write=b=>chunks.push(Buffer.from(b));req.destroy=e=>req.emit('error',e);
  req.end=body=>{if(body)chunks.push(Buffer.from(body));requests.push({url,options,body:Buffer.concat(chunks)});queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=status;res.headers={};res.destroy=()=>{res.closed=true;};callback(res);assert.equal(res.closed,true,'provider response closed before acknowledgement');});};return req;
 };
 const transport=await createWebPushTransport({subject:'mailto:synthetic@example.invalid',...vapid},{request});
  const event='aaaabbbb-cccc-4ddd-8eee-ffffffffffff';assert.deepEqual(await transport(subscription,event),{kind:'accepted'});
  const first=requests[0];assert.equal(new URL(first.url).hostname,'fcm.googleapis.com');assert.equal(first.options.method,'POST');assert.equal(first.options.headers['Content-Encoding'],'aes128gcm');assert.equal(first.options.headers.TTL,3600);assert.match(first.options.headers.Authorization,/^vapid t=/);
  const jwt=first.options.headers.Authorization.match(/^vapid t=([^,]+), k=/)[1].split('.'),publicBytes=Buffer.from(vapid.publicKey,'base64url');
  const publicKey=createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',x:publicBytes.subarray(1,33).toString('base64url'),y:publicBytes.subarray(33).toString('base64url')}});
  assert.equal(verify('sha256',Buffer.from(jwt.slice(0,2).join('.')),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(jwt[2],'base64url')),true);
  const assertion=JSON.parse(Buffer.from(jwt[1],'base64url'));assert.equal(assertion.aud,'https://fcm.googleapis.com');assert.equal(assertion.sub,'mailto:synthetic@example.invalid');assert.ok(assertion.exp>Math.floor(Date.now()/1000));
  assert.doesNotMatch(first.body.toString(),/An update|MW Credit|aaaabbbb/);
  const payload=JSON.parse(ece.decrypt(first.body,{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString());
  // R079: v2 payload; without rendered content the generic text, never the old "update" wording.
  assert.deepEqual(payload,{v:2,eventId:event,title:'MW Credit',body:'New activity',url:'/?notification='+event,tag:'mw-credit-'+event});
  const rendered={title:'รับชำระแล้ว ฿5,000',body:'สมชาย ใจดี'};assert.deepEqual(await transport(subscription,event,{content:rendered}),{kind:'accepted'});
  const second=requests.pop();assert.doesNotMatch(second.body.toString(),/สมชาย|5,000/);assert.equal(second.options.headers.TTL,3600);assert.match(first.options.headers.Topic,/^[a-f0-9]{32}$/);assert.equal(second.options.headers.Topic,first.options.headers.Topic);
  assert.deepEqual(JSON.parse(ece.decrypt(second.body,{version:'aes128gcm',privateKey:receiver,authSecret:auth}).toString()),{v:2,eventId:event,...rendered,url:'/?notification='+event,tag:'mw-credit-'+event});
  for(const [code,kind] of [[404,'expired'],[410,'expired'],[429,'throttled'],[503,'unavailable'],[400,'rejected'],[302,'network']]){status=code;assert.deepEqual(await transport(subscription,event),{kind});}
  assert.equal(requests.length,7); // A redirect was not followed.
  await assert.rejects(transport({...subscription,endpoint:'https://127.0.0.1/private'},event));assert.equal(requests.length,7);
  assert.doesNotMatch(JSON.stringify(requests.map(r=>({status:r.status}))),/PRIVATE_PROVIDER_BODY/);
});

test('malformed elliptic-curve enrollment rejects before a provider request',()=>{
 const value={endpoint:'https://fcm.googleapis.com/fcm/send/invalid-point',expirationTime:null,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
 assert.throws(()=>validateSubscription(value),/invalid_subscription/);
});

test('inactive notification worker and canonical jobs touch no pool, provider or credential',async()=>{
 const forbidden=new Proxy({},{get(){throw Error('Inactive dependency touched');}});
 const worker=await createNotificationWorker({pool:forbidden,getUser:()=>{throw Error('user touched');}});assert.deepEqual(await worker(),{enabled:false});
 const jobs=createCanonicalJobRunner({pool:forbidden});assert.deepEqual(await jobs({job:'daily-charges',businessDate:'2026-10-11',scope:'daily'}),{enabled:false});
});
