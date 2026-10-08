import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
import {seedPaymentFixture} from '../../scripts/rehearsal/payment-fixture.mjs';
import {commandIdentity} from '../../services/contracts/payment-command.mjs';
let pool;
before(async()=>{pool=await disposablePool(78)});after(async()=>pool?.end());
const actor={issuer:'https://synthetic.example.invalid',subject:'synthetic-owner',partnerId:'4A-ACTOR',loginEmail:'4A-owner@example.invalid'};
async function fixture(prefix){await seedPaymentFixture(pool,prefix);const day=(await pool.query("SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text AS day")).rows[0].day;return {schemaVersion:3,requestId:randomUUID(),borrowerId:prefix+'-B',selectedChargeIds:[prefix+'-C1',prefix+'-C2'],cashAccountId:'4A-RECEIVE',paymentDate:day,amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'  ไทย\n"quote" \\ slash\t😀\b\f  ',receiptId:null}}
const identity=command=>commandIdentity(command,actor,null);
async function submit(command,db=pool){return (await db.query('SELECT public.pwa_submit_selected_charges_v1($1) result',[identity(command).canonicalJson])).rows[0].result}
async function status(command){return (await pool.query('SELECT public.pwa_command_status_v1($1,$2,$3) result',[command.requestId,actor.issuer,actor.subject])).rows[0].result}
test('canonical JS/SQL parity posts330 and retains exact bytes/notes in one transaction',async()=>{
 const c=await fixture('4A-JOURNAL-B');const result=await submit(c);assert.equal(result.kind,'recorded');assert.equal(result.originalOutcome.status,'posted');assert.equal(result.originalOutcome.paymentId,'pwa:'+c.requestId);
 const row=(await pool.query('SELECT canonical_json,payload_sha256 FROM pwa_payment_commands WHERE request_id=$1',[c.requestId])).rows[0];assert.deepEqual(row,{canonical_json:identity(c).canonicalJson,payload_sha256:identity(c).payloadSha256});
 assert.equal((await pool.query('SELECT "Notes" FROM "Payments" WHERE "Row ID"=$1',['pwa:'+c.requestId])).rows[0].Notes,c.notes);
 assert.deepEqual(await submit(c),result);assert.deepEqual(await status(c),result);assert.equal((await submit({...c,notes:'changed'})).kind,'conflict');
});
test('typed wrapper rejection is retained but engine errors roll back without journal',async()=>{
 const c=await fixture('4A-JOURNAL-REJECT');const stale={...c,paymentDate:'2020-01-01'};assert.equal((await submit(stale)).originalOutcome.code,'invalid_date');assert.equal((await submit(stale)).originalOutcome.status,'rejected');
 const bad={...c,requestId:randomUUID(),amountReceived:'329'};await assert.rejects(submit(bad),e=>e.code==='P0001');assert.equal((await status(bad)).kind,'unresolved');
 assert.equal(Number((await pool.query('SELECT count(*) n FROM "Payments" WHERE "Row ID"=$1',['pwa:'+bad.requestId])).rows[0].n),0);
});
test('outer rollback leaves neither payment nor journal; post-commit lost response reconciles',async()=>{
 const c=await fixture('4A-JOURNAL-ROLLBACK');const client=await pool.connect();try{await client.query('BEGIN');assert.equal((await submit(c,client)).originalOutcome.status,'posted');await client.query('ROLLBACK')}finally{client.release()}
 assert.equal((await status(c)).kind,'unresolved');assert.equal(Number((await pool.query('SELECT count(*) n FROM "Payments" WHERE "Row ID"=$1',['pwa:'+c.requestId])).rows[0].n),0);
 const second=await pool.connect();const transport={query:async sql=>{const response=await second.query(sql);if(sql==='COMMIT')throw Error('simulated_acknowledgment_loss');return response}};try{await transport.query('BEGIN');await submit(c,second);await assert.rejects(transport.query('COMMIT'),/simulated_acknowledgment_loss/)}finally{second.release()}
 assert.equal((await status(c)).originalOutcome.status,'posted');assert.equal((await submit(c)).originalOutcome.status,'posted');
});
test('request lock serializes same identity; unrelated IDs reuse existing borrower lock',async()=>{
 const c=await fixture('4A-JOURNAL-RACE');const results=await Promise.all([submit(c),submit(c)]);assert.deepEqual(results[0],results[1]);assert.equal(Number((await pool.query('SELECT count(*) n FROM "Payments" WHERE "Row ID"=$1',['pwa:'+c.requestId])).rows[0].n),1);
 const d=await fixture('4A-JOURNAL-RACE2');const two=await Promise.allSettled([submit(d),submit({...d,requestId:randomUUID()})]);assert.equal(two.filter(r=>r.status==='fulfilled').length,1);assert.equal(two.filter(r=>r.status==='rejected').length,1);
});
test('append-only outcome survives ordinary source deletion and process-independent lookup',async()=>{
 const c=await fixture('4A-JOURNAL-DELETE');const original=await submit(c);await pool.query('DELETE FROM "Payments" WHERE "Row ID"=$1',['pwa:'+c.requestId]);assert.deepEqual(await submit(c),original);
 const independent=await disposablePool(78);try{assert.deepEqual(await submit(c,independent),original)}finally{await independent.end()}
 for(const sql of ['UPDATE pwa_payment_commands SET outcome=outcome WHERE request_id=$1','DELETE FROM pwa_payment_commands WHERE request_id=$1'])await assert.rejects(pool.query(sql,[c.requestId]),e=>e.code==='55000');
 await assert.rejects(pool.query('TRUNCATE pwa_payment_commands'),e=>e.code==='55000');
});
