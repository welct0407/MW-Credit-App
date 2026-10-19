import type {OwnerOfflineRepository} from './owner-offline';

/** R078 item 6: after the server confirms the owner's own payment as Posted, the result is applied to the
 * stored offline bundles at once, so the payment shows without waiting for the confirming check.
 * Only a Posted server result is applied (never a queued or unknown command, never the device's own input).
 * The patch is narrow and additive: payment rows and their direct charge balances. Derived values
 * (dashboard, balances, upcoming, statements, analytics) wait for the confirming check, which replaces
 * the patched rows with the server's (the bundle's localPending marker forces that check to walk).
 * Bundle metadata (source version, asOf, business date) is unchanged, so "Updated HH:MM" does not move. */
export type LocalPending={requestId:string;at:number};
type Access={origin:string;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};

/** Decimal text arithmetic without floating point; null when either side is not a plain decimal. */
export function addDecimal(left:unknown,right:unknown,sign:1|-1=1):string|null{
 const parse=(value:unknown)=>{const match=typeof value==='string'?/^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim()):null;return match?{negative:match[1]==='-',whole:match[2],fraction:match[3]??''}:null};
 const a=parse(left),b=parse(right);if(!a||!b)return null;
 const scale=Math.max(a.fraction.length,b.fraction.length),value=(part:{negative:boolean;whole:string;fraction:string})=>(part.negative?-1n:1n)*BigInt(part.whole+part.fraction.padEnd(scale,'0'));
 const total=value(a)+BigInt(sign)*value(b),negative=total<0n,digits=(negative?-total:total).toString().padStart(scale+1,'0');
 return (negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);
}
const positive=(value:string|null)=>value!==null&&!value.startsWith('-')&&/[1-9]/.test(value);

/** A server command result (GET /api/payment-commands/{id}/result) that may be applied locally. */
export const appliableResult=(result:any)=>!!result&&result.currentSource==='present'&&result.payment?.status==='Posted'&&typeof result.payment.id==='string'&&typeof result.payment.borrowerId==='string'&&Array.isArray(result.allocations);
const mark=(bundle:any,requestId:string)=>{bundle.localPending=[...new Set([...(Array.isArray(bundle.localPending)?bundle.localPending:[]),requestId])];return bundle};

