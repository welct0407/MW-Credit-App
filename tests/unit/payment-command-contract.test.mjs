import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalCommand, canonicalActor, canonicalReceipt, commandIdentity, classifyReplay } from '../../services/contracts/payment-command.mjs';
const requestId='a1111111-1111-4111-8111-111111111111';
const command={schemaVersion:3,requestId,borrowerId:'borrower-ไทย',selectedChargeIds:['z','ก','A'],cashAccountId:'account-1',paymentDate:'2026-10-08',amountReceived:'330',paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:'  ไทย\n<Notes>  ',receiptId:null};
const actor={issuer:'https://issuer.example.invalid',subject:'owner-subject',partnerId:'partner-1',loginEmail:' OWNER@example.invalid '};
const originalOutcome={status:'posted',paymentId:'payment-1',code:null,recordedAt:'2026-10-08T00:01:02.003Z'};
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
test('replay preserves original outcome without a current-source dependency',()=>{
 const identity=commandIdentity(command,actor,null);const stored={...identity,outcome:originalOutcome};
 assert.deepEqual(classifyReplay(null,identity),{kind:'unresolved'});
 const replay=classifyReplay(stored,identity);assert.deepEqual(replay,{kind:'replay',originalOutcome});assert.notEqual(replay.originalOutcome,originalOutcome);assert.ok(Object.isFrozen(replay.originalOutcome));
 for(const incoming of [commandIdentity({...command,notes:'changed'},actor,null),commandIdentity(command,{...actor,subject:'other'},null)])assert.deepEqual(classifyReplay(stored,incoming),{kind:'conflict'});
 // No current Payment or receipt is read; subsequent correction/deletion cannot replace this retained outcome.
 assert.deepEqual(classifyReplay(stored,identity).originalOutcome,originalOutcome);
 assert.deepEqual(classifyReplay({...stored,outcome:{status:'rejected',paymentId:null,code:'posting_rejected',recordedAt:originalOutcome.recordedAt}},identity).originalOutcome.status,'rejected');
});
test('corrupt stored records fail closed rather than imply safe retry',()=>{
 const identity=commandIdentity(command,actor,null),stored={...identity,outcome:originalOutcome};
 for(const value of [{...stored,payloadSha256:'0'.repeat(64)},{...stored,canonicalJson:'{}'},{...stored,outcome:{...originalOutcome,status:'pending'}},{...stored,outcome:{...originalOutcome,recordedAt:'2026-02-30T00:00:00Z'}},{...stored,extra:true}])assert.throws(()=>classifyReplay(value,identity),/invalid_stored_record/);
});
