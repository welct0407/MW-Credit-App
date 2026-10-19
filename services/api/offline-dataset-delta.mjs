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
 * source version, so one check request can confirm the other domains unchanged. */
export function readDeltaRequest(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['cursor','need','sourceVersion','acceptChanged','versions'].includes(key)))throw Error('invalid_request');
 const {cursor=null,need=[],sourceVersion=null,acceptChanged=false,versions=false}=input;
 if(cursor!==null&&(typeof cursor!=='string'||cursor.length>32768||!/^[A-Za-z0-9_-]+$/.test(cursor))||sourceVersion!==null&&(typeof sourceVersion!=='string'||!hashPattern.test(sourceVersion))||!Array.isArray(need)||need.length>2048||need.some(hash=>typeof hash!=='string'||!hashPattern.test(hash))||new Set(need).size!==need.length||typeof acceptChanged!=='boolean'||typeof versions!=='boolean')throw Error('invalid_request');
 return {cursor,need,sourceVersion,acceptChanged,versions};
}
/** No retained server snapshot: repeat the same deterministic provider page to
 * retrieve only the content hashes missing from the owner's durable cache. */
export function encodeDeltaChunk(chunk,need=[]){
 const requested=new Set(need),values={};
 const patches=chunk.patches.map(({value,...patch})=>{
  const refs=(patch.mode==='append'?value:[value]).map(item=>{const canonical=canonicalDeltaValue(item),hash=digest(canonical);if(requested.has(hash))values[hash]=canonical;return hash});
  return {...patch,refs};
 });
 return {...chunk,schemaVersion:3,patches,values};
}
export function wrapDeltaCursor(inner,sourceVersion){return Buffer.from(JSON.stringify({v:3,sourceVersion,inner})).toString('base64url')}
export function readDeltaCursor(cursor){
 if(cursor===null)return null;
 try{if(typeof cursor!=='string'||cursor.length>32768||!/^[A-Za-z0-9_-]+$/.test(cursor))throw Error();const value=JSON.parse(Buffer.from(cursor,'base64url').toString());if(Object.keys(value).join(',')!=='v,sourceVersion,inner'||value.v!==3||typeof value.sourceVersion!=='string'||!hashPattern.test(value.sourceVersion)||typeof value.inner!=='string'||value.inner.length>16384||wrapDeltaCursor(value.inner,value.sourceVersion)!==cursor)throw Error();return value}catch{throw Error('invalid_request')}
}
