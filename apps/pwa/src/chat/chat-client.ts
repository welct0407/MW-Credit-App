// R090 chat client (design §6.3). Reads (models, threads, messages) go through read-cache so the last opened thread
// and the list show offline; turns stream over fetch (EventSource cannot send the ID token) and a stream that ends
// without `done` switches to polling the turn's outcome.
import {readCachedJson} from '../read-cache';
import type {OwnerOfflineRepository} from '../owner-offline';
import {createSseParser,classifyOutcome,pollOutcome,isGroup,type ChatMessage,type ChatProposal,type Outcome,type PollResult} from './chat-protocol';

export type ChatAccess={origin:string;offline?:OwnerOfflineRepository;awaitStartup?:()=>Promise<void>;token:()=>Promise<string>;authFailure:(status:number)=>void};
export type ChatThread={id:string;title:string;model:string;status:'active'|'archived';createdAt?:string;lastMessageAt?:string|null;messageCount?:number};
export type ChatModel={id:string;label:string;available:boolean;reason?:string};
export type ChatModels={version:number;default:string;models:ChatModel[]};
export type Page<T>={items:T[];nextCursor:string|null};

/** A non-2xx answer other than 401/403: `code` is the body's `error` (or `unavailable`), `detail` its detail. */
export class ChatHttpError extends Error{
 constructor(readonly status:number,readonly code:string,readonly detail?:string){super(code);this.name='ChatHttpError'}
}
/** 401/403 already went to access.authFailure (expired or denied card); polling stops on it. */
export class ChatAccessError extends Error{readonly fatal=true;constructor(){super('chat_access_denied');this.name='ChatAccessError'}}

/** Design §3.4: chat requests carry X-MW-Wake-Deadline = now + 250 s. */
export const WAKE_MS=250000;
/** `token`: an ID token the caller already holds (the turn keeps the one it was sent with, batch 2c). `gate` (R106):
 * a 403 is the proposal routes' reviewer or capability refusal for this one action, not a lost session. */
