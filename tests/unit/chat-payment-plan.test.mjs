// R106 D3: chat payment proposals (services/chat/payment-plan.mjs) over a fake command service with the draft routes'
// answer shapes (services/payment-command/store.mjs). The split always comes from the command service; synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalCommand} from '../../services/contracts/payment-command.mjs';
import {planPayment} from '../../services/chat/payment-plan.mjs';
import {createProposalPlanner} from '../../services/chat/proposals.mjs';

const RID='00000000-0000-4000-8000-0000000000aa';
const charge=(id,date,p,i,key='Somchai-฿10,000-01/10-1%',l='0')=>({id,chargeDate:date,loanDisplayKey:key,amountRemaining:String(BigInt(p)+BigInt(i)+BigInt(l)),principalRemaining:p,interestRemaining:i,lateChargeRemaining:l});
const due=[charge('C2','2026-10-29','0','100'),charge('C1','2026-10-28','500','100')];
const accounts=[{id:'CA1',label:'Cash box'},{id:'CA2',label:'KBank'}];
const draft={businessDate:'2026-10-30',borrower:{id:'B1',displayName:'สมชาย'},charges:due,accounts,preferredReceivingAccountId:'CA2'};
/** Auto-assign exactly as the command service computes it (store.mjs autoAssign), so the fake is faithful. R118: with
 * {lineVersion: 11} the lines are 8-key (interest, then late charge, then principal); without it 6-key. */
function autoAssign(amount,v11=true,rows=due){
 let remaining=BigInt(amount);const allocations=[];
 for(const row of [...rows].sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate))){
  const p=BigInt(row.principalRemaining),i=BigInt(row.interestRemaining),l=v11?BigInt(row.lateChargeRemaining??'0'):0n,interest=remaining<i?remaining:i;remaining-=interest;const lateCharge=remaining<l?remaining:l;remaining-=lateCharge;const principal=remaining<p?remaining:p;remaining-=principal;
  if(principal+interest+lateCharge>0n)allocations.push(v11?{chargeId:row.id,principal:String(principal),interest:String(interest),lateCharge:String(lateCharge),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,expectedLateChargeRemaining:row.lateChargeRemaining??'0',chargeDate:row.chargeDate}
   :{chargeId:row.id,principal:String(principal),interest:String(interest),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate});
 }
 return {...draft,allocations,amountReceived:amount,allocated:String(BigInt(amount)-remaining),unallocated:String(remaining)};
}
const upcoming=[{id:'cg8:2:L1:2026-11-04',loanId:'L1',chargeDate:'2026-11-04',loanDisplayKey:'Somchai-฿10,000-01/10-1%',amountRemaining:'700',principalRemaining:'0',interestRemaining:'700',bookVersion:'a'.repeat(64)}];
/** R112: Auto-assign's R110 remainder previews (store.mjs remainderPreview) and the /plan answers for a 1,000 receipt. */
const remainder={amount:'300',loans:{L1:'Somchai-฿10,000-01/10-1%'},forward:{rows:[
  {loanId:'L1',chargeId:'cg8:2:L1:2026-10-31',chargeDate:'2026-10-31',principalDue:'0',interestDue:'100',principal:'0',interest:'100',partial:false,booked:true},
  {loanId:'L1',chargeId:'cg8:2:L1:2026-11-01',chargeDate:'2026-11-01',principalDue:'0',interestDue:'100',principal:'0',interest:'100',partial:false,booked:true},
  {loanId:'L1',chargeId:'cg8:2:L1:2026-11-02',chargeDate:'2026-11-02',principalDue:'0',interestDue:'100',principal:'0',interest:'100',partial:false,booked:true}],
 paidThrough:{L1:'2026-11-02'},uncovered:'0',blocked:[]},
 principal:[{loanId:'L1',amount:'300',settles:false,entry:{loanId:'L1',dailyBefore:'100',dailyAfter:'97',outstandingBefore:'10000',outstandingAfter:'9700'}}]};
