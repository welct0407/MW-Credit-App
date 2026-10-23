/** R090 Gemini dialect and Vertex transport (design §4.1; Archie resolutions 6 and 7): a port of
 * gemini_conversation.py with streamGenerateContent?alt=sse. Chunks of one round merge into one content.parts list
 * (plain text parts concatenated; a part with thought:true or a thoughtSignature and every functionCall part stored
 * whole), which is appended, journaled and replayed verbatim. Token from google-auth-library (the runtime service
 * account; no key); project and location come from configuration, never from the request. */
import {TurnError} from './errors.mjs';

export const RESPONSE_LIMIT=8*1048576;
const KNOWN=['text','thought','functionCall','thoughtSignature'];
const BLOCKED=new Set(['SAFETY','RECITATION','BLOCKLIST','PROHIBITED_CONTENT','SPII']);
/** Retry pauses in seconds: capacity answers twice, other 5xx and network failures once; never other 4xx. */
export const CAPACITY={429:[2,5],503:[2,5],529:[2,5]};
export const TRANSIENT={500:[1],502:[1],504:[1]};
export const NETWORK=[1];
export const RETRY_MINIMUM=4; // seconds that must remain after a pause for a retry to be worth starting

/** A response the model may answer correctly on an identical second request (sent at most once). */
export class Resend extends Error {constructor(detail){super(detail);this.name='Resend';}}
class HttpError extends Error {constructor(status){super(`GEMINI_HTTP_${status}`);this.status=status;}}
class IdleTimeout extends Error {constructor(){super('GEMINI_TIMEOUT');}}
class DeadlineReached extends Error {constructor(){super('CONVERSATION_TIMEOUT_NO_REPLAY');}}

