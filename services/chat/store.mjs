/** The chat service's only path to its tables: the fixed pwa_chat_*_v1 RPCs of V104, one short transaction each
 * with the command statement budget, the connection guard and a fresh actor (Firebase principal -> Partners row ->
 * capability policy 'read'). The turn itself runs between two transactions (begin, complete); both re-resolve the
 * actor, which is the design's identity check before the reply is committed (Archie resolution 12). */
import {statementTimeoutSql} from '../lib/budget.mjs';

/** Maps a database error to the API error of design §3.4 (raw causes stay in the service log). */
export function storeError(error){
 const message=error?.message,code=error?.code;
 if(message==='not_found')return {status:404,error:'not_found'};
 if(message==='access_denied')return {status:403,error:'access_denied'};
 if(code==='55006'||message==='turn_in_progress')return {status:409,error:'turn_in_progress'};
 if(code==='54000'||message==='thread_full')return {status:400,error:'invalid_request',detail:'thread_full'};
 if(code==='22023'||message==='invalid_request')return {status:400,error:'invalid_request'};
 return {status:503,error:'unavailable'};
}

/** readRole: the membership lookup (Partners) runs under SET LOCAL ROLE readRole, then RESET ROLE before the RPCs: the
 * IAM user holds the read role WITH INHERIT FALSE, SET TRUE and inherits only mw_chat_api_<env> (EXECUTE).
 * @param {{pool:any,guardConnection:(client:any)=>Promise<void>,resolveActor:(client:any,principal:any,capability:string)=>Promise<any>,issuer:string,readRole?:string}} options */
export function createChatStore({pool,guardConnection,resolveActor,issuer,readRole}){
 const asReader=readRole?`SET LOCAL ROLE "${readRole.replaceAll('"','""')}"`:null;
 async function run(principal,action,readonly=false){
  const c=await pool.connect();let healthy=false;
  try{
   await c.query(readonly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
   await c.query(statementTimeoutSql('chat'));
   await guardConnection(c);
   if(asReader)await c.query(asReader);
   const actor=await resolveActor(c,principal,'read');
   if(asReader)await c.query('RESET ROLE');
   if(!actor||actor.issuer!==issuer)throw Error('access_denied');
   const value=await action(c,actor);
   await c.query('COMMIT');healthy=true;
   return value;
  }catch(error){try{await c.query('ROLLBACK');healthy=true;}catch{/* quarantined below */}throw error;}
  finally{c.release(!healthy);}
 }
 const one=async(c,sql,args)=>(await c.query(sql,args)).rows[0].value;
 return {
  modelsDefault:p=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_models_default_v1($1::jsonb) AS value',[a]),true),
  threads:(p,{status,before,limit})=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_threads_v1($1::jsonb,$2::text,$3::timestamptz,$4::integer) AS value',[a,status,before,limit]),true),
  createThread:(p,input)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_thread_create_v1($1::jsonb,$2::jsonb) AS value',[a,input])),
  updateThread:(p,id,patch)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_thread_update_v1($1::jsonb,$2::uuid,$3::jsonb) AS value',[a,id,patch])),
  messages:(p,thread,{before,limit})=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_messages_v1($1::jsonb,$2::uuid,$3::integer,$4::integer) AS value',[a,thread,before,limit]),true),
  message:(p,thread,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_message_v1($1::jsonb,$2::uuid,$3::uuid) AS value',[a,thread,id]),true),
  /**
   * Claims the turn. A model override applies to the thread only when this call claims it (same transaction); a re-POST
   * of a finished message returns its outcome and leaves the thread's model alone. Returns {actor, value}.
   */
  begin:(p,thread,{id,text,model})=>run(p,async(c,a)=>{
   const value=await one(c,'SELECT public.pwa_chat_turn_begin_v1($1::jsonb,$2::uuid,$3::jsonb) AS value',[a,thread,{id,text}]);
   if(value?.state==='claimed'&&model!==undefined&&model!==value.thread.model){
    await c.query('SELECT public.pwa_chat_thread_update_v1($1::jsonb,$2::uuid,$3::jsonb)',[a,thread,{model}]);
    value.thread={...value.thread,model};
   }
   return {actor:a,value};
  }),
  complete:(p,messageId,assistant,history,toolCalls)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_turn_complete_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value',
   [a,messageId,assistant,history===null?null:JSON.stringify(history),JSON.stringify(toolCalls)])),
 };
}
