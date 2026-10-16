import test from 'node:test';import assert from 'node:assert/strict';
// APP-PAY-05: the unused in-process replay classifier is gone; SQL owns replay (pwa_submit_selected_charges_v1).
test('payment command contract exports only the canonical builders used by services',async()=>{
 const contract=await import('../../services/contracts/payment-command.mjs');
 assert.deepEqual(Object.keys(contract).sort(),['canonicalActor','canonicalAllocationPlan','canonicalCommand','canonicalReceipt','commandIdentity']);
 assert.equal('classifyReplay' in contract,false);
});
