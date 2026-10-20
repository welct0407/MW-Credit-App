import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createECDH} from 'node:crypto';
import {createWebPushTransport} from '../../services/notifications/web-push.mjs';
import {createNotificationIdentityLookup} from '../../services/notifications/identity.mjs';
const curve=createECDH('prime256v1');curve.generateKeys();
const vapid={subject:'mailto:synthetic@example.invalid',publicKey:curve.getPublicKey().toString('base64url'),privateKey:curve.getPrivateKey().toString('base64url')};
const subscription={endpoint:'https://fcm.googleapis.com/synthetic',expirationTime:null,keys:{p256dh:vapid.publicKey,auth:Buffer.alloc(16,1).toString('base64url')}};
test('abortable push preserves maintained encryption and maps provider results without redirects',async()=>{
 for(const [status,kind] of [[201,'accepted'],[404,'expired'],[410,'expired'],[429,'throttled'],[503,'unavailable'],[400,'rejected'],[302,'network']]){
  let destroyed=false;
  const send=await createWebPushTransport(vapid,{request:(url,options,callback)=>{assert.equal(url,subscription.endpoint);assert.equal(options.method,'POST');assert.equal(options.headers['Content-Encoding'],'aes128gcm');const req=new EventEmitter();req.end=body=>{assert.ok(Buffer.isBuffer(body));queueMicrotask(()=>callback({statusCode:status,destroy(){destroyed=true;}}));};return req;}});
  assert.deepEqual(await send(subscription,'12345678-1234-4234-8234-123456789abc'),{kind});assert.equal(destroyed,true);
 }
});
test('provider cancellation destroys pending IO and is uncertain after send start',async()=>{
 const controller=new AbortController();let destroyed=false;
 const send=await createWebPushTransport(vapid,{request:(url,{signal})=>{const req=new EventEmitter();req.destroy=error=>{destroyed=true;req.emit('error',error);};signal.addEventListener('abort',()=>req.destroy(Error('aborted')),{once:true});req.end=()=>controller.abort();return req;}});
 assert.deepEqual(await send(subscription,'12345678-1234-4234-8234-123456789abc',{signal:controller.signal}),{kind:'network'});assert.equal(destroyed,true);
});
test('identity uses the same cancellation signal for token and Firebase lookup and maps current user',async()=>{
 const controller=new AbortController();let calls=0;
 const lookup=createNotificationIdentityLookup('synthetic-project',async(url,options)=>{assert.equal(options.signal,controller.signal);assert.equal(options.redirect,'error');calls++;return{ok:true,json:async()=>calls===1?{access_token:'synthetic-token'}:{users:[{localId:'subject',email:'synthetic@example.invalid',emailVerified:true,providerUserInfo:[{providerId:'google.com'}]}]}};});
 const user=await lookup('subject',{signal:controller.signal});assert.equal(user.emailVerified,true);assert.equal(user.providerData[0].providerId,'google.com');assert.equal(calls,2);
});
test('R079 transport sends v2 rendered text and falls back to generic text for missing or out-of-bounds content',async()=>{
 const {default:webpush}=await import('web-push');const original=webpush.generateRequestDetails;const payloads=[];
 webpush.generateRequestDetails=(sub,payload,options)=>{payloads.push({payload:JSON.parse(payload),options});return original.call(webpush,sub,payload,options);};
 try{
  const send=await createWebPushTransport(vapid,{request:(_url,_options,callback)=>{const req=new EventEmitter();req.end=()=>queueMicrotask(()=>callback({statusCode:201,destroy(){}}));return req;}});
  const id='12345678-1234-4234-8234-123456789abc',generic={title:'MW Credit',body:'New activity'};
  for(const [content,expected] of [[{title:'Payment received ฿5,000',body:'Somchai Jaidee'},{title:'Payment received ฿5,000',body:'Somchai Jaidee'}],[undefined,generic],[null,generic],[{title:'',body:'x'},generic],[{title:'x'.repeat(61),body:'x'},generic],[{title:'x',body:'x'.repeat(201)},generic],[{title:1,body:'x'},generic]]){
   assert.deepEqual(await send(subscription,id,{content}),{kind:'accepted'});
   const {payload,options}=payloads.pop();assert.deepEqual(payload,{v:2,eventId:id,...expected,url:'/?notification='+id,tag:'mw-credit-'+id});
   assert.equal(options.TTL,3600);assert.equal(options.urgency,'normal');assert.match(options.topic,/^[a-f0-9]{32}$/);assert.doesNotMatch(JSON.stringify(payload),/update/i);
  }
 }finally{webpush.generateRequestDetails=original;}
});
