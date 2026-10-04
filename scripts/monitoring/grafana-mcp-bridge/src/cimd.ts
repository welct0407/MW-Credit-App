import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { publicAddress, SafeError, type Resolver } from './security.js';

export const CHATGPT_CLIENT_ID = 'https://chatgpt.com/oauth/client.json';
export const CHATGPT_REDIRECT_URI = 'https://chatgpt.com/connector_platform_oauth_redirect';
const LIMIT = 8192;
export type MetadataSender = (url:URL, address:{address:string;family:number}, signal:AbortSignal)=>Promise<{status:number;body:string}>;

export const httpsMetadata:MetadataSender = (url,address,signal)=>new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',headers:{Accept:'application/json'},agent:false,
    servername:url.hostname,rejectUnauthorized:true,signal,family:address.family,
    lookup:(_host,_options,cb)=>cb(null,address.address,address.family)},res=>{
    const chunks:Buffer[]=[];let size=0;
    res.on('data',chunk=>{size+=chunk.length;if(size>LIMIT){res.destroy();reject(new SafeError('cimd_response_too_large'));return;}chunks.push(chunk);});
    res.on('error',()=>reject(new SafeError('cimd_network_error')));
    res.on('end',()=>resolve({status:res.statusCode ?? 0,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',()=>reject(new SafeError('cimd_network_error')));req.end();
});

/** Select only our supported public-client method; never import remote JWKS or other URLs. */
export function pinnedMetadata(body:string) {
  if(Buffer.byteLength(body)>LIMIT)throw new SafeError('cimd_response_too_large');
  let doc:any;try{doc=JSON.parse(body);}catch{throw new SafeError('cimd_invalid_metadata');}
  const one=(value:any,expected:string)=>Array.isArray(value) && value.length===1 && value[0]===expected;
  const methods=doc?.token_endpoint_auth_methods_supported ?? [doc?.token_endpoint_auth_method];
  if(!doc || typeof doc!=='object' || Array.isArray(doc) || doc.client_id!==CHATGPT_CLIENT_ID ||
    !one(doc.redirect_uris,CHATGPT_REDIRECT_URI) || !one(doc.response_types,'code') ||
    !Array.isArray(doc.grant_types) || !doc.grant_types.includes('authorization_code') ||
    doc.grant_types.some((v:any)=>!['authorization_code','refresh_token'].includes(v)) ||
    !Array.isArray(methods) || !methods.includes('none') || methods.some((v:any)=>!['none','private_key_jwt'].includes(v)) ||
    ('client_secret' in doc) || ('client_secret_expires_at' in doc) ||
    (doc.token_endpoint_auth_method && !['none','private_key_jwt'].includes(doc.token_endpoint_auth_method)))throw new SafeError('cimd_invalid_metadata');
  return {client_id:CHATGPT_CLIENT_ID,redirect_uris:[CHATGPT_REDIRECT_URI],response_types:['code'],
    grant_types:doc.grant_types,token_endpoint_auth_method:'none'};
}

/** Exactly one HTTPS GET, no redirects, TLS verification, public DNS pin and absolute deadline. */
export function metadataFetch(resolve:Resolver=host=>lookup(host,{all:true,verbatim:true}),send:MetadataSender=httpsMetadata):typeof fetch {
  return async (input,init)=>{
    if(String(input)!==CHATGPT_CLIENT_ID || init?.method!=='GET' || init?.body || init?.redirect!=='manual')throw new SafeError('cimd_fetch_denied');
    const url=new URL(CHATGPT_CLIENT_ID),signal=init.signal ?? AbortSignal.timeout(2500);
    signal.throwIfAborted();
    const timeout=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new SafeError('cimd_timeout')),{once:true}));
    const addresses=await Promise.race([resolve(url.hostname),timeout]);
    if(!addresses.length || addresses.some(a=>!publicAddress(a.address)))throw new SafeError('cimd_nonpublic_address');
    signal.throwIfAborted();
    const response=await Promise.race([send(url,addresses[0]!,signal),timeout]);
    if(response.status!==200)throw new SafeError('cimd_fetch_failed');
    return new Response(JSON.stringify(pinnedMetadata(response.body)),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'max-age=300'}});
  };
}