async function send(access:ChatAccess,path:string,{method='GET',body,signal,accept,token:held,gate=false}:{method?:string;body?:unknown;signal?:AbortSignal;accept?:string;token?:string;gate?:boolean}={}){
 let token=held;
 if(token===undefined){if(access.awaitStartup)await access.awaitStartup();token=await access.token()}
 const headers:Record<string,string>={Authorization:'Bearer '+token,'X-MW-Wake-Deadline':String(Date.now()+WAKE_MS)};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(accept)headers.Accept=accept;
 const response=await fetch(new URL(path,access.origin).href,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store',credentials:'omit',redirect:'error'});
 if(response.status===401||(response.status===403&&!gate)){access.authFailure(response.status);throw new ChatAccessError()}
 return response;
}
async function failure(response:Response){
 const data=await response.json().catch(()=>null) as {error?:unknown;detail?:unknown}|null;
 return new ChatHttpError(response.status,typeof data?.error==='string'?data.error:'unavailable',typeof data?.detail==='string'?data.detail:undefined);
}
async function write<T>(access:ChatAccess,path:string,method:string,body:unknown,signal?:AbortSignal):Promise<T>{
 const response=await send(access,path,{method,body,signal});
 if(!response.ok)throw await failure(response);
 return await response.json() as T;
}
/** A cacheable GET: `onCached` paints saved data at once; the result is the network answer (or the saved one offline). */
export async function readChat<T>(access:ChatAccess,path:string,{signal,onCached}:{signal?:AbortSignal;onCached?:(value:T)=>void}={}):Promise<T>{
 try{
  const {response,data}=await readCachedJson<T>(access,path,{signal,onCached,wakeMs:WAKE_MS});
  if(!response.ok){const value=data as {error?:unknown;detail?:unknown}|null;throw new ChatHttpError(response.status,typeof value?.error==='string'?value.error:'unavailable',typeof value?.detail==='string'?value.detail:undefined)}
  return data;
 }catch(error){
  if(error instanceof Error&&error.message==='Read authorization denied')throw new ChatAccessError();
  throw error;
 }
}
const threadPath=(id:string)=>'/api/chat/threads/'+encodeURIComponent(id);
export const listModels=(access:ChatAccess,options:{signal?:AbortSignal;onCached?:(value:ChatModels)=>void}={})=>readChat<ChatModels>(access,'/api/chat/models',options);
export function listThreads(access:ChatAccess,status:'active'|'archived',before:string|null,options:{signal?:AbortSignal;onCached?:(value:Page<ChatThread>)=>void}={}){
 const query=new URLSearchParams({status,limit:'20'});if(before)query.set('before',before);
 return readChat<Page<ChatThread>>(access,'/api/chat/threads?'+query,options);
}
export function listMessages(access:ChatAccess,threadId:string,before:string|null,options:{signal?:AbortSignal;onCached?:(value:Page<ChatMessage>)=>void}={}){
 const query=new URLSearchParams({limit:'50'});if(before)query.set('before',before);
 return readChat<Page<ChatMessage>>(access,threadPath(threadId)+'/messages?'+query,options);
}
export const createThread=(access:ChatAccess,thread:{id:string;model:string})=>write<{item:ChatThread}>(access,'/api/chat/threads','POST',thread).then(value=>value.item);
/** One thread by id, network only (batch 2: a notification tap may open a thread the list page does not hold). */
export async function getThread(access:ChatAccess,id:string,signal?:AbortSignal):Promise<ChatThread>{
 const response=await send(access,threadPath(id),{signal});
 if(!response.ok)throw await failure(response);
 return (await response.json() as {item:ChatThread}).item;
}
export const updateThread=(access:ChatAccess,id:string,patch:{title?:string;model?:string;status?:'active'|'archived'})=>write<{item:ChatThread}>(access,threadPath(id),'PATCH',patch).then(value=>value.item);

/** The presence of the asking device on one running turn (batch 2c, Archie D4). */
export type TurnPresence={arm(token:string):void;stop():void};
const keepaliveFetch=()=>typeof Request==='function'&&'keepalive' in Request.prototype;
/**
 * Reports the asking device leaving its running turn, so the service pushes the reply (Cloud Run never passes the
 * client's close on). On visibilitychange to hidden or pagehide, synchronously and once per hide: the beacon form
 * (text/plain {token, state:'hidden'}, no Authorization, so a CORS simple request without a preflight) as a
 * keepalive fetch, or navigator.sendBeacon where keepalive is missing. On the way back (visible, pageshow) the JSON
 * form clears the mark with a fresh ID token (the turn's token may have expired while away); it runs in the
 * background while the outcome poll starts. Presence is best effort: its failures (a 401 included) are ignored and
 * never reach access.authFailure; the poll reports access problems. Inactive until `arm` hands it the ID token the
 * turn was sent with (getIdToken may not resolve once the page is hidden); stops with `signal` or `stop`. A lost
 * beacon fails safe: no push, and the reply shows on return.
 */
export function turnPresence(access:ChatAccess,threadId:string,messageId:string,signal?:AbortSignal):TurnPresence{
 const path=threadPath(threadId)+'/messages/'+encodeURIComponent(messageId)+'/presence';
 let token:string|null=null,away=false,stopped=false;
 const leave=()=>{
  if(stopped||away||!token)return;
  away=true;
  const url=new URL(path,access.origin).href,body=JSON.stringify({token,state:'hidden'});
  try{
   if(keepaliveFetch()){void fetch(url,{method:'POST',keepalive:true,credentials:'omit',cache:'no-store',headers:{'Content-Type':'text/plain'},body}).catch(()=>{});return}
  }catch{/* fall back to the beacon */}
  try{navigator.sendBeacon?.(url,new Blob([body],{type:'text/plain'}))}catch{/* fail safe: no push */}
 };
 const back=()=>{
  if(stopped||!away||document.visibilityState==='hidden'||!token)return;
  away=false;
  void (async()=>{
   try{
    const fresh=await access.token();
    await fetch(new URL(path,access.origin).href,{method:'POST',body:JSON.stringify({state:'visible'}),cache:'no-store',credentials:'omit',redirect:'error',
     headers:{Authorization:'Bearer '+fresh,'Content-Type':'application/json','X-MW-Wake-Deadline':String(Date.now()+WAKE_MS)}});
   }catch{/* best effort: the poll shows the reply either way */}
  })();
 };
 const visibility=()=>{if(document.visibilityState==='hidden')leave();else back()};
 const stop=()=>{
  if(stopped)return;stopped=true;
  document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',back);signal?.removeEventListener('abort',stop);
 };
 document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);window.addEventListener('pageshow',back);
 signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 return {arm(value){if(!stopped)token=value},stop};
}

