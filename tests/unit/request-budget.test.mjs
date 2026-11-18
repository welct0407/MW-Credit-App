import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {BUDGET} from '../../services/lib/budget.mjs';
import {createIamPool} from '../../services/lib/pool.mjs';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// APP-PAY-03: the request budget fits inside the unchanged 15 s Cloud Run request timeout.
const modules=record=>async()=>({connector:{AuthTypes:{IAM:'IAM'},IpAddressTypes:{PUBLIC:'PUBLIC'},Connector:class{async getOptions(o){record.options=o;return {stream:'synthetic'};}close(){record.closed=true;}}},pg:{Pool:class{constructor(o){record.pool=o;}on(event,_listener){record.listeners=[...(record.listeners??[]),event];}}}});
test('budget: worst-case verify + connect + statement stays below 15 s',()=>{
 assert.equal(BUDGET.connectMs,3000);assert.equal(BUDGET.statementMs.command,8000);assert.equal(BUDGET.lockMs,3000);
 assert.ok(2000+BUDGET.connectMs+BUDGET.statementMs.command<15000);assert.ok(BUDGET.httpRequestTimeoutMs<15000);
});
test('IAM pool factory applies connect, statement and query budgets per service role',async()=>{
 for(const [serviceRole,statement,query,max,idle] of [['command',8000,9000,6,600000],['reader',5000,7000,2,30000]]){
  const record={};const {pool,close}=await createIamPool({instance:'synthetic:region:instance',dbUser:'synthetic@example.iam',database:'synthetic_db',serviceRole},modules(record));
  assert.ok(pool);assert.deepEqual(record.options,{instanceConnectionName:'synthetic:region:instance',ipType:'PUBLIC',authType:'IAM'});
  assert.deepEqual(record.pool,{stream:'synthetic',user:'synthetic@example.iam',database:'synthetic_db',max,connectionTimeoutMillis:3000,idleTimeoutMillis:idle,keepAlive:true,keepAliveInitialDelayMillis:60000,statement_timeout:statement,query_timeout:query});
  assert.deepEqual(record.listeners,['error','connect']);close();assert.equal(record.closed,true);
 }
 const record={};await createIamPool({instance:'i',dbUser:'u',database:'d',connectMs:5000,statementMs:100000,queryMs:105000},modules(record));
 assert.equal(record.pool.statement_timeout,100000);assert.equal(record.pool.connectionTimeoutMillis,5000);
 await assert.rejects(createIamPool({instance:'i',dbUser:'u',database:'d',serviceRole:'unknown'},modules({})),/Invalid database budget/);
});
// R175: a socket error on a checked-out client (pg-pool detaches its idle listener on checkout) must not reach the process
// as an unhandled 'error' event; the client is discarded on release because pg marks it unqueryable.
class SyntheticClient extends EventEmitter{
 constructor(){super();this._queryable=false;this._ending=false}
 connect(callback){this._queryable=true;setImmediate(callback)}
 query(){return Promise.resolve({rows:[]})}
 reset(){const error=Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'});this._queryable=false;this.emit('error',error)}
 end(callback){this._ending=true;this._queryable=false;setImmediate(()=>{this.emit('end');callback?.()})}
}
const realModules=async()=>({connector:{AuthTypes:{IAM:'IAM'},IpAddressTypes:{PUBLIC:'PUBLIC'},Connector:class{async getOptions(){return {Client:SyntheticClient}}close(){}}},pg:(await import('pg')).default});
test('IAM pool survives ECONNRESET on a checked-out client and discards it on release',async()=>{
 const {pool,close}=await createIamPool({instance:'i',dbUser:'u',database:'d',serviceRole:'reader'},realModules);
 try{
  const client=await pool.connect();assert.equal(pool.totalCount,1);
  let thrown=null;try{client.reset()}catch(error){thrown=error}
  client.release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(thrown,null,'ECONNRESET on a checked-out client reached the process');
  assert.equal(pool.totalCount,0);assert.equal(pool.idleCount,0);
  // Without the connect listener the same reset is an unhandled 'error' event.
  const bare=new (await import('pg')).default.Pool({Client:SyntheticClient});
  const exposed=await bare.connect();assert.throws(()=>exposed.reset(),/ECONNRESET/);exposed.release();await bare.end();
 }finally{await pool.end();close()}
});
test('command transaction sets an 8 s statement and 3 s lock timeout',async()=>{
 const sql=[];const client={async query(text){sql.push(text);if(text.startsWith('SELECT public.pwa_command_status_v1'))return {rows:[{result:{ok:true}}]};return {rows:[]};},release(){}};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,resolveActor:async()=>({issuer:'synthetic-issuer',subject:'s',partnerId:'p',loginEmail:'e@example.invalid'}),actorIssuer:'synthetic-issuer'});
 await store.status({ok:true,subject:'s',email:'e@example.invalid'},'11111111-1111-4111-8111-111111111111');
 assert.ok(sql.includes("SET LOCAL statement_timeout='8000ms'"),sql.join('|'));assert.ok(sql.includes("SET LOCAL lock_timeout='3000ms'"));
});
