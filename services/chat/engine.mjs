/** R090 conversation engine (design §4; Archie resolutions 1-5, 8, 13): the round loop of the integration agent's
 * conversation_session.py with the reply as plain text instead of a finish tool. Epoch selection, the seed
 * transcript of a new epoch, nudges, Resend, the length and grounding checks with one shared attempt counter, and
 * the turn deadline. The engine never throws: runTurn answers {ok:true,...} or {ok:false,code,detail,...}, so the
 * caller journals every turn (failed turns too, without history). Events go to emit(name,data) in §3.5 order. */
import {TurnError,TURN_CODES} from './errors.mjs';
import {Resend,geminiDialect} from './gemini.mjs';
import {claudeDialect} from './claude.mjs';
import {providerFor} from './config.mjs';
import {check,rejection,MAX_ATTEMPTS} from './grounding.mjs';
import {FINISH_NUDGE,ROUND_NUDGE,HISTORY_NOTE,SEED_FAILED_NOTE,systemInstruction,promptDigest,openingRequest,transcript,bangkokIso} from './prompt.mjs';

export const REPLY_LIMIT=4000; // code points; the prompt aims for about 1,200
const FAILURE_TEXT={en:'I could not complete this request. Check the app before asking again.',th:'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบในแอปก่อนส่งคำขออีกครั้ง'};
/** The canned localized text stored on a failed assistant row (Archie resolution 5). */
export const failureText=partnerLanguage=>partnerLanguage==='ไทย'?FAILURE_TEXT.th:FAILURE_TEXT.en;
/** R102: the dialect of a model (claude-* -> Claude via the VM relay, otherwise Gemini on Vertex). */
export const dialectFor=model=>providerFor(model)==='claude'?claudeDialect:geminiDialect;
/** The transport of a model's provider: {gemini, claude} transports, or one Vertex transport (Gemini only). */
export function transportFor(transport,provider){
 if(transport&&typeof transport.request!=='function')return transport[provider]??null;
 return provider==='gemini'?transport??null:null;
}

/** Epoch of this turn (Archie resolution 4): replay the highest epoch while the digest matches and the last
 * turn's prompt tokens stay within the limit; otherwise a fresh epoch opens with the seed. */
export function selectEpoch(history,prompt,tokenLimit){
 const rows=history?.rows??[];
 if(!rows.length)return {epoch:history?.epoch!==undefined&&history!==null?history.epoch+1:0,rows:[],seq:0};
 const last=rows.at(-1);
 if(last.prompt_sha256===prompt&&(last.input_tokens??0)<=tokenLimit)return {epoch:history.epoch,rows,seq:last.seq+1};
 return {epoch:history.epoch+1,rows:[],seq:0};
}
/** The text that opens a new epoch: the earlier transcript, a note when disabled or unavailable, or nothing. */
export function seedText(seed,seedChars){
 if(seedChars===0)return HISTORY_NOTE;
 try{return transcript(seed??[],seedChars).text;}catch{return SEED_FAILED_NOTE;}
}

/** One turn.
 * @param {{chat:any,model:string,transport:{request:Function},tools:any,history:{epoch:number,rows:any[]}|null,seed:any[],
 *  partnerLanguage:string|null,text:string,emit?:(name:string,data:any)=>void,now?:()=>number,started?:number}} options
 * @returns {Promise<any>} */