const dueLines=autoAssign('700').allocations;
const forwardPlan={allocations:[...dueLines,...remainder.forward.rows.map(r=>({chargeId:r.chargeId,principal:r.principal,interest:r.interest,lateCharge:'0',expectedPrincipalRemaining:r.principalDue,expectedInterestRemaining:r.interestDue,expectedLateChargeRemaining:'0',chargeDate:r.chargeDate}))].toSorted((a,b)=>a.chargeId.localeCompare(b.chargeId)),
 materialize:remainder.forward.rows.map(r=>({loanId:'L1',chargeId:r.chargeId,chargeDate:r.chargeDate,principalDue:r.principalDue,interestDue:r.interestDue})),principal:[],uncovered:'0',settles:[],paidThrough:{L1:'2026-11-02'}};
const principalPlan={allocations:dueLines.map(l=>l.chargeId==='C2'?{...l,principal:'300',expectedPrincipalRemaining:'300'}:l).toSorted((a,b)=>a.chargeId.localeCompare(b.chargeId)),materialize:[],
 principal:[{loanId:'L1',kind:'raise',chargeId:'C2',chargeDate:'2026-10-29',amount:'300',accruedInterest:'0',principalDue:'300',outstandingBefore:'10000',outstandingAfter:'9700',dailyBefore:'100',dailyAfter:'97'}],uncovered:'0',settles:[],paidThrough:{}};
function fake({planChanged=false,reviewCharges=null,offer=remainder,planFor=null}={}){
 const calls=[];
 const handle=(method,path,body)=>{
  calls.push([method,path,body]);
  if(method==='POST'&&path==='/api/payment-drafts/B1/auto-assign'&&body.amountReceived==='1000'&&offer)return {status:200,data:{...autoAssign('1000',body.lineVersion===11),remainder:offer}};
  if(method==='POST'&&path==='/api/payment-drafts/B1/plan'){const plan=planFor?planFor(body.purpose):body.purpose.forward?forwardPlan:principalPlan;return {status:200,data:{businessDate:'2026-10-30',purpose:body.purpose,plan,loans:remainder.loans}};}
  if(method==='POST'&&path==='/api/payment-drafts/B1/select-all')return {status:200,data:{...draft,total:'700'}};
  if(method==='POST'&&path==='/api/payment-drafts/B1/auto-assign')return {status:200,data:autoAssign(body.amountReceived,body.lineVersion===11)};
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

test('amount only: the screen Auto-assign split verbatim (lineVersion 11), v11, re-posted to review; settles every due charge',async()=>{
 const {client,calls}=fake();
 const {command,plan}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'700',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID});
 assert.deepEqual(command,canonicalCommand(command));assert.equal(command.schemaVersion,11);assert.equal(command.requestId,RID);
 assert.deepEqual(command.allocations,autoAssign('700').allocations.toSorted((a,b)=>a.chargeId.localeCompare(b.chargeId)));
 assert.deepEqual([command.paymentDate,command.receiptId,command.bankReference,command.payerLines],['2026-10-30',null,null,null]);
 assert.deepEqual(calls.map(([m,p])=>m+' '+p),['POST /api/payment-drafts/B1/select-all','POST /api/payment-drafts/B1/auto-assign','POST /api/payment-drafts/B1/review']);
 assert.deepEqual(calls[1][2],{amountReceived:'700',lineVersion:11});
 assert.deepEqual(calls[2][2],{amountReceived:'700',allocations:command.allocations,materialize:[],principal:[]});
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
 assert.deepEqual(command.allocations,[{chargeId:'C1',principal:'500',interest:'100',lateCharge:'0',expectedPrincipalRemaining:'500',expectedInterestRemaining:'100',expectedLateChargeRemaining:'0',chargeDate:'2026-10-28'}]);
 assert.equal(command.schemaVersion,11);assert.equal(plan.settlesAllDue,false);
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

test('R112: an amount above what is due waits for the Partner\'s choice: no command, the card\'s choices, nothing preselected',async()=>{
 const {client,calls}=fake();
 const {command,plan,draft}=await planPayment({client,borrowerId:'B1',values:{amountReceived:'1000',paymentMethod:'Bank Transfer',cashAccountId:'CA1'},requestId:RID});
 assert.equal(command,null);assert.deepEqual(draft,{borrowerId:'B1',amountReceived:'1000',paymentDate:'2026-10-30',paymentMethod:'Bank Transfer',cashAccountId:'CA1',notes:null});
 assert.deepEqual(Object.keys(plan.purposeOptions),['remainder','dueAmount','businessDate','forward','principal','split']);
 assert.equal(plan.purposeOptions.remainder,'300');assert.equal(plan.purposeOptions.forward.paidThrough,'2026-11-02');assert.equal(plan.purposeOptions.forward.from,'2026-10-31');
 assert.deepEqual(plan.purposeOptions.principal.map(o=>[o.loanId,o.amount,o.dailyAfter,o.loanDisplayKey]),[['L1','300','97','Somchai-฿10,000-01/10-1%']]);
 assert.equal(plan.purposeOptions.split,true);assert.deepEqual(plan.split.map(r=>r.chargeId),['C2','C1']);
 assert.equal(calls.some(([,path])=>path.endsWith('/plan')),false,'no plan is read before a choice');
 // Not today: the plan is the business day's.
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'1000',paymentMethod:'Cash',cashAccountId:'CA1',paymentDate:'2026-10-29'},requestId:RID}),/PAY_FORWARD_TODAY_ONLY/);
 // Without previews (before V121 or outside owner testing), the refusal stays.
 await assert.rejects(planPayment({client:fake({offer:null}).client,borrowerId:'B1',values:{amountReceived:'1000',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID}),/AMOUNT_EXCEEDS_DUE/);
 // A settling principal and an uncovered forward are not offered; nothing left -> refusal.
 await assert.rejects(planPayment({client:fake({offer:{...remainder,forward:{...remainder.forward,uncovered:'50'},principal:[{...remainder.principal[0],settles:true}]}}).client,borrowerId:'B1',values:{amountReceived:'1000',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID}),/AMOUNT_EXCEEDS_DUE/);
});

