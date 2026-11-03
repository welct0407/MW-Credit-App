/** R106 D3: a chat payment proposal. The model gives the borrower, the amount received, date, method, receiving
 * account and notes, and optionally the charges to pay (chargeIds: due charges paid in full; nextChargeOf: a loan's
 * next projected charge paid in full). It never gives the per-charge split: the split comes from the command
 * service's own draft routes, called with the Partner's token (the Payments screen's code), and this module does no
 * allocation arithmetic of its own beyond summing the lines it was given:
 * - amount only: POST /api/payment-drafts/:borrower/auto-assign {amountReceived}, the screen's Auto-assign (due
 *   charges newest first, interest before principal); an unallocated remainder refuses (AMOUNT_EXCEEDS_DUE);
 * - named charges: POST .../review {selectedChargeIds}, each charge's full remaining;
 * - next projected charge: GET /api/payment-drafts/:borrower?scope=all supplies `upcoming`; the line pays the whole
 *   projected charge and enters `materialize` (schemaVersion 9; 8 otherwise).
 * Every plan is posted back to .../review in the plan form before the proposal is stored, so plan_changed is caught
 * here as well as at confirm. Receipt images stay out (receiptId null, no slip fields).
 * R112: an amount above what is due (amount only, dated the business day) no longer refuses when Auto-assign offers the
 * R110 remainder choices: the proposal holds no command yet (command null) and the card lists the choices
 * (purposeOptions: pay forward, repay principal per loan, split); nothing is preselected. At Confirm the Partner's purpose
 * is checked against the choices offered now, the server plan is read (POST .../plan) and the v10 command is built from
 * it, re-posted to .../review and sent once under the proposal's request id; the command recomputes it again in SQL.
 * R118: every command is schemaVersion 11 (8-key lines: inside a charge interest, then late charge, then principal), except a
 * plan that books a next projected charge (nextChargeOf), which stays schemaVersion 9 (6-key lines; such a v11 command would
 * be recomputed as a pay-forward plan): its lines pay principal and interest only. */
import {canonicalCommand} from '../contracts/payment-command.mjs';
import {ToolError} from './errors.mjs';

const ID=v=>typeof v==='string'&&v.length>=1&&Buffer.byteLength(v)<=256&&!/[\u0000-\u001f\u007f,\s]/u.test(v);
const DAY=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export const PAYMENT_METHODS=Object.freeze(['Bank Transfer','Cash','Net-off at Disbursement']);
const KEYS=['amountReceived','paymentDate','paymentMethod','cashAccountId','notes','chargeIds','nextChargeOf'];
const SPLIT_KEYS=['allocations','split','principal','interest','materialize','lines'];
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Maps a non-200 draft answer to the tool error the model sees. */
function draftError(status,data){
 if(status===404)return new ToolError('TARGET_NOT_FOUND');
 if(status===401||status===403)return new ToolError('ACCESS_DENIED');
 const code=typeof data?.code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(data.code)?data.code:null;
 if(code&&status>=400&&status<500)return new ToolError(code.toUpperCase());
 return new ToolError('COMMAND_UNAVAILABLE');
}
function wholeAmount(value,name){
 const text=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;
 if(typeof text!=='string'||!/^[1-9][0-9]{0,16}$/.test(text)||BigInt(text)>92233720368547758n)throw new ToolError(`INVALID_FIELD:${name}`);
 return text;
}
function idList(value,name){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length<1||value.length>100||value.some(v=>!ID(v))||new Set(value).size!==value.length)throw new ToolError(`INVALID_FIELD:${name}`);
 return [...value];
}
// R118: a charge's full remaining as an 8-key line (the late charge too; a projected charge has none).
const line=row=>({chargeId:row.id,principal:row.principalRemaining,interest:row.interestRemaining,lateCharge:row.lateChargeRemaining??'0',expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,expectedLateChargeRemaining:row.lateChargeRemaining??'0',chargeDate:row.chargeDate});
const sixKey=({lateCharge:_l,expectedLateChargeRemaining:_e,...row})=>row;
const late=row=>BigInt(row.lateCharge??'0');

/**
 * @param {{client:{get:Function,post:Function},borrowerId:string,values:Record<string,any>,requestId:string,purpose?:any}} input
 * purpose (R112, Confirm only): the Partner's choice {forward, principal:[{loanId, amount}]} for the remainder.
 * @returns {Promise<{command:any,plan:any,draft?:any}>} the canonical v8/v9/v10 command (null while a remainder waits for
 * its purpose, with the draft fields to build it from) and the facts the card shows.
 */
