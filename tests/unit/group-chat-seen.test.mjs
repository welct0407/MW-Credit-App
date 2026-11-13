// R149: POST /api/collection/{borrowerId}/chat-seen records the signed-in user's own "group chat summary seen" value
// (V147, pwa_mark_group_chat_seen_v1). Route shape, the Partner taken from the server-resolved actor only, capability
// read, no notification wake, and the status mapping. Stub pool; every name is invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPaymentCommandHandler,isReadRoute} from '../../services/payment-command/handler.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
import {createBusinessMembership,parseBusinessPolicy} from '../../services/production/business-policy.mjs';
import {readFileSync} from 'node:fs';

const ACTOR={issuer:'https://issuer.example.invalid',subject:'synthetic-subject',partnerId:'P-SYNTHETIC',loginEmail:'synthetic@example.invalid'};
async function fixture({answer=()=>({rows:[{value:{kind:'stored',seenAt:'2026-11-12T07:05:00.000Z'}}]}),actor=ACTOR,verify}={}){
 const state={sql:[],params:[],wakes:0,capabilities:[],released:0,revocation:[]};
 const pool={connect:async()=>({release:()=>{state.released++;},query:async(sql,params)=>{state.sql.push(sql);if(sql.includes('pwa_mark_group_chat_seen_v1')){state.params.push(params);return answer();}return {rows:[]};}})};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:()=>true,actorIssuer:ACTOR.issuer,afterCommit:async()=>{state.wakes++;},
  resolveActor:async(_client,_principal,capability)=>{state.capabilities.push(capability);return actor;}});
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],store,
  verifyPrincipal:verify??(async(_header,options)=>{state.revocation.push(options?.checkRevoked!==false);return {ok:true,subject:ACTOR.subject,email:ACTOR.loginEmail};})});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const post=async(path,body,{method='POST',type='application/json',raw=false}={})=>{
  const response=await fetch(origin+path,{method,headers:{Authorization:'Bearer synthetic',...(type?{'Content-Type':type}:{})},...(method==='GET'?{}:{body:raw?body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
 };
 return {state,store,post,close:()=>new Promise(resolve=>server.close(resolve))};
}
const SEEN={lastMessageAt:'2026-11-12T07:05:00.000Z'};

test('R149: the route takes one borrower id and a body of exactly lastMessageAt; the Partner is the server actor only',async()=>{
 const f=await fixture();
 try{
  const ok=await f.post('/api/collection/B%20one/chat-seen',SEEN);
  assert.deepEqual(ok,{status:200,body:{ok:true,kind:'stored',seenAt:'2026-11-12T07:05:00.000Z'}});
  assert.deepEqual(f.state.params,[[JSON.stringify(ACTOR),'B one','2026-11-12T07:05:00.000Z']],'actor from the server, borrower from the path, time from the body');
  assert.deepEqual(f.state.capabilities,['read'],'a reader may record its own seen value');
  assert.equal(f.state.sql[0],'BEGIN','a writing transaction');assert.ok(f.state.sql.includes('COMMIT'));assert.equal(f.state.released,1);
  assert.equal(f.state.wakes,0,'no notification wake: nothing was enqueued');
  assert.deepEqual(f.state.revocation,[true],'a write keeps the revocation check');
  // A body that names a Partner (or anything else) is refused before the database: the actor is never taken from the request.
  for(const body of [{...SEEN,partnerId:'P-OTHER'},{...SEEN,actor:ACTOR},{},{lastMessageAt:null},{lastMessageAt:1},{lastMessageAt:'2026-11-12'},{lastMessageAt:'2026-11-12T07:05:00+07:00'},
   {lastMessageAt:'2026-11-12T07:05:00'},{lastMessageAt:'2026-13-40T07:05:00Z'},{lastMessageAt:'2026-11-12T07:05:00.0000Z'},[SEEN],null,'text'])
   assert.deepEqual(await f.post('/api/collection/B1/chat-seen',body),{status:400,body:{ok:false,code:'invalid_request'}},JSON.stringify(body));
  assert.equal((await f.post('/api/collection/B1/chat-seen','{"lastMessageAt":',{raw:true})).status,400);
  assert.equal((await f.post('/api/collection/B1/chat-seen?partnerId=P-OTHER',SEEN)).status,400,'no query string');
  assert.equal((await f.post('/api/collection/'+'x'.repeat(257)+'/chat-seen',SEEN)).status,400,'borrower id bound');
  assert.equal((await f.post('/api/collection/B1/chat-seen',SEEN,{type:'text/plain'})).status,415);
  assert.equal((await f.post('/api/collection/B1/chat-seen',SEEN,{method:'GET'})).status,405);
  assert.equal((await f.post('/api/collection/B1/chat-seen',SEEN,{method:'PATCH'})).status,405);
  assert.equal((await f.post('/api/collection/B1/chat-seen',SEEN,{method:'DELETE'})).status,405);
  for(const path of ['/api/collection/chat-seen','/api/collection/B1/B2/chat-seen','/api/collection/B1/chat-seen/more','/api/collection/B1'])assert.equal((await f.post(path,SEEN)).status,404,path);
  assert.equal(f.state.params.length,1,'no refused request reached the function');assert.equal(f.state.wakes,0);
  // Seconds without a fraction are accepted as sent.
  assert.equal((await f.post('/api/collection/B1/chat-seen',{lastMessageAt:'2026-11-12T07:05:00Z'})).status,200);assert.equal(f.state.params[1][2],'2026-11-12T07:05:00Z');
 }finally{await f.close();}
});

test('R149: unchanged and ignored are successes; unknown borrower, refused actor and failures map to 404, 403, 400, 409 and 503 with a rollback and no wake',async()=>{
 const coded=(code,message='synthetic')=>()=>{throw Object.assign(Error(message),{code});};
 for(const [answer,status,body] of [
  [()=>({rows:[{value:{kind:'unchanged',seenAt:'2026-11-12T07:05:00.000Z'}}]}),200,{ok:true,kind:'unchanged',seenAt:'2026-11-12T07:05:00.000Z'}],
  [()=>({rows:[{value:{kind:'ignored',seenAt:null}}]}),200,{ok:true,kind:'ignored',seenAt:null}],
  [coded('P0002','unknown_borrower'),404,{ok:false,code:'not_found'}],
  [coded('22023','invalid_request'),400,{ok:false,code:'invalid_request'}],
  [coded('42501','access_denied'),403,{ok:false,code:'access_denied'}],
  [coded('55P03'),409,{ok:false,code:'command_busy'}],
  [coded('42P01','relation does not exist'),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[{value:{kind:'other'}}]}),503,{ok:false,code:'command_unavailable'}],
  [()=>({rows:[]}),503,{ok:false,code:'command_unavailable'}]]){
  const f=await fixture({answer});
  try{
   assert.deepEqual(await f.post('/api/collection/B1/chat-seen',SEEN),{status,body},JSON.stringify(body));
   assert.equal(f.state.wakes,0);assert.equal(f.state.released,1);assert.equal(f.state.sql.includes(status===200?'COMMIT':'ROLLBACK'),true);assert.equal(f.state.sql.includes(status===200?'ROLLBACK':'COMMIT'),false);
  }finally{await f.close();}
 }
});

test('R149: no actor (the policy does not give this user the read capability) is 403 before the function; an invalid session is 401',async()=>{
 const denied=await fixture({actor:null});
 try{assert.deepEqual(await denied.post('/api/collection/B1/chat-seen',SEEN),{status:403,body:{ok:false,code:'access_denied'}});assert.equal(denied.state.params.length,0);assert.equal(denied.state.wakes,0);}finally{await denied.close();}
 const signedOut=await fixture({verify:async()=>({ok:false,status:401,code:'sign_in_required'})});
 try{assert.deepEqual(await signedOut.post('/api/collection/B1/chat-seen',SEEN),{status:401,body:{ok:false,code:'sign_in_required'}});assert.equal(signedOut.state.sql.length,0);}finally{await signedOut.close();}
});

test('R149: the route is a write for the session check (revocation is checked)',()=>{
 assert.equal(isReadRoute({operation:'chat_seen',borrowerId:'B1'},'POST'),false);
});

// R149 correction: the route works for every signed-in member with the read capability, owner or partner. ownerTesting
// is a store-wide switch of the disposable store (the deployed environment store always has it on), not a per-user
// right; this route no longer consults it. The production membership policy decides, per user.
test('R149: a partner with only the read capability records its own row (200); the Partner is the one mapped from its own email; no capability or no membership is 403',async()=>{
 const policy=parseBusinessPolicy(JSON.stringify({schemaVersion:1,environment:'dev',evidenceSha256:'a'.repeat(64),members:[
  {partnerId:'P-OWNER',loginEmail:'owner@example.invalid',partnerRole:'A',capabilities:['read','command','receipt.read','receipt.write']},
  {partnerId:'P-PARTNER',loginEmail:'partner@example.invalid',partnerRole:'B',capabilities:['read']},
  {partnerId:'P-NOREAD',loginEmail:'noread@example.invalid',partnerRole:'B',capabilities:['receipt.read']}]}),'dev');
 const membership=createBusinessMembership({policy,issuer:'https://issuer.example.invalid'});
 const partners={'owner@example.invalid':{id:'P-OWNER',role:'A'},'partner@example.invalid':{id:'P-PARTNER',role:'B'},'noread@example.invalid':{id:'P-NOREAD',role:'B'}};
 const marks=[];let wakes=0;
 const pool={connect:async()=>({release(){},query:async(sql,params)=>{
  if(sql.includes('"Login Email"'))return {rows:partners[params[0]]?[partners[params[0]]]:[]};
  if(sql.includes('pwa_mark_group_chat_seen_v1')){marks.push({actor:JSON.parse(params[0]),borrower:params[1],at:params[2]});return {rows:[{value:{kind:'stored',seenAt:'2026-11-12T07:05:00.000Z'}}]};}
  return {rows:[]};}})};
 const store=createEnvironmentCommandStore({pool,guardConnection:async()=>{},principalAllowed:membership.principalAllowed,resolveActor:membership.resolveActor,actorIssuer:'https://issuer.example.invalid',afterCommit:async()=>{wakes++;}});
 const as=(email,subject)=>store.markChatSeen({ok:true,email,subject},'B1',SEEN);
 assert.deepEqual(await as('partner@example.invalid','subject-partner'),{ok:true,status:200,kind:'stored',seenAt:'2026-11-12T07:05:00.000Z'});
 assert.deepEqual(await as('owner@example.invalid','subject-owner'),{ok:true,status:200,kind:'stored',seenAt:'2026-11-12T07:05:00.000Z'});
 assert.deepEqual(marks.map(mark=>[mark.actor.partnerId,mark.actor.loginEmail,mark.actor.subject,mark.borrower]),[['P-PARTNER','partner@example.invalid','subject-partner','B1'],['P-OWNER','owner@example.invalid','subject-owner','B1']],'each user writes only under its own Partner');
 assert.deepEqual(Object.keys(marks[0].actor).sort(),['issuer','loginEmail','partnerId','subject']);
 // A member without the read capability, and an email outside the policy: 403, the function is never called.
 assert.deepEqual(await as('noread@example.invalid','s'),{ok:false,status:403,code:'access_denied'});
 assert.deepEqual(await as('stranger@example.invalid','s'),{ok:false,status:403,code:'access_denied'});
 assert.equal(marks.length,2);assert.equal(wakes,0);
});
test('R149: the store method is not gated on ownerTesting (the business reads and commands around it still are)',()=>{
 const source=readFileSync(new URL('../../services/payment-command/store.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async markChatSeen('),end=source.indexOf('async collectionReceipts(');
 assert.ok(start>0&&end>start);assert.doesNotMatch(source.slice(start,end),/ownerTesting|fixture/);
 assert.match(source.slice(end,end+120),/if\(!ownerTesting\)return failure\(403,'access_denied'\)/,'collectionReceipts keeps its gate');
});
