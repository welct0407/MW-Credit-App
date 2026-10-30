// R090 chat protocol (design §3.5, §6.3; Archie resolution 8). Pure functions with no imports, so the unit tests
// transpile this file on its own: the SSE line parser, the per-turn reducer and the outcome polling loop.

export type ChatTool={callId:string;name:string;state:'running'|'ok'|'error';summary?:string;ms?:number};
/** R106 D6/D9: a write proposal and its server-built card (only server fields are shown, never model text). */
export type ProposalState='pending'|'executing'|'done'|'failed'|'expired'|'cancelled'|'unknown';
export type CardField={field:string;label:{en:string;th:string};type:string;value?:unknown;display?:string;before?:unknown;after?:unknown;beforeDisplay?:string;afterDisplay?:string};
export type ProposalCard={version:number;operation:string;label:{en:string;th:string};confirmLabel?:{en:string;th:string}|null;destructive:boolean;group?:{id:string;index:number;count:number;ids?:string[]};target:{type:string;id:string;label:string|null};values:CardField[];changes:CardField[];
 consequences:{code:string;amount?:string}[];split?:{chargeId:string;loanDisplayKey:string|null;chargeDate:string;principal:string;interest:string;projected:boolean}[]};
export type ChatProposal={id:string;threadId:string;messageId:string;kind:'operation'|'payment';operation:string;state:ProposalState;card:ProposalCard;expiresAt:string;createdAt:string;settledAt?:string|null;outcome?:{code:string|null;recordedAt?:string|null}|null;record?:{type:string;id:string;paymentId?:string|null}|null};
export type ChatMessage={id:string;seq?:number;role:'user'|'assistant';text:string;status:'ok'|'failed'|'pending';model?:string;createdAt?:string;usage?:Record<string,number>;tools?:{name:string;count:number}[];errorCode?:string;proposals?:ChatProposal[]};
export type TurnState={accepted:boolean;seq:number|null;model:string|null;round:number;tools:ChatTool[];provisional:string;checking:boolean;message:ChatMessage|null;error:string|null;done:boolean;startedAt:number|null;proposals:ChatProposal[]};
export const initialTurn=():TurnState=>({accepted:false,seq:null,model:null,round:0,tools:[],provisional:'',checking:false,message:null,error:null,done:false,startedAt:null,proposals:[]});

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
  // R106 D9/D12: the turn's group of proposals (stored before the reply); the committed reply carries it too.
  case 'proposal':{const lines=Array.isArray(value.proposals)?value.proposals:value.proposal?[value.proposal]:[];return lines.length&&lines.every(isProposal)?{...state,proposals:lines as ChatProposal[]}:state}
  case 'message':return isMessage(data)?{...state,message:data.proposals===undefined&&state.proposals.length?{...data,proposals:state.proposals}:data,provisional:'',checking:false}:state;
  case 'error':return {...state,error:typeof value.code==='string'?value.code:'INTERNAL',provisional:'',checking:false};
  case 'done':return {...state,done:true};
  default:return state;
 }
}
export function isMessage(value:unknown):value is ChatMessage{
 const item=value as ChatMessage|null;
 return !!item&&typeof item==='object'&&typeof item.id==='string'&&(item.role==='user'||item.role==='assistant')&&typeof item.text==='string'&&['ok','failed','pending'].includes(item.status);
}

const STATES=['pending','executing','done','failed','expired','cancelled','unknown'];
export function isProposal(value:unknown):value is ChatProposal{
 const item=value as ChatProposal|null;
 return !!item&&typeof item==='object'&&typeof item.id==='string'&&typeof item.operation==='string'&&STATES.includes(item.state)&&!!item.card&&typeof item.card==='object'
  &&Array.isArray(item.card.values)&&Array.isArray(item.card.changes)&&typeof item.expiresAt==='string';
}
/** How long an unknown outcome is polled (3 s apart, up to 5 minutes, D7). */
export const PROPOSAL_POLL_MS=3000,PROPOSAL_POLL_LIMIT_MS=300000;
export type ProposalView={state:ProposalState;canConfirm:boolean;canCancel:boolean;poll:boolean;remainingSeconds:number;code:string|null};
/**
 * The card's state machine (D7, Echo): pending counts down and expires on the client clock too; Confirm and Cancel
 * need a connection and no request in flight (CWR-08); unknown is polled and never offers a retry; a settled state is
 * final. `seen` (CWR-01): Confirm stays disabled until the card has been fully visible for a moment.
 */