export async function planPayment({client,borrowerId,values,requestId,purpose=null}){
 if(!ID(borrowerId))throw new ToolError('TARGET_REQUIRED');
 if(!plain(values))throw new ToolError('INVALID_VALUES');
 for(const key of Object.keys(values)){
  if(SPLIT_KEYS.includes(key))throw new ToolError(`HOST_FIELD:${key}`);
  if(!KEYS.includes(key))throw new ToolError(`UNKNOWN_FIELD:${key}`);
 }
 const amountReceived=wholeAmount(values.amountReceived,'amountReceived');
 const chargeIds=idList(values.chargeIds,'chargeIds'),nextChargeOf=idList(values.nextChargeOf,'nextChargeOf');
 if(!PAYMENT_METHODS.includes(values.paymentMethod))throw new ToolError(values.paymentMethod===undefined?'MISSING_FIELD:paymentMethod':'INVALID_FIELD:paymentMethod');
 const notes=values.notes===undefined||values.notes===null||values.notes===''?null:values.notes;
 if(notes!==null&&(typeof notes!=='string'||!notes.isWellFormed()||notes.includes('\0')||Buffer.byteLength(notes)>65536))throw new ToolError('INVALID_FIELD:notes');
 const base='/api/payment-drafts/'+encodeURIComponent(borrowerId);
 const call=async(method,path,body)=>{
  const {status,data}=method==='GET'?await client.get(path):await client.post(path,body);
  if(status!==200)throw draftError(status,data);
  return data;
 };
 // Every due charge of the borrower (the consequence rule) with the borrower label, business date and accounts.
 const due=await call('POST',base+'/select-all',{});
 if(!Array.isArray(due.charges))throw new ToolError('COMMAND_UNAVAILABLE');
 const paymentDate=values.paymentDate===undefined||values.paymentDate===null?due.businessDate:values.paymentDate;
 if(!DAY(paymentDate))throw new ToolError('INVALID_FIELD:paymentDate');
 const cashAccountId=values.cashAccountId===undefined||values.cashAccountId===null?due.preferredReceivingAccountId??null:values.cashAccountId;
 if(cashAccountId===null)throw new ToolError('MISSING_FIELD:cashAccountId');
 if(!ID(cashAccountId))throw new ToolError('INVALID_FIELD:cashAccountId');
 const accounts=Array.isArray(due.accounts)?due.accounts:[];
 if(!accounts.some(a=>a.id===cashAccountId))throw new ToolError('INVALID_FIELD:cashAccountId');
 let allocations,materialize=[],labels=new Map(due.charges.map(row=>[row.id,row]));
 if(!chargeIds.length&&!nextChargeOf.length){
  const assigned=await call('POST',base+'/auto-assign',{amountReceived,lineVersion:11});
  if(typeof assigned.unallocated!=='string'||!Array.isArray(assigned.allocations))throw new ToolError('COMMAND_UNAVAILABLE');
  if(assigned.unallocated!=='0'){
   // R112: the remainder choices (Auto-assign's R110 previews) or, without them, the refusal as before.
   const options=purposeOptions(assigned,due);
   if(!options)throw new ToolError('AMOUNT_EXCEEDS_DUE');
   if(paymentDate!==due.businessDate)throw new ToolError('PAY_FORWARD_TODAY_ONLY');
   for(const row of assigned.charges??[])labels.set(row.id,row);
   const dueSplit=assigned.allocations.map(row=>({chargeId:row.chargeId,loanDisplayKey:labels.get(row.chargeId)?.loanDisplayKey??null,chargeDate:row.chargeDate,principal:row.principal,interest:row.interest,lateCharge:row.lateCharge??'0',projected:false}))
    .sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate)||a.chargeId.localeCompare(b.chargeId));
   const facts={borrowerLabel:due.borrower?.displayName??null,businessDate:due.businessDate,accountLabel:accounts.find(a=>a.id===cashAccountId)?.label??null};
   if(purpose===null)return {command:null,draft:{borrowerId,amountReceived,paymentDate,paymentMethod:values.paymentMethod,cashAccountId,notes},plan:{...facts,settlesAllDue:false,split:dueSplit,purposeOptions:options}};
   return payForward({call,base,requestId,borrowerId,amountReceived,paymentDate,paymentMethod:values.paymentMethod,cashAccountId,notes,purpose:chosenPurpose(options,purpose),labels,facts});
  }
  if(purpose!==null)throw new ToolError('PURPOSE_NOT_OFFERED');
  allocations=assigned.allocations;
  for(const row of assigned.charges??[])labels.set(row.id,row);
 }else{
  if(purpose!==null)throw new ToolError('PURPOSE_NOT_OFFERED');
  allocations=[];
  if(chargeIds.length){
   const reviewed=await call('POST',base+'/review',{selectedChargeIds:chargeIds});
   if(!Array.isArray(reviewed.charges)||reviewed.charges.length!==chargeIds.length)throw new ToolError('SELECTION_CHANGED');
   for(const row of reviewed.charges){labels.set(row.id,row);allocations.push(line(row));}
  }
  if(nextChargeOf.length){
   const draft=await call('GET',base+'?scope=all');
   const upcoming=Array.isArray(draft.upcoming)?draft.upcoming:[];
   for(const loanId of nextChargeOf){
    const row=upcoming.find(entry=>entry.loanId===loanId);
    if(!row)throw new ToolError(`NEXT_CHARGE_UNAVAILABLE:${loanId}`);
    labels.set(row.id,{...row,projected:true});allocations.push(line(row));
    materialize.push({loanId,chargeId:row.id,chargeDate:row.chargeDate,principalDue:row.principalRemaining,interestDue:row.interestRemaining});
   }
  }
  // A next projected charge keeps the v9 command, whose lines pay principal and interest only.
  if(materialize.length)allocations=allocations.map(sixKey).filter(row=>BigInt(row.principal)+BigInt(row.interest)>0n);
  // Only a sum of the lines the command service gave: the amount must pay them exactly.
  let total=0n;for(const row of allocations)total+=BigInt(row.principal)+BigInt(row.interest)+late(row);
  if(total!==BigInt(amountReceived))throw new ToolError(`AMOUNT_MISMATCH:${total}`);
 }
 let command;
 try{
  command=canonicalCommand({schemaVersion:materialize.length?9:11,requestId,borrowerId,allocations,cashAccountId,paymentDate,amountReceived,paymentMethod:values.paymentMethod,notes,receiptId:null,
   bankReference:null,transferTime:null,payerLines:null,...(materialize.length?{materialize}:{materialize:[],principal:[]})});
 }catch{throw new ToolError('INVALID_COMMAND');}
 // The plan the command will carry, checked by the screen's review route now (and again by the command at confirm).
 const {status,data}=await client.post(base+'/review',{amountReceived,allocations:command.allocations,materialize:command.materialize,...(command.schemaVersion===11?{principal:command.principal}:{})});
 if(status===409&&data?.code==='plan_changed')throw new ToolError('PLAN_CHANGED');
 if(status!==200)throw draftError(status,data);
 const paid=new Map(command.allocations.map(row=>[row.chargeId,row]));
 const settlesAllDue=due.charges.length>0&&due.charges.every(row=>{const p=paid.get(row.id);return p&&p.principal===row.principalRemaining&&p.interest===row.interestRemaining&&(p.lateCharge??'0')===(row.lateChargeRemaining??'0');});
 return {command,plan:{borrowerLabel:due.borrower?.displayName??null,businessDate:due.businessDate,accountLabel:accounts.find(a=>a.id===cashAccountId)?.label??null,settlesAllDue,
  split:command.allocations.map(row=>({chargeId:row.chargeId,loanDisplayKey:labels.get(row.chargeId)?.loanDisplayKey??null,chargeDate:row.chargeDate,principal:row.principal,interest:row.interest,lateCharge:row.lateCharge??'0',projected:labels.get(row.chargeId)?.projected===true}))
   .sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate)||a.chargeId.localeCompare(b.chargeId))}};
}

