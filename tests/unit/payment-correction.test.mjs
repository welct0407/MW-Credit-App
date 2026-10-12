import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPaymentCorrection} from '../../services/contracts/payment-correction.mjs';
const fields={borrowerId:'fixture-borrower',amountReceived:'10',paymentDate:'2026-10-09',paymentMethod:'Cash',cashAccountId:'fixture-account',notes:' exact\nไทย ',allocationMethod:'Selected Charges',targetChargeId:null,targetLoanId:null};
const line={chargeId:'fixture-charge',principal:'7',interest:'3',expectedPrincipalRemaining:'8',expectedInterestRemaining:'4',chargeDate:'2026-10-08'};
test('payment revision retains exact manual split, component baselines and notes',()=>{
 const input={kind:'pwa-plan',fields:{...fields,allocations:[line]},receiptMode:'preserve'};
 assert.deepEqual(canonicalPaymentCorrection(input),input);
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,allocations:[{...line,principal:'8'}]}}));
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,allocations:Array(1)}}));
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,createdBy:'caller'}}));
});
test('legacy correction keeps its source method and canonical explicit selected IDs',()=>{
 const input={kind:'legacy-source',fields:{...fields,selectedChargeIds:['z','a']},receiptMode:'remove'};
 assert.deepEqual(canonicalPaymentCorrection(input).fields.selectedChargeIds,['a','z']);
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,selectedChargeIds:['a','a']}}));
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,selectedChargeIds:['two words']}}));
 assert.equal(canonicalPaymentCorrection({...input,fields:{...input.fields,allocationMethod:'Lump Sum',selectedChargeIds:null}}).fields.selectedChargeIds,null);
});
test('correction protocol refuses unknown receipt actions and fractional receipt totals',()=>{
 const input={kind:'pwa-plan',fields:{...fields,allocations:[line]},receiptMode:'replace'};
 assert.throws(()=>canonicalPaymentCorrection({...input,receiptMode:'overwrite-path'}));
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,amountReceived:'10.01'}}));
 assert.throws(()=>canonicalPaymentCorrection({...input,fields:{...input.fields,paymentDate:'2026-02-30'}}));
});

test('operation envelope preserves revision predecessor and enforces receipt mode binding',async()=>{
 const {canonicalOperation,operationIdentity}=await import('../../services/contracts/operation-command.mjs');
 const request={requestId:'11111111-1111-4111-8111-111111111111',operation:'payment.correct',targetId:'existing-payment',expectedVersion:'a'.repeat(64),predecessorRequestId:'22222222-2222-4222-8222-222222222222',inputs:{kind:'pwa-plan',fields:{...fields,allocations:[line]},receiptMode:'preserve'},receiptId:null};
 const actor={issuer:'https://securetoken.google.com/synthetic',subject:'synthetic-owner',partnerId:'fixture-partner',loginEmail:'owner@example.invalid'};
 assert.equal(canonicalOperation(request).predecessorRequestId,request.predecessorRequestId);
 assert.equal(JSON.parse(operationIdentity(request,actor).canonicalJson).command.predecessorRequestId,request.predecessorRequestId);
 assert.throws(()=>canonicalOperation({...request,inputs:{...request.inputs,receiptMode:'replace'}}));
 assert.throws(()=>canonicalOperation({...request,receiptId:'33333333-3333-4333-8333-333333333333'}));
 assert.equal(canonicalOperation({...request,operation:'payment.delete',inputs:{}}).targetId,'existing-payment');
 assert.deepEqual(canonicalOperation({...request,operation:'payment.move-interest',inputs:{allocationId:'allocation',targetChargeId:'charge'}}).inputs,{allocationId:'allocation',targetChargeId:'charge'});
 assert.throws(()=>canonicalOperation({...request,operation:'payment.delete',inputs:{amount:'10'}}));
});
