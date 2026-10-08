import {canonicalLoanFields} from '../../services/business/loans.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
const fields={name:'ชื่อ ไทย',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:' exact\n '};
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,inputs:fields,receiptId:null};const actor={issuer:'https://securetoken.google.com/fixture',subject:'fixture-owner',partnerId:'fixture-partner',loginEmail:'owner@example.invalid'};
test('operation identities bind stable closed source inputs and server actor',()=>{const identity=operationIdentity(command,actor);assert.equal(JSON.parse(identity.canonicalJson).contractVersion,2);assert.equal(JSON.parse(identity.canonicalJson).command.inputs.note,fields.note);assert.equal(operationIdentity({...command,inputs:{...fields}},actor).payloadSha256,identity.payloadSha256);assert.notEqual(operationIdentity({...command,inputs:{...fields,note:'changed'}},actor).payloadSha256,identity.payloadSha256);assert.notEqual(operationIdentity(command,{...actor,subject:'other'}).payloadSha256,identity.payloadSha256);for(const invalid of [{...command,actor},{...command,operation:'arbitrary.sql'},{...command,receiptId:command.requestId},{...command,inputs:{...fields,createdDate:'2026-10-08'}},{...command,expectedVersion:'a'.repeat(64)}])assert.throws(()=>canonicalOperation(invalid));});

test('loan codec preserves decimal precision and nullable legacy terms without inventing an arrangement enum',()=>{
 const fields={borrowerId:'B',loanDate:'2026-10-08',principal:'100.25',transferFee:'0.50',disbursingAccountId:'A',type:'ดอกเบี้ยรายวัน',dueDate:null,dailyPayment:null,fixedInterest:null,currentDailyInterest:'5.25',paymentInterval:1,arrangement:' exact ไทย ',autoChargeEnabled:true};
 assert.deepEqual(canonicalLoanFields(fields,{create:true}),fields);
 for(const value of ['1.001','-1','1e2',1])assert.throws(()=>canonicalLoanFields({...fields,principal:value},{create:true}));
 assert.throws(()=>canonicalLoanFields({...fields,loanDate:'2026-02-30'},{create:true}));
 assert.deepEqual(canonicalLoanFields({...fields,principal:null}),{...fields,principal:null});
 assert.throws(()=>canonicalLoanFields({...fields,principal:null},{create:true}));
 assert.throws(()=>canonicalLoanFields({...fields,originalRate:5},{create:true}));
});
