import test from 'node:test';
import assert from 'node:assert/strict';
import {CHATGPT_CLIENT_ID,CHATGPT_REDIRECT_URI,metadataFetch,pinnedMetadata} from '../dist/cimd.js';
import {application,authorize,tokenExchange,mcpRequest,subscription} from './helpers.mjs';
const document=()=>({client_id:CHATGPT_CLIENT_ID,redirect_uris:[CHATGPT_REDIRECT_URI],response_types:['code'],grant_types:['authorization_code','refresh_token'],token_endpoint_auth_method:'private_key_jwt',token_endpoint_auth_methods_supported:['private_key_jwt','none'],jwks_uri:'https://unused.example/jwks'});
const configuration={clientId:CHATGPT_CLIENT_ID,redirectUri:CHATGPT_REDIRECT_URI,clientMetadataDocument:true,callbackHosts:[]};
const fakeFetch=(send)=>metadataFetch(async host=>{assert.equal(host,'chatgpt.com');return [{address:'8.8.8.8',family:4}];},send);

test('real provider native CIMD with exact identity, public method, RFC9207 success/error, S256, refresh and revocation',async t=>{
  let fetches=0,sends=0;
  const app=await application({config:configuration,send:async()=>{sends++;throw Error('must not send');},metadataFetch:fakeFetch(async(url,address,signal)=>{fetches++;assert.equal(String(url),CHATGPT_CLIENT_ID);assert.equal(address.address,'8.8.8.8');assert.ok(signal);return {status:200,body:JSON.stringify(document())};})});t.after(()=>app.close());
  const metadata=(await app.call('/oauth/.well-known/openid-configuration')).json();
  assert.equal(metadata.client_id_metadata_document_supported,true);
  assert.equal(metadata.authorization_response_iss_parameter_supported,true);
  assert.equal(metadata.registration_endpoint,undefined);assert.deepEqual(metadata.token_endpoint_auth_methods_supported,['none']);
  assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
  const params=new URLSearchParams({client_id:CHATGPT_CLIENT_ID,redirect_uri:CHATGPT_REDIRECT_URI,response_type:'code',scope:'mcp:events',resource:app.conf.resource,state:'error-state',code_challenge:'A'.repeat(43),code_challenge_method:'S256',prompt:'none'});
  const error=await app.call('/oauth/auth?'+params);assert.equal(error.status,303);
  const errorRedirect=new URL(error.headers.location);assert.ok(errorRedirect.searchParams.has('error'));assert.equal(errorRedirect.searchParams.get('iss'),metadata.issuer);assert.equal(errorRedirect.searchParams.get('state'),'error-state');
  const grant=await authorize(app);assert.equal(grant.redirect.searchParams.get('iss'),metadata.issuer);
  const token=(await tokenExchange(app,grant.code,grant.verifier)).json();assert.ok(token.access_token);assert.ok(token.refresh_token);
  assert.equal((await mcpRequest(app,'events/list',{},token.access_token)).status,200);
  const sub=await mcpRequest(app,'events/subscribe',subscription(),token.access_token);assert.ok(sub.json().error,sub.body);assert.equal(sends,0);assert.equal((await app.store.query('subscriptions',[],10)).length,0);assert.equal((await app.store.query('challenges',[],10)).length,0);
  const refresh=await app.call('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:CHATGPT_CLIENT_ID,refresh_token:token.refresh_token,resource:app.conf.resource}).toString()});assert.equal(refresh.status,200);
  const revoke=await app.call('/oauth/token/revocation',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:CHATGPT_CLIENT_ID,token:refresh.json().refresh_token}).toString()});assert.equal(revoke.status,200);
  assert.equal((await mcpRequest(app,'events/list',{},refresh.json().access_token)).status,401);
  assert.equal(fetches,1); // Provider cache still re-applies the allowClient pin.
});

