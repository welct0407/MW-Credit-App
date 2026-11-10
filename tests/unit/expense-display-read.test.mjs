import test from 'node:test';
import assert from 'node:assert/strict';
import {readExpenseRecord} from '../../services/business/expenses.mjs';
import {expensePendingSql} from '../../services/business/rebate-state.mjs';
import {readManagementPosition} from '../../services/business/management-position.mjs';
import {readBorrowerRecord} from '../../services/business/borrowers.mjs';
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
// R140 (V142): a manual expense pending payment (Manual, above zero, no payer holder or account, no R005 cutover source).
test('R140 the pending rule: Manual, above zero, no payer, not a cutover source',()=>{
 const sql=expensePendingSql('e');
 assert.match(sql,/e\."Source Type"='Manual'/);assert.match(sql,/e\."Amount"::numeric>0/);
 assert.match(sql,/e\."Ref Paid By Cash Holder" IS NULL AND e\."Ref Paid By Cash Account" IS NULL/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM public\.r005_cash_cutover_sources r005 WHERE r005\.source_type='Business Expense' AND r005\.source_row_id=e\."Row ID"\)/);
});
test('R140 an expense record carries paymentState and, while pending, pendingAmount (the amount); rebateState stays the rebate rule',async()=>{
 let first=true;const client={query:async sql=>{if(first){first=false;
  assert.match(sql,/CASE WHEN \(e\."Source Type"='Manual'[\s\S]*\) THEN 'pending' END AS "paymentState"/);
  assert.match(sql,/coalesce\(CASE WHEN e\."Source Type" IS DISTINCT FROM 'Referral Rebate' THEN NULL[\s\S]*,CASE WHEN \(e\."Source Type"='Manual'[\s\S]*\) THEN e\."Amount"::numeric END\)::numeric\(20,2\)::text AS "pendingAmount"/);
  return {rows:[{id:'E-PEND',sourceType:'Manual',amount:'500.00',paymentState:'pending',pendingAmount:'500.00',rebateState:null,paidByAccountId:null,paidByAccountLabel:null,offsetPaymentId:null,relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'E-PEND');
 assert.equal(item.paymentState,'pending');assert.equal(item.pendingAmount,'500.00');assert.equal(item.rebateState,null);assert.equal(item.canEdit,true);assert.equal(item.canDelete,true);
});
test('R140 the cash position adds expensesPayable beside rebatesPayable',async()=>{
 const client={query:async sql=>{
  if(/"Operating Income MTD"/.test(sql))return {rows:[{principalWriteOffsMtdPresent:false}]};
  if(/FROM public\."Cash Account Balances"|FROM public\."Cash Holder Balances"/.test(sql))return {rows:[]};
  if(/x\."Source Type"='Referral Rebate'/.test(sql))return {rows:[{amount:'300.00',count:1}]};
  if(/WHERE \(x\."Source Type"='Manual'/.test(sql)){assert.match(sql,/sum\(x\."Amount"::numeric\)/);assert.match(sql,/r005_cash_cutover_sources/);return {rows:[{amount:'750.00',count:2}]};}
  if(/Asia\/Bangkok/.test(sql))return {rows:[{day:'2026-11-10'}]};
  throw Error('unexpected read '+sql.slice(0,80));}};
 const position=await readManagementPosition(client);
 assert.deepEqual(position.rebatesPayable,{amount:'300.00',count:1});assert.deepEqual(position.expensesPayable,{amount:'750.00',count:2});
});
test('R140 (V143) a borrower record carries the manual expenses owed to it (pending, payee link), apart from referral rebates',async()=>{
 const seen=[];const client={query:async sql=>{seen.push(sql);
  if(/to_jsonb\(b\)\?'Referral Rebate Rate'/.test(sql))return {rows:[{id:'B-1',termsPresent:false}]};
  if(/"Total Amount Loaned"/.test(sql))return {rows:[{expensesOwedAmount:'90.00',expensesOwedCount:2,referrerUnpaidAmount:'0.00'}]};
  return {rows:[]};}};
 const record=await readBorrowerRecord(client,'B-1');
 assert.deepEqual([record.details.expensesOwedAmount,record.details.expensesOwedCount,record.details.referrerUnpaidAmount],['90.00',2,'0.00']);
 const sql=seen.find(s=>/"Total Amount Loaned"/.test(s));
 assert.match(sql,/CROSS JOIN LATERAL \(SELECT coalesce\(sum\(x\."Amount"::numeric\),0\)::numeric\(20,2\)::text AS amount,count\(\*\)::int AS count FROM public\."Business Expenses" x WHERE x\."Ref Payee Borrower"=b\."Row ID" AND \(x\."Source Type"='Manual'/);
 assert.match(sql,/eo\.amount AS "expensesOwedAmount",eo\.count AS "expensesOwedCount"/);
});
