import test from 'node:test';import assert from 'node:assert/strict';
import {BUDGET} from '../../services/lib/budget.mjs';
import {createIamPool} from '../../services/lib/pool.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// APP-PAY-03: the request budget fits inside the unchanged 15 s Cloud Run request timeout.
const modules=record=>async()=>({connector:{AuthTypes:{IAM:'IAM'},IpAddressTypes:{PUBLIC:'PUBLIC'},Connector:class{async getOptions(o){record.options=o;return {stream:'synthetic'};}close(){record.closed=true;}}},pg:{Pool:class{constructor(o){record.pool=o;}}}});
test('budget: worst-case verify + connect + statement stays below 15 s',()=>{
 assert.equal(BUDGET.connectMs,3000);assert.equal(BUDGET.statementMs.command,8000);assert.equal(BUDGET.lockMs,3000);
 assert.ok(2000+BUDGET.connectMs+BUDGET.statementMs.command<15000);assert.ok(BUDGET.httpRequestTimeoutMs<15000);
});
test('IAM pool factory applies connect, statement and query budgets per service role',async()=>{
 for(const [serviceRole,statement,query] of [['command',8000,9000],['reader',5000,7000]]){
  const record={};const {pool,close}=await createIamPool({instance:'synthetic:region:instance',dbUser:'synthetic@example.iam',database:'synthetic_db',serviceRole},modules(record));
  assert.ok(pool);assert.deepEqual(record.options,{instanceConnectionName:'synthetic:region:instance',ipType:'PUBLIC',authType:'IAM'});
  assert.deepEqual(record.pool,{stream:'synthetic',user:'synthetic@example.iam',database:'synthetic_db',max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:30000,statement_timeout:statement,query_timeout:query});
  close();assert.equal(record.closed,true);
 }
 const record={};await createIamPool({instance:'i',dbUser:'u',database:'d',connectMs:5000,statementMs:100000,queryMs:105000},modules(record));
 assert.equal(record.pool.statement_timeout,100000);assert.equal(record.pool.connectionTimeoutMillis,5000);
 await assert.rejects(createIamPool({instance:'i',dbUser:'u',database:'d',serviceRole:'unknown'},modules({})),/Invalid database budget/);
});
test('command transaction sets an 8 s statement and 3 s lock timeout',async()=>{
 const sql=[];const client={async query(text){sql.push(text);if(text.startsWith('SELECT public.pwa_command_status_v1'))return {rows:[{result:{ok:true}}]};return {rows:[]};},release(){}};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'synthetic-issuer',subject:'s',partnerId:'p',loginEmail:'e@example.invalid'}),actorIssuer:'synthetic-issuer'});
 await store.status({ok:true,subject:'s',email:'e@example.invalid'},'11111111-1111-4111-8111-111111111111');
 assert.ok(sql.includes("SET LOCAL statement_timeout='8000ms'"),sql.join('|'));assert.ok(sql.includes("SET LOCAL lock_timeout='3000ms'"));
});
