import test from 'node:test';
import assert from 'node:assert/strict';
import {disposablePool} from '../../scripts/rehearsal/disposable-pool.mjs';
test('actual PostgreSQL restart preserves committed outcomes and replay cannot recreate deleted source',async()=>{
 const pool=await disposablePool(78);
 try{
  const records=(await pool.query('SELECT request_id,canonical_json,outcome,payment_id,rejection_code FROM public.pwa_payment_commands ORDER BY request_id')).rows;
  assert.ok(records.length>=5,'Prior focused run must have committed records before restart');
  const before=(await pool.query('SELECT count(*)::int n FROM public."Payments"')).rows[0].n;
  for(const row of records){
   const envelope=JSON.parse(row.canonical_json);
   const result=(await pool.query('SELECT public.pwa_submit_selected_charges_v1($1) result',[row.canonical_json])).rows[0].result;
   assert.equal(result.kind,'recorded');assert.equal(result.originalOutcome.status,row.outcome);assert.equal(result.originalOutcome.paymentId,row.payment_id);assert.equal(result.originalOutcome.code,row.rejection_code);
   const status=(await pool.query('SELECT public.pwa_command_status_v1($1,$2,$3) result',[row.request_id,envelope.actor.issuer,envelope.actor.subject])).rows[0].result;
   assert.deepEqual(status,result);
  }
  assert.equal((await pool.query('SELECT count(*)::int n FROM public."Payments"')).rows[0].n,before);
 }finally{await pool.end()}
});
