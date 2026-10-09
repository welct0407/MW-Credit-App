import test from 'node:test';
import assert from 'node:assert/strict';
import {readExpenseRecord} from '../../services/business/expenses.mjs';
test('expense display keeps parameterized source lookup, bilingual left joins and absent labels',async()=>{
 let count=0;const client={query:async(sql,args)=>{count++;assert.deepEqual(args,['synthetic-expense']);if(count===1){assert.match(sql,/LEFT JOIN public\."Borrowers" payee/);assert.match(sql,/coalesce\(payee\."Description"/);assert.match(sql,/coalesce\(b\."Description"/);assert.match(sql,/WHERE e\."Row ID"=\$1/);return {rows:[{id:'synthetic-expense',sourceType:'Manual',payeeBorrowerLabel:'Thai - English',relatedBorrowerLabel:null,relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'synthetic-expense');assert.equal(item.payeeBorrowerLabel,'Thai - English');assert.equal(item.relatedBorrowerLabel,null);assert.equal(count,2);assert.deepEqual(item.reimbursements,[]);
});
