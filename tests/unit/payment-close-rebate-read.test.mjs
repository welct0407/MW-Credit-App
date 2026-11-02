import test from 'node:test';
import assert from 'node:assert/strict';
import {readPaymentRecord} from '../../services/business/payments.mjs';
// R111 V124 (RP-11): the payment record names the referred loan it closed and what became of the rebate.
function client(rebate){return {query:async sql=>{
 if(sql.includes('FROM public."Payments" p'))return {rows:[{id:'pwa:close'}]};
 if(sql.includes('pwa_payment_version'))return {rows:[{version:'a'.repeat(64)}]};
 if(sql.includes('pwa_effective_payment_plan_v2'))return {rows:[{value:null}]};
 if(sql.includes('l."Ref Closing Payment"=$1')){assert.match(sql,/to_jsonb\(e\)->>'Ref Offset Payment'/);assert.doesNotMatch(sql,/e\."Ref Offset Payment"/);return {rows:rebate?[rebate]:[]};}
 return {rows:[]};
}};}
test('a closing payment with a default offset gives the offset, its loan key, paid-through day and the payable rest',async()=>{
 const item=await readPaymentRecord(client({loanId:'L-1',amount:'300',referrerLabel:'Malee - English',offsetPaymentId:'ro122:pwa:close',offsetAmount:'200',offsetLoanId:'L-0398',principal:'10000',loanDate:'2026-10-03',rate:'3',paidThrough:'2026-11-12'}),'pwa:close');
 assert.deepEqual(item.closeRebate,{loanId:'L-1',amount:'300',referrerLabel:'Malee - English',offsetPaymentId:'ro122:pwa:close',offsetAmount:'200',payableAmount:'100',offsetLoanId:'L-0398',offsetLoanLabel:'Malee - English-฿10,000-03/10-3%',paidThrough:'2026-11-12'});
});
test('a paid-out rebate is payable in full, and a payment that closed no referred loan has none',async()=>{
 const item=await readPaymentRecord(client({loanId:'L-1',amount:'300',referrerLabel:'Malee - English',offsetPaymentId:null,offsetAmount:null,offsetLoanId:null,principal:null,loanDate:null,rate:null,paidThrough:null}),'pwa:close');
 assert.equal(item.closeRebate.payableAmount,'300');assert.equal(item.closeRebate.offsetLoanLabel,null);
 assert.equal((await readPaymentRecord(client(null),'pwa:close')).closeRebate,null);
});
