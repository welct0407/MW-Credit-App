import test from 'node:test';
import assert from 'node:assert/strict';
import {readExpenseRecord,readExpensePage,expenseListFilter} from '../../services/business/expenses.mjs';
import {createServer} from 'node:http';
import {createPaymentCommandHandler} from '../../services/payment-command/handler.mjs';
import {expensePendingSql} from '../../services/business/rebate-state.mjs';
import {readManagementPosition} from '../../services/business/management-position.mjs';
import {readBorrowerRecord} from '../../services/business/borrowers.mjs';
test('expense display keeps parameterized source lookup, bilingual left joins and absent labels',async()=>{
 let count=0;const client={query:async(sql,args)=>{count++;assert.deepEqual(args,['synthetic-expense']);if(count===1){assert.match(sql,/LEFT JOIN public\."Borrowers" payee/);assert.match(sql,/coalesce\(payee\."Borrower Name",''\)\|\|CASE WHEN nullif\(btrim\(payee\."Description"\),''\) IS NULL THEN '' ELSE ' - '\|\|payee\."Description" END/);assert.match(sql,/coalesce\(b\."Borrower Name",''\)\|\|CASE WHEN nullif\(btrim\(b\."Description"\),''\) IS NULL THEN '' ELSE ' - '\|\|b\."Description" END/);assert.match(sql,/WHERE e\."Row ID"=\$1/);return {rows:[{id:'synthetic-expense',sourceType:'Manual',payeeBorrowerLabel:'Thai - English',relatedBorrowerLabel:null,relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'synthetic-expense');assert.equal(item.payeeBorrowerLabel,'Thai - English');assert.equal(item.relatedBorrowerLabel,null);assert.equal(count,2);assert.deepEqual(item.reimbursements,[]);
});
test('R111 a rebate settled by offset names its offset payment, the referrer loan it paid and what stays payable',async()=>{
 let first=true;const client={query:async sql=>{if(first){first=false;assert.match(sql,/x->>'Ref Offset Payment' AS id,.* FROM to_jsonb\(e\) x\) offset_link/);assert.match(sql,/LEFT JOIN public\."Payments" op ON op\."Row ID"=offset_link\.id/);assert.match(sql,/r\."Ref Payment"=offset_link\.id/);
  assert.doesNotMatch(sql,/e\."Ref Offset Payment"/,'no direct column reference: a database before V122 still reads');
  return {rows:[{id:'rr1:L-1',sourceType:'Referral Rebate',amount:'1000',offsetPaymentId:'ro122:pwa:x',offsetAmount:'640',offsetLoanId:'L-0398',offsetLoanDate:'2026-10-03',offsetLoanPrincipal:'10000',offsetLoanOriginalRate:'3',offsetLoanBorrowerLabel:'Referrer - English',relatedLoanId:null}]}}return {rows:[]}}};
 const item=await readExpenseRecord(client,'rr1:L-1');
 assert.equal(item.offsetLoanLabel,'Referrer - English-฿10,000-03/10-3%');assert.equal(item.offsetLoanTerms,'฿10,000-03/10-3%','R140: the terms without the borrower, for the viewer-language name');assert.equal(item.payableAmount,'360');assert.equal(item.offsetAmount,'640');
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
test('R140 (V144) paidDate is stored, else the settlement date, else the expense date; null while pending; payee names both ways',async()=>{
 const read=async row=>{let first=true;const client={query:async sql=>{if(first){first=false;assert.match(sql,/to_jsonb\(e\)->>'Paid Date' AS "storedPaidDate"/);assert.match(sql,/payee\."Borrower Name" AS "payeeBorrowerName",payee\."Description" AS "payeeBorrowerDescription"/);assert.match(sql,/olb\."Borrower Name" AS "offsetLoanBorrowerName",olb\."Description" AS "offsetLoanBorrowerDescription"/);assert.match(sql,/b\."Borrower Name" AS "relatedBorrowerName",b\."Description" AS "relatedBorrowerDescription",lb\."Borrower Name" AS "relatedLoanBorrowerName",lb\."Description" AS "relatedLoanBorrowerDescription"/);
  return {rows:[{id:'E',sourceType:'Manual',amount:'5.00',expenseDate:'2026-11-01',offsetPaymentId:null,relatedLoanId:null,...row}]}}return {rows:[]}}};return readExpenseRecord(client,'E')};
 assert.equal((await read({storedPaidDate:'2026-11-06',paymentState:null})).paidDate,'2026-11-06');
 assert.equal((await read({storedPaidDate:null,paymentState:null})).paidDate,'2026-11-01');
 assert.equal((await read({storedPaidDate:null,paymentState:'pending'})).paidDate,null);
 assert.equal((await read({sourceType:'Referral Rebate',rebateState:'pending',storedPaidDate:null})).paidDate,null);
 const named=await read({payeeBorrowerId:'B',payeeBorrowerName:'สมชาย',payeeBorrowerDescription:'Somchai'});assert.deepEqual([named.payeeBorrowerName,named.payeeBorrowerDescription],['สมชาย','Somchai']);
});
test('R140 the expense list is newest first: date, then created at, then id; the cursor carries all three (version 2)',async()=>{
 const seen=[];const rows=[{id:'E3',expenseDate:'2026-11-11',createdAt:'2026-11-11 10:00:02.5',sourceType:'Manual',amount:'1.00'},{id:'E2',expenseDate:'2026-11-11',createdAt:'2026-11-11 10:00:01',sourceType:'Manual',amount:'1.00'},{id:'E1',expenseDate:'2026-11-11',createdAt:'2026-11-11 09:00:00',sourceType:'Manual',amount:'1.00'}];
 const client={query:async(sql,args)=>{seen.push([sql,args]);if(/ORDER BY e\."Expense Date" DESC/.test(sql))return {rows:args[0]===null?rows:rows.slice(2)};return {rows:[]}}};
 const first=await readExpensePage(client,{limit:2});
 assert.match(seen[0][0],/ORDER BY e\."Expense Date" DESC,e\."Created At" DESC,e\."Row ID" COLLATE "C" DESC LIMIT \$4/);
 assert.match(seen[0][0],/\(e\."Expense Date",e\."Created At",e\."Row ID" COLLATE "C"\)<\(\$1::date,\$2::timestamp,\$3::text COLLATE "C"\)/);
 assert.deepEqual(first.items.map(i=>i.id),['E3','E2']);
 const cursor=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString('utf8'));assert.deepEqual(cursor,{version:2,date:'2026-11-11',createdAt:'2026-11-11 10:00:01',id:'E2'});
 const next=await readExpensePage(client,{limit:2,cursor:first.nextCursor});assert.deepEqual(next.items.map(i=>i.id),['E1']);assert.equal(next.nextCursor,null);
 assert.deepEqual(seen.find(([sql,args])=>/ORDER BY/.test(sql)&&args[0]!==null)[1],['2026-11-11','2026-11-11 10:00:01','E2',3,false,null]);
 assert.equal(first.filter,undefined,'an unfiltered page answers no filter');assert.equal(seen.filter(([sql])=>/count\(\*\)/.test(sql)).length,0,'and counts nothing');
 // A version 1 cursor (date and id only) is refused; so is a malformed one.
 const v1=Buffer.from(JSON.stringify({version:1,date:'2026-11-11',id:'E2'})).toString('base64url');
 await assert.rejects(readExpensePage(client,{cursor:v1}),/invalid_request/);await assert.rejects(readExpensePage(client,{cursor:'not-json'}),/invalid_request/);
 await assert.rejects(readExpensePage(client,{cursor:Buffer.from(JSON.stringify({version:2,date:'2026-11-11',createdAt:'yesterday',id:'E2'})).toString('base64url')}),/invalid_request/);
});
test('R141 the list filters to pending payment (the Cash Position rule) and to one payee; the cursor is bound to its filter',async()=>{
 const seen=[];const rows=[{id:'E3',expenseDate:'2026-11-11',createdAt:'2026-11-11 10:00:02',sourceType:'Manual',amount:'15.00'},{id:'E2',expenseDate:'2026-11-10',createdAt:'2026-11-10 10:00:01',sourceType:'Manual',amount:'5.00'},{id:'E1',expenseDate:'2026-11-09',createdAt:'2026-11-09 09:00:00',sourceType:'Manual',amount:'1.00'}];
 const client={query:async(sql,args)=>{seen.push([sql,args]);if(/ORDER BY e\."Expense Date" DESC/.test(sql))return {rows:args[0]===null?rows:rows.slice(2)};if(/count\(\*\)::int AS count/.test(sql))return {rows:[{count:3,amount:'21.00'}]};return {rows:[]}}};
 const first=await readExpensePage(client,{limit:2,payment:'pending',payeeBorrowerId:'B-PAYEE'});
 const [listSql,listArgs]=seen.find(([sql])=>/ORDER BY/.test(sql));
 assert.ok(listSql.includes(`($5::boolean IS NOT TRUE OR ${expensePendingSql('e')}) AND ($6::text IS NULL OR e."Ref Payee Borrower"=$6::text)`),'the pending rule of the totals');
 assert.match(listSql,/ORDER BY e\."Expense Date" DESC,e\."Created At" DESC,e\."Row ID" COLLATE "C" DESC LIMIT \$4/);
 assert.deepEqual(listArgs,[null,null,null,3,true,'B-PAYEE']);
 const [totalSql,totalArgs]=seen.find(([sql])=>/count\(\*\)::int AS count/.test(sql));
 assert.ok(totalSql.includes(`($1::boolean IS NOT TRUE OR ${expensePendingSql('e')}) AND ($2::text IS NULL OR e."Ref Payee Borrower"=$2::text)`));assert.match(totalSql,/sum\(e\."Amount"::numeric\)/);assert.deepEqual(totalArgs,[true,'B-PAYEE']);
 assert.deepEqual(first.filter,{payment:'pending',payeeBorrowerId:'B-PAYEE',total:{count:3,amount:'21.00'}});
 const cursor=JSON.parse(Buffer.from(first.nextCursor,'base64url').toString('utf8'));assert.equal(cursor.filter,'payment=pending&payee=B-PAYEE');
 // The next page of the same filter is accepted (no second total); any other filter, or none, refuses that cursor.
 seen.length=0;const next=await readExpensePage(client,{limit:2,cursor:first.nextCursor,payment:'pending',payeeBorrowerId:'B-PAYEE'});
 assert.deepEqual(next.items.map(i=>i.id),['E1']);assert.equal(next.filter.total,undefined);assert.equal(seen.filter(([sql])=>/count\(\*\)/.test(sql)).length,0);
 for(const other of [{},{payment:'pending'},{payeeBorrowerId:'B-PAYEE'},{payment:'pending',payeeBorrowerId:'B-OTHER'}])await assert.rejects(readExpensePage(client,{cursor:first.nextCursor,...other}),/invalid_request/,JSON.stringify(other));
 const plain=(await readExpensePage(client,{limit:2})).nextCursor;await assert.rejects(readExpensePage(client,{cursor:plain,payment:'pending'}),/invalid_request/,'an unfiltered cursor does not page a filtered list');
 // Bad values are refused before any query.
 for(const bad of [{payment:'paid'},{payment:''},{payeeBorrowerId:''},{payeeBorrowerId:'a\nb'},{payeeBorrowerId:'x'.repeat(500)}])assert.throws(()=>expenseListFilter(bad),/invalid_request/,JSON.stringify(bad));
 assert.deepEqual(expenseListFilter({payment:'pending'}),{payment:'pending',payeeBorrowerId:null});
});
test('R141 route: GET /api/expense-records passes payment and payeeBorrowerId; other parameters are 400',async()=>{
 const reached=[];const store={expenses:async(_principal,options)=>{reached.push(options);return {ok:true,status:200,items:[],nextCursor:null}}};
 const handler=createPaymentCommandHandler({origins:['http://127.0.0.1:9'],verifyPrincipal:async()=>({ok:true,email:'owner@example.invalid',subject:'s'}),store});
 const server=createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const call=path=>fetch('http://127.0.0.1:'+server.address().port+path,{headers:{authorization:'Bearer x'}});
 try{
  assert.equal((await call('/api/expense-records?payment=pending&payeeBorrowerId=B-1&limit=25')).status,200);
  assert.deepEqual(reached.at(-1),{limit:25,cursor:null,payment:'pending',payeeBorrowerId:'B-1'});
  assert.equal((await call('/api/expense-records')).status,200);assert.deepEqual(reached.at(-1),{limit:25,cursor:null,payment:null,payeeBorrowerId:null});
  for(const path of ['/api/expense-records?scope=due','/api/expense-records?payee=B-1','/api/expense-records?payment=pending&payment=pending'])assert.equal((await call(path)).status,400,path);
  assert.equal(reached.length,2);
 }finally{await new Promise(resolve=>server.close(resolve))}
});
