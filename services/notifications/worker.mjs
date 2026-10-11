import {enqueueNotifications} from './store.mjs';
import {createNotificationDispatcher} from './dispatcher.mjs';
import {createWebPushTransport} from './web-push.mjs';
/** One explicit worker tick; no scheduler installation and no effects by default. */
export async function createNotificationWorker({enabled=false,pool,guardConnection,policy,getUser,vapid}){
 if(!enabled)return async()=>({enabled:false});
 if(!policy?.members?.length||typeof getUser!=='function')throw Error('approved_notification_policy_required');
 const eligible=async(client,s)=>{
  const rows=(await client.query('SELECT "Row ID" AS id,lower(btrim("Login Email")) AS email,"Partner Role" AS role FROM public."Partners" WHERE "Row ID"=$1',[s.partner_id])).rows;
  const p=rows[0];if(rows.length!==1||!policy.members.some(m=>m.partnerId===p.id&&m.loginEmail===p.email&&m.partnerRole===p.role&&m.capabilities.includes('read')))return false;
  try{const user=await getUser(s.subject);return !user.disabled&&user.emailVerified&&user.email?.trim().toLowerCase()===p.email&&user.providerData?.some(v=>v.providerId==='google.com');}catch{return false;}
 };
 const transport=await createWebPushTransport(vapid),dispatch=createNotificationDispatcher({pool,transport,eligible,guardConnection,enabled:true});
 return async()=>{
  const c=await pool.connect();let enqueued=0;
  try{await guardConnection(c);let after=null;do{const page=await enqueueNotifications(c,{eligible,after});enqueued+=page.enqueued;after=page.nextCursor;}while(after);}finally{c.release();}
  return{...await dispatch(),enqueued};
 };
}