test('R112: the chosen purpose builds the v11 (R118; v10 before) command from the server plan, re-posted to review; only offered choices',async()=>{
 const values={amountReceived:'1000',paymentMethod:'Bank Transfer',cashAccountId:'CA1'};
 let {client,calls}=fake();
 const forward=await planPayment({client,borrowerId:'B1',values,requestId:RID,purpose:{forward:true,principal:[]}});
 assert.equal(forward.command.schemaVersion,11);assert.deepEqual(forward.command,canonicalCommand(forward.command));assert.equal(forward.command.requestId,RID);
 assert.deepEqual(forward.command.materialize,forwardPlan.materialize);assert.deepEqual(forward.command.principal,[]);
 assert.deepEqual(calls.find(([,path])=>path.endsWith('/plan'))[2],{amountReceived:'1000',purpose:{forward:true,principal:[],loans:null}});
 assert.deepEqual(calls.at(-1),['POST','/api/payment-drafts/B1/review',{amountReceived:'1000',allocations:forward.command.allocations,materialize:forward.command.materialize,principal:[]}]);
 assert.equal(forward.plan.split.filter(r=>r.projected).length,3);
 ({client,calls}=fake());
 const principal=await planPayment({client,borrowerId:'B1',values,requestId:RID,purpose:{forward:false,principal:[{loanId:'L1',amount:'300'}]}});
 assert.deepEqual(principal.command.principal,[{loanId:'L1',kind:'raise',chargeId:'C2',chargeDate:'2026-10-29',amount:'300',accruedInterest:'0',principalDue:'300'}]);
 for(const purpose of [{forward:false,principal:[]},{forward:false,principal:[{loanId:'L1',amount:'299'}]},{forward:true,principal:[{loanId:'L1',amount:'300'}]},{forward:true,principal:[{loanId:'L2',amount:'100'}]},
  {forward:true,principal:[],loans:null},{forward:'yes',principal:[]},{forward:true,principal:[{loanId:'L1',amount:'0'}]}])
  await assert.rejects(planPayment({client,borrowerId:'B1',values,requestId:RID,purpose}),/PURPOSE_NOT_OFFERED/,JSON.stringify(purpose));
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{...values,amountReceived:'700'},requestId:RID,purpose:{forward:true,principal:[]}}),/PURPOSE_NOT_OFFERED/,'no remainder, no purpose');
 await assert.rejects(planPayment({client:fake({planFor:()=>({...forwardPlan,uncovered:'100'})}).client,borrowerId:'B1',values,requestId:RID,purpose:{forward:true,principal:[]}}),/PAY_FORWARD_UNCOVERED/);
 await assert.rejects(planPayment({client:fake({planFor:()=>({...principalPlan,settles:['L1']})}).client,borrowerId:'B1',values,requestId:RID,purpose:{forward:false,principal:[{loanId:'L1',amount:'300'}]}}),/PAY_FORWARD_SETTLES/);
 await assert.rejects(planPayment({client:fake({planChanged:true}).client,borrowerId:'B1',values,requestId:RID,purpose:{forward:true,principal:[]}}),/PLAN_CHANGED/);
});

