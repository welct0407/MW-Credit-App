import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {EventEmitter} from 'node:events';
import {PROJECT_ID,OWNER_EMAIL} from '../../services/lib/identity.mjs';
import {verifyFirebaseClaims} from '../../services/lib/firebase-claims.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createPaymentCommandHandler,isReadRoute} from '../../services/payment-command/handler.mjs';
import {notificationHandler} from '../../services/notifications/handler.mjs';
import {createReadHandler} from '../../services/api/read-handler.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';
// R078 (owner decision 19 Oct 2026, "check on writes only"): reads skip the Firebase revocation
// round trip; every write and every unclassified route keeps verifyIdToken(token,true).
const claims=()=>({aud:PROJECT_ID,iss:`https://securetoken.google.com/${PROJECT_ID}`,sub:'synthetic-owner-uid',exp:2000,iat:900,auth_time:900,email_verified:true,email:OWNER_EMAIL,firebase:{sign_in_provider:'google.com'}});
/** A synthetic token whose user was revoked: the signature is valid, the revocation check fails. */
function revokedUser(){
 const calls=[];
 const verifyIdToken=async(_token,checkRevoked)=>{calls.push(checkRevoked);if(checkRevoked)throw Object.assign(Error('synthetic revoked'),{code:'auth/id-token-revoked'});return claims();};
 return {calls,verifyPrincipal:createBusinessPrincipalVerifier(verifyIdToken,()=>1000000)};
}
test('claims verifier checks revocation unless the caller passes exactly checkRevoked:false',async()=>{
 const seen=[];const verify=verifyFirebaseClaims({verifyIdToken:async(_token,flag)=>{seen.push(flag);return claims();},projectId:PROJECT_ID,now:()=>1000000});
 for(const options of [undefined,{},{checkRevoked:true},{checkRevoked:false},{checkRevoked:0},{checkRevoked:'false'},{checkRevoked:null}])assert.equal((await verify('Bearer t',options)).ok,true);
 assert.deepEqual(seen,[true,true,true,false,true,true,true]);
});
test('route classification: reads by intent, writes and unclassified routes checked',()=>{
 const read=[[{operation:'dashboard'},'GET'],[{operation:'offline_dataset',options:{protocol:3}},'POST'],[{operation:'offline_dataset',options:{protocol:2}},'GET'],[{operation:'receipt'},'GET'],[{operation:'borrower_record'},'GET'],[{operation:'command_status'},'GET'],[{operation:'payment_record'},'GET']];
 const checked=[[{operation:'offline_dataset',options:{protocol:3}},'GET'],[{operation:'offline_dataset',options:{protocol:2}},'POST'],[{operation:'command_submit'},'POST'],[{operation:'receipt'},'POST'],[{operation:'borrower_record'},'PATCH'],[{operation:'borrower_record'},'DELETE'],[{operation:'borrower_create'},'POST'],[{operation:'command_metadata'},'PATCH'],[{operation:'payment_review'},'POST'],[{operation:'operation_submit'},'POST'],[{operation:'receipt_recognition'},'POST'],[{operation:'dashboard'},'POST'],[{operation:'unknown'},'GET'],[{invalid:true,operation:'dashboard'},'GET'],[undefined,'GET']];
 for(const [target,method] of read)assert.equal(isReadRoute(target,method),true,JSON.stringify([target,method]));
 for(const [target,method] of checked)assert.equal(isReadRoute(target,method),false,JSON.stringify([target,method]));
});
async function commandServer(){
 const reached=[];const auth=revokedUser();
 const ok=name=>async()=>{reached.push(name);return {ok:true,status:200};};
 const store={dashboard:ok('dashboard'),offlineDataset:ok('offlineDataset'),submit:ok('submit'),borrowerRecord:ok('borrowerRecord'),receipt:ok('receipt'),recognize:ok('recognize'),operation:ok('operation')};
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:auth.verifyPrincipal,store});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 return {reached,auth,call:(path,init={})=>fetch(base+path,{...init,headers:{authorization:'Bearer synthetic-revoked',...init.headers}}),close:()=>new Promise(resolve=>server.close(resolve))};
}
test('command service: a revoked token is accepted on reads',async()=>{
 const f=await commandServer();
 try{
  assert.equal((await f.call('/api/dashboard')).status,200);
  assert.equal((await f.call('/api/offline-dataset?domain=records&protocol=3',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,200);
  assert.deepEqual(f.reached,['dashboard','offlineDataset']);assert.deepEqual(f.auth.calls,[false,false]);
 }finally{await f.close();}
});
test('command service: a revoked token is rejected on every write and unclassified route before the store',async()=>{
 const f=await commandServer();const id='12345678-1234-4234-8234-123456789abc',receipt='12345678-1234-4234-8234-123456789abd';
 try{
  for(const [path,init] of [['/api/payment-commands',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}],['/api/borrower-records',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}],
   ['/api/borrower-records/synthetic',{method:'PATCH',headers:{'content-type':'application/json'},body:'{}'}],['/api/borrower-records/synthetic',{method:'DELETE',headers:{'content-type':'application/json'},body:'{}'}],
   [`/api/payment-commands/${id}/receipts/${receipt}`,{method:'POST',headers:{'content-type':'image/png'},body:'x'}],[`/api/payment-commands/${id}/receipts/${receipt}/recognition`,{method:'POST'}],
   ['/api/operations',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}],['/api/offline-dataset?domain=records&protocol=3',{method:'GET'}],['/api/not-a-route',{method:'GET'}],['/api/dashboard?unexpected=1',{method:'GET'}]]){
   const response=await f.call(path,init);assert.equal(response.status,401,init.method+' '+path);assert.equal((await response.json()).code,'session_invalid');
  }
  assert.deepEqual(f.reached,[]);assert.ok(f.auth.calls.length===10&&f.auth.calls.every(flag=>flag===true));
 }finally{await f.close();}
});
test('command service: a live token on a write is verified with the revocation check',async()=>{
 const flags=[];const store={borrowerRecord:async()=>({ok:true,status:200})};
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:createBusinessPrincipalVerifier(async(_token,flag)=>{flags.push(flag);return claims();},()=>1000000),store});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/borrower-records/synthetic',{method:'PATCH',headers:{authorization:'Bearer live','content-type':'application/json'},body:'{}'});assert.equal(response.status,200);assert.deepEqual(flags,[true]);}
 finally{await new Promise(resolve=>server.close(resolve));}
});
function notificationCall(handler,{method,url,body}){
 const req=Object.assign((async function*(){if(body)yield Buffer.from(body);})(),{method,url,headers:{authorization:'Bearer synthetic-revoked','content-type':'application/json'},setTimeout(){}});
 const res=new EventEmitter(),out={};res.setHeader=()=>{};res.end=text=>{out.status=res.statusCode;out.body=text?JSON.parse(text):undefined;};
 return handler(req,res).then(()=>out);
}
test('notification routes: revoked token accepted on reads, rejected on writes',async()=>{
 const auth=revokedUser(),reached=[];const mark=(name,value={})=>async()=>{reached.push(name);return value;};
 const handler=notificationHandler({next:()=>{throw Error('next must not run')},enabled:true,offlineDataset:true,origins:['https://dev-lm.mw-credit.com'],publicKey:'synthetic',verifyPrincipal:auth.verifyPrincipal,
  store:{status:mark('status'),history:mark('history'),offlineDataset:mark('offlineDataset'),subscribe:mark('subscribe'),preference:mark('preference'),revoke:mark('revoke')}});
 for(const request of [{method:'GET',url:'/api/notifications/status'},{method:'GET',url:'/api/notifications'},{method:'POST',url:'/api/notifications/offline-dataset?protocol=3',body:'{}'}])assert.equal((await notificationCall(handler,request)).status,200,request.url);
 assert.deepEqual(reached,['status','history','offlineDataset']);
 for(const request of [{method:'POST',url:'/api/notifications/subscriptions',body:'{}'},{method:'PUT',url:'/api/notifications/preference',body:'{"enabled":true}'},{method:'DELETE',url:'/api/notifications/subscriptions/12345678-1234-4234-8234-123456789abc'},{method:'POST',url:'/api/notifications/other',body:'{}'}])
  assert.equal((await notificationCall(handler,request)).status,401,request.method+' '+request.url);
 assert.deepEqual(reached,['status','history','offlineDataset']);assert.deepEqual(auth.calls,[false,false,false,true,true,true,true]);
});
test('reader: revoked token accepted on a recognised read, unrecognised path keeps the check',async()=>{
 const auth=revokedUser(),reached=[];const config=loadBusinessConfig(businessEnv('dev','reader'));
 const handler=createReadHandler({config,verifyPrincipal:auth.verifyPrincipal,store:{listBorrowers:async()=>{reached.push('listBorrowers');return {ok:true,items:[]};}}});
 const call=async url=>{const out={};const res={setHeader(){},set statusCode(v){out.status=v},end:body=>out.body=body?JSON.parse(body):null};await handler({url,method:'GET',headers:{authorization:'Bearer synthetic-revoked'}},res);return out;};
 assert.equal((await call('/api/borrowers')).status,200);
 assert.equal((await call('/api/unknown-route')).status,401);
 assert.deepEqual(reached,['listBorrowers']);assert.deepEqual(auth.calls,[false,true]);
});
