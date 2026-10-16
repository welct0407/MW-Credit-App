import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';
// APP-AUTH-05: /health is GET-only; only the explicit status route reaches store.status.
const call=(handler,method,url)=>{const res=new EventEmitter(),out={};res.setHeader=()=>{};res.end=b=>{out.status=res.statusCode;out.body=b?JSON.parse(b):undefined;res.emit('finish')};const req=new EventEmitter();Object.assign(req,{method,url,headers:{authorization:'Bearer synthetic'}});return handler(req,res).then(()=>out);};
test('health accepts GET and rejects other methods with 405 without touching the store',async()=>{
 let statusCalls=0;const handler=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:async()=>({ok:true,subject:'s',email:'e@example.invalid'}),store:{status:async()=>{statusCalls++;return {ok:true,status:200}}}});
 assert.equal((await call(handler,'GET','/health')).status,200);
 for(const method of ['POST','PATCH','DELETE']){const out=await call(handler,method,'/health');assert.equal(out.status,405);assert.equal(out.body.code,'method_not_allowed');}
 assert.equal(statusCalls,0);
});
