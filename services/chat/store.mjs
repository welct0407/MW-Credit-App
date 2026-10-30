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
 // R106 (V118): the reviewer gate in SQL, a second tap while another one executes, one proposal per turn.
 if(message==='reviewer_required')return {status:403,error:'reviewer_required'};
 if(message==='proposal_executing')return {status:409,error:'proposal_executing'};
 if(message==='one_proposal_per_turn')return {status:409,error:'one_proposal_per_turn'};
 if(code==='55006'||message==='turn_in_progress')return {status:409,error:'turn_in_progress'};
 if(code==='54000'||message==='thread_full')return {status:400,error:'invalid_request',detail:'thread_full'};
 if(code==='22023'||message==='invalid_request')return {status:400,error:'invalid_request'};
 return {status:503,error:'unavailable'};
}

/** readRole: the membership lookup (Partners) runs under SET LOCAL ROLE readRole, then RESET ROLE before the RPCs: the
 * IAM user holds the read role WITH INHERIT FALSE, SET TRUE and inherits only mw_chat_api_<env> (EXECUTE).
 * afterCommit: the notification dispatch wake (createPostCommitWake), called after a completion that recorded a
 * chat reply event (batch 2, B3; batch 2c: only for a stream whose device reported leaving); log: service log for a reply event that could not be recorded.
 * @param {{pool:any,guardConnection:(client:any)=>Promise<void>,resolveActor:(client:any,principal:any,capability:string)=>Promise<any>,issuer:string,readRole?:string,afterCommit?:(wake?:{deadline?:number})=>Promise<void>,log?:(record:object)=>void}} options */