/** records: payment detail, borrower payment history, payment months, loan payments and charge balances. */
export function patchRecords(bundle:any,result:any,requestId:string,at=Date.now()){
 const data=bundle?.data,payment=result.payment;if(!data)return null;
 const existing=(data.payments??[]).find((row:any)=>row.id===payment.id);
 // The bundle already holds the server's row (a check committed first): nothing to apply.
 if(existing&&!existing.localPending)return null;
 const localPending:LocalPending={requestId,at},borrower=(data.borrowerList??[]).find((row:any)=>row.id===payment.borrowerId)??null;
 const chargeOf=(id:string)=>(data.charges??[]).find((row:any)=>row.id===id);
 const draftCharge=(id:string)=>Object.values(data.paymentDrafts?.[payment.borrowerId]??{}).flatMap((draft:any)=>draft?.charges??[]).find((row:any)=>row.id===id);
 const receipt=typeof payment.receiptReference==='string'&&payment.receiptReference.trim()?'attached':null;
 const record={...(existing??{}),asOf:bundle.asOf,businessDate:bundle.businessDate,id:payment.id,borrowerId:payment.borrowerId,borrowerName:borrower?.name??null,borrowerDescription:borrower?.description??null,amountReceived:payment.amountReceived,postedAmount:payment.postedAmount,paymentDate:payment.paymentDate,paymentMethod:payment.paymentMethod,allocationMethod:payment.allocationMethod,targetChargeId:payment.targetChargeId??null,targetLoanId:null,selectedChargeIdsText:payment.selectedChargeIds??null,cashAccountId:payment.cashAccountId,cashAccountLabel:payment.accountLabel??null,notes:payment.notes??null,receiptReference:receipt,receiptAt:payment.receiptAt??null,agentReceiptPresent:false,agentReceiptAt:null,status:payment.status,createdAt:payment.createdAt??null,processedAt:payment.processedAt??null,originalOutcomeStatus:'posted',originalRecordedAt:result.history?.recordedAt??null,provenance:null,
  allocations:result.allocations.map((row:any)=>({...row,loanDisplayKey:draftCharge(row.chargeId)?.loanDisplayKey??null})),repayments:result.repayments??[],cashMovements:(result.cashMovements??[]).map(({sourceType:_type,sourceKey:_key,...row}:any)=>row),localPending};
 data.payments=[...(data.payments??[]).filter((row:any)=>row.id!==payment.id),record];
 const history={borrowerId:payment.borrowerId,requestId,id:payment.id,status:payment.status,paymentDate:payment.paymentDate,amountReceived:payment.amountReceived,postedAmount:payment.postedAmount,notes:payment.notes??null,receiptReference:receipt,receiptAt:payment.receiptAt??null,accountLabel:payment.accountLabel??null,localPending};
 data.paymentHistory=[...(data.paymentHistory??[]).filter((row:any)=>row.id!==payment.id),history];
 if(!existing){
  // Balances move once per payment; a repeated apply only refreshes the rows above.
  const month=typeof payment.paymentDate==='string'?payment.paymentDate.slice(0,7):null,months=data.paymentMonths??[],group=months.find((row:any)=>(row.borrowerId??null)===payment.borrowerId&&(row.month??null)===month);
  if(group){const amount=addDecimal(group.amountReceived,payment.amountReceived);if(amount!==null)Object.assign(group,{amountReceived:amount,count:(group.count??0)+1,localPending})}
  else data.paymentMonths=[...months,{borrowerId:payment.borrowerId,month,amountReceived:payment.amountReceived,count:1,localPending}];
  const loans=new Set<string>();
  for(const allocation of result.allocations){
   const charge=chargeOf(allocation.chargeId);
   if(charge){const remaining=addDecimal(charge.amountRemaining,allocation.amount,-1),paid=addDecimal(charge.totalPaid,allocation.amount);if(remaining!==null&&paid!==null)Object.assign(charge,{amountRemaining:remaining,totalPaid:paid,localPending});if(charge.loanId)loans.add(charge.loanId)}
   for(const [loanId,related] of Object.entries(data.loanRelated??{}) as [string,any][]){const row=(related?.charges??[]).find((item:any)=>item.id===allocation.chargeId);if(!row)continue;loans.add(loanId);const remaining=addDecimal(row.remaining,allocation.amount,-1);if(remaining!==null)Object.assign(row,{remaining,localPending})}
   for(const drafts of Object.values(data.paymentDrafts?.[payment.borrowerId]??{}) as any[]){
    if(!Array.isArray(drafts?.charges))continue;
    drafts.charges=drafts.charges.flatMap((row:any)=>{if(row.id!==allocation.chargeId)return [row];const amount=addDecimal(row.amountRemaining,allocation.amount,-1),principal=addDecimal(row.principalRemaining,allocation.principal,-1),interest=addDecimal(row.interestRemaining,allocation.interest,-1);if(amount===null||principal===null||interest===null)return [row];
     // A charge paid in full leaves the payment draft, as the server's draft does.
     return positive(amount)?[{...row,amountRemaining:amount,principalRemaining:principal,interestRemaining:interest,localPending}]:[]});
   }
  }
  for(const loanId of loans){const related=data.loanRelated?.[loanId];if(!related)continue;related.payments=[{id:payment.id,date:payment.paymentDate,amount:payment.amountReceived,method:payment.paymentMethod,status:payment.status,notes:payment.notes??null,localPending},...(related.payments??[]).filter((row:any)=>row.id!==payment.id)].sort((a:any,b:any)=>(a.date==null?1:0)-(b.date==null?1:0)||(a.date<b.date?1:a.date>b.date?-1:0)||(a.id<b.id?-1:a.id>b.id?1:0))}
 }
 return mark(bundle,requestId);
}
/** collection: the payment's receipt row and the charge amounts it paid. */
export function patchCollection(bundle:any,result:any,requestId:string,at=Date.now()){
 const data=bundle?.data,payment=result.payment;if(!data)return null;
 const existing=(data.receipts??[]).find((row:any)=>row.id===payment.id);if(existing&&!existing.localPending)return null;
 const localPending:LocalPending={requestId,at},paidIds=result.allocations.filter((row:any)=>positive(addDecimal(row.amount,'0'))).map((row:any)=>row.chargeId);
 const charges=(data.charges??[]).filter((row:any)=>row.borrowerId===payment.borrowerId&&paidIds.includes(row.id));
 // A payment on no charge the collection shows has nothing to patch there.
 if(!existing&&!charges.length)return null;
 if(!existing){
  for(const allocation of result.allocations){const row=charges.find((charge:any)=>charge.id===allocation.chargeId);if(!row)continue;const remaining=addDecimal(row.amountRemaining,allocation.amount,-1),paid=addDecimal(row.totalPaid,allocation.amount),today=payment.paymentDate===bundle.businessDate?addDecimal(row.receivedToday??'0',allocation.amount):row.receivedToday;if(remaining===null||paid===null)continue;Object.assign(row,{amountRemaining:remaining,totalPaid:paid,receivedToday:today,localPending})}
 }
 const receipt={id:payment.id,borrowerId:payment.borrowerId,paymentDate:payment.paymentDate,amount:payment.amountReceived,manualReceiptPresent:typeof payment.receiptReference==='string'&&!!payment.receiptReference.trim(),agentReceiptPresent:false,receiptAt:payment.receiptAt??null,chargeIds:charges.map((row:any)=>row.id).sort(),localPending};
 data.receipts=[...(data.receipts??[]).filter((row:any)=>row.id!==payment.id),receipt];
 return mark(bundle,requestId);
}