test('unknown URL client and DCR denied before any metadata fetch; redirect/resource/plain PKCE errors carry issuer',async t=>{
  let fetches=0;
  const app=await application({config:configuration,metadataFetch:fakeFetch(async()=>{fetches++;return {status:200,body:JSON.stringify(document())};})});t.after(()=>app.close());
  const params=new URLSearchParams({client_id:'https://attacker.example/client.json',redirect_uri:CHATGPT_REDIRECT_URI,response_type:'code',scope:'mcp:events',resource:app.conf.resource,state:'error',code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  assert.equal((await app.call('/oauth/auth?'+params)).status,400);assert.equal(fetches,0);
  assert.equal((await app.call('/oauth/reg',{method:'POST',body:document()})).status,404);assert.equal(fetches,0);
  params.set('client_id',CHATGPT_CLIENT_ID);
  for(const [key,value] of [['resource','https://attacker.example/mcp'],['code_challenge_method','plain'],['code_challenge','']]){
    const changed=new URLSearchParams(params);changed.set(key,value);const result=await app.call('/oauth/auth?'+changed);
    const destination=new URL(result.headers.location);assert.equal(destination.origin,'https://chatgpt.com');assert.ok(destination.searchParams.has('error'));assert.equal(destination.searchParams.get('iss'),app.conf.issuer);
  }
  params.set('redirect_uri','https://attacker.example/callback');const result=await app.call('/oauth/auth?'+params);assert.equal(result.status,400);assert.equal(result.headers.location,undefined);
});

test('strict fetched metadata validation and method intersection reject poisoning',()=>{
  assert.equal(pinnedMetadata(JSON.stringify(document())).token_endpoint_auth_method,'none');
  for(const override of [{client_id:'https://other.example'},{redirect_uris:[CHATGPT_REDIRECT_URI,'https://other.example']},{redirect_uris:[CHATGPT_REDIRECT_URI+'?x=1']},{token_endpoint_auth_methods_supported:['private_key_jwt']},{token_endpoint_auth_method:'client_secret_post'},{client_secret:'synthetic'},{client_secret_expires_at:0},{grant_types:['client_credentials']},{response_types:['token']}])assert.throws(()=>pinnedMetadata(JSON.stringify({...document(),...override})));
  for(const raw of ['{','null','[]','"string"',' '.repeat(8193)])assert.throws(()=>pinnedMetadata(raw));
});

test('CIMD fetch blocks other URLs/requests, mixed DNS, redirects, oversized content, abort and failed fetch',async()=>{
  let dns=0,sends=0;
  const fetch=metadataFetch(async()=>{dns++;return [{address:'8.8.8.8',family:4}];},async()=>{sends++;return {status:200,body:JSON.stringify(document())};});
  const options={method:'GET',redirect:'manual'};
  for(const [url,opts] of [['https://chatgpt.com/oauth/client.json?x=1',options],[CHATGPT_CLIENT_ID,{...options,method:'POST'}],[CHATGPT_CLIENT_ID,{...options,body:'data'}],[CHATGPT_CLIENT_ID,{...options,redirect:'follow'}]])await assert.rejects(()=>fetch(url,opts));
  assert.equal(dns,0);assert.equal(sends,0);
  const mixed=metadataFetch(async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],async()=>{throw Error('must not send');});await assert.rejects(()=>mixed(CHATGPT_CLIENT_ID,options),/nonpublic/);
  for(const response of [{status:302,body:''},{status:403,body:''},{status:200,body:' '.repeat(8193)}])await assert.rejects(()=>fakeFetch(async()=>response)(CHATGPT_CLIENT_ID,options));
  await assert.rejects(()=>fakeFetch(async()=>{throw Error('synthetic-network');})(CHATGPT_CLIENT_ID,options));
  const signal=AbortSignal.abort();await assert.rejects(()=>fetch(CHATGPT_CLIENT_ID,{...options,signal}));assert.equal(dns,0);
});

test('provider rejects poisoned fetched metadata and does not start owner login',async t=>{
  const app=await application({config:configuration,metadataFetch:fakeFetch(async()=>({status:200,body:JSON.stringify({...document(),redirect_uris:['https://attacker.example']})}))});t.after(()=>app.close());
  const params=new URLSearchParams({client_id:CHATGPT_CLIENT_ID,redirect_uri:CHATGPT_REDIRECT_URI,response_type:'code',scope:'mcp:events',resource:app.conf.resource,code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  assert.equal((await app.call('/oauth/auth?'+params)).status,400);assert.equal(app.login(),undefined);
});
test('metadata deadline bounds a stalled DNS lookup without outbound traffic',async()=>{
  let sends=0;const fetch=metadataFetch(async()=>new Promise(()=>{}),async()=>{sends++;throw Error('must not send');});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20);
  try{await assert.rejects(()=>fetch(CHATGPT_CLIENT_ID,{method:'GET',redirect:'manual',signal:controller.signal}),/cimd_timeout/);}finally{clearTimeout(timer);}
  assert.equal(sends,0);
});
test('owner disabled still denies CIMD login and token exchange',async t=>{
  const app=await application({config:{...configuration,ownerEnabled:false},metadataFetch:fakeFetch(async()=>({status:200,body:JSON.stringify(document())}))});t.after(()=>app.close());
  const params=new URLSearchParams({client_id:CHATGPT_CLIENT_ID,redirect_uri:CHATGPT_REDIRECT_URI,response_type:'code',scope:'mcp:events',resource:app.conf.resource,code_challenge:'A'.repeat(43),code_challenge_method:'S256'});
  const start=await app.call('/oauth/auth?'+params);assert.equal((await app.follow(start.headers.location)).status,403);assert.equal(app.login(),undefined);
  assert.equal((await app.call('/oauth/token',{method:'POST',body:{}})).status,403);
});
