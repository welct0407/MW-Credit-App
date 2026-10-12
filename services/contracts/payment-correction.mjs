import {canonicalAllocationPlan} from './payment-command.mjs';
import {validBorrowerId} from '../business/borrowers.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const fields=['borrowerId','amountReceived','paymentDate','paymentMethod','cashAccountId','notes','allocationMethod','targetChargeId','targetLoanId'];
const methods=['Single Full','Single Partial','Receive All','Lump Sum','First-day Auto','Loan Close','Selected Charges'];
/** The server separately proves immutable origin; client kind never selects an engine. */
export function canonicalPaymentCorrection(input){
 if(!(exact(input,['kind','fields','receiptMode'])||(input?.kind==='pwa-plan'&&exact(input,['kind','fields','receiptMode','closePreparationHash'])))||!['pwa-plan','legacy-source'].includes(input.kind)||!['preserve','replace','remove'].includes(input.receiptMode))throw Error('invalid_request');
 if(Object.hasOwn(input,'closePreparationHash')&&input.closePreparationHash!==null&&(typeof input.closePreparationHash!=='string'||!/^[a-f0-9]{64}$/.test(input.closePreparationHash)))throw Error('invalid_request');
 const keys=[...fields,input.kind==='pwa-plan'?'allocations':'selectedChargeIds'],value=input.fields;
 if(!exact(value,keys)||!validBorrowerId(value.borrowerId)||!validBorrowerId(value.cashAccountId)||typeof value.amountReceived!=='string'||!/^[1-9][0-9]*$/.test(value.amountReceived)||value.amountReceived.length>17||BigInt(value.amountReceived)>92233720368547758n)throw Error('invalid_request');
 if(typeof value.paymentDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)||value.paymentDate<'0001-01-01'||new Date(value.paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==value.paymentDate||!['Bank Transfer','Cash','Net-off at Disbursement'].includes(value.paymentMethod)||!methods.includes(value.allocationMethod))throw Error('invalid_request');
 for(const key of ['targetChargeId','targetLoanId'])if(value[key]!==null&&!validBorrowerId(value[key]))throw Error('invalid_request');
 if(value.notes!==null&&(typeof value.notes!=='string'||!value.notes.isWellFormed()||value.notes.includes('\0')||Buffer.byteLength(value.notes)>65536))throw Error('invalid_request');
 const result=Object.fromEntries(fields.map(key=>[key,value[key]]));
 if(input.kind==='pwa-plan'){
  if(!['Selected Charges','First-day Auto','Loan Close'].includes(value.allocationMethod))throw Error('invalid_request');
  result.allocations=canonicalAllocationPlan(value.amountReceived,value.allocations);
 }else{
  if(value.selectedChargeIds===null)result.selectedChargeIds=null;
  else{
   if(!Array.isArray(value.selectedChargeIds)||value.selectedChargeIds.length<1||value.selectedChargeIds.length>10000)throw Error('invalid_request');
   const ids=Array.from(value.selectedChargeIds,id=>{if(!validBorrowerId(id)||/[\s,]/u.test(id))throw Error('invalid_request');return id});
   if(new Set(ids).size!==ids.length)throw Error('invalid_request');result.selectedChargeIds=ids.sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  }
 }
 return {kind:input.kind,fields:result,receiptMode:input.receiptMode,...(Object.hasOwn(input,'closePreparationHash')?{closePreparationHash:input.closePreparationHash}:{})};
}
