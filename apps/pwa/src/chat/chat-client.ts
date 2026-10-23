// R090 chat client (design §6.3). Reads (models, threads, messages) go through read-cache so the last opened thread
// and the list show offline; turns stream over fetch (EventSource cannot send the ID token) and a stream that ends
// without `done` switches to polling the turn's outcome.
import {readCachedJson} from '../read-cache';
import type {OwnerOfflineRepository} from '../owner-offline';
import {createSseParser,classifyOutcome,pollOutcome,type ChatMessage,type Outcome,type PollResult} from './chat-protocol';

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
async function send(access:ChatAccess,path:string,{method='GET',body,signal,accept}:{method?:string;body?:unknown;signal?:AbortSignal;accept?:string}={}){
 if(access.awaitStartup)await access.awaitStartup();
 const token=await access.token();
 const headers:Record<string,string>={Authorization:'Bearer '+token,'X-MW-Wake-Deadline':String(Date.now()+WAKE_MS)};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(accept)headers.Accept=accept;
 const response=await fetch(new URL(path,access.origin).href,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store',credentials:'omit',redirect:'error'});
 if(response.status===401||response.status===403){access.authFailure(response.status);throw new ChatAccessError()}
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
export const updateThread=(access:ChatAccess,id:string,patch:{title?:string;model?:string;status?:'active'|'archived'})=>write<{item:ChatThread}>(access,threadPath(id),'PATCH',patch).then(value=>value.item);

export type TurnResult={kind:'stream';complete:boolean}|{kind:'completed';user:ChatMessage;assistant:ChatMessage|null};
/**
 * Sends one message and streams its events to `onEvent`. Returns `complete:false` when the body ended (or went
 * silent for `idleMs`; the service pings every 15 s) before `done`: the caller then polls the outcome. A re-POST
 * of a finished message answers JSON `{user, assistant}`. HTTP errors throw ChatHttpError; 401/403 ChatAccessError.
 */
export async function streamTurn(access:ChatAccess,threadId:string,body:{id:string;text:string;model?:string},onEvent:(name:string,data:unknown)=>void,{signal,idleMs=45000}:{signal?:AbortSignal;idleMs?:number}={}):Promise<TurnResult>{
 const response=await send(access,threadPath(threadId)+'/messages',{method:'POST',body,signal,accept:'text/event-stream'});
 if(!response.ok)throw await failure(response);
 if(!/text\/event-stream/i.test(response.headers.get('Content-Type')??'')){
  const value=await response.json() as {user:ChatMessage;assistant:ChatMessage|null};
  return {kind:'completed',user:value.user,assistant:value.assistant??null};
 }
 let complete=false,timer:ReturnType<typeof setTimeout>|undefined;
 const parser=createSseParser((name,data)=>{if(name==='done')complete=true;onEvent(name,data)});
 const reader=response.body?.getReader();if(!reader)return {kind:'stream',complete:false};
 const decoder=new TextDecoder(),idle=()=>{clearTimeout(timer);timer=setTimeout(()=>{void reader.cancel().catch(()=>{})},idleMs)};
 try{
  idle();
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   idle();parser.push(decoder.decode(value,{stream:true}));
   if(complete)break;
  }
 }catch(error){
  if(signal?.aborted)throw error;
  // A dropped connection: the outcome poll decides what happened.
 }finally{
  clearTimeout(timer);parser.end();
  if(complete)void reader.cancel().catch(()=>{});
 }
 return {kind:'stream',complete};
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
