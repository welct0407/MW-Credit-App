import {validateSubscription} from './web-push.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Only fixed RPCs touch protected notification state. Identity is resolved afresh. */
export function createNotificationStore({pool,guardConnection,resolveActor,issuer}){
 async function run(principal,action){
  const c=await pool.connect();let healthy=false;
  try{await c.query('BEGIN');await guardConnection(c);const actor=await resolveActor(c,principal,'read');if(!actor||actor.issuer!==issuer)throw Error('access_denied');const value=await action(c,actor);await c.query('COMMIT');healthy=true;return value;}
  catch(e){try{await c.query('ROLLBACK');healthy=true}catch{}throw e;}finally{c.release(!healthy);}
 }
 return{
  subscribe:(p,input)=>run(p,async(c,a)=>{validateSubscription(input);return(await c.query('SELECT public.pwa_notify_subscribe_v1($1::jsonb,$2::jsonb) AS value',[a,input])).rows[0].value;}),
  revoke:(p,id)=>run(p,async(c,a)=>{if(!uuid(id))throw Error('invalid_request');await c.query('SELECT public.pwa_notify_revoke_v1($1::jsonb,$2::uuid)',[a,id]);return{ok:true};}),
  preference:(p,enabled)=>run(p,async(c,a)=>{if(typeof enabled!=='boolean')throw Error('invalid_request');await c.query('SELECT public.pwa_notify_preference_v1($1::jsonb,$2::boolean)',[a,enabled]);return{enabled};}),
  status:(p,endpointHash)=>run(p,async(c,a)=>{if(endpointHash!==null&&!/^[a-f0-9]{64}$/.test(endpointHash??''))throw Error('invalid_request');return(await c.query('SELECT public.pwa_notify_status_v1($1::jsonb,$2::text) AS value',[a,endpointHash])).rows[0].value;}),
  history:(p,before)=>run(p,async(c,a)=>{
   let cursor=null;
   if(before!==null){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString());if(Object.keys(cursor).join(',')!=='at,id'||!uuid(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||new Date(cursor.at).toISOString().slice(0,19)!==cursor.at.slice(0,19)||Buffer.from(JSON.stringify(cursor)).toString('base64url')!==before)throw Error();}catch{throw Error('invalid_request');}}
   const rows=(await c.query('SELECT * FROM public.pwa_notify_history_v1($1::jsonb,$2::timestamptz,$3::uuid)',[a,cursor?.at??null,cursor?.id??null])).rows;
   return{items:rows.slice(0,25),nextCursor:rows.length>25?Buffer.from(JSON.stringify({at:rows[24].occurredAt,id:rows[24].eventId})).toString('base64url'):null};
  }),
  target:(p,id)=>run(p,async(c,a)=>{if(!uuid(id))throw Error('invalid_request');const row=(await c.query('SELECT * FROM public.pwa_notify_target_v1($1::jsonb,$2::uuid)',[a,id])).rows[0];if(!row)throw Error('not_found');return row;})
 };
}
/** One bounded candidate page per tick; no full-history drain in application code. */
export async function enqueueNotifications(client,{eligible,shouldStop=()=>false}){
 const candidates=(await client.query('SELECT * FROM public.pwa_notify_candidates_v1($1)',[100])).rows;
 let count=0;
 for(const candidate of candidates){
  if(shouldStop())break;
  const eligibility=await eligible(client,candidate);
  if(eligibility===null)continue; // External identity lookup unavailable: defer, never cancel.
  count+=Number((await client.query('SELECT public.pwa_notify_enqueue_v1($1::uuid,$2::uuid,$3::bigint,$4::boolean) AS inserted',[candidate.event_id,candidate.subscription_id,candidate.version,eligibility])).rows[0].inserted);
 }
 return{enqueued:count,candidates:candidates.length};
}
