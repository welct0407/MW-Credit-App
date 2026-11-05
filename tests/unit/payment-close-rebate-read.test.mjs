import test from 'node:test';
import assert from 'node:assert/strict';
import {readPaymentRecord} from '../../services/business/payments.mjs';
// R111 V124 (RP-11): the payment record names the referred loan it closed and what became of the rebate.
function client(rebate){const rows=rebate==null?[]:Array.isArray(rebate)?rebate:[rebate];return {query:async sql=>{
 if(sql.includes('FROM public."Payments" p'))return {rows:[{id:'pwa:close'}]};
 if(sql.includes('pwa_payment_version'))return {rows:[{version:'a'.repeat(64)}]};
 if(sql.includes('pwa_effective_payment_plan_v2'))return {rows:[{value:null}]};
 if(sql.includes('l."Ref Closing Payment"=$1')){assert.match(sql,/to_jsonb\(e\)->>'Ref Offset Payment'/);assert.doesNotMatch(sql,/e\."Ref Offset Payment"/);assert.doesNotMatch(sql,/::money/,'no money literal: "Amount Remaining" is numeric');assert.match(sql,/c\."Amount Remaining"=0\)/);assert.doesNotMatch(sql,/LIMIT 1`?$/,'R119: every rebate, not only the first');{const aliases=[...sql.split(/\n\s*FROM public\."Loans" l/)[0].matchAll(/ AS (\w+|"[^"]+")/g)].map(m=>m[1]);assert.equal(new Set(aliases).size,aliases.length,'each output column once: '+aliases);}assert.match(sql,/ORDER BY fa\.ord NULLS LAST,fa\.aid COLLATE "C" NULLS LAST,l\."Row ID" COLLATE "C"\s*$/,'R119 PR-2: the Payment Allocations order, then the loan id');return {rows};}
 return {rows:[]};
}};}
test('a closing payment with a default offset gives the offset, its loan key, paid-through day and the payable rest',async()=>{
 const item=await readPaymentRecord(client({loanId:'L-1',amount:'300',referrerLabel:'Malee - English',offsetPaymentId:'ro122:pwa:close',offsetAmount:'200',offsetLoanId:'L-0398',principal:'10000',loanDate:'2026-10-03',rate:'3',paidThrough:'2026-11-12'}),'pwa:close');
 assert.deepEqual(item.closeRebate,{loanId:'L-1',loanDisplayKey:null,amount:'300',referrerLabel:'Malee - English',offsetPaymentId:'ro122:pwa:close',offsetAmount:'200',payableAmount:'100',offsetLoanId:'L-0398',offsetLoanLabel:'Malee - English-฿10,000-03/10-3%',paidThrough:'2026-11-12',
  // R129: the state fields (none from a row without them, as before V137)
  rebateState:null,pendingAmount:null,settlementId:null,settlementDate:null,owedTotal:null});
});
test('a paid-out rebate is payable in full, and a payment that closed no referred loan has none',async()=>{
 const item=await readPaymentRecord(client({loanId:'L-1',amount:'300',referrerLabel:'Malee - English',offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,principal:null,loanDate:null,rate:null,paidThrough:null}),'pwa:close');
 assert.equal(item.closeRebate.payableAmount,'300');assert.equal(item.closeRebate.offsetLoanLabel,null);
 assert.equal((await readPaymentRecord(client(null),'pwa:close')).closeRebate,null);
});
// R119: every rebate line, in loan order; closeRebate stays the first for a phone on an older bundle.
const paid=(loanId,amount,referrerLabel)=>({loanId,amount,referrerLabel,offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,principal:null,loanDate:null,rate:null,paidThrough:null});
test('closeRebates holds 0, 1 or 2 rebates and closeRebate is the first or null',async()=>{
 const none=await readPaymentRecord(client([]),'pwa:close');
 assert.deepEqual(none.closeRebates,[]);assert.equal(none.closeRebate,null);
 const one=await readPaymentRecord(client([paid('L-1','300','A - a')]),'pwa:close');
 assert.equal(one.closeRebates.length,1);assert.deepEqual(one.closeRebate,one.closeRebates[0]);assert.equal(one.closeRebate.payableAmount,'300');
 const two=await readPaymentRecord(client([paid('L-1','30','A - a'),{...paid('L-2','20','B - b'),offsetPaymentId:'ro122:pwa:close:L-2',offsetAmount:'20',offsetLoanId:'L-9',principal:'1000',loanDate:'2026-10-03',rate:'3',paidThrough:'2026-11-12'}]),'pwa:close');
 assert.equal(two.closeRebates.length,2);
 assert.deepEqual(two.closeRebates.map(r=>[r.loanId,r.amount,r.payableAmount,r.offsetPaymentId]),[['L-1','30','30',null],['L-2','20','0','ro122:pwa:close:L-2']]);
 assert.deepEqual(two.closeRebate,two.closeRebates[0]);
});
test('R119 PR-1: each rebate carries its closed loan display key, built like the allocations key',async()=>{
 const item=await readPaymentRecord(client([{...paid('L-1','30','A - a'),loanPrincipal:'5000',loanDay:'2026-09-01',loanRate:'2',loanBorrowerName:'Nok',loanBorrowerDescription:'Thai',offsetLoanId:'L-9',principal:'1000',loanDate:'2026-10-03',rate:'3'}]),'pwa:close');
 assert.equal(item.closeRebates[0].loanDisplayKey,'Nok - Thai-฿5,000-01/09-2%','the closed loan, not the offset loan');
 assert.equal(item.closeRebates[0].offsetLoanLabel,'A - a-฿1,000-03/10-3%');
});
