/** R106 D1: the chat service's only write path, the environment's command service over HTTPS. Every request forwards
 * the Partner's own Firebase ID token (Authorization: Bearer, verified and journaled as the actor by the command
 * service), sends no Origin header (server to server, outside the browser CORS boundary) and passes the PWA's
 * X-MW-Wake-Deadline when the chat request carried one; each request aborts after 15 s. The command service keeps its
 * authorization, idempotency (requestId), optimistic versions, audit and busy/reconcile protocol unchanged. */
export const COMMAND_TIMEOUT_MS=15000;
const TOKEN=/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** A transport failure, or an answer that is not the command service's JSON: nothing is known about the effect. */
export class CommandUnavailable extends Error {
 constructor(reason='command_unavailable'){super(reason);this.name='CommandUnavailable';this.reason=reason;}
}
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** @param {{baseUrl:string,authorization:string,wakeDeadline?:string,fetch?:typeof globalThis.fetch,timeoutMs?:number,sleep?:(ms:number)=>Promise<void>}} options */
export function createCommandClient({baseUrl,authorization,wakeDeadline,fetch:request=globalThis.fetch,timeoutMs=COMMAND_TIMEOUT_MS,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(typeof baseUrl!=='string'||!/^https?:\/\/[^/]+$/.test(baseUrl)||typeof authorization!=='string'||!TOKEN.test(authorization))throw Error('Invalid command client');
 /** One request: {status, data} for any JSON object answer (errors included); CommandUnavailable otherwise.
  * @param {string} method @param {string} path @param {unknown} [body] @returns {Promise<{status:number,data:any}>} */
 async function call(method,path,body){
  if(typeof path!=='string'||!path.startsWith('/api/'))throw Error('Invalid command path');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const headers={Authorization:authorization,Accept:'application/json',...(wakeDeadline?{'X-MW-Wake-Deadline':wakeDeadline}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})};
   let response;
   try{response=await request(baseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,redirect:'error',cache:'no-store'});}
   catch{throw new CommandUnavailable(controller.signal.aborted?'timeout':'network');}
   /** @type {any} */let data;try{data=await response.json();}catch{throw new CommandUnavailable(controller.signal.aborted?'timeout':'malformed');}
   if(!plain(data)||!Number.isInteger(response.status))throw new CommandUnavailable('malformed');
   return {status:response.status,data};
  }finally{clearTimeout(timer);}
 }
 const statusPath=(kind,id)=>(kind==='payment'?'/api/payment-commands/':'/api/operations/')+id;
 const submitPath=kind=>kind==='payment'?'/api/payment-commands':'/api/operations';
 return {
  get:path=>call('GET',path),
  post:(path,body)=>call('POST',path,body),
  /** The command's journal state: {kind:'recorded',originalOutcome} | {kind:'unresolved'} | {kind:'conflict'}. */
  async status(kind,id){
   const {status,data}=await call('GET',statusPath(kind,id));
   if(status===200&&['recorded','unresolved','conflict'].includes(data.kind))return data;
   if(status===401||status===403)return {kind:'refused',status,code:typeof data.code==='string'?data.code:'access_denied'};
   throw new CommandUnavailable('status_unavailable');
  },
  /**
   * POST the exact command once, resending the same requestId after 409 command_busy (nothing applied) up to twice
   * (1 s, 2 s). Returns {result:'recorded',data} | {result:'rejected',status,code,data} | {result:'busy'} |
   * {result:'unknown',reason}: a timeout, network error, 5xx or unreadable answer after the POST is unknown.
   */
  async submit(kind,commandText){
   for(let attempt=0;;attempt++){
    let answer;
    try{answer=await call('POST',submitPath(kind),JSON.parse(commandText));}
    catch(error){if(error instanceof CommandUnavailable)return {result:'unknown',reason:error.reason};throw error;}
    const {status,data}=answer;
    if(data.kind==='recorded'&&plain(data.originalOutcome))return {result:'recorded',status,data};
    if(status===409&&data.code==='command_busy'){if(attempt<2){await sleep(attempt===0?1000:2000);continue;}return {result:'busy'};}
    if(status>=500)return {result:'unknown',reason:typeof data.code==='string'?data.code:'unavailable'};
    if(data.kind==='conflict')return {result:'rejected',status,code:'command_conflict',data};
    return {result:'rejected',status,code:typeof data.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(data.code)?data.code:'request_rejected',data};
   }
  },
 };
}
