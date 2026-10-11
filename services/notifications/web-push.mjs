import {createHash,ECDH} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateSubscription(value){
 if(!value||Object.keys(value).sort().join(',')!=='endpoint,expirationTime,keys'||!value.keys||Object.keys(value.keys).sort().join(',')!=='auth,p256dh')throw Error('invalid_subscription');
 let u;try{u=new URL(value.endpoint)}catch{throw Error('invalid_subscription')}
 const allowed=u.hostname==='fcm.googleapis.com'||u.hostname==='web.push.apple.com'||u.hostname==='updates.push.services.mozilla.com';
 if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||value.endpoint.length>4096||u.href!==value.endpoint)throw Error('invalid_subscription');
 for(const [name,size]of [['p256dh',65],['auth',16]]){const v=value.keys[name];if(typeof v!=='string'||!/^[A-Za-z0-9_-]+$/.test(v)||Buffer.from(v,'base64url').length!==size||Buffer.from(v,'base64url').toString('base64url')!==v)throw Error('invalid_subscription');}
 if(Buffer.from(value.keys.p256dh,'base64url')[0]!==4)throw Error('invalid_subscription');
 try{ECDH.convertKey(Buffer.from(value.keys.p256dh,'base64url'),'prime256v1')}catch{throw Error('invalid_subscription')}
 if(value.expirationTime!==null&&(!Number.isSafeInteger(value.expirationTime)||value.expirationTime<=Date.now()))throw Error('invalid_subscription');
 return{...value,endpointHash:hash(value.endpoint)};
}
/** The maintained library owns encryption/VAPID. No redirect or arbitrary host input. */
export async function createWebPushTransport({subject,publicKey,privateKey}){
 if(typeof subject!=='string'||!/^mailto:[^\s@]+@[^\s@]+$/.test(subject)||!publicKey||!privateKey)throw Error('invalid_push_configuration');
 const {default:webpush}=await import('web-push');
 return async(subscription,eventId)=>{
  const valid=validateSubscription(subscription);
  if(!/^[0-9a-f-]{36}$/.test(eventId))throw Error('invalid_event');
  try{await webpush.sendNotification({endpoint:valid.endpoint,keys:valid.keys},JSON.stringify({v:1,eventId,title:'MW Credit',body:'An update is available.',url:'/?notification='+eventId,tag:'mw-credit-'+eventId}),{vapidDetails:{subject,publicKey,privateKey},TTL:3600,timeout:8000,contentEncoding:'aes128gcm',urgency:'normal',topic:hash(eventId).slice(0,32)});return{kind:'accepted'};}
  catch(error){const status=error?.statusCode;return{kind:status===404||status===410?'expired':status===429?'throttled':status>=500?'unavailable':status>=400?'rejected':'network'};}
 };
}