const ready=(repo:OwnerOfflineRepository,domain:string)=>window.dispatchEvent(new CustomEvent('mw-offline-dataset-ready',{detail:{scopeName:repo.scopeName,domain,changed:true}}));
/** Applies a Posted own payment result to records and collection; returns the domains it changed. */
export async function applyOwnPayment(access:Pick<Access,'offline'>,requestId:string,result:any):Promise<string[]>{
 const repo=access.offline;if(!repo||!appliableResult(result))return [];
 const changed:string[]=[],at=Date.now();
 for(const [domain,patch] of [['records',patchRecords],['collection',patchCollection]] as const){
  try{if(await repo.patchDataset(domain,bundle=>patch(bundle,result,requestId,at))){changed.push(domain);ready(repo,domain)}}catch{/* The confirming check still brings the payment. */}
 }
 return changed;
}
const results=new Map<string,Promise<string[]>>();
/** A payment synced from the saved-request queue: read its server result once and apply it. */
export function confirmOwnPayment(access:Access,requestId:string):Promise<string[]>{
 const key=(access.offline?.scopeName??'')+':'+requestId,current=results.get(key);if(current)return current;
 const task=(async()=>{
  if(!access.offline||access.offlineOnly||!navigator.onLine)return [];
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(access.origin+'/api/payment-commands/'+encodeURIComponent(requestId)+'/result',{headers:{Authorization:'Bearer '+await access.token(),'X-MW-Wake-Deadline':String(Date.now()+15000)},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.status===401||response.status===403){access.authFailure(response.status);return []}
   if(!response.ok)return [];
   return await applyOwnPayment(access,requestId,await response.json());
  }catch{return []}finally{clearTimeout(timer)}
 })();
 results.set(key,task);void task.finally(()=>setTimeout(()=>{if(results.get(key)===task)results.delete(key)},1000));
 return task;
}
/** The dataset media key under which the coordinator keeps a payment's manual receipt. */
export const ownReceiptKey=(origin:string,paymentId:string)=>'blob:'+new URL('/api/payment-records/'+encodeURIComponent(paymentId)+'/receipt?source=manual',origin).href;
/** A seeded receipt counts as current for the coordinator (saved at or after the server's receipt time,
 * read the same way the coordinator reads it), even when the device clock is behind the server. */
export const seededReceiptTime=(receiptAt:unknown)=>Math.max(Date.now(),typeof receiptAt==='string'?Date.parse(receiptAt)||0:0);