test('R112: through the planner the remainder card stores the draft (purposeRequired), never a command; it is alone in its card',async()=>{
 const {client}=fake();
 const planner=createProposalPlanner({client,actor:{partnerId:'P1'},newId:()=>RID});
 const value=await planner.propose({operation:'payment.record',target:'B1',values:{amountReceived:'1000',paymentMethod:'Cash',cashAccountId:'CA1'}});
 const stored=JSON.parse(value.command);
 assert.deepEqual(Object.keys(stored),['requestId','purposeRequired','draft']);assert.equal(stored.requestId,RID);assert.equal(stored.purposeRequired,true);
 assert.throws(()=>canonicalCommand(stored));assert.equal(value.card.purposeOptions.remainder,'300');
 assert.deepEqual(value.card.confirmLabel,{en:'Record ฿1,000',th:'บันทึก ฿1,000'});
 let n=0;const many=createProposalPlanner({client,actor:{partnerId:'P1'},newId:()=>`00000000-0000-4000-8000-00000000000${n++}`});
 await assert.rejects(many.proposeGroup([{operation:'payment.record',target:'B1',values:{amountReceived:'1000',paymentMethod:'Cash',cashAccountId:'CA1'}},{operation:'payment.record',target:'B1',values:{amountReceived:'100',paymentMethod:'Cash',cashAccountId:'CA1'}}]),/PURPOSE_LINE_ALONE:1/);
});

test('R113: Repay principal that settles loans is one choice with its per-loan requests; Confirm builds a v11 (R118; v10 before) settle command',async()=>{
 const settle={...remainder,principal:[{loanId:'L1',amount:'300',settles:true,entry:null,payoffRemainder:'300',settlesWith:{payoff:'1000',gapInterest:'0',charges:'0',planHash:'a'.repeat(64)}}],
  repay:{purpose:{forward:false,principal:[{loanId:'L1',amount:'300'}],loans:null},settles:['L1'],uncovered:'0'}};
 const settlePlan={allocations:dueLines.map(l=>l.chargeId==='C2'?{...l,principal:'300',expectedPrincipalRemaining:'300'}:l).toSorted((a,b)=>a.chargeId.localeCompare(b.chargeId)),materialize:[],
  principal:[{loanId:'L1',kind:'settle',chargeId:'C2',chargeDate:'2026-10-29',amount:'300',accruedInterest:'0',principalDue:'300',payoff:'1000',charges:'0',planHash:'a'.repeat(64)}],uncovered:'0',settles:['L1'],paidThrough:{}};
 const values={amountReceived:'1000',paymentMethod:'Bank Transfer',cashAccountId:'CA1'};
 let {client}=fake({offer:settle,planFor:()=>settlePlan});
 const {plan}=await planPayment({client,borrowerId:'B1',values,requestId:RID});
 assert.deepEqual(plan.purposeOptions.principal.map(o=>[o.loanId,o.principal,o.closes.map(c=>[c.loanId,c.payoff])]),[['L1',[{loanId:'L1',amount:'300'}],[['L1','1000']]]]);
 assert.equal(plan.purposeOptions.split,false);
 const built=await planPayment({client,borrowerId:'B1',values,requestId:RID,purpose:{forward:false,principal:[{loanId:'L1',amount:'300'}]}});
 assert.equal(built.command.schemaVersion,11);assert.deepEqual(built.command.principal,[{loanId:'L1',kind:'settle',chargeId:'C2',chargeDate:'2026-10-29',amount:'300',accruedInterest:'0',principalDue:'300'}]);
 assert.deepEqual(built.command,canonicalCommand(built.command));
 // A request that reaches a loan's principal without settling it (settles without a settle entry) still refuses.
 ({client}=fake({offer:settle,planFor:()=>({...settlePlan,principal:[]})}));
 await assert.rejects(planPayment({client,borrowerId:'B1',values,requestId:RID,purpose:{forward:false,principal:[{loanId:'L1',amount:'300'}]}}),/PAY_FORWARD_SETTLES/);
});

