import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createDevReadHandler} from '../../services/api/dev-read-handler.mjs';
const origin='https://dev-lm.mw-credit.com';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test('real HTTP completion references are unique, private and preserve boundary behavior',async()=>{
 const logs=[];let reads=0;const store=new Proxy({}, {get:()=>async()=>{reads++;return {ok:false,status:503,code:'source_unavailable'}}});
 const server=createServer(createDevReadHandler({config:{origins:[origin]},verifyPrincipal:async token=>token==='Bearer synthetic-good'?{ok:true,email:'synthetic@example.test',subject:'synthetic'}:{ok:false,status:401,code:'sign_in_required'},store,completionLogger:r=>logs.push(r)}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const base=`http://127.0.0.1:${server.address().port}`;const seen=new Set();
 const cases=[['/health',{},200,'health'],['/api/borrowers?q=SECRET_QUERY',{},401,'borrowers_list'],['/api/borrowers/SECRET_RECORD',{headers:{origin:'https://bad.example.test'}},403,'borrower_detail'],['/api/borrowers',{method:'POST'},405,'borrowers_list'],['/api/borrowers',{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET','access-control-request-headers':'Authorization'}},204,'preflight'],['/api/borrowers?q=SECRET_QUERY',{headers:{origin,authorization:'Bearer synthetic-good'}},503,'borrowers_list'],['/api/borrowers/SECRET_RECORD/loans/SECRET_LOAN',{headers:{origin,authorization:'Bearer synthetic-good'}},503,'loan_detail'],['/api/collection/SECRET_RECORD/upcoming/2026-10-09?businessDate=2026-10-08',{headers:{origin,authorization:'Bearer synthetic-good'}},503,'upcoming_date']];
 for(const[path,options,status,operation]of cases){const before=reads;const r=await fetch(base+path,{...options,headers:{...options.headers,'x-request-id':'attacker-reference'}});const body=await r.text();const id=r.headers.get('x-request-id');assert.match(id,uuid);assert.ok(!seen.has(id));seen.add(id);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('vary'),'Origin');assert.equal(r.headers.get('access-control-expose-headers'),options.headers?.origin===origin?'X-Request-ID':null);assert.ok(!body.includes(id));if(status!==503)assert.equal(reads,before);await new Promise(resolve=>setImmediate(resolve));const log=logs.at(-1);assert.equal(log.requestId,id);assert.equal(log.operation,operation);assert.equal(log.status,status);assert.deepEqual(Object.keys(log).sort(),['code','durationMs','event','method','operation','requestId','status']);assert.equal(log.event,'read_request');assert.ok(Number.isInteger(log.durationMs)&&log.durationMs>=0);assert.doesNotMatch(JSON.stringify(log),/SECRET|synthetic|Bearer|attacker|https/);}
 assert.equal(logs.length,cases.length);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('throwing completion logger cannot corrupt actual HTTP response',async()=>{
 const server=createServer(createDevReadHandler({config:{origins:[origin]},verifyPrincipal:async()=>{throw Error('PRIVATE_STACK')},store:{},completionLogger:()=>{throw Error('PRIVATE_LOGGER')}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/session`);assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,code:'read_unavailable'});assert.match(r.headers.get('x-request-id'),uuid)}finally{await new Promise(resolve=>server.close(resolve))}
});
