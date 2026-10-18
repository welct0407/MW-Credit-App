// Self-contained (no relative imports) so unit tests can load it directly.
/** R072 troubleshooting payload (schemaVersion 1): pure helpers. The payload is only ever written encrypted (troubleshooting-envelope.ts). */
export type PendingRowInput={key:string;savedAt:number;value?:any;sync?:{state?:string;code?:string;outcome?:any;attempted?:boolean;deferred?:boolean;status?:number}};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
export const sha256Hex=async(value:string|ArrayBuffer)=>hex(await globalThis.crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value));
/** Never the raw uid: the first 16 hex of its sha256. */
export const accountHash=async(uid:string)=>(await sha256Hex(uid)).slice(0,16);
/** yyyymmdd-hhmm in Asia/Bangkok (UTC+7, no daylight saving). */
export function troubleshootingFileName(environment:string,date=new Date()){const local=new Date(date.getTime()+7*3600000).toISOString();return 'mw-credit-troubleshooting-'+environment+'-'+local.slice(0,10).replaceAll('-','')+'-'+local.slice(11,16).replace(':','')+'.txt'}
/** A saved change that did not go through: blocked, or carrying a recorded error code. */
export const failedSave=(row:PendingRowInput)=>row.sync?.state==='blocked'||!!row.sync?.code;
const operationOf=(value:any)=>typeof value?.command?.operation==='string'?value.command.operation:typeof value?.domain==='string'?value.domain:typeof value?.operation==='string'?value.operation:'unknown';
const iso=(time:number)=>Number.isFinite(time)?new Date(time).toISOString():null;
/** Receipt images and any other Blob become {type,size,sha256}; the bytes are never included. */
export async function describeBlobs(value:unknown):Promise<unknown>{
 if(typeof Blob!=='undefined'&&value instanceof Blob)return {type:value.type,size:value.size,sha256:await sha256Hex(await value.arrayBuffer())};
 if(value instanceof ArrayBuffer||ArrayBuffer.isView(value))return {type:'binary',size:value.byteLength};
 if(Array.isArray(value))return Promise.all(value.map(describeBlobs));
 if(value&&typeof value==='object'){const entries=await Promise.all(Object.entries(value).map(async([key,item])=>[key,await describeBlobs(item)] as const));return Object.fromEntries(entries)}
 return value;
}
/** Signed in: failed saves carry their full saved content and sync record; untouched queued rows only a summary. */
export async function describePendingRows(rows:PendingRowInput[],now=Date.now()){
 const failed=[],queued=[];
 for(const row of rows){
  const sync=row.sync??{},base={requestId:row.key.replace(/^pending:/,''),savedAt:iso(row.savedAt),ageMinutes:Math.round((now-row.savedAt)/60000)};
  if(failedSave(row))failed.push({...base,value:await describeBlobs(row.value),sync:{state:sync.state??null,code:sync.code??null,status:sync.status??sync.outcome?.status??null,outcome:await describeBlobs(sync.outcome??null),attempted:sync.attempted??null,deferred:sync.deferred??null}});
  else queued.push({operation:operationOf(row.value),state:sync.state??'queued',savedAt:base.savedAt,ageMinutes:base.ageMinutes});
 }
 return {failed,queued};
}
/** Signed out: metadata only, never the saved content. */
export const signedOutPendingRow=(row:PendingRowInput)=>({savedAt:iso(row.savedAt),operation:operationOf(row.value),state:row.sync?.state??'queued',code:row.sync?.code??null,attempted:row.sync?.attempted??null,deferred:row.sync?.deferred??null});
/** Field names compared lower-case without - and _: any name containing these parts, or exactly one of the push/config names. `session` itself (the section) stays. */
const sensitiveParts=['token','secret','password','passwd','apikey','authorization','cookie','privatekey','credential'],sensitiveNames=['auth','endpoint','p256dh','subscription','subscriptionid','firebase','firebaseconfig'];
const sensitiveKey=(key:string)=>{const name=key.toLowerCase().replace(/[-_\s]/g,'');return sensitiveParts.some(part=>name.includes(part))||sensitiveNames.includes(name)};
const patterns:[RegExp,string][]=[
 [/eyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}(?:\.[A-Za-z0-9_-]*)?/g,'[redacted-token]'],
 [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [redacted]'],
 [/AIza[0-9A-Za-z_-]{10,}/g,'[redacted-key]'],
 [/\bAMf-[A-Za-z0-9_-]{20,}/g,'[redacted-token]'],
 [/([?&#](?:key|api_?key|token|access_token|id_token|refresh_token|auth)=)[^&#\s"'<>]+/gi,'$1[redacted]'],
 [/https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]*push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\/[^\s"'<>]*/gi,'[redacted-push-endpoint]'],
 [/https?:\/\/[a-z0-9.-]+\.run\.app/gi,'[redacted-origin]'],
 [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[redacted-email]'],
 [/[A-Za-z0-9_-]{120,}/g,'[redacted-long-value]'],
];
/** Final pass over every string: tokens, keys, push endpoints, API origins, emails and the given secrets (raw uid, namespace names). */
export function scrubTroubleshooting<T>(value:T,secrets:(string|null|undefined)[]=[]):T{
 const known=[...new Set(secrets.filter((secret):secret is string=>typeof secret==='string'&&secret.length>=4))].sort((a,b)=>b.length-a.length);
 const text=(input:string)=>{let output=input;for(const secret of known)output=output.split(secret).join('[redacted-account]');for(const [pattern,replacement] of patterns)output=output.replace(pattern,replacement);return output};
 const visit=(item:unknown):unknown=>typeof item==='string'?text(item):Array.isArray(item)?item.map(visit):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).map(([key,child])=>[text(key),sensitiveKey(key)&&child!==null&&child!==undefined?'[redacted]':visit(child)])):item;
 return visit(value) as T;
}
export type TroubleshootingSections={app:unknown;device:unknown;serviceWorker:unknown;session:unknown;events:unknown[];offline?:unknown;pending?:{failed:unknown[];queued:unknown[]};signedOutStorage?:unknown;notes?:string[]};
/** The whole payload passes the scrubber last. */
export function buildTroubleshootingPayload(sections:TroubleshootingSections,{createdAt=new Date(),secrets=[]}:{createdAt?:Date;secrets?:(string|null|undefined)[]}={}){
 return scrubTroubleshooting({schemaVersion:1,createdAt:createdAt.toISOString(),...sections},secrets);
}
