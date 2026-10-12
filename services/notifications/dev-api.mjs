import {notificationHandler} from './handler.mjs';
import {createNotificationStore} from './store.mjs';
import {canonicalActor} from '../contracts/payment-command.mjs';
/** DEV API pins the owner tuple independently of the dispatcher's endpoint policy. */
export function createDevNotificationHandler({next,config,pool,guardConnection,verifyPrincipal}){
 if(!config.notificationsEnabled)return next;
 const issuer=`https://securetoken.google.com/${config.projectId}`;
 const resolveActor=async(c,p)=>{
  if(!p?.ok||p.subject!==config.ownerUid||p.email!==config.ownerEmail)return null;
  const rows=(await c.query('SELECT "Row ID" AS id FROM public."Partners" WHERE lower(btrim("Login Email"))=$1 LIMIT 2',[p.email])).rows;
  return rows.length===1&&rows[0].id===config.notificationOwnerPartnerId?canonicalActor({issuer,subject:p.subject,loginEmail:p.email,partnerId:rows[0].id}):null;
 };
 return notificationHandler({next,enabled:true,store:createNotificationStore({pool,guardConnection,resolveActor,issuer}),verifyPrincipal,origins:config.origins,publicKey:config.pushPublicKey});
}
