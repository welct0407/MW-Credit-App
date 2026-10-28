/** R102 Claude dialect and VM relay transport (Archie design §2.2). The chat service never holds an Anthropic
 * credential: each round is POSTed with a Google ID token (audience = the relay URL, minted from the metadata server
 * as services/receipts/recognizer-client.mjs does) to the integration agent's chat relay on the VPC
 * (http://10.148.0.2:8791/v1/chat/messages), which authenticates to the Messages API and streams the SSE bytes back
 * unchanged. Same transport contract as createVertexTransport().request ({message, calls, text, inputTokens, usage,
 * attempts}, onDelta, onRetry, idle and deadline bounds, the CAPACITY/TRANSIENT/NETWORK retry tables).
 * Request: adaptive thinking (the only mode on Claude Opus 5.5, so `thinking` is omitted), output_config.effort
 * medium, tool_choice auto (forced tool use is refused on Opus 5.5), no temperature, no server-side fallbacks (never a
 * silent model switch, Echo CHAT-03), the system prompt as one cached text block. Assistant content blocks,
 * thinking blocks included, are stored and replayed verbatim (preserved thinking: the transcript is append-only). */
import {TurnError} from './errors.mjs';
import {Resend,sseEvents,CAPACITY,TRANSIENT,NETWORK,RETRY_MINIMUM} from './gemini.mjs';

export const CLAUDE_EFFORT='medium';
export const RELAY_PORT='8791',RELAY_PATH='/v1/chat/messages';
const METADATA_IDENTITY='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** Relay answers that mean "this model cannot be reached now" (identity, caller or federation failures): no retry. */
const UNAVAILABLE=new Set([401,403,404,503]);

class HttpError extends Error {constructor(status){super(`CLAUDE_HTTP_${status}`);this.status=status;}}
class IdleTimeout extends Error {constructor(){super('CLAUDE_TIMEOUT');}}
class DeadlineReached extends Error {constructor(){super('CONVERSATION_TIMEOUT_NO_REPLAY');}}
const STREAM_ERRORS={overloaded_error:529,rate_limit_error:429,api_error:500,timeout_error:504,authentication_error:401,permission_error:403,not_found_error:404,invalid_request_error:400,request_too_large:413};

/** The relay endpoint http://<private IPv4>:8791/v1/chat/messages, or null for anything else. */
export function chatRelayUrl(value){
 let url;
 try{url=new URL(value);}catch{return null;}
 const octets=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(url.hostname)?.slice(1).map(Number);
 const privateAddress=octets?.every(n=>n<=255)&&(octets[0]===10||(octets[0]===172&&octets[1]>=16&&octets[1]<=31)||(octets[0]===192&&octets[1]===168));
 if(url.protocol!=='http:'||!privateAddress||url.port!==RELAY_PORT||url.pathname!==RELAY_PATH||url.search||url.hash||url.username||url.password||url.href!==value)return null;
 return url.href;
}

const text=value=>({type:'text',text:value});
/** The Claude dialect hooks used by engine.mjs instead of Gemini literals. */
export const claudeDialect=Object.freeze({
 provider:'claude',
 declarations:tools=>tools.specs(),
 /** The opening user message of a round set: one text block per part. */
 user:texts=>({role:'user',content:texts.map(text)}),
 /** All tool results of one round in one user message, in call order; failures carry is_error. */
 toolResults:results=>({role:'user',content:results.map(r=>({type:'tool_result',tool_use_id:r.call.id,content:JSON.stringify(r.value),...(r.error?{is_error:true}:{})}))}),
 /** Stored rows keep role user/model (no store change); content is the content block list. */
 store:message=>({role:message.role==='assistant'?'model':'user',content:JSON.stringify(message.content)}),
 replay:row=>({role:row.role==='model'?'assistant':'user',content:JSON.parse(row.content)}),
 body:({model,system,contents,declarations,maxOutputTokens})=>({model,max_tokens:maxOutputTokens,
  system:[{type:'text',text:system.parts.map(p=>p.text).join('\n\n'),cache_control:{type:'ephemeral'}}],
  messages:contents,tools:declarations,tool_choice:{type:'auto'},output_config:{effort:CLAUDE_EFFORT},stream:true}),
});

