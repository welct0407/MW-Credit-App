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
 assert.throws(()=>canonicalCommand({...v7,schemaVersion:8}),'v8 needs payerName');
 assert.throws(()=>canonicalCommand({...v7,schemaVersion:9,payerName:null}));
});
test('R095 v8 = v7 plus payerLines after transferTime (Bank Transfer only); v7 stays accepted and refuses it',()=>{
 const payerLines={before:null,after:'นาย สมชาย ใ***'};
 const v8={...command,schemaVersion:8,paymentMethod:'Bank Transfer',bankReference:'ab-12 34 cd',transferTime:'09:41',payerLines};
 const value=canonicalCommand(v8);
 assert.deepEqual(Object.keys(value),['schemaVersion','requestId','borrowerId','allocations','cashAccountId','paymentDate','amountReceived','paymentMethod','notes','receiptId','bankReference','transferTime','payerLines']);
 assert.deepEqual(canonicalCommand(value),value,'canonical form is a fixed point');
 assert.match(commandIdentity(v8,actor,null).canonicalJson,/"transferTime":"09:41","payerLines":\{"before":null,"after":"นาย สมชาย ใ\*\*\*"\}\},"actor"/);
 assert.equal(canonicalCommand({...v8,payerLines:null}).payerLines,null);
 assert.equal(canonicalCommand({...v8,payerLines:null,bankReference:null,transferTime:null,paymentMethod:'Cash'}).payerLines,null,'Cash learns nothing');
 assert.notEqual(commandIdentity(v8,actor,null).payloadSha256,commandIdentity({...v8,payerLines:{before:'x y z',after:'นาย สมชาย ใ***'}},actor,null).payloadSha256);
 for(const bad of [{payerLines:{before:null,after:''}},{payerLines:{before:null,after:'a\u0007b'}},{payerLines:{before:null,after:'e\u0301mile'}},{payerLines:'x'},{paymentMethod:'Cash',bankReference:null,transferTime:null}])
  assert.throws(()=>canonicalCommand({...v8,...bad}),undefined,JSON.stringify(bad));
 const {payerLines:_,...missing}=v8;assert.throws(()=>canonicalCommand(missing));
 assert.throws(()=>canonicalCommand({...v8,schemaVersion:7}),'v7 refuses payerLines');
});
test('R101 v9 = v8 plus materialize, set last: entries bound to a whole-charge line, one per loan, sorted by chargeId',()=>{
 const due={...line,chargeId:'C1'};
 const next={chargeId:'cg8:5:L-ไทย:2026-10-12',principal:'0',interest:'3',expectedPrincipalRemaining:'0',expectedInterestRemaining:'70',chargeDate:'2026-10-12'};
 const other={chargeId:'cg8:3:L-2:2026-10-10',principal:'4',interest:'0',expectedPrincipalRemaining:'20',expectedInterestRemaining:'10',chargeDate:'2026-10-10'};
 const entry={loanId:'L-ไทย',chargeId:next.chargeId,chargeDate:'2026-10-12',principalDue:'0',interestDue:'70'};
 const entry2={loanId:'L-2',chargeId:other.chargeId,chargeDate:'2026-10-10',principalDue:'20',interestDue:'10'};
 const v9={...command,schemaVersion:9,allocations:[next,due,other],amountReceived:'14',paymentMethod:'Bank Transfer',bankReference:null,transferTime:null,payerLines:null,materialize:[entry,entry2]};
 const value=canonicalCommand(v9);
 assert.deepEqual(Object.keys(value),['schemaVersion','requestId','borrowerId','allocations','cashAccountId','paymentDate','amountReceived','paymentMethod','notes','receiptId','bankReference','transferTime','payerLines','materialize']);
 assert.deepEqual(value.allocations.map(row=>row.chargeId),['C1','cg8:3:L-2:2026-10-10','cg8:5:L-ไทย:2026-10-12'],'byte order');
 assert.deepEqual(value.materialize.map(row=>row.loanId),['L-2','L-ไทย'],'entries sorted by chargeId');
 assert.deepEqual(Object.keys(value.materialize[0]),['loanId','chargeId','chargeDate','principalDue','interestDue']);
 assert.ok(Object.isFrozen(value.materialize[0]));assert.deepEqual(canonicalCommand(value),value,'canonical form is a fixed point');
 assert.match(commandIdentity(v9,actor,null).canonicalJson,/"payerLines":null,"materialize":\[\{"loanId":"L-2","chargeId":"cg8:3:L-2:2026-10-10","chargeDate":"2026-10-10","principalDue":"20","interestDue":"10"\},\{"loanId":"L-ไทย","chargeId":"cg8:5:L-ไทย:2026-10-12",/);
 // The key counts code points, as SQL length() does: 'L-ไทย' is 5 characters and 11 bytes.
 for(const bad of [{materialize:[]},{materialize:null},{materialize:[{...entry,chargeId:'cg8:11:L-ไทย:2026-10-12'}]},{materialize:[{...entry,interestDue:'69'}]},{materialize:[{...entry,interestDue:70}]},
   {materialize:[{...entry,extra:'1'}]},{materialize:[entry,entry]},{materialize:[entry,{...entry,chargeId:'cg8:5:L-ไทย:2026-10-10',chargeDate:'2026-10-10'}]},{materialize:[{...entry,principalDue:'0',interestDue:'0'}]},{materialize:[{...entry,loanId:' L-ไทย'}]}])
  assert.throws(()=>canonicalCommand({...v9,...bad}),undefined,JSON.stringify(bad));
 const {materialize:_,...missing}=v9;assert.throws(()=>canonicalCommand(missing),'v9 needs materialize');
 assert.throws(()=>canonicalCommand({...v9,schemaVersion:8}),'v8 refuses materialize');
});
