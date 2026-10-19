import {createHash} from 'node:crypto';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashPattern=/^[a-f0-9]{64}$/;
/** Read timestamps are envelope metadata, not changed business content. */
export function canonicalDeltaValue(value){
 if(value instanceof Date)return value.toJSON();
 if(Array.isArray(value))return value.map(canonicalDeltaValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,key==='asOf'&&(typeof value[key]==='string'||value[key] instanceof Date)?null:canonicalDeltaValue(value[key])]));
 return value;
}
export const deltaValueHash=value=>digest(canonicalDeltaValue(value));
/** versions (R078): the response to a request without a cursor also carries every domain's
 * source version, so one check request can confirm the other domains unchanged.
 * since (R078 protocol v4): the change-log cursor {seq,xmin,businessDate} the client's bundle was read at;
 * a server that can, answers with only the records changed since then (schemaVersion 4). */
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
/** A change-log cursor: last seq seen, the snapshot's xmin (xid8) and the business date, all as text. */
export const validChangeCursor=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')==='businessDate,seq,xmin'&&typeof value.seq==='string'&&/^(0|[1-9]\d{0,18})$/.test(value.seq)&&typeof value.xmin==='string'&&/^(0|[1-9]\d{0,19})$/.test(value.xmin)&&typeof value.businessDate==='string'&&dayPattern.test(value.businessDate);
export function readDeltaRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['cursor','need','sourceVersion','acceptChanged','versions','since'].includes(key)))throw Error('invalid_request');
 const {cursor=null,need=[],sourceVersion=null,acceptChanged=false,versions=false,since=null}=input;
 if(cursor!==null&&(typeof cursor!=='string'||cursor.length>32768||!/^[A-Za-z0-9_-]+$/.test(cursor))||sourceVersion!==null&&(typeof sourceVersion!=='string'||!hashPattern.test(sourceVersion))||!Array.isArray(need)||need.length>2048||need.some(hash=>typeof hash!=='string'||!hashPattern.test(hash))||new Set(need).size!==need.length||typeof acceptChanged!=='boolean'||typeof versions!=='boolean'||since!==null&&!validChangeCursor(since))throw Error('invalid_request');
 return {cursor,need,sourceVersion,acceptChanged,versions,since};
}
/** No retained server snapshot: repeat the same deterministic provider page to
 * retrieve only the content hashes missing from the owner's durable cache. */
export function encodeDeltaChunk(chunk,need=[]){
 const requested=new Set(need),values={};
 const patches=chunk.patches.map(({value,...patch})=>{
  // upsert (protocol v4) carries rows like append; remove carries one list of ids like replace.
  const refs=(patch.mode==='append'||patch.mode==='upsert'?value:[value]).map(item=>{const canonical=canonicalDeltaValue(item),hash=digest(canonical);if(requested.has(hash))values[hash]=canonical;return hash});
  return {...patch,refs};
 });
 return {...chunk,schemaVersion:3,patches,values};
}
export function wrapDeltaCursor(inner,sourceVersion){return Buffer.from(JSON.stringify({v:3,sourceVersion,inner})).toString('base64url')}
export function readDeltaCursor(cursor){
 if(cursor===null)return null;
 try{if(typeof cursor!=='string'||cursor.length>32768||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();const value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(Object.keys(value).join(',')!=='v,sourceVersion,inner'||value.v!==3||typeof value.sourceVersion!=='string'||!hashPattern.test(value.sourceVersion)||typeof value.inner!=='string'||value.inner.length>16384||wrapDeltaCursor(value.inner,value.sourceVersion)!==cursor)throw Error();return value}catch{throw Error('invalid_request')}
}
