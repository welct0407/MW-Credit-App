import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {notificationHandler} from '../../services/notifications/handler.mjs';
// APP-AUTH-03: the notification routes use the shared HTTP boundary.
const origin='https://dev-lm.mw-credit.com';
function call(handler,{method='GET',url='/api/notifications/status',headers={}}={}){
 const res=new EventEmitter(),out={headers:{}};res.setHeader=(k,v)=>{out.headers[k.toLowerCase()]=v};res.end=body=>{out.status=res.statusCode;out.body=body?JSON.parse(body):undefined;res.emit('finish')};
 return handler({method,url,headers},res).then(()=>out);
}
const build=(over={})=>{const logs=[];let verifies=0;const handler=notificationHandler({next:()=>{throw Error('next must not run')},enabled:true,origins:[origin],publicKey:'synthetic',completionLogger:r=>logs.push(r),
 verifyPrincipal:async()=>{verifies++;return {ok:true,subject:'s',email:'e@example.invalid'}},store:{status:async()=>({enabled:true})},...over});return {handler,logs,verifies:()=>verifies};};
test('preflight requires an allowlisted Origin and a listed method and headers',async()=>{
 const {handler,verifies}=build();
 assert.equal((await call(handler,{method:'OPTIONS',headers:{'access-control-request-method':'GET'}})).status,403);
 assert.equal((await call(handler,{method:'OPTIONS',headers:{origin,'access-control-request-method':'PATCH'}})).status,403);
 assert.equal((await call(handler,{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'authorization, x-other'}})).status,403);
 const ok=await call(handler,{method:'OPTIONS',headers:{origin,'access-control-request-method':'PUT','access-control-request-headers':'authorization,content-type,x-mw-wake-deadline'}});
 assert.equal(ok.status,204);assert.equal(ok.headers['access-control-allow-origin'],origin);assert.match(ok.headers['access-control-allow-headers'],/X-MW-Wake-Deadline/);
 assert.equal(verifies(),0);
});
test('responses carry a request id, nosniff and one completion log',async()=>{
 const {handler,logs}=build();
 const out=await call(handler,{headers:{origin,authorization:'Bearer synthetic'}});
 assert.equal(out.status,200);assert.match(out.headers['x-request-id'],/^[0-9a-f-]{36}$/);assert.equal(out.headers['x-content-type-options'],'nosniff');assert.equal(out.headers['cache-control'],'no-store');
 assert.equal(logs.length,1);assert.equal(logs[0].requestId,out.headers['x-request-id']);assert.equal(logs[0].event,'notification_request');assert.equal(logs[0].status,200);
});
test('a throwing verifier is a 401 session_invalid; a non-ok principal keeps its status and code',async()=>{
 assert.deepEqual((await call(build({verifyPrincipal:async()=>{throw Error('synthetic')}}).handler,{headers:{authorization:'Bearer x'}})).body,{error:'session_invalid',code:'session_invalid'});
 const forbidden=await call(build({verifyPrincipal:async()=>({ok:false,status:403,code:'access_denied'})}).handler,{headers:{authorization:'Bearer x'}});
 assert.equal(forbidden.status,403);assert.equal(forbidden.body.code,'access_denied');
});