export type TurnResult={kind:'stream';complete:boolean;detached?:boolean}|{kind:'completed';user:ChatMessage;assistant:ChatMessage|null};
/**
 * Sends one message and streams its events to `onEvent`. Returns `complete:false` when the body ended (or went
 * silent for `idleMs`; the service pings every 15 s) before `done`: the caller then polls the outcome. A re-POST
 * of a finished message answers JSON `{user, assistant}`. HTTP errors throw ChatHttpError; 401/403 ChatAccessError.
 * The stream is aborted at once when the page is hidden or left (visibilitychange to hidden, pagehide); the result
 * then has `detached`. `presence` (batch 2c) receives the ID token the turn is sent with, before the request.
 */
export async function streamTurn(access:ChatAccess,threadId:string,body:{id:string;text:string;model?:string},onEvent:(name:string,data:unknown)=>void,{signal,idleMs=45000,presence}:{signal?:AbortSignal;idleMs?:number;presence?:TurnPresence}={}):Promise<TurnResult>{
 const controller=new AbortController();let detached=false;
 const forward=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',forward,{once:true});if(signal?.aborted)forward();
 const leave=()=>{if(detached||controller.signal.aborted)return;detached=true;controller.abort(new DOMException('Page hidden','AbortError'))};
 const hidden=()=>{if(document.visibilityState==='hidden')leave()};
 document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',leave);
 let complete=false,timer:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  if(document.visibilityState==='hidden')leave();
  let response:Response;
  try{
   if(access.awaitStartup)await access.awaitStartup();
   const token=await access.token();presence?.arm(token);
   response=await send(access,threadPath(threadId)+'/messages',{method:'POST',body,signal:controller.signal,accept:'text/event-stream',token});
  }catch(error){if(detached&&!signal?.aborted)return {kind:'stream',complete:false,detached:true};throw error}
  if(!response.ok)throw await failure(response);
  if(!/text\/event-stream/i.test(response.headers.get('Content-Type')??'')){
   const value=await response.json() as {user:ChatMessage;assistant:ChatMessage|null};
   return {kind:'completed',user:value.user,assistant:value.assistant??null};
  }
  const parser=createSseParser((name,data)=>{if(name==='done')complete=true;onEvent(name,data)});
  reader=response.body?.getReader();if(!reader)return {kind:'stream',complete:false};
  const stream=reader,decoder=new TextDecoder(),idle=()=>{clearTimeout(timer);timer=setTimeout(()=>{void stream.cancel().catch(()=>{})},idleMs)};
  try{
   idle();
   for(;;){
    const {value,done}=await stream.read();
    if(done)break;
    idle();parser.push(decoder.decode(value,{stream:true}));
    if(complete)break;
   }
  }catch(error){
   if(signal?.aborted)throw error;
   // A dropped connection or a hidden page: the outcome poll decides what happened.
  }finally{parser.end()}
  return {kind:'stream',complete,...(detached&&!complete?{detached:true}:{})};
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',forward);
  document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);
  if(complete||detached)void reader?.cancel().catch(()=>{});
 }
}
/** Resolves once the page is visible (at once when it already is): outcome polling runs only in the foreground. */
export function whenVisible(signal?:AbortSignal):Promise<void>{
 if(document.visibilityState!=='hidden')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const done=()=>{if(document.visibilityState==='hidden')return;cleanup();resolve()};
  const abort=()=>{cleanup();reject(signal?.reason)};
  const cleanup=()=>{document.removeEventListener('visibilitychange',done);window.removeEventListener('pageshow',done);signal?.removeEventListener('abort',abort)};
  document.addEventListener('visibilitychange',done);window.addEventListener('pageshow',done);signal?.addEventListener('abort',abort,{once:true});
 });
}
/** Polls `GET …/messages/:id` every 3 s for up to 5 minutes; 404 means the service never stored the message. */
export function waitForOutcome(access:ChatAccess,threadId:string,messageId:string,signal?:AbortSignal):Promise<PollResult>{
 return pollOutcome(async():Promise<Outcome>=>{
  const response=await send(access,threadPath(threadId)+'/messages/'+encodeURIComponent(messageId),{signal});
  if(response.status===404)return {state:'gone'};
  if(!response.ok)throw await failure(response);
  return classifyOutcome(await response.json());
 },{signal});
}

