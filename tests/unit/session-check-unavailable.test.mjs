import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {definiteTokenErrorCodes,sessionCheckFailure} from '../../services/api/session-check.mjs';
import {createBusinessPrincipalVerifier} from '../../services/production/business-principal.mjs';
import {createProductionPrincipalVerifier} from '../../services/production/principal.mjs';
import {verifyFirebaseClaims} from '../../services/lib/firebase-claims.mjs';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {createProductionFoundationHandler} from '../../services/production/handler.mjs';
import {notificationHandler} from '../../services/notifications/handler.mjs';
// APP-AUTH-01: only definite Firebase token/user errors are 401 session_invalid; a verifier outage is 503 session_check_unavailable.
const invalid={ok:false,status:401,code:'session_invalid'},unavailable={ok:false,status:503,code:'session_check_unavailable'};
// auth/argument-error is definite only with the library's own token-validation message (see session-check-key-fetch.test.mjs for the key-fetch outage).
const definiteError=code=>Object.assign(Error(code==='auth/argument-error'?'Firebase ID token has invalid signature.':'secret'),{code});
const outages=[Error('ECONNRESET'),Object.assign(Error('secret'),{code:'app/network-error'}),Object.assign(Error('secret'),{code:'app/network-timeout'}),Object.assign(Error('secret'),{code:'auth/internal-error'}),Object.assign(Error('secret'),{code:'auth/invalid-credential'}),'string-throw',undefined];
const factories={
 business:fn=>createBusinessPrincipalVerifier(fn),
 foundation:fn=>createProductionPrincipalVerifier(fn,{projectId:'synthetic',issuer:'https://securetoken.google.com/synthetic',ownerUid:'owner',ownerEmail:'owner@example.invalid'}),
 claims:fn=>verifyFirebaseClaims({verifyIdToken:fn,projectId:'synthetic'}),
};
test('sessionCheckFailure classifies by Firebase error code only',()=>{
 for(const code of definiteTokenErrorCodes)assert.deepEqual(sessionCheckFailure(definiteError(code)),invalid,code);
 for(const error of outages)assert.deepEqual(sessionCheckFailure(error),unavailable,String(error));
});
for(const [name,factory] of Object.entries(factories))test(name+' verifier: definite token errors 401, every other throw 503',async()=>{
 for(const code of definiteTokenErrorCodes)assert.deepEqual(await factory(async()=>{throw definiteError(code)})('Bearer synthetic'),invalid,name+' '+code);
 for(const error of outages)assert.deepEqual(await factory(async()=>{throw error})('Bearer synthetic'),unavailable,name+' '+String(error));
});
async function serve(handler){const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};}
test('command handler passes 503 session_check_unavailable through and logs the code',async()=>{
 const logs=[];let stores=0;
 const server=await serve(createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>unavailable,store:new Proxy({},{get(){stores++;throw Error('store touched')}}),completionLogger:r=>logs.push(r)}));
 try{
  const response=await fetch(server.origin+'/api/payment-commands/12345678-1234-4234-8234-123456789abc',{headers:{Authorization:'Bearer synthetic'}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'session_check_unavailable'});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(logs.at(-1).code,'session_check_unavailable');assert.equal(logs.at(-1).status,503);assert.equal(stores,0);
  const denied=await fetch(server.origin+'/api/payment-commands/12345678-1234-4234-8234-123456789abc');assert.equal(denied.status,503);
 }finally{await server.close()}
});
test('foundation handler maps 503 principal to 503',async()=>{
 const logs=[];
 const server=await serve(createProductionFoundationHandler({config:{origins:['https://lm.mw-credit.com'],serviceRole:'reader'},verifyPrincipal:async()=>unavailable,completionLogger:r=>logs.push(r)}));
 try{
  const response=await fetch(server.origin+'/api/session',{headers:{Authorization:'Bearer synthetic'}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,code:'session_check_unavailable'});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(logs.at(-1).code,'session_check_unavailable');
 }finally{await server.close()}
});
test('notification handler keeps the verifier status and code: 503 session_check_unavailable, 401 sign_in_required',async()=>{
 let principal=unavailable;
 const server=await serve(notificationHandler({next:()=>{throw Error('next must not run')},store:new Proxy({},{get(){throw Error('store touched')}}),verifyPrincipal:async()=>principal,origins:['https://lm.mw-credit.com'],enabled:true,publicKey:'synthetic'}));
 try{
  const outage=await fetch(server.origin+'/api/notifications/status',{headers:{Authorization:'Bearer synthetic'}});
  assert.equal(outage.status,503);assert.deepEqual(await outage.json(),{error:'session_check_unavailable',code:'session_check_unavailable'});
  principal={ok:false,status:401,code:'sign_in_required'};
  const denied=await fetch(server.origin+'/api/notifications/status');assert.equal(denied.status,401);assert.deepEqual(await denied.json(),{error:'sign_in_required',code:'sign_in_required'});
 }finally{await server.close()}
});
