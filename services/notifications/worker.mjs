import {enqueueNotifications} from './store.mjs';
import {createNotificationDispatcher} from './dispatcher.mjs';
import {createWebPushTransport} from './web-push.mjs';
/** One explicit worker tick; no scheduler installation and no effects by default. */
export async function createNotificationWorker({enabled=false,pool,guardConnection,policy,getUser,vapid,shouldStop=()=>false}){
 if(!enabled)return async()=>({enabled:false});
 if(!policy?.members?.length||typeof getUser!=='function')throw Error('approved_notification_policy_required');
 const eligible=async(client,s)=>{
  if(shouldStop())return null;
  if(!policy.members.some(m=>m.partnerId===s.partner_id&&m.loginEmail===s.login_email&&m.partnerRole===s.partner_role&&m.capabilities.includes('read')))return false;
  if(policy.environment==='dev'&&(s.subject!==policy.owner.subject||s.partner_id!==policy.owner.partnerId||s.login_email!==policy.owner.loginEmail||s.endpoint_hash!==policy.owner.endpointSha256))return false;
  let timer;
  try{const user=await Promise.race([getUser(s.subject),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('identity_lookup_unavailable')),2000);})]);return !!(!user.disabled&&user.emailVerified&&user.email?.trim().toLowerCase()===s.login_email&&user.providerData?.some(v=>v.providerId==='google.com'));}catch(error){return error?.code==='auth/user-not-found'?false:null;}finally{clearTimeout(timer);}
 };
 const transport=await createWebPushTransport(vapid),dispatch=createNotificationDispatcher({pool,transport,eligible,guardConnection,enabled:true,shouldStop});
 return async()=>{
  const c=await pool.connect();let enqueued=0;
  try{await guardConnection(c);enqueued=(await enqueueNotifications(c,{eligible,shouldStop})).enqueued;}finally{c.release();}
  return{...await dispatch(),enqueued};
 };
}
