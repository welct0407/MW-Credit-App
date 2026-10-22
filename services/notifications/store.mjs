import {validateSubscription} from './web-push.mjs';
import {withOfflineReadSlot,offlineReadClient} from '../api/offline-read-slot.mjs';
import {readTraversalCursor,encodeTraversalCursor} from '../api/offline-dataset-cursor.mjs';
import {readDeltaRequest,encodeDeltaChunk} from '../api/offline-dataset-delta.mjs';
import {isUuidAny as uuid} from '../lib/ids.mjs';
import {renderNotification,genericNotification} from './content.mjs';
/** R089: each history row carries the push it stood for (title/body), rendered from the V102 facts of the page's
 * events with the caller as recipient; an event without facts shows the generic push. One query per page. Best effort,
 * like the dispatcher: an RPC failure (e.g. before V102) rolls back to a savepoint and the page shows generic text. */
async function withContent(c,a,items){
 if(!items.length)return items;
 let facts=new Map();
 await c.query('SAVEPOINT history_content');
 try{facts=new Map((await c.query('SELECT * FROM public.pwa_notify_history_content_v1($1::jsonb,$2::uuid[])',[a,items.map(row=>row.eventId)])).rows.map(row=>[row.eventId,row]));await c.query('RELEASE SAVEPOINT history_content');}
 catch{await c.query('ROLLBACK TO SAVEPOINT history_content');} // A failed rollback (cancelled read, lost connection) propagates.
 return items.map(row=>({...row,...(facts.has(row.eventId)?renderNotification(facts.get(row.eventId)):genericNotification('en'))}));
}
/** Only fixed RPCs touch protected notification state. Identity is resolved afresh. */
export function createNotificationStore({pool,guardConnection,resolveActor,issuer}){
 async function run(principal,action,readonly=false){
  const c=await pool.connect();let healthy=false;
  try{await c.query(readonly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await guardConnection(c);const actor=await resolveActor(c,principal,'read');if(!actor||actor.issuer!==issuer)throw Error('access_denied');const value=await action(c,actor);await c.query('COMMIT');healthy=true;return value;}
  catch(e){try{await c.query('ROLLBACK');healthy=true}catch{}throw e;}finally{c.release(!healthy);}
 }
 return{
  offlineDataset:(p,signal,options={})=>withOfflineReadSlot(pool,signal,()=>run(p,async(c,a)=>{
   c=offlineReadClient(c,signal);
   const stamp=(await c.query(`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf",(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS "businessDate"`)).rows[0];
   if(options.protocol===2||options.protocol===3){ // Protocol 1 is retired.
    const delta=options.protocol===3?readDeltaRequest(options.input):null;
    const traversal=readTraversalCursor(delta?.cursor??options.cursor??null,{actor:a,domain:'notifications',...stamp,phases:1});
    const before=traversal.state;
    if(before!==null&&(!before||Object.keys(before).sort().join(',')!=='at,id'||!uuid(before.id)||typeof before.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(before.at)||!Number.isFinite(Date.parse(before.at))))throw Error('invalid_request');
    const rows=(await c.query('SELECT * FROM public.pwa_notify_history_v1($1::jsonb,$2::timestamptz,$3::uuid)',[a,before?.at??null,before?.id??null])).rows;
    const items=await withContent(c,a,rows.slice(0,25)),complete=rows.length<=25;
    const targets=items.length?(await c.query('SELECT event_id AS "eventId",to_jsonb(target) AS value FROM unnest($2::uuid[]) AS events(event_id) CROSS JOIN LATERAL public.pwa_notify_target_v1($1::jsonb,event_id) target',[a,items.map(row=>row.eventId)])).rows.map(row=>({eventId:row.eventId,...row.value})):[];
    const patches=[{key:'items',mode:'append',value:items},{key:'targets',mode:'append',value:targets}];
    if(traversal.done===0)patches.push({key:'status',mode:'replace',value:(await c.query('SELECT public.pwa_notify_status_v1($1::jsonb,NULL::text) AS value',[a])).rows[0].value});
    const done=traversal.done+1,nextCursor=complete?null:encodeTraversalCursor({...traversal,done,state:{at:items.at(-1).occurredAt,id:items.at(-1).eventId}});
    const chunk={ok:true,schemaVersion:2,domain:'notifications',generation:traversal.generation,startedAt:traversal.startedAt,...stamp,complete,patches,nextCursor,progress:{completed:done,total:done+(complete?0:1)}};
    // Protected recipient RPCs have no universal change watermark. Recheck their
    // bounded manifests each sweep; only missing content is transferred.
    return delta?encodeDeltaChunk({...chunk,sourceVersion:null},delta.need):chunk;
   }
   throw Error('invalid_request');
  },true)),
  subscribe:(p,input)=>run(p,async(c,a)=>{validateSubscription(input);return(await c.query('SELECT public.pwa_notify_subscribe_v1($1::jsonb,$2::jsonb) AS value',[a,input])).rows[0].value;}),
  revoke:(p,id)=>run(p,async(c,a)=>{if(!uuid(id))throw Error('invalid_request');await c.query('SELECT public.pwa_notify_revoke_v1($1::jsonb,$2::uuid)',[a,id]);return{ok:true};}),
  preference:(p,enabled)=>run(p,async(c,a)=>{if(typeof enabled!=='boolean')throw Error('invalid_request');await c.query('SELECT public.pwa_notify_preference_v1($1::jsonb,$2::boolean)',[a,enabled]);return{enabled};}),
  status:(p,endpointHash)=>run(p,async(c,a)=>{if(endpointHash!==null&&!/^[a-f0-9]{64}$/.test(endpointHash??''))throw Error('invalid_request');return(await c.query('SELECT public.pwa_notify_status_v1($1::jsonb,$2::text) AS value',[a,endpointHash])).rows[0].value;}),
  history:(p,before)=>run(p,async(c,a)=>{
   let cursor=null;
   if(before!==null){try{cursor=JSON.parse(Buffer.from(before,'base64url').toString());if(Object.keys(cursor).join(',')!=='at,id'||!uuid(cursor.id)||typeof cursor.at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(cursor.at)||new Date(cursor.at).toISOString().slice(0,19)!==cursor.at.slice(0,19)||Buffer.from(JSON.stringify(cursor)).toString('base64url')!==before)throw Error();}catch{throw Error('invalid_request');}}
   const rows=(await c.query('SELECT * FROM public.pwa_notify_history_v1($1::jsonb,$2::timestamptz,$3::uuid)',[a,cursor?.at??null,cursor?.id??null])).rows;
   return{items:await withContent(c,a,rows.slice(0,25)),nextCursor:rows.length>25?Buffer.from(JSON.stringify({at:rows[24].occurredAt,id:rows[24].eventId})).toString('base64url'):null};
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
