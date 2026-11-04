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
  // R111: v2 first; a database before V122 (an error) falls back to v1, which answers the same scripted content.
  // R118: v3 first (V132), then v2, then v1. R119: v4 first (V134), then v3.
  if(sql.includes('pwa_notify_content_v4')||sql.includes('pwa_notify_content_v3')||sql.includes('pwa_notify_content_v2')||sql.includes('pwa_notify_content_v1')){if(content instanceof Error)throw content;return content;}
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
 assert.deepEqual(calls.map(c=>c.sql.match(/pwa_\w+_v\d/)[0]),['pwa_claim_notifications_v1','pwa_notify_prepare_send_v1','pwa_notify_content_v4','pwa_notify_start_send_v1','pwa_notify_complete_v1','pwa_claim_notifications_v1']);
 assert.deepEqual(calls[2].args,['d1',4]);
});
test('R118: v3 late-charge facts reach the push; a missing v4 and v3 fall back to v2 (no late part)',async()=>{
 const {pool}=scriptedPool([{found:true,event_type:'payment.posted',language:'en',borrower_name:'Somchai Jaidee',amount:'150',late_charge_amount:'50'}]);const sent=[];
 await createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}})();
 assert.deepEqual(sent,[{title:'Payment received ฿150',body:'Late charge ฿50 · Somchai Jaidee'}]);
 const old=scriptedPool([{found:true,event_type:'payment.posted',language:'en',borrower_name:'Somchai Jaidee',amount:'150'}]);const answer=old.pool.connect;
 old.pool.connect=async()=>{const c=await answer();const query=c.query;c.query=async(sql,args)=>{if(/pwa_notify_content_v[34]/.test(sql))throw Object.assign(Error('function public.pwa_notify_content_v3(uuid, bigint) does not exist'),{code:'42883'});return query(sql,args);};return c;};
 const fallback=[];await createNotificationDispatcher({pool:old.pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{fallback.push(options.content);return{kind:'accepted'};}})();
 assert.deepEqual(fallback,[{title:'Payment received ฿150',body:'Somchai Jaidee'}]);assert.ok(old.calls.some(c=>c.sql.includes('pwa_notify_content_v2')));
});
test('R111: v2 rebate facts reach the push; a missing v4, v3 and v2 fall back to v1',async()=>{
 const {calls,pool}=scriptedPool([{found:true,event_type:'loan.closed',language:'en',borrower_name:'Somchai Jaidee',amount:'10000',rebate_amount:'300',rebate_payee:'Malee Srisuk',rebate_payable:'300'}]);const sent=[];
 const dispatch=createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}});
 await dispatch();assert.deepEqual(sent,[{title:'Loan closed ฿10,000',body:'Rebate ฿300 to Malee Srisuk, transfer from Lisa · Somchai Jaidee'}]);
 assert.equal(calls.some(c=>c.sql.includes('pwa_notify_content_v1')),false);
 const old=scriptedPool([{found:true,event_type:'payment.posted',language:'en',borrower_name:'Somchai Jaidee',amount:'5000'}]);const answer=old.pool.connect;
 old.pool.connect=async()=>{const c=await answer();const query=c.query;c.query=async(sql,args)=>{if(/pwa_notify_content_v[234]/.test(sql))throw Object.assign(Error('function public.pwa_notify_content_v2(uuid, bigint) does not exist'),{code:'42883'});return query(sql,args);};return c;};
 const fallback=[];await createNotificationDispatcher({pool:old.pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{fallback.push(options.content);return{kind:'accepted'};}})();
 assert.deepEqual(fallback,[{title:'Payment received ฿5,000',body:'Somchai Jaidee'}]);assert.ok(old.calls.some(c=>c.sql.includes('pwa_notify_content_v1')));
});
test('R111: an offset payment push carries the method and closed loan from v2',async()=>{
 const {pool}=scriptedPool([{found:true,event_type:'payment.posted',language:'en',borrower_name:'Malee Srisuk',amount:'300',payment_method:'Referral Rebate Offset',rebate_loan:'L-0412'}]);const sent=[];
 await createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}})();
 assert.deepEqual(sent,[{title:'Rebate offset',body:'Rebate offset ฿300 · Malee Srisuk · from loan L-0412'}]);
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
 assert.equal((await dispatch()).claimed,1);assert.equal(calls.some(c=>c.sql.includes('pwa_notify_content_v')),false);
 assert.equal(calls.find(c=>c.sql.includes('pwa_notify_complete_v1')).args[2],'ineligible');
});
// R119 (V134): v4 adds every rebate of the payment; a database before V134 (v4 missing) answers from v3 with the same text.
test('R119: v4 rebates reach the push; a missing v4 falls back to v3 with the same single-rebate text',async()=>{
 const row={found:true,event_type:'payment.posted',language:'en',borrower_name:'Somchai Jaidee',amount:'2500',rebate_amount:'30',rebate_payee:'A',rebate_payable:'30',late_charge_amount:'0'};
 const send=async pool=>{const sent=[];await createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}})();return sent;};
 const v4=scriptedPool([{...row,rebates:[{amount:30,payee:'A',payable:30},{amount:20,payee:'B',payable:20}]}]);
 assert.deepEqual(await send(v4.pool),[{title:'Payment received ฿2,500',body:'Rebates ฿30 to A and ฿20 to B, transfer from Lisa · Somchai Jaidee'}]);
 assert.equal(v4.calls.some(c=>/pwa_notify_content_v[123]/.test(c.sql)),false,'v4 answers; no older read');
 const single=scriptedPool([{...row,rebates:[{amount:30,payee:'A',payable:30}]}]),old=scriptedPool([row]),answer=old.pool.connect;
 old.pool.connect=async()=>{const c=await answer();const query=c.query;c.query=async(sql,args)=>{if(sql.includes('pwa_notify_content_v4'))throw Object.assign(Error('function public.pwa_notify_content_v4(uuid, bigint) does not exist'),{code:'42883'});return query(sql,args);};return c;};
 const fallback=await send(old.pool);
 assert.deepEqual(fallback,[{title:'Payment received ฿2,500',body:'Rebate ฿30 to A, transfer from Lisa · Somchai Jaidee'}]);
 assert.deepEqual(await send(single.pool),fallback,'one rebate reads the same from v4 and v3');
 assert.ok(old.calls.some(c=>c.sql.includes('pwa_notify_content_v3')));
});
// R119 (Chase): only a missing v4 (42883) or its missing grant (42501) falls back to v3; any other v4 error sends the
// generic text instead of a push that names only the first rebate.
test('R119: v4 falls back to v3 only on 42883 or 42501; another v4 error sends the generic text without reading v3',async()=>{
 const row={found:true,event_type:'payment.posted',language:'en',borrower_name:'Somchai Jaidee',amount:'2500',rebate_amount:'30',rebate_payee:'A',rebate_payable:'30'};
 const failing=error=>{const s=scriptedPool([row]),answer=s.pool.connect;
  s.pool.connect=async()=>{const c=await answer();const query=c.query;c.query=async(sql,args)=>{if(sql.includes('pwa_notify_content_v4'))throw error;return query(sql,args);};return c;};return s;};
 const send=async pool=>{const sent=[];const out=await createNotificationDispatcher({pool,enabled:true,guardConnection:async()=>{},eligible:async()=>true,transport:async(_s,_id,options)=>{sent.push(options.content);return{kind:'accepted'};}})();return{sent,out};};
 for(const code of ['42883','42501']){
  const s=failing(Object.assign(Error('v4 unavailable'),{code}));const {sent,out}=await send(s.pool);
  assert.deepEqual(sent,[{title:'Payment received ฿2,500',body:'Rebate ฿30 to A, transfer from Lisa · Somchai Jaidee'}],code);
  assert.ok(s.calls.some(c=>c.sql.includes('pwa_notify_content_v3')),code);assert.deepEqual(out.results,[{state:'sent'}]);
 }
 for(const error of [Object.assign(Error('canceling statement due to statement timeout'),{code:'57014'}),Object.assign(Error('connection terminated'),{code:'08006'}),Error('socket hang up')]){
  const s=failing(error);const {sent,out}=await send(s.pool);
  assert.deepEqual(sent,[{title:'MW Credit',body:'New activity'}],error.message);
  assert.equal(s.calls.some(c=>/pwa_notify_content_v[123]/.test(c.sql)),false,'no older read after '+error.message);
  assert.deepEqual(out.results,[{state:'sent'}],'the delivery completes as before');
 }
});
