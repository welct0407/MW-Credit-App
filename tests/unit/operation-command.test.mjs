import {canonicalLoanFields} from '../../services/business/loans.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
const fields={name:'ชื่อ ไทย',description:null,communicationName:null,instagramUsername:null,city:null,workingLocation:null,address:null,hidden:null,referrerId:null,preferredReceivingAccountId:null,note:' exact\n '};
const command={requestId:'12345678-1234-4234-8234-123456789abc',operation:'borrower.create',targetId:'12345678-1234-4234-8234-123456789abd',expectedVersion:null,predecessorRequestId:null,inputs:fields,receiptId:null};const actor={issuer:'https://securetoken.google.com/fixture',subject:'fixture-owner',partnerId:'fixture-partner',loginEmail:'owner@example.invalid'};

test('optional borrower AI toggle does not inject a field into old command identities',()=>{const legacy=canonicalOperation(command);assert.deepEqual(legacy.inputs,fields);assert.equal(Object.hasOwn(legacy.inputs,'aiCollectionEnabled'),false);for(const flag of[true,false,null]){const updated=canonicalOperation({...command,inputs:{...fields,aiCollectionEnabled:flag}});assert.equal(updated.inputs.aiCollectionEnabled,flag);assert.equal(Object.keys(updated.inputs).at(-1),'aiCollectionEnabled');assert.notEqual(operationIdentity(updated,actor).payloadSha256,operationIdentity(command,actor).payloadSha256)}for(const flag of['true',0,{},undefined])assert.throws(()=>canonicalOperation({...command,inputs:{...fields,aiCollectionEnabled:flag}}));});

test('partner delivery emails and editable flags remain separate from forged actor fields',()=>{const inputs={partnerName:'Synthetic partner',partnerRole:'B',loginEmail:null,email:'valid+alias@example.test',instagramUsername:null,languagePreference:'English',igIntegrationEnabled:true,aiReviewer:true};const c={...command,operation:'partner.create',inputs};assert.deepEqual(canonicalOperation(c).inputs,inputs);for(const email of['bad','a\n@example.test','x'.repeat(321)+'@example.test'])assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,email}}));for(const forged of['actor','partnerId','capability','enrolled'])assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,[forged]:true}}));assert.throws(()=>canonicalOperation({...c,inputs:{...inputs,aiReviewer:'true'}}));});
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

test('R104 loan.book-projected-charge: a versioned loan target, closed date and whole-baht inputs, canonical key order',()=>{
 const version='a'.repeat(64),book={requestId:'12345678-1234-4234-8234-123456789abc',operation:'loan.book-projected-charge',targetId:'LOAN-1',expectedVersion:version,predecessorRequestId:null,receiptId:null,inputs:{interestDue:'70',chargeDate:'2026-11-01',principalDue:'0'}};
 const canonical=canonicalOperation(book);
 assert.deepEqual(Object.keys(canonical.inputs),['chargeDate','principalDue','interestDue'],'the SQL canonical order');
 const json=operationIdentity(book,actor).canonicalJson;
 assert.ok(json.includes('"operation":"loan.book-projected-charge","targetType":"loan","targetId":"LOAN-1","expectedVersion":"'+version+'"'));
 assert.ok(json.includes('"inputs":{"chargeDate":"2026-11-01","principalDue":"0","interestDue":"70"}'),'the charge id is derived, never an input');
 assert.equal(operationIdentity({...book,inputs:{chargeDate:'2026-11-01',principalDue:'0',interestDue:'70'}},actor).payloadSha256,operationIdentity(book,actor).payloadSha256);
 const bad=[{...book,expectedVersion:null},{...book,expectedVersion:'A'.repeat(64)},{...book,receiptId:'12345678-1234-4234-8234-123456789abe'},{...book,predecessorRequestId:'12345678-1234-4234-8234-123456789abe'},
  {...book,inputs:{...book.inputs,chargeId:'cg8:6:LOAN-1:2026-11-01'}},{...book,inputs:{chargeDate:'2026-11-01',principalDue:'0'}}];
 for(const [key,value] of [['chargeDate','2026-02-30'],['chargeDate','2026-11-1'],['chargeDate',null],['principalDue','0.5'],['principalDue','-1'],['principalDue','01'],['principalDue',0],['interestDue','1e2'],['interestDue','92233720368547759'],['interestDue','0']])bad.push({...book,inputs:{...book.inputs,principalDue:key==='interestDue'&&value==='0'?'0':book.inputs.principalDue,[key]:value}});
 for(const value of bad)assert.throws(()=>canonicalOperation(value),/invalid_request/,JSON.stringify(value.inputs));
 assert.doesNotThrow(()=>canonicalOperation({...book,inputs:{chargeDate:'2026-11-01',principalDue:'16',interestDue:'0'}}),'one component may be zero');
});
