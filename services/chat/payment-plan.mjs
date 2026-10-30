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
 * here as well as at confirm. Receipt images stay out (receiptId null, no slip fields). */
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
const line=row=>({chargeId:row.id,principal:row.principalRemaining,interest:row.interestRemaining,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate});

/**
 * @param {{client:{get:Function,post:Function},borrowerId:string,values:Record<string,any>,requestId:string}} input
 * @returns {Promise<{command:any,plan:any}>} the canonical v8/v9 command and the facts the card shows.
 */
export async function planPayment({client,borrowerId,values,requestId}){
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
  const assigned=await call('POST',base+'/auto-assign',{amountReceived});
  if(typeof assigned.unallocated!=='string'||!Array.isArray(assigned.allocations))throw new ToolError('COMMAND_UNAVAILABLE');
  if(assigned.unallocated!=='0')throw new ToolError('AMOUNT_EXCEEDS_DUE');
  allocations=assigned.allocations;
  for(const row of assigned.charges??[])labels.set(row.id,row);
 }else{
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
  // Only a sum of the lines the command service gave: the amount must pay them exactly.
  const total=allocations.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest),0n);
  if(total!==BigInt(amountReceived))throw new ToolError(`AMOUNT_MISMATCH:${total}`);
 }
 let command;
 try{
  command=canonicalCommand({schemaVersion:materialize.length?9:8,requestId,borrowerId,allocations,cashAccountId,paymentDate,amountReceived,paymentMethod:values.paymentMethod,notes,receiptId:null,
   bankReference:null,transferTime:null,payerLines:null,...(materialize.length?{materialize}:{})});
 }catch{throw new ToolError('INVALID_COMMAND');}
 // The plan the command will carry, checked by the screen's review route now (and again by the command at confirm).
 const {status,data}=await client.post(base+'/review',{amountReceived,allocations:command.allocations,...(materialize.length?{materialize:command.materialize}:{})});
 if(status===409&&data?.code==='plan_changed')throw new ToolError('PLAN_CHANGED');
 if(status!==200)throw draftError(status,data);
 const paid=new Map(command.allocations.map(row=>[row.chargeId,row]));
 const settlesAllDue=due.charges.length>0&&due.charges.every(row=>{const p=paid.get(row.id);return p&&p.principal===row.principalRemaining&&p.interest===row.interestRemaining;});
 return {command,plan:{borrowerLabel:due.borrower?.displayName??null,businessDate:due.businessDate,accountLabel:accounts.find(a=>a.id===cashAccountId)?.label??null,settlesAllDue,
  split:command.allocations.map(row=>({chargeId:row.chargeId,loanDisplayKey:labels.get(row.chargeId)?.loanDisplayKey??null,chargeDate:row.chargeDate,principal:row.principal,interest:row.interest,projected:labels.get(row.chargeId)?.projected===true}))
   .sort((a,b)=>b.chargeDate.localeCompare(a.chargeDate)||a.chargeId.localeCompare(b.chargeId))}};
}
