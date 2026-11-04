import test from 'node:test';
import assert from 'node:assert/strict';
import {readExpenseRecord} from '../../services/business/expenses.mjs';
test('expense display keeps parameterized source lookup, bilingual left joins and absent labels',async()=>{
 let count=0;const client={query:async(sql,args)=>{count++;assert.deepEqual(args,['synthetic-expense']);if(count===1){assert.match(sql,/LEFT JOIN public\."Borrowers" payee/);assert.match(sql,/coalesce\(payee\."Description"/);assert.match(sql,/coalesce\(b\."Description"/);assert.match(sql,/WHERE e\."Row ID"=\$1/);return {rows:[{id:'synthetic-expense',sourceType:'Manual',payeeBorrowerLabel:'Thai - English',relatedBorrowerLabel:null,relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'synthetic-expense');assert.equal(item.payeeBorrowerLabel,'Thai - English');assert.equal(item.relatedBorrowerLabel,null);assert.equal(count,2);assert.deepEqual(item.reimbursements,[]);
});
test('R111 a rebate settled by offset names its offset payment, the referrer loan it paid and what stays payable',async()=>{
 let first=true;const client={query:async sql=>{if(first){first=false;assert.match(sql,/x->>'Ref Offset Payment' AS id,.* FROM to_jsonb\(e\) x\) offset_link/);assert.match(sql,/LEFT JOIN public\."Payments" op ON op\."Row ID"=offset_link\.id/);assert.match(sql,/r\."Ref Payment"=offset_link\.id/);
  assert.doesNotMatch(sql,/e\."Ref Offset Payment"/,'no direct column reference: a database before V122 still reads');
  return {rows:[{id:'rr1:L-1',sourceType:'Referral Rebate',amount:'1000',offsetPaymentId:'ro122:pwa:x',offsetAmount:'640',offsetLoanId:'L-0398',offsetLoanDate:'2026-10-03',offsetLoanPrincipal:'10000',offsetLoanOriginalRate:'3',offsetLoanBorrowerLabel:'Referrer - English',relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'rr1:L-1');
 assert.equal(item.offsetLoanLabel,'Referrer - English-฿10,000-03/10-3%');assert.equal(item.payableAmount,'360');assert.equal(item.offsetAmount,'640');
 assert.equal('offsetLoanDate' in item,false,'the label parts stay internal');assert.equal(item.canDelete,false);
 first=true;const plain={query:async()=>{if(first){first=false;return {rows:[{id:'rr1:L-2',sourceType:'Referral Rebate',amount:'300',offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,relatedLoanId:null}]}}return {rows:[]}}};
 const payout=await readExpenseRecord(plain,'rr1:L-2');assert.equal(payout.offsetLoanLabel,null);assert.equal(payout.payableAmount,null);
});
test('R120 a referral rebate reads its applied terms through to_jsonb (null before V135 and on earlier rows)',async()=>{
 let first=true;const client={query:async sql=>{if(first){first=false;assert.match(sql,/\(x->>'Rebate Rate'\)::float8 AS rebate_rate,\(x->>'Rebate Cap'\)::float8 AS rebate_cap FROM to_jsonb\(e\) x/);
  assert.match(sql,/offset_link\.rebate_rate AS "rebateRate",offset_link\.rebate_cap AS "rebateCap"/);
  assert.doesNotMatch(sql,/e\."Rebate (Rate|Cap)"/,'no direct column reference: a database before V135 still reads');
  return {rows:[{id:'rr1:L-3',sourceType:'Referral Rebate',amount:'1200',ruleVersion:'REFERRAL_REBATE_V2',rebateRate:50,rebateCap:1500,offsetPaymentId:null,relatedLoanId:null}]}}return {rows:[]}}};
 const v2=await readExpenseRecord(client,'rr1:L-3');assert.equal(v2.rebateRate,50);assert.equal(v2.rebateCap,1500);
 first=true;const legacy={query:async()=>{if(first){first=false;return {rows:[{id:'rr1:L-4',sourceType:'Referral Rebate',amount:'30',ruleVersion:'REFERRAL_REBATE_V1',rebateRate:null,rebateCap:null,offsetPaymentId:null,relatedLoanId:null}]}}return {rows:[]}}};
 const v1=await readExpenseRecord(legacy,'rr1:L-4');assert.equal(v1.rebateRate,null);assert.equal(v1.rebateCap,null);
});