export function createChatStore({pool,guardConnection,resolveActor,issuer,readRole,afterCommit=async()=>{},log=()=>{}}){
 const asReader=readRole?`SET LOCAL ROLE "${readRole.replaceAll('"','""')}"`:null;
 /**
  * writer (R106 D5): also resolve, in the same transaction and under the read role, whether the actor may propose and
  * confirm writes: Partners."AI Reviewer" and the 'command' capability of the policy, both for the same Partner.
  */
 async function run(principal,action,readonly=false,{writer:withWriter=false}={}){
  const c=await pool.connect();let healthy=false;
  try{
   await c.query(readonly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
   await c.query(statementTimeoutSql('chat'));
   await guardConnection(c);
   if(asReader)await c.query(asReader);
   const actor=await resolveActor(c,principal,'read');
   let writer=null;
   if(withWriter&&actor){
    const command=await resolveActor(c,principal,'command');
    const reviewer=(await c.query('SELECT "AI Reviewer" AS reviewer FROM public."Partners" WHERE "Row ID"=$1',[actor.partnerId])).rows[0]?.reviewer===true;
    writer={reviewer,command:!!command&&command.partnerId===actor.partnerId&&command.subject===actor.subject};
   }
   if(asReader)await c.query('RESET ROLE');
   if(!actor||actor.issuer!==issuer)throw Error('access_denied');
   const value=await action(c,actor,writer);
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
  thread:(p,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_thread_v1($1::jsonb,$2::uuid) AS value',[a,id]),true),
  updateThread:(p,id,patch)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_thread_update_v1($1::jsonb,$2::uuid,$3::jsonb) AS value',[a,id,patch])),
  messages:(p,thread,{before,limit})=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_messages_v1($1::jsonb,$2::uuid,$3::integer,$4::integer) AS value',[a,thread,before,limit]),true),
  message:(p,thread,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_message_v1($1::jsonb,$2::uuid,$3::uuid) AS value',[a,thread,id]),true),
  /**
   * Claims the turn. A model override applies to the thread only when this call claims it (same transaction); a re-POST
   * of a finished message returns its outcome and leaves the thread's model alone. Returns {actor, value}.
   */
  begin:(p,thread,{id,text,model},{writes=false}={})=>run(p,async(c,a,writer)=>{
   const value=await one(c,'SELECT public.pwa_chat_turn_begin_v1($1::jsonb,$2::uuid,$3::jsonb) AS value',[a,thread,{id,text}]);
   if(value?.state==='claimed'&&model!==undefined&&model!==value.thread.model){
    await c.query('SELECT public.pwa_chat_thread_update_v1($1::jsonb,$2::uuid,$3::jsonb)',[a,thread,{model}]);
    value.thread={...value.thread,model};
   }
   // R106 D7/D10: a new user message cancels the thread's pending proposals; a writer's turn sees its recent actions.
   let recent=null;
   if(writes&&value?.state==='claimed'){
    await c.query('SELECT public.pwa_chat_proposal_cancel_v1($1::jsonb,$2::uuid,NULL,\'superseded\')',[a,thread]);
    if(writer?.reviewer&&writer.command)recent=await one(c,'SELECT public.pwa_chat_proposals_v1($1::jsonb,$2::uuid,NULL,5) AS value',[a,thread]);
   }
   return {actor:a,value,writer:writes?{allowed:!!(writer?.reviewer&&writer.command),...writer}:null,recent};
  },false,{writer:writes}),
  /** R106 D5: whether the Partner may use the proposal routes ({reviewer, command}). */
  writer:p=>run(p,async(_c,_a,writer)=>writer,true,{writer:true}),
  /** R106 V118 proposal RPCs; the reviewer gate is enforced in SQL as well (42501 reviewer_required). */
  createProposal:(p,thread,proposal)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_proposal_create_v1($1::jsonb,$2::uuid,$3::jsonb) AS value',[a,thread,proposal])),
  proposal:(p,thread,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_proposals_v1($1::jsonb,$2::uuid,$3::uuid,NULL) AS value',[a,thread,id]),true),
  claimProposal:(p,thread,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_proposal_claim_v1($1::jsonb,$2::uuid,$3::uuid) AS value',[a,thread,id])),
  settleProposal:(p,thread,id,settlement)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_proposal_settle_v1($1::jsonb,$2::uuid,$3::uuid,$4::jsonb) AS value',[a,thread,id,settlement])),
  cancelProposal:(p,thread,id)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_proposal_cancel_v1($1::jsonb,$2::uuid,$3::uuid,\'cancelled\') AS value',[a,thread,id])),
  /**
   * The asking device's presence on its running turn (batch 2c, V106): 'hidden' (the PWA left: beacon) or 'visible'.
   * Returns {state:'claimed',detached} | {state:'idle'} | {state:'completed'}; another Partner's message is not_found.
   */
  presence:(p,thread,id,state)=>run(p,(c,a)=>one(c,'SELECT public.pwa_chat_turn_presence_v1($1::jsonb,$2::uuid,$3::uuid,$4::text) AS value',[a,thread,id,state])),
  /**
   * Commits the turn and returns {message, detached}: the reply row and whether the asking device had reported leaving
   * (V106 reads detached_at of the locked user row in the completion's transaction). notify ({thread}, stream requests
   * only): when detached, the reply event (pwa_notify_chat_reply_v1, V105) is recorded in the same transaction under a
   * savepoint, so a failure is logged and never fails the turn; after COMMIT the dispatch wake runs (bounded, logged).
   */
  complete:async(p,messageId,assistant,history,toolCalls,notify=null)=>{
   let notified=false,detached=false;
   const message=await run(p,async(c,a)=>{
    const {detached:flag,...value}=await one(c,'SELECT public.pwa_chat_turn_complete_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value',
     [a,messageId,assistant,history===null?null:JSON.stringify(history),JSON.stringify(toolCalls)]);
    detached=flag===true;
    if(notify&&detached){
     await c.query('SAVEPOINT chat_reply_event');
     try{
      notified=(await c.query('SELECT public.pwa_notify_chat_reply_v1($1::jsonb,$2::uuid,$3::uuid,$4::text) AS value',[a,notify.thread,messageId,assistant.status==='ok'?'ok':'failed'])).rows[0].value===true;
      await c.query('RELEASE SAVEPOINT chat_reply_event');
     }catch(error){
      await c.query('ROLLBACK TO SAVEPOINT chat_reply_event');
      log({event:'chat_reply_event_failed',thread:notify.thread,messageId,sqlstate:typeof error?.code==='string'?error.code:undefined});
     }
    }
    return value;
   });
   if(notified){try{await afterCommit();}catch{/* the wake logs its own deferral; the scheduler tick recovers */}}
   return {message,detached};
  },
 };
}