/** R106 D9/D12: a proposal group by its head id ({id, state, lines}); the service reconciles unknown lines on the read. */
const proposalPath=(threadId:string,id:string)=>threadPath(threadId)+'/proposals/'+encodeURIComponent(id);
export type ProposalGroup={id:string;state:string;lines:ChatProposal[]};
export type GroupLineEvent={index:number;id:string;state:ChatProposal['state'];code?:string;record?:ChatProposal['record']};
async function groupAnswer(response:Response):Promise<ProposalGroup>{
 if(!response.ok)throw await failure(response);
 const value=(await response.json() as {item?:unknown}).item;
 if(!isGroup(value))throw new ChatHttpError(response.status,'unavailable');
 return value;
}
export async function getProposalGroup(access:ChatAccess,threadId:string,id:string,signal?:AbortSignal){return groupAnswer(await send(access,proposalPath(threadId,id),{signal,gate:true}))}
export async function cancelProposalGroup(access:ChatAccess,threadId:string,id:string,signal?:AbortSignal){return groupAnswer(await send(access,proposalPath(threadId,id)+'/cancel',{method:'POST',body:{},signal,gate:true}))}
/**
 * Confirm all (online only: nothing is queued on the device). The service runs the pending lines in order and streams
 * `line` after each, then `group` and `done`. Returns the final group, or null when the stream ended without it (the
 * caller then reads the group, which reconciles; a lost answer is never resent blindly).
 */
export async function confirmProposalGroup(access:ChatAccess,threadId:string,id:string,onLine:(line:GroupLineEvent)=>void,signal?:AbortSignal):Promise<ProposalGroup|null>{
 const response=await send(access,proposalPath(threadId,id)+'/confirm',{method:'POST',body:{},signal,gate:true,accept:'text/event-stream'});
 if(!response.ok)throw await failure(response);
 if(!/text\/event-stream/i.test(response.headers.get('Content-Type')??''))return groupAnswer(response);
 let group:ProposalGroup|null=null,error:string|null=null;
 const parser=createSseParser((name,data)=>{
  const value=data as Record<string,unknown>|null;
  if(name==='line'&&value&&typeof value.id==='string'&&typeof value.state==='string')onLine(value as unknown as GroupLineEvent);
  else if(name==='group'&&value&&isGroup(value.group))group=value.group;
  else if(name==='error')error=typeof value?.code==='string'?value.code:'unavailable';
 });
 const reader=response.body?.getReader();if(!reader)return null;
 const decoder=new TextDecoder();
 try{for(;;){const {value,done}=await reader.read();if(done)break;parser.push(decoder.decode(value,{stream:true}))}}
 catch{/* a dropped stream: the caller reads the group */}
 finally{parser.end()}
 if(error==='proposal_executing')throw new ChatHttpError(409,'proposal_executing');
 return group;
}
