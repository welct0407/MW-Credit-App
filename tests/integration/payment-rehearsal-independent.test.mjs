import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {createPaymentRehearsal,paymentId,TRUSTED_ACTOR} from '../../scripts/rehearsal/payment-command.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
let pool;before(async()=>{pool=await disposablePool()});after(async()=>{await pool?.end()});
async function fixture(prefix){await seedPaymentFixture(pool,prefix);const provider=createPaymentRehearsal({pool});return {provider,command:{schemaVersion:2,notes:null,receiptId:null,requestId:randomUUID(),borrowerId:prefix+'-B',selectedChargeIds:[prefix+'-C2',prefix+'-C1'],cashAccountId:'4A-RECEIVE',paymentDate:await provider.businessDate(),amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges'}}}
async function effects(id){return(await pool.query('SELECT (SELECT count(*) FROM "Payments" WHERE "Row ID"=$1)::int AS receipts,(SELECT count(*) FROM "Repayments" WHERE "Ref Payment"=$1)::int AS repayments,(SELECT count(*) FROM "Payment Allocations" WHERE "Ref Payment"=$1)::int AS allocations,(SELECT count(*) FROM "Cash Ledger" WHERE "Ref Payment"=$1)::int AS ledger',[paymentId(id)])).rows[0]}
test('independent reconciliation uses exact decimal strings and actor propagation',async()=>{
 const {provider,command}=await fixture('4A-C-EXACT');assert.equal((await provider.submit(command)).status,'posted');
 const rows=(await pool.query('SELECT "Ref Charges" AS charge,"Principal Paid"::numeric::text AS principal,"Interest Paid"::numeric::text AS interest,"Created By" AS actor FROM "Repayments" WHERE "Ref Payment"=$1 ORDER BY "Ref Charges" COLLATE "C"',[paymentId(command.requestId)])).rows;
 assert.deepEqual(rows,[{charge:'4A-C-EXACT-C1',principal:'100.00',interest:'10.00',actor:TRUSTED_ACTOR},{charge:'4A-C-EXACT-C2',principal:'200.00',interest:'20.00',actor:TRUSTED_ACTOR}]);
 assert.deepEqual(await effects(command.requestId),{receipts:1,repayments:2,allocations:2,ledger:1});
 const unchanged=(await pool.query('SELECT "Row ID" AS id,"Amount Remaining"::text AS remaining FROM "Charges" WHERE "Row ID"=ANY($1) ORDER BY "Row ID" COLLATE "C"',[['4A-C-EXACT-FOREIGN','4A-C-EXACT-FUTURE','4A-C-EXACT-UNSELECTED']])).rows;assert.deepEqual(unchanged.map(x=>x.remaining),['33.00','10.00','55.00']);
});
test('independent provider instances contend on stable receipt PK without memory serialization',async()=>{
 const {provider,command}=await fixture('4A-C-SAMEKEY');const other=createPaymentRehearsal({pool});const results=await Promise.all([provider.submit(command),other.submit(command)]);assert.ok(results.every(x=>x.status==='posted'),'Both identical requests must reconcile to the one posted receipt');assert.deepEqual(await effects(command.requestId),{receipts:1,repayments:2,allocations:2,ledger:1});
});
test('lost COMMIT acknowledgment is unknown until fresh status; precommit fault rolls back',async()=>{
 for(const afterCommit of [true,false]){const {command}=await fixture(afterCommit?'4A-C-UNKNOWN':'4A-C-ROLLBACK');let injected=false;const wrapped={query:(...args)=>pool.query(...args),connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(sql,...args)=>{if(!injected&&((afterCommit&&sql==='COMMIT')||(!afterCommit&&sql.startsWith('INSERT INTO public."Payments"')))){injected=true;if(afterCommit)await client.query(sql,...args);throw Error('synthetic transport failure')}return client.query(sql,...args)}}}};const provider=createPaymentRehearsal({pool:wrapped});const result=await provider.submit(command);assert.equal(result.status,afterCommit?'unknown':'rejected');if(afterCommit){assert.equal((await provider.status(command.requestId)).status,'posted');assert.deepEqual(await effects(command.requestId),{receipts:1,repayments:2,allocations:2,ledger:1})}else assert.deepEqual(await effects(command.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});}
});
test('same-key retry never returns cached posted after ordinary source correction or deletion',async()=>{
 const {provider,command}=await fixture('4A-C-REPLAY');assert.equal((await provider.submit(command)).status,'posted');
 await pool.query('UPDATE "Payments" SET "Selected Charge IDs"=$2,"Amount Received"=55::money WHERE "Row ID"=$1',[paymentId(command.requestId),'4A-C-REPLAY-UNSELECTED']);
 assert.notEqual((await provider.submit(command)).status,'posted','Original command must not appear posted after correction');
 await pool.query('DELETE FROM "Payments" WHERE "Row ID"=$1',[paymentId(command.requestId)]);
 assert.notEqual((await provider.submit(command)).status,'posted','Deletion must not be masked by cached success');assert.deepEqual(await effects(command.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});
});
test('known command survives Bangkok date rollover but new stale-day command is rejected',async()=>{
 const {command}=await fixture('4A-C-DAY');let nextDay=false;const wrapped={connect:()=>pool.connect(),query:async(sql,...args)=>{const result=await pool.query(sql,...args);if(nextDay&&sql.includes("AS day")&&sql.includes('CURRENT_TIMESTAMP')){const d=new Date(result.rows[0].day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return{...result,rows:[{day:d.toISOString().slice(0,10)}]}}return result}};
 const provider=createPaymentRehearsal({pool:wrapped});assert.equal((await provider.submit(command)).status,'posted');nextDay=true;assert.equal((await provider.submit(command)).status,'posted');const fresh={...command,requestId:randomUUID()};assert.equal((await provider.submit(fresh)).status,'rejected');assert.deepEqual(await effects(command.requestId),{receipts:1,repayments:2,allocations:2,ledger:1});assert.deepEqual(await effects(fresh.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});
});
test('inactive account, missing actor mapping and changed residual reject with no partial effects',async()=>{
 const {command}=await fixture('4A-C-GUARDS');await pool.query('INSERT INTO "Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name","Active") VALUES(\'4A-C-INACTIVE\',\'ch:dad\',\'Synthetic inactive account\',\'Synthetic\',false)');
 const provider=createPaymentRehearsal({pool});const inactive={...command,requestId:randomUUID(),cashAccountId:'4A-C-INACTIVE'};assert.equal((await provider.submit(inactive)).status,'rejected');assert.deepEqual(await effects(inactive.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});
 const unmapped=createPaymentRehearsal({pool,trustedActor:'unmapped-4A@example.invalid'});const missing={...command,requestId:randomUUID()};assert.equal((await unmapped.submit(missing)).status,'rejected');assert.deepEqual(await effects(missing.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});
 const first={...command,requestId:randomUUID(),selectedChargeIds:['4A-C-GUARDS-C1'],amountReceived:'110'};assert.equal((await provider.submit(first)).status,'posted');assert.equal((await provider.submit(command)).status,'rejected');assert.deepEqual(await effects(command.requestId),{receipts:0,repayments:0,allocations:0,ledger:0});assert.deepEqual(await effects(first.requestId),{receipts:1,repayments:1,allocations:1,ledger:1});
});
