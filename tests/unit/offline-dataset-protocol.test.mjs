import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createEnvironmentCommandHandler} from '../../services/payment-command/handler.mjs';
import {notificationHandler} from '../../services/notifications/handler.mjs';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {businessEnv} from './business-env-fixture.mjs';
// APP-OFFLINE-06: protocol 1 (one whole-domain response) is retired; a protocol is required.
const call=(handler,url)=>{const res=new EventEmitter(),out={};res.setHeader=()=>{};res.once=res.once.bind(res);res.end=b=>{out.status=res.statusCode;out.body=b?JSON.parse(b):undefined;res.emit('finish')};const req=new EventEmitter();Object.assign(req,{method:'GET',url,headers:{authorization:'Bearer synthetic'}});return handler(req,res).then(()=>out);};
const principal=async()=>({ok:true,subject:'s',email:'e@example.invalid'});
test('business offline dataset without protocol=2 is a 400 before the store',async()=>{
 const seen=[];const handler=createEnvironmentCommandHandler({config:loadBusinessConfig(businessEnv('dev','command')),verifyPrincipal:principal,store:{offlineDataset:async(...args)=>{seen.push(args[3]);return {ok:true,status:200,chunk:true}}}});
 for(const url of ['/api/offline-dataset?domain=records','/api/offline-dataset?domain=records&protocol=1','/api/offline-dataset?domain=records&cursor=x'])assert.equal((await call(handler,url)).status,400,url);
 assert.equal(seen.length,0);
 assert.equal((await call(handler,'/api/offline-dataset?domain=records&protocol=2')).status,200);assert.equal(seen[0].protocol,2);
});
test('notification offline dataset without protocol=2 is a 400 before the store',async()=>{
 const seen=[];const handler=notificationHandler({next:()=>{throw Error('next')},enabled:true,offlineDataset:true,origins:[],verifyPrincipal:principal,store:{offlineDataset:async(_p,_s,options)=>{seen.push(options);return {ok:true}}}});
 for(const url of ['/api/notifications/offline-dataset','/api/notifications/offline-dataset?protocol=1','/api/notifications/offline-dataset?cursor=x'])assert.equal((await call(handler,url)).status,400,url);
 assert.equal(seen.length,0);
 assert.equal((await call(handler,'/api/notifications/offline-dataset?protocol=2')).status,200);assert.deepEqual(seen[0],{protocol:2,cursor:null});
});
