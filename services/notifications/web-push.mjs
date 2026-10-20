import https from 'node:https';
import {createHash,ECDH} from 'node:crypto';
import {genericNotification} from './content.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function validateSubscription(value){
 if(!value||Object.keys(value).sort().join(',')!=='endpoint,expirationTime,keys'||!value.keys||Object.keys(value.keys).sort().join(',')!=='auth,p256dh')throw Error('invalid_subscription');
 let u;try{u=new URL(value.endpoint)}catch{throw Error('invalid_subscription')}
 const allowed=u.hostname==='fcm.googleapis.com'||/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+push\.apple\.com$(?![\s\S])/.test(u.hostname)||u.hostname==='updates.push.services.mozilla.com'||/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+notify\.windows\.com$(?![\s\S])/.test(u.hostname);
 if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||value.endpoint.length>4096||u.href!==value.endpoint)throw Error('invalid_subscription');
 for(const [name,size]of [['p256dh',65],['auth',16]]){const v=value.keys[name];if(typeof v!=='string'||!/^[A-Za-z0-9_-]+$/.test(v)||Buffer.from(v,'base64url').length!==size||Buffer.from(v,'base64url').toString('base64url')!==v)throw Error('invalid_subscription');}
 if(Buffer.from(value.keys.p256dh,'base64url')[0]!==4)throw Error('invalid_subscription');
 try{ECDH.convertKey(Buffer.from(value.keys.p256dh,'base64url'),'prime256v1')}catch{throw Error('invalid_subscription')}
 if(value.expirationTime!==null&&(!Number.isSafeInteger(value.expirationTime)||value.expirationTime<=Date.now()))throw Error('invalid_subscription');
 return{...value,endpointHash:hash(value.endpoint)};
}
/** The maintained library owns encryption/VAPID. No redirect or arbitrary host input. */
export async function createWebPushTransport({subject,publicKey,privateKey},{request=https.request}={}){
 if(typeof subject!=='string'||!/^mailto:[^\s@]+@[^\s@]+$/.test(subject)||!publicKey||!privateKey)throw Error('invalid_push_configuration');
 const {default:webpush}=await import('web-push');
 /** @param {any} subscription @param {string} eventId @param {{timeoutMs?:number,signal?:AbortSignal,content?:{title:string,body:string}|null}} [options] */
 return async(subscription,eventId,{timeoutMs=8000,signal,content}={})=>{
  const valid=validateSubscription(subscription);
  if(!/^[0-9a-f-]{36}$/.test(eventId))throw Error('invalid_event');
  // v2 (R080): the rendered event text; anything missing or out of bounds is the generic text (sw.js limits).
  const text=typeof content?.title==='string'&&typeof content?.body==='string'&&content.title.length>=1&&content.title.length<=60&&content.body.length>=1&&content.body.length<=200?content:genericNotification();
  try{
   const details=webpush.generateRequestDetails({endpoint:valid.endpoint,keys:valid.keys},JSON.stringify({v:2,eventId,title:text.title,body:text.body,url:'/?notification='+eventId,tag:'mw-credit-'+eventId}),{vapidDetails:{subject,publicKey,privateKey},TTL:3600,contentEncoding:'aes128gcm',urgency:'normal',topic:hash(eventId).slice(0,32)});
   const status=await new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const req=request(details.endpoint,{method:details.method,headers:details.headers,signal},res=>{
     // No response body is needed; close the socket before acknowledging this work.
     const status=res.statusCode;res.destroy();finish(null,status);
    });
    const timer=setTimeout(()=>req.destroy(Error('provider_deadline')),Math.max(1,Math.min(8000,Math.floor(timeoutMs))));
    req.on('error',error=>finish(error));req.end(details.body);
   });
   if(status>=200&&status<300)return{kind:'accepted'};
   return{kind:status===404||status===410?'expired':status===429?'throttled':status>=500?'unavailable':status>=400?'rejected':'network'};
  }
  catch(error){const status=error?.statusCode;return{kind:status===404||status===410?'expired':status===429?'throttled':status>=500?'unavailable':status>=400?'rejected':'network'};}
 };
}
