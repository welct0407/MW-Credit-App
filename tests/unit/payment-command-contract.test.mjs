import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalCommand, canonicalActor, canonicalReceipt, commandIdentity } from '../../services/contracts/payment-command.mjs';
const requestId='a1111111-1111-4111-8111-111111111111';
const command={schemaVersion:3,requestId,borrowerId:'borrower-ไทย',selectedChargeIds:['z','ก','A'],cashAccountId:'account-1',paymentDate:'2026-10-08',amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'  ไทย\n<Notes>  ',receiptId:null};
const actor={issuer:'https://issuer.example.invalid',subject:'owner-subject',partnerId:'partner-1',loginEmail:' OWNER@example.invalid '};

test('canonical identity is deterministic, copied, immutable and byte-exact',()=>{
 const c=canonicalCommand(command);assert.deepEqual(c.selectedChargeIds,['A','z','ก']);assert.equal(c.notes,command.notes);assert.equal(canonicalActor(actor).loginEmail,'owner@example.invalid');
 const identity=commandIdentity(command,actor,null);const reordered=Object.fromEntries(Object.entries(command).reverse());assert.deepEqual(commandIdentity({...reordered,selectedChargeIds:['ก','A','z']},actor,null),identity);
 assert.equal(identity.payloadSha256,createHash('sha256').update(identity.canonicalJson).digest('hex'));assert.ok(Object.isFrozen(identity));assert.ok(Object.isFrozen(c.selectedChargeIds));assert.notEqual(c.selectedChargeIds,command.selectedChargeIds);
 assert.equal(canonicalCommand({...command,notes:''}).notes,null);assert.equal(canonicalCommand({...command,notes:' '}).notes,' ');
});
test('strict command validation rejects lossy and unsupported values',()=>{
 for(const patch of [{extra:true},{schemaVersion:2},{amountReceived:330},{amountReceived:'0330'},{amountReceived:'330.1'},{amountReceived:'92233720368547759'},{paymentDate:'2026-02-30'},{notes:'\ud800'},{notes:'a\0b'},{notes:'ก'.repeat(22000)},{borrowerId:' x'},{selectedChargeIds:['one two']},{selectedChargeIds:['a,b']},{selectedChargeIds:['a','a']},{selectedChargeIds:['\udfff']}])assert.throws(()=>canonicalCommand({...command,...patch}));
 assert.equal(canonicalCommand({...command,amountReceived:'92233720368547758'}).amountReceived,'92233720368547758');
});
test('receipt identity includes trusted opaque reference and exact descriptor',()=>{
 const receipt={receiptId:'b1111111-1111-4111-8111-111111111111',sha256:'a'.repeat(64),mimeType:'image/png',sizeBytes:123,storageReference:'opaque-adapter-reference'};
 assert.ok(Object.isFrozen(canonicalReceipt(receipt)));assert.throws(()=>commandIdentity(command,actor,receipt));
 const c={...command,receiptId:receipt.receiptId};const first=commandIdentity(c,actor,receipt);assert.notEqual(commandIdentity(c,actor,{...receipt,storageReference:'another-opaque-reference'}).payloadSha256,first.payloadSha256);
 for(const patch of [{sha256:'A'.repeat(64)},{mimeType:'image/svg+xml'},{sizeBytes:0},{sizeBytes:5242881},{storageReference:'bad\nreference'},{extra:true}])assert.throws(()=>canonicalReceipt({...receipt,...patch}));
});
test('R101 v9 canonical bytes match the SQL validator (multi-byte loan id, materialize after payerLines)',()=>{
 const id='cg8:7:PCP-ไทย:2026-10-30';
 const v9={schemaVersion:9,requestId:'b4444444-4444-4444-8444-444444444441',borrowerId:'PCP-B4',allocations:[{chargeId:id,principal:'0',interest:'70',expectedPrincipalRemaining:'0',expectedInterestRemaining:'70',chargeDate:'2026-10-30'}],cashAccountId:'CI-LISA',paymentDate:'2026-10-26',amountReceived:'70',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,payerLines:null,materialize:[{interestDue:'70',principalDue:'0',chargeDate:'2026-10-30',chargeId:id,loanId:'PCP-ไทย'}]};
 const identity=commandIdentity(v9,{issuer:'https://pcp.invalid',subject:'pcp-owner',partnerId:'PCP-ACT',loginEmail:'pcp-actor@example.invalid'},null);
 assert.equal(identity.canonicalJson,'{"contractVersion":1,"command":{"schemaVersion":9,"requestId":"b4444444-4444-4444-8444-444444444441","borrowerId":"PCP-B4","allocations":[{"chargeId":"cg8:7:PCP-ไทย:2026-10-30","principal":"0","interest":"70","expectedPrincipalRemaining":"0","expectedInterestRemaining":"70","chargeDate":"2026-10-30"}],"cashAccountId":"CI-LISA","paymentDate":"2026-10-26","amountReceived":"70","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null,"materialize":[{"loanId":"PCP-ไทย","chargeId":"cg8:7:PCP-ไทย:2026-10-30","chargeDate":"2026-10-30","principalDue":"0","interestDue":"70"}]},"actor":{"issuer":"https://pcp.invalid","subject":"pcp-owner","partnerId":"PCP-ACT","loginEmail":"pcp-actor@example.invalid"},"receipt":null}');
 assert.equal(identity.payloadSha256,createHash('sha256').update(identity.canonicalJson).digest('hex'));
});
test('R110 v10 canonical bytes match the SQL validator (pay forward after a booked principal repayment)',()=>{
 const forward='cg8:5:PF-D3:2026-11-09',today='pf121:5:PF-D3:2026-11-02';
 const v10={schemaVersion:10,requestId:'c3333333-3333-4333-8333-333333333333',borrowerId:'PF-B3',allocations:[{chargeId:today,principal:'1000',interest:'300',expectedPrincipalRemaining:'1000',expectedInterestRemaining:'300',chargeDate:'2026-11-02'},{chargeId:forward,principal:'0',interest:'630',expectedPrincipalRemaining:'0',expectedInterestRemaining:'630',chargeDate:'2026-11-09'}],
  cashAccountId:'CI-LISA',paymentDate:'2026-11-02',amountReceived:'1930',paymentMethod:'Bank Transfer',notes:null,receiptId:null,bankReference:null,transferTime:null,payerLines:null,
  materialize:[{loanId:'PF-D3',chargeId:forward,chargeDate:'2026-11-09',principalDue:'0',interestDue:'630'}],principal:[{loanId:'PF-D3',kind:'book',chargeId:today,chargeDate:'2026-11-02',amount:'1000',accruedInterest:'300',principalDue:'1000'}]};
 const identity=commandIdentity(v10,{issuer:'https://pf.invalid',subject:'pf-owner',partnerId:'PF-ACT',loginEmail:'pf-actor@example.invalid'},null);
 assert.equal(identity.canonicalJson,'{"contractVersion":1,"command":{"schemaVersion":10,"requestId":"c3333333-3333-4333-8333-333333333333","borrowerId":"PF-B3","allocations":[{"chargeId":"cg8:5:PF-D3:2026-11-09","principal":"0","interest":"630","expectedPrincipalRemaining":"0","expectedInterestRemaining":"630","chargeDate":"2026-11-09"},{"chargeId":"pf121:5:PF-D3:2026-11-02","principal":"1000","interest":"300","expectedPrincipalRemaining":"1000","expectedInterestRemaining":"300","chargeDate":"2026-11-02"}],"cashAccountId":"CI-LISA","paymentDate":"2026-11-02","amountReceived":"1930","paymentMethod":"Bank Transfer","notes":null,"receiptId":null,"bankReference":null,"transferTime":null,"payerLines":null,"materialize":[{"loanId":"PF-D3","chargeId":"cg8:5:PF-D3:2026-11-09","chargeDate":"2026-11-09","principalDue":"0","interestDue":"630"}],"principal":[{"loanId":"PF-D3","kind":"book","chargeId":"pf121:5:PF-D3:2026-11-02","chargeDate":"2026-11-02","amount":"1000","accruedInterest":"300","principalDue":"1000"}]},"actor":{"issuer":"https://pf.invalid","subject":"pf-owner","partnerId":"PF-ACT","loginEmail":"pf-actor@example.invalid"},"receipt":null}');
 assert.equal(identity.payloadSha256,createHash('sha256').update(identity.canonicalJson).digest('hex'));
});
