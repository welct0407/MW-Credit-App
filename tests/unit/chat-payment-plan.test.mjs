// R106 D3: chat payment proposals (services/chat/payment-plan.mjs) over a fake command service with the draft routes'
// answer shapes (services/payment-command/store.mjs). The split always comes from the command service; synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
import {planPayment} from '../../services/chat/payment-plan.mjs';
import {createProposalPlanner} from '../../services/chat/proposals.mjs';

const RID='00000000-0000-4000-8000-0000000000aa';
const charge=(id,date,p,i,key='Somchai-฿10,000-01/10-1%')=>({id,chargeDate:date,loanDisplayKey:key,amountRemaining:String(BigInt(p)+BigInt(i)),principalRemaining:p,interestRemaining:i});
const due=[charge('C2','2026-10-29','0','100'),charge('C1','2026-10-28','500','100')];
const accounts=[{id:'CA1',label:'Cash box'},{id:'CA2',label:'KBank'}];
const draft={businessDate:'2026-10-30',borrower:{id:'B1',displayName:'สมชาย'},charges:due,accounts,preferredReceivingAccountId:'CA2'};
/** Auto-assign exactly as the command service computes it (store.mjs autoAssign), so the fake is faithful. */
function autoAssign(amount){
 let remaining=BigInt(amount);const allocations=[];
 for(const row of [...due].sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate))){
  const p=BigInt(row.principalRemaining),i=BigInt(row.interestRemaining),interest=remaining<i?remaining:i;remaining-=interest;const principal=remaining<p?remaining:p;remaining-=principal;
  if(principal+interest>0n)allocations.push({chargeId:row.id,principal:String(principal),interest:String(interest),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate});
 }
 return {...draft,allocations,amountReceived:amount,allocated:String(BigInt(amount)-remaining),unallocated:String(remaining)};
}
const upcoming=[{id:'cg8:2:L1:2026-11-04',loanId:'L1',chargeDate:'2026-11-04',loanDisplayKey:'Somchai-฿10,000-01/10-1%',amountRemaining:'700',principalRemaining:'0',interestRemaining:'700',bookVersion:'a'.repeat(64)}];
function fake({planChanged=false,reviewCharges=null}={}){
 const calls=[];
 const handle=(method,path,body)=>{
  calls.push([method,path,body]);
  if(method==='POST'&&path==='/api/payment-drafts/B1/select-all')return {status:200,data:{...draft,total:'700'}};
  if(method==='POST'&&path==='/api/payment-drafts/B1/auto-assign')return {status:200,data:autoAssign(body.amountReceived)};
  if(method==='GET'&&path==='/api/payment-drafts/B1?scope=all')return {status:200,data:{...draft,scope:'all',upcoming}};
  if(method==='POST'&&path==='/api/payment-drafts/B1/review'){
   if(body.selectedChargeIds){const charges=(reviewCharges??due).filter(row=>body.selectedChargeIds.includes(row.id));return charges.length===body.selectedChargeIds.length?{status:200,data:{...draft,charges}}:{status:409,data:{ok:false,code:'selection_changed'}};}
   return planChanged?{status:409,data:{ok:false,code:'plan_changed'}}:{status:200,data:{...draft,allocations:body.allocations,total:body.amountReceived}};
  }
  if(path.startsWith('/api/payment-drafts/B9'))return {status:404,data:{ok:false,code:'not_found'}};
  return {status:404,data:{ok:false,code:'not_found'}};
 };
 return {calls,client:{get:async path=>handle('GET',path),post:async(path,body)=>handle('POST',path,body)}};
}

test('amount only: the screen Auto-assign split verbatim, v8, re-posted to review; settles every due charge',async()=>{
 const {client,calls}=fake();
 const {command,plan}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'700',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID});
 assert.deepEqual(command,canonicalCommand(command));assert.equal(command.schemaVersion,8);assert.equal(command.requestId,RID);
 assert.deepEqual(command.allocations,autoAssign('700').allocations.toSorted((a,b)=>a.chargeId.localeCompare(b.chargeId)));
 assert.deepEqual([command.paymentDate,command.receiptId,command.bankReference,command.payerLines],['2026-10-30',null,null,null]);
 assert.deepEqual(calls.map(([m,p])=>m+' '+p),['POST /api/payment-drafts/B1/select-all','POST /api/payment-drafts/B1/auto-assign','POST /api/payment-drafts/B1/review']);
 assert.deepEqual(calls[2][2],{amountReceived:'700',allocations:command.allocations});
 assert.equal(plan.settlesAllDue,true);assert.equal(plan.borrowerLabel,'สมชาย');assert.equal(plan.accountLabel,'Cash box');
 assert.deepEqual(plan.split.map(r=>[r.chargeId,r.principal,r.interest,r.projected]),[['C2','0','100',false],['C1','500','100',false]]);
});

test('a partial amount: interest before principal, newest first; no settles-all consequence; preferred account by default',async()=>{
 const {client}=fake();
 const {command,plan}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'250',paymentMethod:'Bank Transfer'},requestId:RID});
 assert.deepEqual(command.allocations.map(r=>[r.chargeId,r.principal,r.interest]),[['C1','50','100'],['C2','0','100']]);
 assert.equal(command.cashAccountId,'CA2');assert.equal(plan.settlesAllDue,false);
});