/** Merges the SSE events of one Messages stream. push() returns the visible text the event added (delta events). */
export class ClaudeMerger {
 constructor(){this.blocks=[];this.json=new Map();this.stopReason=undefined;this.usage={};this.started=false;}
 push(event){
  if(!event||typeof event!=='object'||Array.isArray(event))throw new TurnError('INTERNAL','CLAUDE_RESPONSE_INVALID');
  switch(event.type){
   case 'message_start':this.started=true;Object.assign(this.usage,event.message?.usage??{});return '';
   case 'content_block_start':{
    const block=event.content_block;
    if(!Number.isSafeInteger(event.index)||!block||typeof block!=='object'||typeof block.type!=='string')throw new TurnError('INTERNAL','CLAUDE_RESPONSE_INVALID');
    this.blocks[event.index]={...block};
    if(block.type==='tool_use'){this.json.set(event.index,'');this.blocks[event.index].input={};}
    return block.type==='text'&&typeof block.text==='string'?block.text:'';
   }
   case 'content_block_delta':{
    const block=this.blocks[event.index],delta=event.delta;
    if(!block||!delta||typeof delta!=='object')throw new TurnError('INTERNAL','CLAUDE_RESPONSE_INVALID');
    if(delta.type==='text_delta'&&typeof delta.text==='string'){block.text=(block.text??'')+delta.text;return delta.text;}
    if(delta.type==='input_json_delta'&&typeof delta.partial_json==='string'){this.json.set(event.index,(this.json.get(event.index)??'')+delta.partial_json);return '';}
    if(delta.type==='thinking_delta'&&typeof delta.thinking==='string'){block.thinking=(block.thinking??'')+delta.thinking;return '';}
    if(delta.type==='signature_delta'&&typeof delta.signature==='string'){block.signature=(block.signature??'')+delta.signature;return '';}
    return '';
   }
   case 'content_block_stop':{
    const block=this.blocks[event.index];
    if(block?.type==='tool_use'){
     const raw=this.json.get(event.index)??'';
     let input;try{input=raw===''?{}:JSON.parse(raw);}catch{throw new Resend('CLAUDE_TOOL_INPUT_INVALID');}
     if(!input||typeof input!=='object'||Array.isArray(input))throw new Resend('CLAUDE_TOOL_INPUT_INVALID');
     block.input=input;
    }
    return '';
   }
   case 'message_delta':
    if(event.delta?.stop_reason)this.stopReason=event.delta.stop_reason;
    if(event.usage&&typeof event.usage==='object')Object.assign(this.usage,event.usage);
    return '';
   // The relay ends a stream it cut at its own deadline with timeout_error: a model timeout, not a retryable 5xx.
   case 'error':if(event.error?.type==='timeout_error')throw new TurnError('MODEL_TIMEOUT','CLAUDE_RELAY_DEADLINE');throw new HttpError(STREAM_ERRORS[event.error?.type]??500);
   default:return ''; // ping, message_stop and later event types
  }
 }
 /** The parsed round: {message, calls, text, usage, inputTokens}. */
 result(){
  if(!this.started)throw new TurnError('INTERNAL','CLAUDE_RESPONSE_INVALID');
  // Started but cut before message_delta (a relay without the deadline event, or a dropped stream): treat as a timeout.
  if(!this.stopReason)throw new TurnError('MODEL_TIMEOUT','CLAUDE_STREAM_TRUNCATED');
  const reason=this.stopReason;
  if(reason==='refusal')throw new TurnError('PROMPT_BLOCKED','CLAUDE_STOP_REFUSAL');
  if(reason==='max_tokens')throw new TurnError('INTERNAL','CLAUDE_STOP_MAX_TOKENS');
  if(reason==='pause_turn')throw new Resend('CLAUDE_STOP_PAUSE_TURN');
  if(!['end_turn','tool_use','stop_sequence'].includes(reason))throw new TurnError('INTERNAL',`CLAUDE_STOP_${String(reason).toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,40)}`);
  // An empty text block is refused on replay; every other block (thinking included) is kept verbatim.
  const content=this.blocks.filter(b=>b&&!(b.type==='text'&&!b.text));
  if(!content.length)throw new Resend('CLAUDE_RESPONSE_EMPTY');
  const calls=[];
  for(const block of content){
   if(block.type!=='tool_use')continue;
   if(typeof block.id!=='string'||!block.id||typeof block.name!=='string')throw new TurnError('INTERNAL','CLAUDE_RESPONSE_INVALID');
   calls.push({name:block.name,args:block.input,id:block.id});
  }
  const count=key=>Number.isSafeInteger(this.usage[key])&&this.usage[key]>0?this.usage[key]:0;
  const prompt=count('input_tokens')+count('cache_read_input_tokens')+count('cache_creation_input_tokens');
  return {message:{role:'assistant',content},calls,text:content.filter(b=>b.type==='text').map(b=>b.text).join(''),inputTokens:prompt,
   usage:{promptTokens:prompt,outputTokens:count('output_tokens'),thoughtsTokens:0,cachedTokens:count('cache_read_input_tokens'),finishReason:reason}};
 }
}

