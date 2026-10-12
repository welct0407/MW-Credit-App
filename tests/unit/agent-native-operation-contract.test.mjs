import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalNativeOperation,nativeOperationIdentity} from '../../services/agent-conversations/native-operation-contract.mjs';
const id='12345678-1234-4234-8234-123456789abc';
const actor={issuer:'https://accounts.google.com',subject:'12345',partnerId:'partner:synthetic',loginEmail:'reviewer@example.invalid'};
const payment=()=>({requestId:id,operation:'payment.create',targetId:id,expectedVersion:null,predecessorRequestId:null,receiptId:null,
 inputs:{borrowerId:'borrower:synthetic',amountReceived:'92233720368547758',paymentDate:'2020-02-29',createdAt:'2020-02-29 23:59:59.123456',
 paymentMethod:'Bank Transfer',allocationMethod:'Lump Sum',bankReference:'bank:synthetic',notes:'',targetChargeId:null,targetLoanId:null,cashAccountId:'account:synthetic',cashHolderId:null}});
const allocation=()=>({...payment(),operation:'allocation.create',inputs:{paymentId:'payment:synthetic',chargeId:'charge:synthetic',
 chargeDateSnapshot:null,chargeRowNumberSnapshot:'2147483647',interestRemainingSnapshot:'92233720368547758.07',principalRemainingSnapshot:'-92233720368547758.07',
 amountRemainingSnapshot:'0.00',allocationOrder:null,allocatedInterest:'10.10',allocatedPrincipal:'0',allocatedAmount:'10.1',createdAt:null}});
test('ordinary payment preserves historical wall time, metadata and six modes without receipt authority',()=>{
 for(const mode of ['Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close']){
  const input=payment();input.inputs.allocationMethod=mode;
  const result=canonicalNativeOperation(input);assert.deepEqual(result,input);assert.ok(Object.isFrozen(result.inputs));
 }
 for(const [key,value] of [['amountReceived','1.00'],['amountReceived','0'],['amountReceived','92233720368547759'],['amountReceived',1],['allocationMethod','Selected Charges'],['createdAt',null]]){
  const input=payment();input.inputs[key]=value;assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
});
test('allocation decimal and integer boundaries preserve exact strings and nulls',()=>{
 assert.deepEqual(canonicalNativeOperation(allocation()).inputs,allocation().inputs);
 for(const [key,value] of [['allocatedAmount','92233720368547758.08'],['allocatedAmount','-92233720368547758.08'],['allocatedAmount','1e2'],['allocatedAmount','0.001'],['allocationOrder','2147483648'],['allocationOrder','-2147483648'],['paymentId',null]]){
  const input=allocation();input.inputs[key]=value;assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
});
test('date/time never rolls over, accepts timezone, or truncates microseconds',()=>{
 for(const value of ['2020-02-30 00:00:00','2020-02-29 24:00:00','2020-02-29 23:60:00','2020-02-29 23:59:60','2020-02-29T23:59:59Z','2020-02-29 23:59:59.1234567','0000-01-01 00:00:00']){
  const input=payment();input.inputs.createdAt=value;assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
 for(const value of ['2021-02-29','2020-13-01','2020-01-32']){
  const input=payment();input.inputs.paymentDate=value;assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
});
test('exact contracts deny extra/defaulted/computed fields and stale identity shapes',()=>{
 for(const field of ['Status','Processed At','Created By','receiptId','selectedChargeIds']){
  const input=payment();input.inputs[field]='forged';assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
 for(const key of Object.keys(payment().inputs)){
  const input=payment();delete input.inputs[key];assert.throws(()=>canonicalNativeOperation(input),/invalid_request/);
 }
 for(const edit of [{receiptId:id},{predecessorRequestId:id},{requestId:id.toUpperCase()},{expectedVersion:'a'.repeat(64)},{targetId:'existing'}]){
  assert.throws(()=>canonicalNativeOperation({...payment(),...edit}),/invalid_request/);
 }
 const symbol=payment();symbol[Symbol('hidden')]=1;assert.throws(()=>canonicalNativeOperation(symbol),/invalid_request/);
 const polluted=payment();polluted.inputs=Object.create(payment().inputs);assert.throws(()=>canonicalNativeOperation(polluted),/invalid_request/);
});
test('update/delete require exact existing version; deletion carries no replacement fields',()=>{
 const update={...allocation(),operation:'allocation.update',targetId:'legacy:allocation',expectedVersion:'a'.repeat(64)};
 assert.deepEqual(canonicalNativeOperation(update),update);
 assert.throws(()=>canonicalNativeOperation({...update,expectedVersion:null}),/invalid_request/);
 const del={...update,operation:'allocation.delete',inputs:{}};assert.deepEqual(canonicalNativeOperation(del),del);
 assert.throws(()=>canonicalNativeOperation({...del,inputs:{paymentId:'p'}}),/invalid_request/);
});
test('source timestamp metadata edit requires current version/head and permits no financial fields',()=>{
 const update={...payment(),operation:'payment.update-metadata',targetId:'legacy:payment',expectedVersion:'a'.repeat(64),
  predecessorRequestId:id,inputs:{createdAt:'2020-02-29 12:00:00.000001'}};
 assert.deepEqual(canonicalNativeOperation(update),update);
 assert.equal(JSON.parse(nativeOperationIdentity(update,actor).canonicalJson).command.predecessorRequestId,id);
 assert.deepEqual(canonicalNativeOperation({...update,predecessorRequestId:null,inputs:{createdAt:null}}).inputs,{createdAt:null});
 for(const change of [{expectedVersion:null},{predecessorRequestId:'unknown'},{receiptId:id},
  {inputs:{createdAt:update.inputs.createdAt,amountReceived:'1'}},{inputs:{createdAt:'2020-02-29T12:00:00Z'}}]){
  assert.throws(()=>canonicalNativeOperation({...update,...change}),/invalid_request/);
 }
});
test('v2 identity is deterministic across key order and rejects browser/actor spoofing',()=>{
 const input=payment(), reversed=Object.fromEntries(Object.entries(input).reverse());
 reversed.inputs=Object.fromEntries(Object.entries(input.inputs).reverse());
 const a=nativeOperationIdentity(input,actor),b=nativeOperationIdentity(reversed,Object.fromEntries(Object.entries(actor).reverse()));
 assert.equal(a.canonicalJson,b.canonicalJson);
 const envelope=JSON.parse(a.canonicalJson);assert.equal(envelope.contractVersion,2);assert.equal(envelope.receipt,null);
 assert.equal(envelope.command.targetType,'payment');assert.equal(envelope.command.inputs.createdAt,input.inputs.createdAt);
 for(const change of [{issuer:'https://securetoken.google.com/project'},{subject:'firebase-user'},{loginEmail:'UPPER@example.invalid'},{partnerId:'x\n'}]){
  assert.throws(()=>nativeOperationIdentity(input,{...actor,...change}),/invalid_request/);
 }
 const malicious=payment();malicious.inputs.notes='\ud800';assert.throws(()=>canonicalNativeOperation(malicious),/invalid_request/);
 malicious.inputs.notes='\0';assert.throws(()=>canonicalNativeOperation(malicious),/invalid_request/);
});