const WHOLE=v=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,16})$/.test(v);
/** R112: the card's remainder choices from Auto-assign's R110 previews (store.mjs remainderPreview), or null when the
 * amount above what is due cannot be offered (no preview, before V121 or outside owner testing). Pay forward is offered
 * when its plan covers the whole remainder; principal per loan when it does not settle the loan; split when both are. */
export function purposeOptions(assigned,due){
 const r=assigned?.remainder;
 if(!plain(r)||!WHOLE(r.amount)||r.amount==='0'||r.amount!==assigned.unallocated)return null;
 const labels=plain(r.loans)?r.loans:{};
 const rows=Array.isArray(r.forward?.rows)?r.forward.rows.filter(row=>plain(row)&&ID(row.loanId)&&DAY(row.chargeDate)&&WHOLE(row.principal)&&WHOLE(row.interest)&&WHOLE(row.principalDue)&&WHOLE(row.interestDue)):[];
 const covered=r.forward?.uncovered==='0'&&rows.length>0;
 const paidThrough=plain(r.forward?.paidThrough)?Object.values(r.forward.paidThrough).filter(DAY).sort().at(-1)??null:null;
 const forward=covered?{from:rows[0].chargeDate,paidThrough,rows:rows.slice(0,200).map(row=>({loanId:row.loanId,chargeId:row.chargeId,chargeDate:row.chargeDate,principalDue:row.principalDue,interestDue:row.interestDue,principal:row.principal,interest:row.interest,partial:row.partial===true}))}:null;
 // R113: when Repay principal (the server's purpose over the loans in Row ID order) closes loans and covers the remainder,
 // it is the one principal choice: it settles each loan at its Loan Close payoff (card: "Closes …", loan_close_payoff).
 const repay=plain(r.repay)&&plain(r.repay.purpose)&&Array.isArray(r.repay.purpose.principal)&&r.repay.purpose.principal.length&&Array.isArray(r.repay.settles)&&r.repay.settles.length&&r.repay.uncovered==='0'?r.repay:null;
 if(repay){
  const byLoan=new Map((Array.isArray(r.principal)?r.principal:[]).filter(o=>plain(o)&&ID(o.loanId)).map(o=>[o.loanId,o]));
  const lines=repay.purpose.principal.filter(x=>plain(x)&&ID(x.loanId)&&WHOLE(x.amount)).map(x=>({loanId:x.loanId,amount:x.amount}));
  const closes=repay.settles.filter(ID).map(loanId=>({loanId,loanDisplayKey:typeof labels[loanId]==='string'?labels[loanId]:null,payoff:byLoan.get(loanId)?.settlesWith?.payoff??null}));
  if(lines.length===repay.purpose.principal.length&&closes.length){
   const option={loanId:lines[0].loanId,loanDisplayKey:closes.map(x=>x.loanDisplayKey??x.loanId).join(', '),amount:r.amount,dailyBefore:null,dailyAfter:null,outstandingBefore:null,outstandingAfter:null,principal:lines,closes};
   return {remainder:r.amount,dueAmount:assigned.allocated??null,businessDate:due.businessDate,forward,principal:[option],split:false};
  }
 }
 const principal=(Array.isArray(r.principal)?r.principal:[]).filter(o=>plain(o)&&ID(o.loanId)&&WHOLE(o.amount)&&o.amount!=='0'&&o.settles!==true&&o.settleOnly!==true&&plain(o.entry)).slice(0,20)
  .map(o=>({loanId:o.loanId,loanDisplayKey:typeof labels[o.loanId]==='string'?labels[o.loanId]:null,amount:o.amount,dailyBefore:WHOLE(o.entry.dailyBefore)?o.entry.dailyBefore:null,dailyAfter:WHOLE(o.entry.dailyAfter)?o.entry.dailyAfter:null,
   outstandingBefore:WHOLE(o.entry.outstandingBefore)?o.entry.outstandingBefore:null,outstandingAfter:WHOLE(o.entry.outstandingAfter)?o.entry.outstandingAfter:null}));
 const settles=(Array.isArray(r.principal)?r.principal:[]).some(o=>plain(o)&&o.settles===true);
 if(!forward&&!principal.length)return null;
 return {remainder:r.amount,dueAmount:assigned.allocated??null,businessDate:due.businessDate,forward,principal,split:!!forward&&principal.length>0,
  ...(settles?{settles:true}:{}),...(!covered&&WHOLE(r.forward?.uncovered)&&r.forward.uncovered!=='0'?{uncovered:r.forward.uncovered}:{})};
}
/** R112: the Partner's purpose, accepted only as one of the offered choices: pay forward {forward:true, principal:[]};
 * repay principal {forward:false, principal:[{loanId, amount: the offered amount}]}; split {forward:true, principal:
 * [{loanId, amount between 1 and the offered amount less 1}]}. Returns the plan route's purpose (loans null). */
