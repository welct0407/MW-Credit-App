// Self-contained (no relative imports) so unit tests can load it directly.
/** R072 troubleshooting: the last 25 client events, in memory and mirrored to this tab's sessionStorage. Read only by the encrypted troubleshooting file. */
export type ClientEventKind='error'|'rejection'|'sync-blocked'|'dataset-failed'|'read-failure'|'sign-in'|'startup'|'reconcile-match'|'reconcile-mismatch';
export type ClientEvent={at:string;kind:ClientEventKind;code?:string;ref?:string;message?:string;stack?:string};
export const CLIENT_EVENT_LIMIT=25,CLIENT_EVENT_TEXT_BYTES=2048;
const storageKey='mw-credit-client-events',encoder=new TextEncoder(),marker='…[truncated]';
/** Cuts text to at most `limit` UTF-8 bytes (Thai is 3 bytes a character) on a character boundary. */
export function clipText(value:unknown,limit=CLIENT_EVENT_TEXT_BYTES):string|undefined{
 if(value===undefined||value===null||value==='')return undefined;
 const text=String(value);if(encoder.encode(text).length<=limit)return text;
 const room=limit-encoder.encode(marker).length;let bytes=0,end=0;
 for(const character of text){const size=encoder.encode(character).length;if(bytes+size>room)break;bytes+=size;end+=character.length}
 return text.slice(0,end)+marker;
}
const storage=()=>{try{return typeof sessionStorage==='undefined'?null:sessionStorage}catch{return null}};
let events:ClientEvent[]=(()=>{try{const saved=JSON.parse(storage()?.getItem(storageKey)??'[]');return Array.isArray(saved)?saved.slice(-CLIENT_EVENT_LIMIT):[]}catch{return []}})();
export function recordClientEvent(event:Omit<ClientEvent,'at'>&{at?:string}){
 const entry:ClientEvent={at:event.at??new Date().toISOString(),kind:event.kind};
 for(const key of ['code','ref','message','stack'] as const){const value=clipText(event[key]);if(value!==undefined)entry[key]=value}
 events=[...events,entry].slice(-CLIENT_EVENT_LIMIT);
 try{storage()?.setItem(storageKey,JSON.stringify(events))}catch{/* The in-memory log still holds it. */}
}
export const clientEvents=():ClientEvent[]=>events.map(event=>({...event}));
export function clearClientEvents(){events=[];try{storage()?.removeItem(storageKey)}catch{}}
const errorFields=(value:unknown)=>value instanceof Error?{message:value.name+': '+value.message,stack:value.stack}:{message:typeof value==='string'?value:(()=>{try{return JSON.stringify(value)}catch{return String(value)}})()};
let installed=false;
export function installClientEventListeners(target:Window=window){
 if(installed)return;installed=true;
 target.addEventListener('error',event=>{if(!(event instanceof ErrorEvent))return;recordClientEvent({kind:'error',ref:event.filename?event.filename+':'+event.lineno+':'+event.colno:undefined,...(event.error?errorFields(event.error):{message:event.message})})});
 target.addEventListener('unhandledrejection',event=>recordClientEvent({kind:'rejection',...errorFields(event.reason)}));
 target.addEventListener('mw-offline-sync-outcome',event=>{const detail=(event as CustomEvent).detail;if(detail?.kind==='blocked')recordClientEvent({kind:'sync-blocked',code:detail.code??detail.data?.code,ref:detail.requestId})});
 target.addEventListener('mw-offline-dataset-failed',event=>recordClientEvent({kind:'dataset-failed',code:(event as CustomEvent).detail?.domain}));
}
if(typeof window!=='undefined'&&typeof window.addEventListener==='function')installClientEventListeners();
