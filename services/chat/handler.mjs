/** R090 chat HTTP routes (design §3.3-§3.5; Archie resolutions 8 and 12). Every route except /health: Firebase ID
 * token (revocation checked on POST and PATCH), the environment's two web origins, a Partner with 'read' in the
 * capability policy, and per-Partner scoping (another Partner's id answers 404). A turn is one request: POST a
 * message, then Server-Sent Events until done; a dropped connection does not abort the turn, which is journaled
 * and read back with GET .../messages/:messageId. Batch 2c: the PWA reports leaving a running turn with
 * POST .../messages/:messageId/presence (a text/plain beacon carrying the ID token, or JSON with Authorization); the
 * completion reads that mark in its transaction and a stream whose device left records the chat reply push. */
import {beginRequest} from '../lib/http-boundary.mjs';
import {UUID_V4} from '../lib/ids.mjs';
import {availableModel,providerFor} from './config.mjs';
import {storeError} from './store.mjs';
import {runTurn,failureText} from './engine.mjs';

export const BODY_LIMIT=65536;
export const PING_MS=15000;
/** The presence body: {state} or the beacon's {token, state}; a Firebase ID token is about 1 KB. */
export const PRESENCE_LIMIT=16384;
const THREAD=/^\/api\/chat\/threads\/([0-9a-f-]{36})$/;
const MESSAGES=/^\/api\/chat\/threads\/([0-9a-f-]{36})\/messages$/;
const MESSAGE=/^\/api\/chat\/threads\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/;
const PRESENCE=/^\/api\/chat\/threads\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/presence$/;
const JSON_TYPE=/^application\/json(?:;|$)/i,TEXT_TYPE=/^text\/plain(?:;|$)/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** Well-formed text without C0 controls other than newline and tab, 1..max characters. */
export const validText=(v,max)=>typeof v==='string'&&v.isWellFormed()&&!/[\u0000-\u0008\u000b-\u001f]/.test(v)&&[...v].length>=1&&[...v].length<=max;
const validTitle=v=>validText(v,120)&&!/[\n\t]/.test(v)&&v===v.trim();
class RequestError extends Error {constructor(status,error,detail){super(error);this.status=status;this.error=error;this.detail=detail;}}
const invalid=(detail)=>new RequestError(400,'invalid_request',detail);
/** Query parameters: only the listed keys, each at most once. */
function query(url,allowed){
 const keys=[...url.searchParams.keys()];
 if(keys.some(k=>!allowed.includes(k))||allowed.some(k=>url.searchParams.getAll(k).length>1))throw invalid();
 return Object.fromEntries(allowed.map(k=>[k,url.searchParams.get(k)]));
}
function limitParam(value,fallback){
 if(value===null)return fallback;
 if(!/^[1-9][0-9]?$/.test(value)||Number(value)>50)throw invalid();
 return Number(value);
}
const stripCursor=({sortAt:_sortAt,...item})=>item;

/** @param {{config:any,verifyPrincipal:Function,store:ReturnType<import('./store.mjs').createChatStore>,createTools:(actor:any)=>any,transport:any,
 *  completionLogger?:(record:object)=>void,log?:(record:object)=>void,now?:()=>number,pingMs?:number}} options */