export function chosenPurpose(options,input){
 const bad=()=>{throw new ToolError('PURPOSE_NOT_OFFERED');};
 // R113: a Repay principal choice that settles loans carries its whole per-loan request list (option.principal).
 const repay=options.principal.find(o=>Array.isArray(o.principal));
 if(repay&&plain(input)&&input.forward===false&&Array.isArray(input.principal)&&input.principal.length>1){
  if(Object.keys(input).sort().join(',')!=='forward,principal'||JSON.stringify(input.principal.map(x=>({loanId:x?.loanId,amount:x?.amount})))!==JSON.stringify(repay.principal))bad();
  return {forward:false,principal:repay.principal.map(x=>({loanId:x.loanId,amount:x.amount})),loans:null};
 }
 if(!plain(input)||Object.keys(input).sort().join(',')!=='forward,principal'||typeof input.forward!=='boolean'||!Array.isArray(input.principal)||input.principal.length>1)bad();
 const line=input.principal[0];
 if(line!==undefined&&(!plain(line)||Object.keys(line).sort().join(',')!=='amount,loanId'||!WHOLE(line.amount)||line.amount==='0'))bad();
 const option=line?options.principal.find(o=>o.loanId===line.loanId):null;
 if(!line){if(!input.forward||!options.forward)bad();}
 else if(!option)bad();
 else if(Array.isArray(option.principal)){if(input.forward||JSON.stringify([{loanId:line.loanId,amount:line.amount}])!==JSON.stringify(option.principal))bad();return {forward:false,principal:option.principal.map(x=>({loanId:x.loanId,amount:x.amount})),loans:null};}
 else if(!input.forward){if(line.amount!==option.amount)bad();}
 else if(!options.split||BigInt(line.amount)>=BigInt(option.amount))bad();
 return {forward:input.forward,principal:line?[{loanId:line.loanId,amount:line.amount}]:[],loans:null};
}
/** R112: the server's plan for the chosen purpose -> the v11 (R118; v10 before) command (checked by .../review), as Receive payment builds it. */
async function payForward({call,base,requestId,borrowerId,amountReceived,paymentDate,paymentMethod,cashAccountId,notes,purpose,labels,facts}){
 const read=await call('POST',base+'/plan',{amountReceived,purpose});
 const plan=read?.plan;
 if(!plain(plan)||read.businessDate!==paymentDate)throw new ToolError('PLAN_CHANGED');
 // R113: a loan the plan settles is a settle entry (the command closes it); one a request reaches without settling refuses.
 if(Array.isArray(plan.settles)&&plan.settles.some(id=>!(plan.principal??[]).some(e=>e?.loanId===id&&e.kind==='settle')))throw new ToolError('PAY_FORWARD_SETTLES');
 if(plan.uncovered!=='0')throw new ToolError('PAY_FORWARD_UNCOVERED');
 if(!Array.isArray(plan.principal)||plan.principal.length!==purpose.principal.length||!Array.isArray(plan.allocations)||!Array.isArray(plan.materialize))throw new ToolError('PLAN_CHANGED');
 const principal=plan.principal.map(e=>({loanId:e.loanId,kind:e.kind,chargeId:e.chargeId,chargeDate:e.chargeDate,amount:e.amount,accruedInterest:e.accruedInterest,principalDue:e.principalDue}));
 let command;
 try{
  command=canonicalCommand({schemaVersion:11,requestId,borrowerId,allocations:plan.allocations,cashAccountId,paymentDate,amountReceived,paymentMethod,notes,receiptId:null,
   bankReference:null,transferTime:null,payerLines:null,materialize:plan.materialize,principal});
 }catch{throw new ToolError('PLAN_CHANGED');}
 // .../review recomputes the whole plan for the purpose the command derives (409 plan_changed -> PLAN_CHANGED).
 await call('POST',base+'/review',{amountReceived,allocations:command.allocations,materialize:command.materialize,principal:command.principal});
 const projected=new Set(command.materialize.map(row=>row.chargeId));
 return {command,plan:{...facts,settlesAllDue:false,split:command.allocations.map(row=>({chargeId:row.chargeId,loanDisplayKey:labels.get(row.chargeId)?.loanDisplayKey??null,chargeDate:row.chargeDate,principal:row.principal,interest:row.interest,lateCharge:row.lateCharge??'0',projected:projected.has(row.chargeId)||row.chargeDate>paymentDate}))
  .sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate)||a.chargeId.localeCompare(b.chargeId))}};
}