export async function runTurn({chat,model,transport,tools,history,seed,partnerLanguage,text,emit=()=>{},now=Date.now,started=now()}){
 const deadline=started+chat.turnTimeoutSeconds*1000;
 const dialect=dialectFor(model),channel=transportFor(transport,dialect.provider);
 const declarations=dialect.declarations(tools);
 // The provider is part of the digest: a thread switched between providers opens a new epoch (no cross replay).
 const prompt=promptDigest({model,declarations,provider:dialect.provider});
 const userText=value=>dialect.user([value]);
 const usage={promptTokens:0,outputTokens:0,thoughtsTokens:0,cachedTokens:0};
 let rounds=0,attempts=0,rejections=0,nudged=false,finalNudged=false,inputTokens=null;
 const selected=selectEpoch(history,prompt,chat.historyTokenLimit);
 const summary=()=>({usage:{...usage},rounds,attempts,epoch:selected.epoch,toolCalls:tools.journal,promptSha256:prompt});
 try{
  if(!channel)throw new TurnError('MODEL_UNAVAILABLE',`${dialect.provider.toUpperCase()}_TRANSPORT_UNCONFIGURED`);
  const replay=selected.rows.map(dialect.replay);
  const prefix=replay.length?null:seedText(seed,chat.seedChars);
  const messages=[...replay,dialect.user([...(prefix?[prefix]:[]),openingRequest({partnerLanguage,asOf:bangkokIso(now()),text})])];
  const start=replay.length,system=systemInstruction();
  const request=async()=>{
   let resent=false;
   for(;;){
    let streamed=false;
    try{
     const response=await channel.request({model,body:dialect.body({model,system,contents:messages,declarations,thinkingLevel:chat.thinkingLevel,maxOutputTokens:chat.maxOutputTokens}),
      requestTimeoutMs:chat.requestTimeoutSeconds*1000,deadline,
      onDelta:delta=>{streamed=true;emit('delta',{text:delta});},
      // A retried attempt replaces text already streamed: clear it silently.
      onRetry:()=>{if(streamed){emit('retract',{reason:'tool_round',attempt:0});streamed=false;}}});
     attempts+=response.attempts??1;
     return {...response,streamed};
    }catch(error){
     attempts+=error?.attempts??1;
     if(streamed)emit('retract',{reason:'tool_round',attempt:0});
     if(error instanceof Resend){if(resent)throw new TurnError('INTERNAL',error.message);resent=true;continue;}
     throw error;
    }
   }
  };
  let reply=null;
  while(reply===null){
   rounds++;
   emit('round',{n:rounds});
   const response=await request();
   for(const key of Object.keys(usage))usage[key]+=response.usage?.[key]??0;
   inputTokens=response.inputTokens;
   messages.push(response.message);
   if(response.calls.length){
    if(response.streamed)emit('retract',{reason:'tool_round',attempt:0});
    // After ROUND_NUDGE a response that still calls tools fails without running them.
    if(finalNudged)throw new TurnError('TOOL_ROUNDS_EXCEEDED',`${dialect.provider.toUpperCase()}_TOOL_ROUNDS_EXCEEDED`);
    const results=await tools.runRound(response.calls,{deadline,round:rounds,emit});
    messages.push(dialect.toolResults(results));
    // Vertex refuses a user content mixing functionResponse and text: the nudge is its own content (Claude merges
    // consecutive user messages, so the same shape is valid there).
    if(rounds>=chat.maxRounds){finalNudged=true;messages.push(userText(ROUND_NUDGE));}
    continue;
   }
   const candidate=response.text;
   if(!candidate.trim()){
    if(nudged)throw new TurnError('INTERNAL','REPLY_EMPTY');
    nudged=true;messages.push(userText(FINISH_NUDGE));continue;
   }
   // Length, then grounding; one shared attempt counter; the rejected content stays in the transcript.
   let reason=null,feedback=null;
   const length=[...candidate].length;
   if(length>REPLY_LIMIT){reason='too_long';feedback=`REPLY_TOO_LONG: ${length} characters; the limit is ${REPLY_LIMIT}. Shorten the reply.`;}
   else{
    const result=check(candidate,tools.observations,text);
    if(!result.ok){reason='ungrounded';feedback=rejection(result,rejections+1);}
   }
   if(reason){
    rejections++;
    if(rejections>=MAX_ATTEMPTS)throw new TurnError('GROUNDING_EXCEEDED',reason==='too_long'?'REPLY_TOO_LONG':'FINISH_UNGROUNDED_EXCEEDED');
    emit('retract',{reason,attempt:rejections});
    messages.push(userText(feedback));
    continue;
   }
   reply=candidate;
  }
  return {ok:true,text:reply,...summary(),
   history:{epoch:selected.epoch,seq:selected.seq,promptSha256:prompt,inputTokens,
    messages:messages.slice(start).map(dialect.store)}};
 }catch(error){
  const known=error instanceof TurnError&&TURN_CODES.includes(error.code);
  return {ok:false,code:known?error.code:'INTERNAL',detail:known?error.detail:(error?.message??'INTERNAL').slice(0,200),...summary()};
 }
}
