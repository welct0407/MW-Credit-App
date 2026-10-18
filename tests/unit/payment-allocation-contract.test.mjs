import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCommand,commandIdentity} from '../../services/contracts/payment-command.mjs';
const line={chargeId:'C1',principal:'7',interest:'0',expectedPrincipalRemaining:'10',expectedInterestRemaining:'2',chargeDate:'2026-10-08'};
const command={schemaVersion:6,requestId:'a1111111-1111-4111-8111-111111111111',borrowerId:'B',allocations:[line],cashAccountId:'A',paymentDate:'2026-10-08',amountReceived:'7',paymentMethod:'Cash',notes:' ไทย\n ',receiptId:null};
const actor={issuer:'test',subject:'owner',partnerId:'partner',loginEmail:'owner@example.invalid'};
test('v6 plan is exact, immutable and binds paid and reviewed components',()=>{
 const value=canonicalCommand(command);assert.ok(Object.isFrozen(value.allocations[0]));assert.equal(value.notes,command.notes);
 const initial=commandIdentity(command,actor,null);
 assert.notEqual(commandIdentity({...command,allocations:[{...line,expectedPrincipalRemaining:'11'}]},actor,null).payloadSha256,initial.payloadSha256);
 for(const allocations of [Array(1),[{...line,principal:'07'}],[{...line,principal:'-1'}],[{...line,principal:'7.0'}],[{...line,principal:'11'}],[{...line,extra:1}],[line,line],[{...line,chargeDate:'2026-02-30'}]])assert.throws(()=>canonicalCommand({...command,allocations}));
 assert.throws(()=>canonicalCommand({...command,amountReceived:'8'}));assert.throws(()=>canonicalCommand({...command,selectedChargeIds:['C1']}));
});
test('R075 v7 adds the normalized slip bank reference and HH:MM transfer time after receiptId; v6 stays accepted',()=>{
 const v7={...command,schemaVersion:7,paymentMethod:'Bank Transfer',bankReference:'ab-12 34 cd',transferTime:'09:41:27'};
 const value=canonicalCommand(v7);assert.equal(value.bankReference,'AB1234CD');assert.equal(value.transferTime,'09:41');assert.ok(Object.isFrozen(value));
 assert.deepEqual(Object.keys(value),['schemaVersion','requestId','borrowerId','allocations','cashAccountId','paymentDate','amountReceived','paymentMethod','notes','receiptId','bankReference','transferTime']);
 assert.deepEqual(canonicalCommand(value),value,'canonical form is a fixed point');
 assert.match(commandIdentity(v7,actor,null).canonicalJson,/"receiptId":null,"bankReference":"AB1234CD","transferTime":"09:41"\},"actor"/);
 assert.deepEqual(canonicalCommand({...v7,bankReference:null,transferTime:null,paymentMethod:'Cash'}).bankReference,null);
 assert.equal(canonicalCommand(command).schemaVersion,6);assert.equal(Object.hasOwn(canonicalCommand(command),'bankReference'),false);
 for(const bad of [{bankReference:'AB12'},{bankReference:'AB12/34CD'},{bankReference:'A'.repeat(101)},{bankReference:12345678},{transferTime:'9:41'},{transferTime:'24:00'},{transferTime:'09:41:27.5'},{transferTime:''},{paymentMethod:'Cash'},{paymentMethod:'Cash',bankReference:null}])
  assert.throws(()=>canonicalCommand({...v7,...bad}),undefined,JSON.stringify(bad));
 const {transferTime,...missing}=v7;void transferTime;assert.throws(()=>canonicalCommand(missing));
 assert.throws(()=>canonicalCommand({...command,bankReference:null,transferTime:null}),'v6 refuses the v7 keys');
 assert.throws(()=>canonicalCommand({...v7,schemaVersion:8}));
});
