import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalExpenseFields,expenseCategories} from '../../services/contracts/expense-command.mjs';
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
 for(const key of ['sourceType','paidByHolderId','payeeBorrowerId','partnerAShare'])assert.throws(()=>canonicalExpenseFields({...input,[key]:'forged'}));
 assert.throws(()=>canonicalExpenseFields({...input,expenseDate:'2026-02-30'}));
});