test('R118: a late charge: Auto-assign pays interest, then the late charge, then principal; named charges pay the late part too; a next projected charge stays v9',async()=>{
 const lateDue=[charge('C2','2026-10-29','0','100'),charge('C1','2026-10-28','500','100','Somchai-฿10,000-01/10-1%','50')];
 const calls=[];
 const client={get:async path=>(calls.push(['GET',path]),{status:200,data:{...draft,charges:lateDue,scope:'all',upcoming}}),post:async(path,body)=>{
  calls.push(['POST',path,body]);
  if(path.endsWith('/select-all'))return {status:200,data:{...draft,charges:lateDue,total:'750'}};
  if(path.endsWith('/auto-assign'))return {status:200,data:{...autoAssign(body.amountReceived,body.lineVersion===11,lateDue),charges:lateDue}};
  if(path.endsWith('/review'))return body.selectedChargeIds?{status:200,data:{...draft,charges:lateDue.filter(r=>body.selectedChargeIds.includes(r.id))}}:{status:200,data:{...draft,allocations:body.allocations}};
  return {status:404,data:{ok:false,code:'not_found'}};
 }};
 const partial=await planPayment({client,borrowerId:'B1',values:{amountReceived:'260',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID});
 assert.equal(partial.command.schemaVersion,11);
 assert.deepEqual(partial.command.allocations.map(r=>[r.chargeId,r.interest,r.lateCharge,r.principal,r.expectedLateChargeRemaining]),[['C1','100','50','10','50'],['C2','100','0','0','0']]);
 assert.deepEqual(partial.plan.split.map(r=>[r.chargeId,r.lateCharge]),[['C2','0'],['C1','50']]);assert.equal(partial.plan.settlesAllDue,false);
 const all=await planPayment({client,borrowerId:'B1',values:{amountReceived:'750',paymentMethod:'Cash',cashAccountId:'CA1'},requestId:RID});
 assert.equal(all.plan.settlesAllDue,true);
 const named=await planPayment({client,borrowerId:'B1',values:{amountReceived:'650',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C1']},requestId:RID});
 assert.deepEqual(named.command.allocations,[{chargeId:'C1',principal:'500',interest:'100',lateCharge:'50',expectedPrincipalRemaining:'500',expectedInterestRemaining:'100',expectedLateChargeRemaining:'50',chargeDate:'2026-10-28'}]);
 await assert.rejects(planPayment({client,borrowerId:'B1',values:{amountReceived:'600',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C1']},requestId:RID}),/AMOUNT_MISMATCH:650/);
 const next=await planPayment({client,borrowerId:'B1',values:{amountReceived:'800',paymentMethod:'Cash',cashAccountId:'CA1',chargeIds:['C2'],nextChargeOf:['L1']},requestId:RID});
 assert.equal(next.command.schemaVersion,9);assert.equal(next.command.allocations.every(r=>!('lateCharge' in r)),true);
});