test('refusals: amount above everything due, a model split, bad amounts, unknown account, plan_changed',async()=>{
 const {client}=fake();
 const plan=values=>planPayment({client,borrowerId:'B1',values:{paymentMethod:'Cash',cashAccountId:'CA1',...values},requestId:RID});
 await assert.rejects(plan({amountReceived:'701'}),/AMOUNT_EXCEEDS_DUE/);
 for(const key of ['allocations','split','principal','interest','materialize'])await assert.rejects(plan({amountReceived:'100',[key]:[]}),new RegExp('HOST_FIELD:'+key));
 for(const amount of ['0','1,000','10.5',-5,'abc'])await assert.rejects(plan({amountReceived:amount}),/INVALID_FIELD:amountReceived/,String(amount));
 await assert.rejects(plan({amountReceived:'100',cashAccountId:'CA9'}),/INVALID_FIELD:cashAccountId/);
 await assert.rejects(plan({amountReceived:'100',paymentMethod:'Cheque'}),/INVALID_FIELD:paymentMethod/);
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'100'},requestId:RID}),/MISSING_FIELD:paymentMethod/);
 await assert.rejects(plan({amountReceived:'100',colour:'red'}),/UNKNOWN_FIELD:colour/);
 await assert.rejects(planPayment({client,borrowerId:'B9',values:{amountReceived:'100',paymentMethod:'Cash'},requestId:RID}),/TARGET_NOT_FOUND/);
 await assert.rejects(planPayment({client:fake({planChanged:true}).client,borrowerId:'B1',values:{amountReceived:'100',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID}),/PLAN_CHANGED/);
});

test('named charges: the full remaining of each through review; the amount must equal the total',async()=>{
 const {client,calls}=fake();
 const {command,plan}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'600',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C1']},requestId:RID});
 assert.deepEqual(command.allocations,[{chargeId:'C1',principal:'500',interest:'100',expectedPrincipalRemaining:'500',expectedInterestRemaining:'100',chargeDate:'2026-10-28'}]);
 assert.equal(command.schemaVersion,8);assert.equal(plan.settlesAllDue,false);
 assert.deepEqual(calls[1],['POST','/api/payment-drafts/B1/review',{selectedChargeIds:['C1']}]);
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'500',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C1']},requestId:RID}),/AMOUNT_MISMATCH:600/);
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'600',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C7']},requestId:RID}),/SELECTION_CHANGED/);
});

test('next projected charge: the whole upcoming charge, materialize filled, schemaVersion 9',async()=>{
 const {client,calls}=fake();
 const {command,plan}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'700',paymentMethod:'Cash',cashAccountId:'CA1',nextChargeOf:['L1']},requestId:RID});
 assert.equal(command.schemaVersion,9);assert.deepEqual(command,canonicalCommand(command));
 assert.deepEqual(command.materialize,[{loanId:'L1',chargeId:'cg8:2:L1:2026-11-04',chargeDate:'2026-11-04',principalDue:'0',interestDue:'700'}]);
 assert.deepEqual(command.allocations,[{chargeId:'cg8:2:L1:2026-11-04',principal:'0',interest:'700',expectedPrincipalRemaining:'0',expectedInterestRemaining:'700',chargeDate:'2026-11-04'}]);
 assert.deepEqual(calls.at(-1)[2],{amountReceived:'700',allocations:command.allocations,materialize:command.materialize});
 assert.equal(plan.split[0].projected,true);
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'700',paymentMethod:'Cash',cashAccountId:'CA1',nextChargeOf:['L2']},requestId:RID}),/NEXT_CHARGE_UNAVAILABLE:L2/);
 // Due charge plus next charge in one payment.
 const both=await planPayment({client,borrowerId:'B1',values:{amountReceived:'800',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C2'],nextChargeOf:['L1']},requestId:RID});
 assert.equal(both.command.schemaVersion,9);assert.equal(both.command.allocations.length,2);
});

test('payment.record through the planner: the card lists every allocation line and the stored command canonicalizes',async()=>{
 const {client}=fake();
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:()=>RID});
 const value=await planner.propose({operation:'payment.record',target:'B1',values:{amountReceived:'700',paymentMethod:'Cash',cashAccountId:'CA1',notes:'synthetic'}});
 assert.equal(value.kind,'payment');assert.equal(value.id,RID);
 const command=JSON.parse(value.command);assert.deepEqual(canonicalCommand(command),command);
 assert.deepEqual(value.card.split.map(r=>r.chargeId),['C2','C1']);assert.equal(value.card.split[0].loanDisplayKey,'Somchai-฿10,000-01/10-1%');
 assert.deepEqual(value.card.consequences,[{code:'settles_all_due'}]);assert.deepEqual(value.card.confirmLabel,{en:'Record ฿700',th:'บันทึก ฿700'});assert.deepEqual(value.card.target,{type:'borrower',id:'B1',label:'สมชาย'});
 assert.deepEqual(value.card.values.map(v=>v.field),['amountReceived','paymentDate','paymentMethod','cashAccountId','notes']);
 assert.equal(value.card.values.find(v=>v.field==='cashAccountId').display,'Cash box');
 await assert.rejects(planner.propose({operation:'payment.record',target:'',values:{amountReceived:'700',paymentMethod:'Cash'}}),/TARGET_REQUIRED/);
});
