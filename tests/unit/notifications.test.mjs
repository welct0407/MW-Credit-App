import {createECDH} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {validateSubscription} from '../../services/notifications/web-push.mjs';
import {createNotificationDispatcher} from '../../services/notifications/dispatcher.mjs';
const curve=createECDH('prime256v1');curve.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',expirationTime:null,keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
test('push enrollment accepts supported HTTPS providers and rejects SSRF, credentials and malformed keys',()=>{
 assert.match(validateSubscription(subscription).endpointHash,/^[a-f0-9]{64}$/);
 for(const endpoint of ['http://fcm.googleapis.com/path','https://127.0.0.1/path','https://fcm.googleapis.com.attacker.invalid/path','https://private.invalid/path','https://user@fcm.googleapis.com/path','https://fcm.googleapis.com:444/path'])assert.throws(()=>validateSubscription({...subscription,endpoint}));
 assert.throws(()=>validateSubscription({...subscription,keys:{...subscription.keys,auth:'bad'}}));
});
test('disabled dispatcher has zero pool and transport effects',async()=>{
 const dispatch=createNotificationDispatcher({pool:{connect(){throw Error('pool touched')}},transport(){throw Error('transport touched')}});
 assert.deepEqual(await dispatch(),{enabled:false,claimed:0});
});
// R080: the dispatcher asks V99 for the event facts between prepare and the send fence; any failure sends generic text.
function scriptedPool(content){
 const calls=[];let claimed=false;
 const answer=sql=>{
  if(sql.includes('pwa_claim_notifications_v1')){if(claimed)return[];claimed=true;return[{delivery_id:'d1',lease_generation:4,event_id:'12345678-1234-4234-8234-123456789abc'}];}
  if(sql.includes('pwa_notify_prepare_send_v1'))return[{version:2,endpoint:subscription.endpoint,p256dh:subscription.keys.p256dh,auth:subscription.keys.auth,expires_at:null}];
  if(sql.includes('pwa_notify_content_v1')){if(content instanceof Error)throw content;return content;}
  if(sql.includes('pwa_notify_start_send_v1'))return[{started:true}];
  if(sql.includes('pwa_notify_complete_v1'))return[{state:'sent'}];
  throw Error('unexpected '+sql);
 };
 return{calls,pool:{async connect(){return{query:async(sql,args)=>{calls.push({sql,args,released:false});return{rows:answer(sql)};},release(destroy){calls.at(-1).released=destroy?'destroyed':'kept';}};}}};
}
test('dispatcher passes rendered content to the transport and keeps the lease, fence and result order',async()=>{
 const {calls,pool}=scriptedPool([{found:true,event_type:'payment.posted',language:'th',borrower_name:'สมชาย ใจดี',amount:'5000'}]);const sent=[];
 const dispatch=createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}});
 assert.deepEqual(await dispatch(),{enabled:true,claimed:1,results:[{state:'sent'}]});
 assert.deepEqual(sent,[{title:'รับชำระแล้ว ฿5,000',body:'สมชาย ใจดี'}]);
 assert.deepEqual(calls.map(c=>c.sql.match(/pwa_\w+_v1/)[0]),['pwa_claim_notifications_v1','pwa_notify_prepare_send_v1','pwa_notify_content_v1','pwa_notify_start_send_v1','pwa_notify_complete_v1','pwa_claim_notifications_v1']);
 assert.deepEqual(calls[2].args,['d1',4]);
});
test('content RPC failure or no row still sends once with generic text and never defers',async()=>{
 for(const content of [Error('function public.pwa_notify_content_v1(uuid, bigint) does not exist'),[],[{found:true,event_type:'loan.unknown',language:'en'}]]){
  const {calls,pool}=scriptedPool(content);const sent=[];
  const dispatch=createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}});
  assert.deepEqual((await dispatch()).results,[{state:'sent'}]);assert.deepEqual(sent,[{title:'MW Credit',body:'New activity'}]);
  assert.equal(calls.find(c=>c.sql.includes('pwa_notify_complete_v1')).args[2],'accepted');
  if(content instanceof Error)assert.equal(calls.find(c=>c.sql.includes('pwa_notify_content_v1')).released,'destroyed');
 }
});
test('ineligible delivery reads no content',async()=>{
 const {calls,pool}=scriptedPool([]);
 const dispatch=createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>false,transport:async()=>{throw Error('transport touched');}});
 assert.equal((await dispatch()).claimed,1);assert.equal(calls.some(c=>c.sql.includes('pwa_notify_content_v1')),false);
 assert.equal(calls.find(c=>c.sql.includes('pwa_notify_complete_v1')).args[2],'ineligible');
});
