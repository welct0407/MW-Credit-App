import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironmentCommandStore} from '../../services/payment-command/store.mjs';
// R131: before V121 (no pwa_pay_forward_plan_v1) the remainder preview is no preview. It used to return a null value, which
// run() dereferenced after COMMIT (value.kind): a TypeError, a quarantined connection and a logged 503 the caller ignored
// (seen in the receiving group's V82 fixture). Synthetic pool; no database.
test('remainder preview without the pay-forward plan function: no preview, no 503, the connection is kept',async()=>{
 const released=[],lines=[],client={query:async sql=>/to_regprocedure\('public\.pwa_pay_forward_plan_v1/.test(sql)?{rows:[{present:false}]}:{rows:[],rowCount:0},release:quarantine=>released.push(quarantine)};
 const store=createEnvironmentCommandStore({pool:{connect:async()=>client},guardConnection:async()=>{},principalAllowed:()=>true,
  resolveActor:async()=>({issuer:'synthetic-issuer',subject:'s',partnerId:'p',loginEmail:'e@example.invalid'}),actorIssuer:'synthetic-issuer'});
 const log=console.log;console.log=line=>lines.push(String(line));
 let preview;try{preview=await store.remainderPreview({ok:true,subject:'s',email:'e@example.invalid'},'B-SYNTHETIC','100')}finally{console.log=log}
 assert.equal(preview,undefined);
 assert.deepEqual(released,[false],'the connection goes back to the pool, not quarantined');
 assert.deepEqual(lines.filter(line=>line.includes('command_store_unavailable')),[],'no 503 is logged');
});
