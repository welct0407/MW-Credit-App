// R090 chat protocol (design §3.5, §6.3; Archie resolution 8). Pure functions with no imports, so the unit tests
// transpile this file on its own: the SSE line parser, the per-turn reducer and the outcome polling loop.

export type ChatTool={callId:string;name:string;state:'running'|'ok'|'error';summary?:string;ms?:number};
export type ChatMessage={id:string;seq?:number;role:'user'|'assistant';text:string;status:'ok'|'failed'|'pending';model?:string;createdAt?:string;usage?:Record<string,number>;tools?:{name:string;count:number}[];errorCode?:string};
export type TurnState={accepted:boolean;seq:number|null;model:string|null;round:number;tools:ChatTool[];provisional:string;checking:boolean;message:ChatMessage|null;error:string|null;done:boolean;startedAt:number|null};
export const initialTurn=():TurnState=>({accepted:false,seq:null,model:null,round:0,tools:[],provisional:'',checking:false,message:null,error:null,done:false,startedAt:null});

/**
 * Server-Sent Events parser for a fetch body (EventSource cannot send the ID token). Lines end in LF, CRLF or CR;
 * `event:` names the event, `data:` lines join with LF, a blank line dispatches, `:` lines (the 15 s ping) are
 * ignored. Data is JSON; an unparseable payload dispatches null. An event left incomplete when the body ends is
 * dropped, as the SSE standard does, so a cut stream never reports a half-received `done`.
 */
export function createSseParser(onEvent:(name:string,data:unknown)=>void){
 let buffer='',name='',data:string[]=[];
 const line=(raw:string)=>{
  if(raw===''){if(data.length){let parsed:unknown=null;try{parsed=JSON.parse(data.join('\n'))}catch{parsed=null}onEvent(name||'message',parsed)}name='';data=[];return}
  if(raw.startsWith(':'))return;
  const colon=raw.indexOf(':'),field=colon<0?raw:raw.slice(0,colon);let value=colon<0?'':raw.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);
  if(field==='event')name=value;else if(field==='data')data.push(value);
 };
 return {
  push(text:string){
   buffer+=text;
   for(;;){
    const match=/\r\n|\n|\r/.exec(buffer);if(!match)break;
    // A CR at the very end may be the first half of CRLF split across chunks: wait for the next chunk.
    if(match[0]==='\r'&&match.index===buffer.length-1)break;
    line(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);
   }
  },
  end(){buffer='';name='';data=[]},
 };
}

/**
 * Applies one SSE event to the turn shown under the user's message. `retract` clears the provisional text; a
 * `tool_round` retraction is silent, while `ungrounded` and `too_long` show "Checking the figures again…" until the
 * next streamed text. `startedAt` (the client time of the first `accepted`, for the elapsed seconds) is never reset
 * by `round`, `retract` or a repeated `accepted`.
 */
export function applyTurnEvent(state:TurnState,name:string,data:unknown,now:number=Date.now()):TurnState{
 const value=(data&&typeof data==='object'?data:{}) as Record<string,unknown>;
 switch(name){
  case 'accepted':return {...state,accepted:true,startedAt:state.startedAt??now,seq:typeof value.seq==='number'?value.seq:state.seq,model:typeof value.model==='string'?value.model:state.model};
  case 'round':return {...state,round:typeof value.n==='number'?value.n:state.round+1,tools:[]};
  case 'tool':{
   if(typeof value.callId!=='string'||typeof value.name!=='string')return state;
   const tool:ChatTool={callId:value.callId,name:value.name,state:value.state==='ok'||value.state==='error'?value.state:'running',...(typeof value.summary==='string'?{summary:value.summary}:{}),...(typeof value.ms==='number'?{ms:value.ms}:{})};
   const index=state.tools.findIndex(item=>item.callId===tool.callId);
   return {...state,tools:index<0?[...state.tools,tool]:state.tools.map((item,at)=>at===index?tool:item)};
  }
  case 'delta':return typeof value.text==='string'?{...state,provisional:state.provisional+value.text,checking:false}:state;
  case 'retract':return {...state,provisional:'',checking:value.reason==='tool_round'?state.checking:true};
  case 'message':return isMessage(data)?{...state,message:data,provisional:'',checking:false}:state;
  case 'error':return {...state,error:typeof value.code==='string'?value.code:'INTERNAL',provisional:'',checking:false};
  case 'done':return {...state,done:true};
  default:return state;
 }
}
export function isMessage(value:unknown):value is ChatMessage{
 const item=value as ChatMessage|null;
 return !!item&&typeof item==='object'&&typeof item.id==='string'&&(item.role==='user'||item.role==='assistant')&&typeof item.text==='string'&&['ok','failed','pending'].includes(item.status);
}

export type Outcome={state:'pending'}|{state:'done';user:ChatMessage;assistant:ChatMessage}|{state:'gone'};
/** Reads `GET …/messages/:id`: a reply (ok or failed) ends the wait; a stale claim with no reply is lost. */
export function classifyOutcome(body:unknown):Outcome{
 const value=body as {user?:unknown;assistant?:unknown}|null;
 if(!value||typeof value!=='object'||!isMessage(value.user))return {state:'gone'};
 if(isMessage(value.assistant))return {state:'done',user:value.user,assistant:value.assistant};
 return value.user.status==='failed'?{state:'gone'}:{state:'pending'};
}

export type PollResult=Exclude<Outcome,{state:'pending'}>|{state:'timeout'};
/**
 * Polls until the turn has an outcome: every `intervalMs` (3 s) for at most `timeoutMs` (5 minutes, the claim's
 * lifetime). A failed request counts as still pending unless the error is marked `fatal` (401/403: the session is
 * gone); an abort rejects with the signal's reason.
 */
export async function pollOutcome(read:()=>Promise<Outcome>,{intervalMs=3000,timeoutMs=300000,now=Date.now,sleep,signal}:{intervalMs?:number;timeoutMs?:number;now?:()=>number;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;signal?:AbortSignal}={}):Promise<PollResult>{
 const wait=sleep??((ms:number,abort?:AbortSignal)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,ms);abort?.addEventListener('abort',()=>{clearTimeout(timer);reject(abort.reason)},{once:true})}));
 const deadline=now()+timeoutMs;
 for(let first=true;;first=false){
  if(signal?.aborted)throw signal.reason;
  if(!first){if(now()+intervalMs>deadline)return {state:'timeout'};await wait(intervalMs,signal)}
  let outcome:Outcome;
  try{outcome=await read()}catch(error){if(signal?.aborted||(error as {fatal?:boolean})?.fatal)throw error;outcome={state:'pending'}}
  if(outcome.state!=='pending')return outcome;
 }
}
