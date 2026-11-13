/** R149: sends "this user has seen the group chat summary up to <time>" to the command service, so the list mark agrees
 * across the user's devices (POST /api/collection/{borrowerId}/chat-seen, V147). A hint, not a business change: no header
 * activity, no pending-queue entry, no sign-out or update block. The request is idempotent and forward only on the
 * server, so sending again is always safe.
 * Unsent values wait in localStorage under mw-credit.chat-seen-unsent:<scope> (in memory when storage is blocked) and
 * are sent again when the page is online, becomes visible or renders a card. */
export type ChatSeenAccess={origin:string;token:()=>Promise<string>};
type SeenMap=Record<string,string>;
const key=(scope:string)=>'mw-credit.chat-seen-unsent:'+scope;
const MAX_UNSENT=200;
// Fallback queue where storage cannot be used, what the server has answered for in this session (taken, or refused for
// good), and one sender per scope.
const memory=new Map<string,SeenMap>(),settled=new Map<string,SeenMap>(),sending=new Map<string,Promise<void>>(),again=new Set<string>();
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):Number.NaN;
/** Whether a known value already covers this version (by time). */
const covers=(value:unknown,version:string)=>{const known=time(value),wanted=time(version);return Number.isFinite(known)&&Number.isFinite(wanted)&&known>=wanted};
const valid=(value:unknown):SeenMap=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>!!entry[0]&&Number.isFinite(time(entry[1])))):{};
/** The unsent values of a scope (storage, else memory). */
export function readUnsentChatSeen(scope:string):SeenMap{
 try{const raw=localStorage.getItem(key(scope));if(raw!==null)return {...valid(JSON.parse(raw)),...memory.get(scope)}}catch{/* fall through to memory */}
 return {...memory.get(scope)};
}
function writeUnsent(scope:string,next:SeenMap):void{
 try{
  if(Object.keys(next).length)localStorage.setItem(key(scope),JSON.stringify(next));else localStorage.removeItem(key(scope));
  memory.delete(scope);
 }catch{if(Object.keys(next).length)memory.set(scope,next);else memory.delete(scope)}
}
/** Queues one shown version unless the server is already known to have it (its own value, or an answered send) or the
 * same or a newer version is already waiting. True when something new waits. */
export function queueChatSeen(scope:string,borrowerId:string,lastMessageAt:string,serverSeenAt?:string|null):boolean{
 if(!borrowerId||!Number.isFinite(time(lastMessageAt))||covers(serverSeenAt,lastMessageAt)||covers(settled.get(scope)?.[borrowerId],lastMessageAt))return false;
 const unsent=readUnsentChatSeen(scope);if(covers(unsent[borrowerId],lastMessageAt))return false;
 const next={...unsent,[borrowerId]:lastMessageAt},ids=Object.keys(next);
 // A bound for a device that stays offline for long: the oldest values go first (they matter least).
 if(ids.length>MAX_UNSENT)for(const id of ids.sort((a,b)=>time(next[a])-time(next[b])).slice(0,ids.length-MAX_UNSENT))delete next[id];
 writeUnsent(scope,next);return true;
}
/** Sends the scope's unsent values, one request each, one pass per scope at a time. 2xx: done. Any other 4xx than 401,
 * 408, 409 and 429 (400, 403, 404, 405, 413, 415, 422, ...): dropped, the server will never take it. Anything else
 * (offline, network error, 401, 408, 409, 429, 5xx): kept, and the pass stops; a later pass tries again. A value the
 * server already answered for in this session is never sent again, even where storage refuses to forget it. A call during a running pass makes that pass run once more when it ends. */
export function flushChatSeen(scope:string,access:ChatSeenAccess,fetcher:typeof fetch=fetch):Promise<void>{
 const running=sending.get(scope);if(running){again.add(scope);return running}
 const pass=(async()=>{
  for(let first=true;first||again.delete(scope);first=false){
   const tried=new Set<string>();
   for(;;){
    if(typeof navigator!=='undefined'&&navigator.onLine===false)return;
    const entry=Object.entries(readUnsentChatSeen(scope)).find(([id,at])=>!tried.has(id+'\n'+at)&&!covers(settled.get(scope)?.[id],at));if(!entry)break;
    const [borrowerId,lastMessageAt]=entry;tried.add(borrowerId+'\n'+lastMessageAt);
    let status=0;
    try{
     const response=await fetcher(access.origin+'/api/collection/'+encodeURIComponent(borrowerId)+'/chat-seen',{method:'POST',headers:{Authorization:'Bearer '+await access.token(),'Content-Type':'application/json'},body:JSON.stringify({lastMessageAt:new Date(lastMessageAt).toISOString()}),cache:'no-store',credentials:'omit',redirect:'error'});
     status=response.status;
    }catch{return}
    const done=status>=200&&status<300;
    if(!done&&!(status>=400&&status<500&&![401,408,409,429].includes(status)))return;
    settled.set(scope,{...settled.get(scope),[borrowerId]:lastMessageAt});
    // Remove only the value that was sent: a newer version queued meanwhile stays and is sent next.
    const current=readUnsentChatSeen(scope);
    if(current[borrowerId]===lastMessageAt){delete current[borrowerId];writeUnsent(scope,current)}
   }
  }
 })().catch(()=>{}).finally(()=>{sending.delete(scope);again.delete(scope)});
 sending.set(scope,pass);return pass;
}
/** The card rendered this version: queue it if the server does not have it, then send whatever waits. */
export function syncChatSeen(scope:string,access:ChatSeenAccess,borrowerId:string,lastMessageAt:string,serverSeenAt?:string|null,fetcher:typeof fetch=fetch):Promise<void>{
 queueChatSeen(scope,borrowerId,lastMessageAt,serverSeenAt);
 return Object.keys(readUnsentChatSeen(scope)).length?flushChatSeen(scope,access,fetcher):Promise.resolve();
}
