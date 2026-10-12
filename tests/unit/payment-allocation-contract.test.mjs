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