export function proposalView(proposal:ChatProposal,{now=Date.now(),online=true,busy=false,seen=true}:{now?:number;online?:boolean;busy?:boolean;seen?:boolean}={}):ProposalView{
 const remaining=Math.max(0,Math.floor((Date.parse(proposal.expiresAt)-now)/1000));
 const state:ProposalState=proposal.state==='pending'&&remaining<=0?'expired':proposal.state;
 const code=state==='expired'?'proposal_expired':state==='cancelled'?'proposal_cancelled':state==='unknown'?'outcome_unknown':proposal.outcome?.code??null;
 return {state,canConfirm:state==='pending'&&online&&!busy&&seen,canCancel:state==='pending'&&online&&!busy,poll:state==='unknown'||state==='executing'&&!busy,remainingSeconds:state==='pending'?remaining:0,code};
}
/** The proposal shown for a message: a newer local copy (confirm, cancel, poll) wins over the row's. */
export function mergeProposal(row:ChatProposal|null|undefined,local:ChatProposal|undefined){
 if(!row)return local??null;if(!local||local.id!==row.id)return row;
 const final=(p:ChatProposal)=>['done','failed','expired','cancelled'].includes(p.state);
 return final(row)&&!final(local)?row:local;
}
/** Polls an unknown (or executing) proposal until it settles or 5 minutes pass; read errors count as still unknown. */
export async function pollProposal(read:()=>Promise<ChatProposal>,{intervalMs=PROPOSAL_POLL_MS,timeoutMs=PROPOSAL_POLL_LIMIT_MS,now=Date.now,sleep,signal}:{intervalMs?:number;timeoutMs?:number;now?:()=>number;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;signal?:AbortSignal}={}):Promise<ChatProposal|null>{
 const wait=sleep??((ms:number,abort?:AbortSignal)=>new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,ms);abort?.addEventListener('abort',()=>{clearTimeout(timer);reject(abort.reason)},{once:true})}));
 const deadline=now()+timeoutMs;
 for(;;){
  if(now()+intervalMs>deadline)return null;
  await wait(intervalMs,signal);
  if(signal?.aborted)throw signal.reason;
  try{const value=await read();if(value.state!=='unknown'&&value.state!=='executing')return value}catch(error){if(signal?.aborted||(error as {fatal?:boolean})?.fatal)throw error}
 }
}

/** CWR-01/D12: whether the visible spans seen so far ([top, bottom] in card pixels) cover the whole card (2 px slack). */
export function seenThrough(spans:[number,number][],height:number,slack=2){
 let reach=0;
 for(const [top,bottom] of [...spans].sort((a,b)=>a[0]-b[0])){if(top>reach+slack)return false;reach=Math.max(reach,bottom)}
 return spans.length>0&&reach>=height-slack;
}

/** D12: one card for a group of lines. */
export type GroupState='pending'|'executing'|'done'|'partial'|'failed'|'expired'|'cancelled'|'unknown';
export type LineView=ProposalState|'notrun'|'skipped';
const SETTLED_LINE=['done','failed'];
/** The server's derived group state (proposals.mjs groupState), from the lines' states. */
export function groupState(states:string[]):GroupState{
 if(states.includes('executing'))return 'executing';
 if(states.includes('unknown'))return 'unknown';
 const settled=states.filter(state=>SETTLED_LINE.includes(state));
 if(!settled.length)return states.includes('pending')?'pending':states.every(state=>state==='expired')?'expired':'cancelled';
 const done=states.filter(state=>state==='done').length;
 return done===states.length?'done':done?'partial':'failed';
}
export type GroupView={state:GroupState;lines:LineView[];pending:number;remaining:boolean;canConfirm:boolean;canCancel:boolean;poll:boolean;remainingSeconds:number};
/**
 * The group card's state machine (D12 with D7 per line): each line's state from proposalView (client-side expiry);
 * once a line of the group settled, a pending line is "notrun" (still runnable) and an expired one "skipped" (CW3-02); Confirm runs the pending lines
 * (all of them, or "N remaining" once some settled); unknown or executing lines are polled, never re-confirmed.
 */
export function groupView(lines:ChatProposal[],options:{now?:number;online?:boolean;busy?:boolean;seen?:boolean}={}):GroupView{
 const views=lines.map(line=>proposalView(line,options));
 const states=views.map(view=>view.state);
 const settled=states.some(state=>SETTLED_LINE.includes(state));
 const pending=states.filter(state=>state==='pending').length;
 const state=groupState(states);
 const live=state!=='executing'&&state!=='unknown';
 return {state,lines:states.map(line=>settled&&line==='pending'?'notrun':settled&&line==='expired'?'skipped':line),pending,remaining:settled&&pending>0,
  canConfirm:live&&pending>0&&views.some(view=>view.canConfirm),canCancel:live&&pending>0&&views.some(view=>view.canCancel),
  poll:!options.busy&&(state==='executing'||state==='unknown'),remainingSeconds:Math.max(0,...views.map(view=>view.remainingSeconds))};
}
/** A group answer: {id, state, lines}. */
export function isGroup(value:unknown):value is {id:string;state:GroupState;lines:ChatProposal[]}{
 const item=value as {id?:unknown;lines?:unknown}|null;
 return !!item&&typeof item==='object'&&typeof item.id==='string'&&Array.isArray(item.lines)&&item.lines.length>0&&item.lines.every(isProposal);
}
/** Polls a group until no line is unknown or executing, or 5 minutes pass (the service reconciles on each read). */
export async function pollGroup(read:()=>Promise<ChatProposal[]>,options:{intervalMs?:number;timeoutMs?:number;now?:()=>number;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;signal?:AbortSignal}={}):Promise<ChatProposal[]|null>{
 const value=await pollProposal(async()=>{const lines=await read();const state=groupState(lines.map(line=>line.state));return {...lines[0],state:state==='unknown'||state==='executing'?state:'done',lines} as ChatProposal&{lines:ChatProposal[]}},options);
 return value?(value as ChatProposal&{lines:ChatProposal[]}).lines:null;
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
