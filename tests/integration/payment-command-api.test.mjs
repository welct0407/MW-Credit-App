import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { disposablePool } from '../../scripts/rehearsal/disposable-pool.mjs';
import { seedPaymentFixture } from '../../scripts/rehearsal/payment-fixture.mjs';
import { createCommandPrincipalVerifier } from '../../services/payment-command/principal.mjs';
import { createPaymentCommandStore } from '../../services/payment-command/store.mjs';
import { createPaymentCommandHandler } from '../../services/payment-command/handler.mjs';
import { DEV_PROJECT,OWNER_EMAIL } from '../../services/api/dev-read-config.mjs';
let pool,server,origin,handler;const logs=[],verifications=[];const subject='synthetic-command-owner';
before(async()=>{
 pool=await disposablePool(78);
 const verifyPrincipal=createCommandPrincipalVerifier({ownerUid:subject,verifyIdToken:async(token,revoked)=>{verifications.push({token,revoked});if(token!=='synthetic-valid')throw Error('syntheticinvalid');return {aud:DEV_PROJECT,iss:`https://securetoken.google.com/${DEV_PROJECT}`,sub:subject,email:OWNER_EMAIL,email_verified:true,firebase:{sign_in_provider:'google.com'},iat:1,auth_time:1,exp:Math.floor(Date.now()/1000)+3600}}});
 const store=createPaymentCommandStore({pool,expectedDirectory:process.env.PAYMENT_REHEARSAL_DIRECTORY});
 server=http.createServer((req,res)=>handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 handler=createPaymentCommandHandler({origins:[origin],verifyPrincipal,store,completionLogger:event=>logs.push(event)});
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await pool.end()});
async function fixture(prefix){await seedPaymentFixture(pool,prefix);await pool.query('UPDATE "Partners" SET "Login Email"=$1 WHERE "Row ID"=\'4A-ACTOR\'',[OWNER_EMAIL]);const day=(await pool.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;return {schemaVersion:3,requestId:randomUUID(),borrowerId:prefix+'-B',selectedChargeIds:[prefix+'-C1',prefix+'-C2'],cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'  ไทย\n<Notes>😀  ',receiptId:null}}
const headers={'Authorization':'Bearer synthetic-valid','Content-Type':'application/json'};
async function post(command,extra={}){return fetch(origin+'/api/payment-commands',{method:'POST',headers:{...headers,Origin:origin,...extra},body:JSON.stringify(command)})}
test('real HTTP candidate posts and replays via verified pinned identity/current mapping',async()=>{
 const command=await fixture('4A-API-B');const first=await post(command);assert.equal(first.status,200);const result=await first.json();assert.equal(result.originalOutcome.status,'posted');assert.equal(first.headers.get('cache-control'),'no-store');assert.match(first.headers.get('x-request-id'),/^[0-9a-f-]{36}$/);assert.notEqual(first.headers.get('x-request-id'),command.requestId);
 assert.deepEqual(await(await post(command)).json(),result);
 const status=await fetch(origin+'/api/payment-commands/'+command.requestId,{headers});assert.equal(status.status,200);assert.deepEqual(await status.json(),result);
 assert.equal((await post({...command,notes:'changed'})).status,409);assert.ok(verifications.every(v=>v.revoked===true));
 const row=(await pool.query('SELECT "Created By","Notes" FROM "Payments" WHERE "Row ID"=$1',['pwa:'+command.requestId])).rows[0];assert.equal(row['Created By'],OWNER_EMAIL);assert.equal(row.Notes,command.notes);
});
test('typed durable rejection, unsupported receipt and strict body do not silently post',async()=>{
 const c=await fixture('4A-API-REJECT');const stale=await post({...c,paymentDate:'2020-01-01'});assert.equal(stale.status,422);assert.equal((await stale.json()).originalOutcome.code,'invalid_date');
 const receipt=await post({...c,requestId:randomUUID(),receiptId:randomUUID()});assert.equal(receipt.status,422);assert.equal((await receipt.json()).code,'receipt_unsupported');
 const actor=await post({...c,actor:{subject}});assert.equal(actor.status,400);
 assert.equal((await fetch(origin+'/api/payment-commands/'+randomUUID(),{headers})).status,200);
});
test('CORS/auth and sanitized finish logging preserve command privacy',async()=>{
 const c=await fixture('4A-API-BOUNDARY');const n=verifications.length;
 assert.equal((await post(c,{Origin:'http://evil.invalid'})).status,403);assert.equal(verifications.length,n);
 assert.equal((await post(c,{Authorization:'Bearer invalid'})).status,401);
 assert.equal((await fetch(origin+'/api/payment-commands',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'}})).status,204);
 assert.equal((await fetch(origin+'/api/payment-commands?secret=private',{headers})).status,400);
 await new Promise(resolve=>setImmediate(resolve));assert.ok(logs.length>0);
 for(const log of logs){assert.deepEqual(Object.keys(log).sort(),['code','durationMs','event','method','operation','requestId','status']);const text=JSON.stringify(log);for(const privateValue of [OWNER_EMAIL,subject,c.borrowerId,'synthetic-valid','private'])assert.ok(!text.includes(privateValue))}
});