/** Relay transport: one round with bounded retries inside the turn deadline. The request timeout is an inactivity
 * bound (no byte for that long aborts the attempt); the turn deadline aborts it outright.
 * @param {{url:string,fetch?:typeof fetch,mintToken?:(audience:string,signal:AbortSignal)=>Promise<string>,sleep?:(ms:number)=>Promise<void>,now?:()=>number}} options */
export function createRelayTransport({url,fetch:fetcher=globalThis.fetch,mintToken,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}){
 const endpoint=chatRelayUrl(url);
 if(!endpoint||typeof fetcher!=='function')throw Error('Invalid chat relay configuration');
 const token=mintToken??(async(audience,signal)=>{
  const response=await fetcher(`${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}&format=full`,{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal});
  const value=response.ok?await response.text():'';
  if(!JWT.test(value)||value.length>8192)throw Error('identity_unavailable');
  return value;
 });
 async function attempt({payload,idleMs,deadline,onDelta}){
  let bearer;
  try{bearer=await token(endpoint,AbortSignal.timeout(Math.min(idleMs,10000)));}
  catch{throw new TurnError('MODEL_UNAVAILABLE','CLAUDE_RELAY_IDENTITY_UNAVAILABLE');}
  if(typeof bearer!=='string'||!JWT.test(bearer))throw new TurnError('MODEL_UNAVAILABLE','CLAUDE_RELAY_IDENTITY_UNAVAILABLE');
  const controller=new AbortController();let reason=null,idle;
  const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{reason='idle';controller.abort();},Math.max(1,Math.min(idleMs,deadline-now())));};
  const hard=setTimeout(()=>{reason='deadline';controller.abort();},Math.max(1,deadline-now()));
  arm();
  try{
   const response=await fetcher(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json',Accept:'text/event-stream'},body:payload,signal:controller.signal});
   if(!response.ok){try{await response.body?.cancel?.();}catch{/* drained */}throw new HttpError(response.status);}
   const merger=new ClaudeMerger();
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
  /** One round. onDelta(text) streams visible text; onRetry() runs before a retried attempt. */
  async request({body:value,requestTimeoutMs,deadline,onDelta=()=>{},onRetry=()=>{}}){
   const payload=JSON.stringify(value);
   let retries=0,attempts=0;
   for(;;){
    const remaining=deadline-now();
    if(remaining<=1000)throw new TurnError('TURN_TIMEOUT','CONVERSATION_TIMEOUT_NO_REPLAY');
    attempts++;
    let pauses,fallback;
    try{
     return {...await attempt({payload,idleMs:Math.min(requestTimeoutMs,remaining),deadline,onDelta}),attempts};
    }catch(error){
     if(error instanceof Resend||error instanceof TurnError)throw Object.assign(error,{attempts});
     if(error instanceof DeadlineReached)throw Object.assign(new TurnError('TURN_TIMEOUT',error.message),{attempts});
     if(error instanceof HttpError){
      pauses=UNAVAILABLE.has(error.status)?[]:CAPACITY[error.status]??TRANSIENT[error.status]??[];
      fallback=UNAVAILABLE.has(error.status)||[429,529,500,502,504].includes(error.status)?['MODEL_UNAVAILABLE',error.message]:['INTERNAL',error.message];
     }else{
      pauses=NETWORK;
      fallback=error instanceof IdleTimeout?['MODEL_TIMEOUT','CLAUDE_TIMEOUT']:['MODEL_UNAVAILABLE','CLAUDE_RELAY_UNREACHABLE'];
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
