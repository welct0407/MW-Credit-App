import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalExpenseFields,expenseCategories} from '../../services/contracts/expense-command.mjs';
import {canonicalOperation,operationIdentity} from '../../services/contracts/operation-command.mjs';
const input={expenseDate:'2026-10-09',category:expenseCategories[0],amount:'10',payeeName:null,relatedBorrowerId:null,relatedLoanId:null,notes:' ไทย\n exact ',paidByAccountId:'fixture-account'};
test('expense codec preserves signed whole money and exact notes with governed create requirements',()=>{
 assert.deepEqual(canonicalExpenseFields(input,{create:true}),input);
 assert.equal(canonicalExpenseFields({...input,amount:'-10',paidByAccountId:null},{create:true}).amount,'-10');
 for(const amount of ['0','-0','10.01','01'])assert.throws(()=>canonicalExpenseFields({...input,amount}));
 for(const notes of [null,'  \n'])assert.throws(()=>canonicalExpenseFields({...input,amount:'-10',notes}));
 // R140 (V142): a positive expense without an account is pending payment, on create and on update.
 assert.equal(canonicalExpenseFields({...input,paidByAccountId:null},{create:true}).paidByAccountId,null);
 assert.equal(canonicalExpenseFields({...input,paidByAccountId:null}).paidByAccountId,null);
});
test('expense codec permits legacy category for source comparison but forbids source-owned input',()=>{
 assert.equal(canonicalExpenseFields({...input,category:'Retained legacy category'}).category,'Retained legacy category');
 assert.throws(()=>canonicalExpenseFields({...input,category:'Retained legacy category'},{create:true}));
 for(const key of ['sourceType','paidByHolderId','partnerAShare'])assert.throws(()=>canonicalExpenseFields({...input,[key]:'forged'}));
 assert.throws(()=>canonicalExpenseFields({...input,expenseDate:'2026-02-30'}));
});
test('R140 (V143) payeeBorrowerId is an optional last key: a borrower without a typed name, null with free text, absent stays 8 keys',()=>{
 const linked=canonicalExpenseFields({...input,payeeName:null,payeeBorrowerId:'B-1'},{create:true});
 assert.deepEqual(Object.keys(linked),['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId','payeeBorrowerId']);
 assert.equal(linked.payeeBorrowerId,'B-1');
 assert.equal(canonicalExpenseFields({...input,payeeName:'Dad',payeeBorrowerId:null}).payeeBorrowerId,null);
 assert.equal('payeeBorrowerId' in canonicalExpenseFields(input),false,'an older 8-key command stays 8 keys');
 assert.throws(()=>canonicalExpenseFields({...input,payeeName:'Typed',payeeBorrowerId:'B-1'}),/invalid_request/,'a borrower and a typed name');
 for(const bad of ['','a\nb','x'.repeat(257),42,true])assert.throws(()=>canonicalExpenseFields({...input,payeeName:null,payeeBorrowerId:bad}),/invalid_request/,String(bad));
 // The canonical JSON puts payeeBorrowerId last, after paidByAccountId, and only when it was given.
 const base={requestId:'00000000-0000-4000-8000-000000000001',operation:'expense.create',targetId:'00000000-0000-4000-8000-000000000002',expectedVersion:null,predecessorRequestId:null,receiptId:null};
 const actor={issuer:'https://synthetic.invalid',subject:'s',partnerId:'P1',loginEmail:'p1@example.invalid'};
 const nine=operationIdentity({...base,inputs:{...input,payeeName:null,payeeBorrowerId:'B-1'}},actor).canonicalJson,eight=operationIdentity({...base,inputs:input},actor).canonicalJson;
 assert.match(nine,/"paidByAccountId":"fixture-account","payeeBorrowerId":"B-1"\}\}/);assert.match(eight,/"paidByAccountId":"fixture-account"\}\}/);
 assert.equal(canonicalOperation({...base,operation:'expense.update',targetId:'E-1',expectedVersion:'a'.repeat(64),inputs:{...input,payeeName:null,payeeBorrowerId:'B-1'}}).inputs.payeeBorrowerId,'B-1');
});
test('R140 (V144) paidDate is an optional last key after payeeBorrowerId: a date with an account, null, or absent',()=>{
 const paid=canonicalExpenseFields({...input,paidDate:'2026-10-10'});
 assert.deepEqual(Object.keys(paid).slice(-2),['paidByAccountId','paidDate']);assert.equal(paid.paidDate,'2026-10-10');
 const both=canonicalExpenseFields({paidDate:'2026-10-10',...input,payeeName:null,payeeBorrowerId:'B-1'});
 assert.deepEqual(Object.keys(both).slice(-3),['paidByAccountId','payeeBorrowerId','paidDate'],'key order: payeeBorrowerId, then paidDate');
 assert.equal(canonicalExpenseFields({...input,paidByAccountId:null,paidDate:null}).paidDate,null);
 assert.throws(()=>canonicalExpenseFields({...input,paidByAccountId:null,paidDate:'2026-10-10'}),/invalid_request/,'a paid date needs an account');
 for(const bad of ['2026-02-30','10/10/2026','',7])assert.throws(()=>canonicalExpenseFields({...input,paidDate:bad}),/invalid_request/,String(bad));
 assert.equal('paidDate' in canonicalExpenseFields(input),false,'absent stays absent');
 // R140 (V145): not before the expense date; the same day is fine.
 assert.throws(()=>canonicalExpenseFields({...input,paidDate:'2026-10-08'}),/invalid_request/);assert.equal(canonicalExpenseFields({...input,paidDate:'2026-10-09'}).paidDate,'2026-10-09');
});