export const vertexHost=location=>location==='global'?'aiplatform.googleapis.com':`${location}-aiplatform.googleapis.com`;
export function endpoint({projectId,location,model}){
 return `https://${vertexHost(location)}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
}
/** Request body: thinkingLevel always sent (thinkingBudget never), no temperature, tools in AUTO mode. */
export function body({system,contents,declarations,thinkingLevel,maxOutputTokens}){
 return {systemInstruction:system,contents,tools:[{functionDeclarations:declarations}],toolConfig:{functionCallingConfig:{mode:'AUTO'}},
  generationConfig:{maxOutputTokens,candidateCount:1,thinkingConfig:{thinkingLevel}}};
}
const plainText=part=>typeof part.text==='string'&&part.thought!==true&&part.thoughtSignature===undefined&&part.functionCall===undefined;

/** Merges the SSE chunks of one round. push() returns the non-thought text the chunk added (for delta events). */
export class ChunkMerger {
 constructor(){this.parts=[];this.finishReason=undefined;this.usage=null;this.blockReason=undefined;this.candidates=false;}
 push(chunk){
  if(!chunk||typeof chunk!=='object'||Array.isArray(chunk))throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
  if(chunk.error)throw new HttpError(Number(chunk.error.code)||500);
  if(chunk.usageMetadata&&typeof chunk.usageMetadata==='object')this.usage=chunk.usageMetadata;
  const feedback=chunk.promptFeedback;
  if(feedback&&typeof feedback==='object'&&feedback.blockReason)this.blockReason=feedback.blockReason;
  const candidate=Array.isArray(chunk.candidates)?chunk.candidates[0]:undefined;
  if(!candidate)return '';
  if(typeof candidate!=='object')throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
  this.candidates=true;
  if(candidate.finishReason)this.finishReason=candidate.finishReason;
  const parts=candidate.content?.parts;
  if(parts===undefined)return '';
  if(!Array.isArray(parts)||parts.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
  let delta='';
  for(const part of parts){
   const last=this.parts.at(-1);
   if(plainText(part)&&last&&plainText(last))last.text+=part.text;
   else this.parts.push({...part});
   if(typeof part.text==='string'&&part.thought!==true&&part.functionCall===undefined)delta+=part.text;
  }
  return delta;
 }
 /** The parsed round (gemini_conversation.parse): {message, calls, text, usage, inputTokens}. */
 result(){
  if(!this.candidates){
   if(this.blockReason)throw new TurnError('PROMPT_BLOCKED',`GEMINI_PROMPT_BLOCKED_${code(this.blockReason)}`);
   throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
  }
  const reason=this.finishReason;
  if(reason==='MALFORMED_FUNCTION_CALL')throw new Resend('GEMINI_STOP_MALFORMED_FUNCTION_CALL');
  if(reason!=='STOP'){
   if(BLOCKED.has(reason)||this.blockReason)throw new TurnError('PROMPT_BLOCKED',`GEMINI_STOP_${code(reason)}`);
   throw new TurnError('INTERNAL',`GEMINI_STOP_${code(reason)}`);
  }
  if(!this.parts.length)throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
  const calls=[];
  for(const part of this.parts){
   if(!KNOWN.some(k=>k in part))throw new TurnError('INTERNAL','GEMINI_UNEXPECTED_PART');
   const call=part.functionCall;
   if(call===undefined)continue;
   if(!call||typeof call!=='object'||typeof call.name!=='string'||(call.args!==undefined&&(typeof call.args!=='object'||call.args===null||Array.isArray(call.args)))
    ||(call.id!==undefined&&typeof call.id!=='string'))throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');
   calls.push({name:call.name,args:call.args??{},id:call.id||null});
  }
  const usage=this.usage??{},count=key=>Number.isSafeInteger(usage[key])?usage[key]:0;
  return {message:{role:'model',parts:this.parts},calls,
   text:this.parts.filter(p=>typeof p.text==='string'&&p.thought!==true&&p.functionCall===undefined).map(p=>p.text).join(''),
   inputTokens:count('promptTokenCount'),
   usage:{promptTokens:count('promptTokenCount'),outputTokens:count('candidatesTokenCount'),thoughtsTokens:count('thoughtsTokenCount'),cachedTokens:count('cachedContentTokenCount'),finishReason:reason}};
 }
}
function code(value){return String(value??'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,40)||'UNKNOWN';}

/** Parses an SSE byte stream into JSON data objects. */
export async function* sseEvents(stream,{limit=RESPONSE_LIMIT,onBytes=()=>{}}={}){
 const decoder=new TextDecoder('utf-8');let buffer='',data=[],size=0;
 const flush=function*(){if(data.length){const text=data.join('\n');data=[];let value;try{value=JSON.parse(text);}catch{throw new TurnError('INTERNAL','GEMINI_RESPONSE_INVALID');}yield value;}};
 for await(const chunk of stream){
  size+=chunk.byteLength??chunk.length;onBytes();
  if(size>limit)throw new TurnError('INTERNAL','GEMINI_RESPONSE_TOO_LARGE');
  buffer+=decoder.decode(chunk,{stream:true});
  for(let index=buffer.search(/\r?\n/);index>=0;index=buffer.search(/\r?\n/)){
   const line=buffer.slice(0,index);buffer=buffer.slice(index+(buffer[index]==='\r'?2:1));
   if(line==='')yield* flush();
   else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
  }
 }
 buffer+=decoder.decode();
 if(buffer.startsWith('data:'))data.push(buffer.slice(5).replace(/^ /,''));
 yield* flush();
}

/** Vertex transport: one round's request with bounded retries inside the turn deadline (CAPACITY, TRANSIENT,
 * NETWORK). The request timeout is an inactivity bound (the agent's socket timeout): no byte for that long
 * aborts the attempt; the turn deadline aborts it outright.
 * @param {{projectId:string,location:string,getToken:()=>Promise<string>,fetch?:typeof fetch,sleep?:(ms:number)=>Promise<void>,now?:()=>number}} options */
export function createVertexTransport({projectId,location,getToken,fetch:fetcher=globalThis.fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}){
 async function attempt({url,payload,idleMs,deadline,onDelta}){
  let token;
  try{token=await Promise.race([getToken(),new Promise((_,reject)=>setTimeout(()=>reject(Error('token timeout')),Math.min(idleMs,10000)))]);}
  catch{throw new TurnError('INTERNAL','GEMINI_TOKEN_UNAVAILABLE');}
  if(typeof token!=='string'||!token)throw new TurnError('INTERNAL','GEMINI_TOKEN_UNAVAILABLE');
  const controller=new AbortController();let reason=null,idle;
  const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{reason='idle';controller.abort();},Math.max(1,Math.min(idleMs,deadline-now())));};
  const hard=setTimeout(()=>{reason='deadline';controller.abort();},Math.max(1,deadline-now()));
  arm();
  try{
   const response=await fetcher(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'text/event-stream'},body:payload,signal:controller.signal});
   if(!response.ok){try{await response.body?.cancel?.();}catch{/* drained */}throw new HttpError(response.status);}
   const merger=new ChunkMerger();
   for await(const event of sseEvents(response.body,{onBytes:arm})){
    const delta=merger.push(event);
    if(delta)onDelta(delta);
   }
   return merger.result();
  }catch(error){
   if(reason==='deadline')throw new DeadlineReached();
   if(reason==='idle')throw new IdleTimeout();
   throw error;
  }finally{clearTimeout(idle);clearTimeout(hard);}
 }
 return {
  /** One round. onDelta(text) streams non-thought text; onRetry() runs before a retried attempt.
   * @returns {Promise<{message:any,calls:any[],text:string,inputTokens:number,usage:any,attempts:number}>} */
  async request({model,body:value,requestTimeoutMs,deadline,onDelta=()=>{},onRetry=()=>{}}){
   const url=endpoint({projectId,location,model}),payload=JSON.stringify(value);
   let retries=0,attempts=0;
   for(;;){
    const remaining=deadline-now();
    if(remaining<=1000)throw new TurnError('TURN_TIMEOUT','CONVERSATION_TIMEOUT_NO_REPLAY');
    attempts++;
    let pauses,fallback;
    try{
     const result=await attempt({url,payload,idleMs:Math.min(requestTimeoutMs,remaining),deadline,onDelta});
     return {...result,attempts};
    }catch(error){
     if(error instanceof Resend||error instanceof TurnError)throw Object.assign(error,{attempts});
     if(error instanceof DeadlineReached)throw Object.assign(new TurnError('TURN_TIMEOUT',error.message),{attempts});
     if(error instanceof HttpError){
      pauses=CAPACITY[error.status]??TRANSIENT[error.status]??[];
      fallback=[404,429,503,529,500,502,504].includes(error.status)?['MODEL_UNAVAILABLE',error.message]:['INTERNAL',error.message];
     }else{
      pauses=NETWORK;
      fallback=error instanceof IdleTimeout?['MODEL_TIMEOUT','GEMINI_TIMEOUT']:['MODEL_UNAVAILABLE','GEMINI_UNREACHABLE'];
     }
     if(!(retries<pauses.length&&deadline-now()>=(RETRY_MINIMUM+pauses[retries])*1000)){
      if(deadline-now()<=1000)throw Object.assign(new TurnError('TURN_TIMEOUT','CONVERSATION_TIMEOUT_NO_REPLAY'),{attempts});
      throw Object.assign(new TurnError(...fallback),{attempts});
     }
    }
    onRetry();
    await sleep(pauses[retries]*1000);
    retries++;
   }
  },
 };
}
