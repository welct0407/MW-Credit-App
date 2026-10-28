// R102-DEV-01: every service the PWA calls cross-origin accepts X-MW-Wake-Deadline in a CORS preflight (the PWA sends
// it on reads since R090), and still refuses an unknown request header. Synthetic origins and principals; no I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBusinessConfig} from '../../services/production/business-config.mjs';
import {createReadHandler} from '../../services/api/read-handler.mjs';
import {createProductionFoundationHandler} from '../../services/production/handler.mjs';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {notificationHandler} from '../../services/notifications/handler.mjs';
import {businessEnv} from './business-env-fixture.mjs';

const DEV='https://dev-lm.mw-credit.com',LOOPBACK='http://127.0.0.1:4173';
const unreachable=async()=>{throw Error('preflight must not authenticate');};
async function preflight(handler,{origin,url,method='GET',headers}){
 const saved={};let body;
 const res={setHeader:(k,v)=>{saved[k]=v;},removeHeader:k=>{delete saved[k];},once:()=>{},end:v=>{body=v;}};
 await handler({method:'OPTIONS',url,headers:{origin,'access-control-request-method':method,'access-control-request-headers':headers}},res);
 return {status:res.statusCode,allow:saved['Access-Control-Allow-Headers'],origin:saved['Access-Control-Allow-Origin'],body};
}
const services=[
 {name:'read service',origin:DEV,url:'/api/borrowers',handler:()=>createReadHandler({config:loadBusinessConfig(businessEnv('dev','reader')),verifyPrincipal:unreachable,store:{}})},
 {name:'foundation (business runtime without activation)',origin:'https://lm.mw-credit.com',url:'/api/session',
  handler:()=>createProductionFoundationHandler({config:{origins:['https://lm.mw-credit.com'],serviceRole:'reader'},verifyPrincipal:unreachable})},
 {name:'payment command service',origin:LOOPBACK,url:'/api/collection-records',handler:()=>createPaymentCommandHandler({origins:[LOOPBACK],verifyPrincipal:unreachable,store:{}})},
 {name:'notification service',origin:DEV,url:'/api/notifications',
  handler:()=>notificationHandler({next:()=>{throw Error('not delegated');},store:{},verifyPrincipal:unreachable,origins:[DEV],enabled:true})},
];

for(const service of services)test(`${service.name}: a preflight with authorization, x-mw-wake-deadline is granted; an unknown header is refused`,async()=>{
 const handler=service.handler();
 const granted=await preflight(handler,{origin:service.origin,url:service.url,headers:'authorization, x-mw-wake-deadline'});
 assert.equal(granted.status,204);assert.equal(granted.origin,service.origin);
 assert.ok(granted.allow.split(',').map(h=>h.trim().toLowerCase()).includes('x-mw-wake-deadline'),granted.allow);
 const refused=await preflight(handler,{origin:service.origin,url:service.url,headers:'authorization, x-mw-wake-deadline, x-unknown'});
 assert.equal(refused.status,403);assert.equal(refused.allow,undefined);
 const stranger=await preflight(handler,{origin:'https://other.example.test',url:service.url,headers:'authorization, x-mw-wake-deadline'});
 assert.equal(stranger.status,403);
});