export function createChatHandler({config,verifyPrincipal,store,createTools,transport,completionLogger=()=>{},log=()=>{},now=Date.now,pingMs=PING_MS}){
 const chat=config.chat;
 if(!chat||!Array.isArray(config.origins)||config.origins.length<1)throw Error('Invalid chat handler configuration');
 const models=()=>({version:1,default:chat.default,models:chat.models.map(m=>({id:m.id,label:m.label,available:m.available,...(m.reason?{reason:m.reason}:{})}))});
 /** A JSON body (type: the accepted Content-Type; the presence beacon sends JSON text as text/plain). */
 async function readBody(req,{type=JSON_TYPE,limit=BODY_LIMIT}={}){
  if(!type.test(req.headers['content-type']??''))throw invalid();
  if(Number(req.headers['content-length']??0)>limit)throw invalid('body_too_large');
  req.setTimeout?.(10000,()=>req.destroy());
  const chunks=[];let size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>limit)throw invalid('body_too_large');chunks.push(chunk);}}
  finally{req.setTimeout?.(0);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{throw invalid();}
 }
 // R102: Claude runs at the fixed effort medium (claude.mjs); Gemini at the configured thinking level.
 const thinkingLevel=model=>providerFor(model)==='claude'?'MEDIUM':chat.thinkingLevel;
 const modelOrFail=id=>{if(typeof id!=='string'||!availableModel(chat,id))throw new RequestError(400,'model_unavailable');return id;};

 /**
  * One turn after the claim: runs the engine, journals the outcome, streams events through emit. stream: the request
  * was a stream, so a completion whose device reported leaving (detached in the database, batch 2c) records the chat
  * reply push; ?stream=0 never does.
  */
 async function turn({principal,actor,thread,claim,text,emit,stream=false}){
  const started=now();
  const model=claim.thread.model,messageId=claim.message.id;
  let outcome;
  const none={usage:{promptTokens:0,outputTokens:0,thoughtsTokens:0,cachedTokens:0},rounds:0,attempts:0,toolCalls:[]};
  if(!availableModel(chat,model))outcome={ok:false,code:'MODEL_UNAVAILABLE',detail:'model not listed or unavailable',...none};
  else{
   try{outcome=await runTurn({chat,model,transport,tools:createTools(actor),history:claim.history,seed:claim.seed,partnerLanguage:claim.partnerLanguage,text,emit,now,started});}
   catch(error){outcome={ok:false,code:'INTERNAL',detail:String(error?.name??'INTERNAL').slice(0,200),...none};}
  }
  const assistant={status:outcome.ok?'ok':'failed',text:outcome.ok?outcome.text:failureText(claim.partnerLanguage),model,thinkingLevel:thinkingLevel(model),
   rounds:outcome.rounds,attempts:outcome.attempts,...outcome.usage,latencyMs:Math.max(0,Math.round(now()-started)),errorCode:outcome.ok?null:outcome.code};
  log({event:'chat_turn',thread,messageId,model,ok:outcome.ok,code:outcome.ok?'ok':outcome.code,detail:outcome.ok?undefined:outcome.detail,rounds:outcome.rounds,attempts:outcome.attempts,
   epoch:outcome.epoch,tools:outcome.toolCalls.length,...outcome.usage,latencyMs:assistant.latencyMs});
  try{
   const {message:row,detached}=await store.complete(principal,messageId,assistant,outcome.ok?outcome.history:null,outcome.toolCalls,stream?{thread}:null);
   // Diagnostics for the reply push: whether the asking device had reported leaving when the reply committed.
   log({event:'chat_turn_attachment',thread,messageId,stream,detached});
   if(outcome.ok)emit('message',row);
   else emit('error',{code:outcome.code});
  }catch(error){
   // A late completion after a re-claim fails on UNIQUE (thread_id, seq); identity loss fails the commit too.
   log({event:'chat_turn_complete_failed',thread,messageId,sqlstate:typeof error?.code==='string'?error.code:undefined,code:error?.message==='access_denied'?'access_denied':'INTERNAL'});
   await release({principal,thread,claim,started,usage:assistant,cause:error,stream});
   emit('error',{code:'INTERNAL'});
  }
 }
 /**
  * A commit that failed for any other reason (for example a history row over the 1 MiB CHECK) would leave the claim
  * holding the thread for 5 minutes: try once to store a failed reply (INTERNAL) with no history and no tool rows.
  * Not after a late completion (23505: another claim owns the turn) or a lost identity (42501 / access_denied).
  */
 /** @param {{principal:any,thread:string,claim:any,started:number,usage?:Record<string,any>,cause:any,stream?:boolean}} input */
 async function release({principal,thread,claim,started,usage={},cause,stream=false}){
  if(cause?.code==='23505'||cause?.code==='42501'||cause?.message==='access_denied')return false;
  const messageId=claim.message.id;
  const failed={status:'failed',text:failureText(claim.partnerLanguage),model:claim.thread.model,thinkingLevel:thinkingLevel(claim.thread.model),
   rounds:usage.rounds??0,attempts:usage.attempts??0,promptTokens:usage.promptTokens??0,outputTokens:usage.outputTokens??0,thoughtsTokens:usage.thoughtsTokens??0,cachedTokens:usage.cachedTokens??0,
   latencyMs:Math.max(0,Math.round(now()-started)),errorCode:'INTERNAL'};
  try{const {detached}=await store.complete(principal,messageId,failed,null,[],stream?{thread}:null);log({event:'chat_turn_released',thread,messageId,detached});return true;}
  catch(error){log({event:'chat_turn_release_failed',thread,messageId,sqlstate:typeof error?.code==='string'?error.code:undefined});return false;}
 }

 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://local.invalid');}catch{res.statusCode=404;return res.end();}
  if(req.method==='GET'&&req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true}));}
  let code='ok',route='unknown';
  const boundary=beginRequest(req,res,{origins:config.origins,methods:['GET','POST','PATCH'],headers:['Authorization','Content-Type','Accept','X-MW-Wake-Deadline'],logger:completionLogger,
   record:({requestId,status})=>({event:'chat_request',requestId,route,method:['GET','POST','PATCH','OPTIONS'].includes(req.method)?req.method:'OTHER',status,code,durationMs:boundary.durationMs()})});
  const reply=(status,value)=>{code=status<400?'ok':value?.error??'unavailable';if(!res.headersSent)res.statusCode=status;res.end(JSON.stringify(value));};
  if(boundary.originDenied)return reply(403,{error:'access_denied'});
  const path=url.pathname;
  route=path==='/api/chat/models'?'models':path==='/api/chat/threads'?'threads':THREAD.test(path)?'thread':MESSAGES.test(path)?'messages':MESSAGE.test(path)?'message':PRESENCE.test(path)?'presence':'unknown';
  if(route==='unknown')return reply(404,{error:'not_found'});
  if(req.method==='OPTIONS')return boundary.preflight()?reply(204,{}):reply(403,{error:'access_denied'});
  const allowed={models:['GET'],threads:['GET','POST'],thread:['GET','PATCH'],messages:['GET','POST'],message:['GET'],presence:['POST']}[route];
  if(!allowed.includes(req.method))return reply(404,{error:'not_found'});
  // Batch 2c presence: the body comes first, because the hidden beacon carries the ID token in it. The beacon form
  // (text/plain {token, state}, no Authorization) is a CORS simple request: no preflight, which Safari does not
  // reliably send for a keepalive request; the token is verified exactly as the header token.
  let authorization=req.headers.authorization,presence=null;
  if(route==='presence'){
   try{
    query(url,[]);
    const beacon=TEXT_TYPE.test(req.headers['content-type']??'');
    const body=await readBody(req,{type:beacon?TEXT_TYPE:JSON_TYPE,limit:PRESENCE_LIMIT});
    const keys=plain(body)?Object.keys(body).sort().join():'';
    if(keys!==(beacon?'state,token':'state')||!['hidden','visible'].includes(body.state))throw invalid();
    if(beacon){
     if(authorization!==undefined||typeof body.token!=='string'||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.token)||body.token.length>8192)throw invalid();
     authorization=`Bearer ${body.token}`;
    }
    presence={state:body.state,form:beacon?'beacon':'json'};
   }catch(error){
    if(error instanceof RequestError)return reply(error.status,{error:error.error,...(error.detail?{detail:error.detail}:{})});
    return reply(400,{error:'invalid_request'});
   }
  }
  // R078: reads skip the revocation round trip; POST and PATCH keep it. A presence mark is a read-class side effect.
  let principal;
  try{principal=req.method==='GET'||route==='presence'?await verifyPrincipal(authorization,{checkRevoked:false}):await verifyPrincipal(authorization);}
  catch{return reply(401,{error:'unauthorized',code:'session_invalid'});}
  if(!principal?.ok){
   const status=[401,403,503].includes(principal?.status)?principal.status:401;
   return reply(status,{error:status===401?'unauthorized':status===403?'access_denied':'unavailable',code:typeof principal?.code==='string'?principal.code:'session_invalid'});
  }
  try{
   const wake=req.headers['x-mw-wake-deadline'];
   if(wake!==undefined&&(typeof wake!=='string'||!/^\d{13}$/.test(wake)))throw invalid();
   if(route==='models'){
    query(url,[]);
    const last=await store.modelsDefault(principal);
    const value=models();
    if(last&&availableModel(chat,last))value.default=last;
    return reply(200,value);
   }
   if(route==='threads'&&req.method==='GET'){
    const q=query(url,['status','before','limit']);
    const status=q.status??'active';if(!['active','archived'].includes(status))throw invalid();
    let before=null;
    if(q.before!==null){
     try{before=Buffer.from(q.before,'base64url').toString('utf8');}catch{throw invalid();}
     if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(before)||!Number.isFinite(Date.parse(before))||Buffer.from(before).toString('base64url')!==q.before)throw invalid();
    }
    const limit=limitParam(q.limit,20);
    const rows=await store.threads(principal,{status,before,limit});
    const items=rows.slice(0,limit);
    return reply(200,{items:items.map(stripCursor),nextCursor:rows.length>limit?Buffer.from(items.at(-1).sortAt).toString('base64url'):null});
   }
   if(route==='threads'){
    query(url,[]);
    const body=await readBody(req);
    if(!plain(body)||Object.keys(body).some(k=>!['id','model','title'].includes(k))||typeof body.id!=='string'||!UUID_V4.test(body.id)
     ||(body.title!==undefined&&!validTitle(body.title)))throw invalid();
    modelOrFail(body.model);
    const result=await store.createThread(principal,{id:body.id,model:body.model,...(body.title!==undefined?{title:body.title}:{})});
    return reply(result.created?201:200,{item:result.item});
   }
   if(route==='thread'){
    query(url,[]);
    const id=THREAD.exec(path)[1];if(!UUID_V4.test(id))throw invalid();
    // Batch 2: one thread by id (the PWA opens a notification's thread before its list page has it).
    if(req.method==='GET')return reply(200,{item:await store.thread(principal,id)});
    const body=await readBody(req);
    if(!plain(body)||!Object.keys(body).length||Object.keys(body).some(k=>!['title','model','status'].includes(k))
     ||(body.title!==undefined&&!validTitle(body.title))||(body.status!==undefined&&!['active','archived'].includes(body.status)))throw invalid();
    if(body.model!==undefined)modelOrFail(body.model);
    return reply(200,{item:await store.updateThread(principal,id,body)});
   }
   if(route==='messages'&&req.method==='GET'){
    const thread=MESSAGES.exec(path)[1];if(!UUID_V4.test(thread))throw invalid();
    const q=query(url,['before','limit']);
    let before=null;
    if(q.before!==null){if(!/^[1-9][0-9]{0,8}$/.test(q.before))throw invalid();before=Number(q.before);}
    const limit=limitParam(q.limit,50);
    const rows=await store.messages(principal,thread,{before,limit});
    const items=rows.slice(0,limit).toReversed();
    return reply(200,{items,nextCursor:rows.length>limit?String(items[0].seq):null});
   }
   if(route==='presence'){
    const [,thread,id]=PRESENCE.exec(path);if(!UUID_V4.test(thread)||!UUID_V4.test(id))throw invalid();
    const value=await store.presence(principal,thread,id,presence.state);
    log({event:'chat_turn_presence',thread,messageId:id,state:presence.state,form:presence.form,result:value?.state,detached:value?.detached});
    code='ok';if(!res.headersSent)res.statusCode=204;res.removeHeader('Content-Type');return res.end();
   }
   if(route==='message'){
    query(url,[]);
    const [,thread,id]=MESSAGE.exec(path);if(!UUID_V4.test(thread)||!UUID_V4.test(id))throw invalid();
    return reply(200,await store.message(principal,thread,id));
   }
   // POST /api/chat/threads/:id/messages
   const thread=MESSAGES.exec(path)[1];if(!UUID_V4.test(thread))throw invalid();
   const q=query(url,['stream']);if(q.stream!==null&&q.stream!=='0')throw invalid();
   const body=await readBody(req);
   if(!plain(body)||Object.keys(body).some(k=>!['id','text','model'].includes(k))||typeof body.id!=='string'||!UUID_V4.test(body.id)||!validText(body.text,4000))throw invalid();
   if(body.model!==undefined)modelOrFail(body.model);
   const begun=await store.begin(principal,thread,{id:body.id,text:body.text,model:body.model});
   const claim=begun.value;
   if(claim.state==='completed')return reply(200,{user:claim.user,assistant:claim.assistant});
   const stream=q.stream!=='0'&&/text\/event-stream/i.test(req.headers.accept??'');
   if(!stream){
    let failure=null;
    await turn({principal,actor:begun.actor,thread,claim,text:body.text,emit:(name,data)=>{if(name==='error')failure=data.code;},stream:false});
    const outcome=await store.message(principal,thread,body.id);
    if(failure)code=failure;
    return reply(200,outcome);
   }
   // Server-Sent Events: the turn runs to completion even when the client goes away. Whether the device left is not
   // read from the connection (Cloud Run's front end does not pass the client's close on): the PWA's presence beacon
   // marks the turn in the database (batch 2c).
   res.statusCode=200;
   res.setHeader('Content-Type','text/event-stream; charset=utf-8');
   res.setHeader('Cache-Control','no-store');
   res.setHeader('X-Accel-Buffering','no');
   res.flushHeaders?.();
   const write=text=>{if(!res.destroyed&&!res.writableEnded)res.write(text);};
   const emit=(name,data)=>{if(name==='error')code=data.code;write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);};
   const ping=setInterval(()=>write(': ping\n\n'),pingMs);
   try{
    emit('accepted',{messageId:claim.message.id,seq:claim.message.seq,model:claim.thread.model});
    await turn({principal,actor:begun.actor,thread,claim,text:body.text,emit,stream:true});
   }catch(error){
    log({event:'chat_turn_failed',thread,messageId:claim.message.id,reason:error?.name});
    await release({principal,thread,claim,started:now(),cause:error,stream:true});
    emit('error',{code:'INTERNAL'});
   }finally{
    clearInterval(ping);
    emit('done',{});
    if(!res.writableEnded)res.end();
   }
  }catch(error){
   if(error instanceof RequestError)return reply(error.status,{error:error.error,...(error.detail?{detail:error.detail}:{})});
   const mapped=storeError(error);
   if(mapped.status===503)log({event:'chat_request_failed',route,requestId:boundary.requestId,sqlstate:typeof error?.code==='string'?error.code:undefined,reason:error?.name});
   return reply(mapped.status,{error:mapped.error,...(mapped.detail?{detail:mapped.detail}:{})});
  }
 };
}
