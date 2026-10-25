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
export async function applyOwnPayment(access:Pick<Access,'offline'>,requestId:string,result:any,receipt?:OwnReceipt):Promise<string[]>{
 const repo=access.offline;if(!repo||!appliableResult(result))return [];
 // The own receipt is stored for the payment now (verified locally, or one background download).
 if(receipt&&'origin' in access)void seedPaymentReceipt(access as Access,result.payment,{...receipt,requestId:receipt.requestId??requestId});
 const changed:string[]=[],at=Date.now();
 for(const [domain,patch] of [['records',patchRecords],['collection',patchCollection]] as const){
  try{if(await repo.patchDataset(domain,bundle=>patch(bundle,result,requestId,at))){changed.push(domain);ready(repo,domain)}}catch{/* The confirming check still brings the payment. */}
 }
 return changed;
}
const results=new Map<string,Promise<{changed:string[];result:any}>>();
/** A payment synced from the saved-request queue or posted online: read its server result once and apply it;
 * a receipt this device sent with it is stored for the payment (each caller may add its own). */
export function confirmOwnPayment(access:Access,requestId:string,receipt?:OwnReceipt):Promise<string[]>{
 const key=(access.offline?.scopeName??'')+':'+requestId;let task=results.get(key);
 if(!task){
  const created=(async()=>{
   if(!access.offline||access.offlineOnly||!navigator.onLine)return {changed:[],result:null};
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await fetch(access.origin+'/api/payment-commands/'+encodeURIComponent(requestId)+'/result',{headers:{Authorization:'Bearer '+await access.token(),'X-MW-Wake-Deadline':String(Date.now()+15000)},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
    if(response.status===401||response.status===403){access.authFailure(response.status);return {changed:[],result:null}}
    if(!response.ok)return {changed:[],result:null};
    const result=await response.json();
    return {changed:await applyOwnPayment(access,requestId,result),result};
   }catch{return {changed:[],result:null}}finally{clearTimeout(timer)}
  })();
  task=created;results.set(key,created);void created.finally(()=>setTimeout(()=>{if(results.get(key)===created)results.delete(key)},1000));
 }
 return task.then(({changed,result})=>{if(receipt&&appliableResult(result))void seedPaymentReceipt(access,result.payment,{...receipt,requestId:receipt.requestId??requestId});return changed});
}
/** The dataset media key under which the coordinator keeps a payment's manual receipt. */
export const ownReceiptKey=(origin:string,paymentId:string)=>'blob:'+new URL('/api/payment-records/'+encodeURIComponent(paymentId)+'/receipt?source=manual',origin).href;
/** The saved time of a seeded receipt is the server's receipt time (its identity, read the way the
 * coordinator reads it), never the device clock: a device clock running ahead must not make this copy look
 * newer than a later replacement receipt. */
export const seededReceiptTime=(receiptAt:unknown)=>{const value=typeof receiptAt==='string'?Date.parse(receiptAt):Number.NaN;return Number.isFinite(value)?value:null};

/** R078 follow-up (owner, 19 October 2026): the owner's own receipt is stored under the payment's media key
 * without downloading it again. The upload response carries the server's sha256 and sizeBytes of the stored
 * object; a local file with the same SHA-256 and size is that object. Otherwise the verified server copy is
 * fetched once (shared by the posted screen, the payment result and the seed) and stored. */
export type OwnReceipt={receiptId:string;file?:Blob|null;descriptor?:{sha256?:unknown;sizeBytes?:unknown}|null;requestId?:string};
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join('');
/** Whether a local file is byte-identical to the server's stored receipt (upload descriptor). */
export async function sameReceipt(file:Blob|null|undefined,descriptor:OwnReceipt['descriptor']):Promise<boolean>{
 if(!(file instanceof Blob)||!descriptor||typeof descriptor.sha256!=='string'||!/^[a-f0-9]{64}$/.test(descriptor.sha256)||descriptor.sizeBytes!==file.size||!['image/png','image/jpeg'].includes(file.type))return false;
 try{return hex(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))===descriptor.sha256}catch{return false}
}
const verified=new Map<string,Promise<Blob|null>>();
/** The verified bytes of an own receipt: the local file when it matches the upload descriptor, else one
 * download of the server copy. Concurrent and later callers share the answer. */
export function verifiedOwnReceipt(access:Access,requestId:string,receiptId:string,{file,descriptor}:Pick<OwnReceipt,'file'|'descriptor'>={}):Promise<Blob|null>{
 const key=(access.offline?.scopeName??'')+':'+receiptId,current=verified.get(key);if(current)return current;
 const task=(async()=>{
  if(await sameReceipt(file,descriptor))return file as Blob;
  if(access.offlineOnly||!navigator.onLine)return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(access.origin+'/api/payment-commands/'+encodeURIComponent(requestId)+'/receipts/'+encodeURIComponent(receiptId),{headers:{Authorization:'Bearer '+await access.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.status===401||response.status===403){access.authFailure(response.status);return null}
   if(!response.ok||!['image/png','image/jpeg'].includes(response.headers.get('content-type')??''))return null;
   return await response.blob();
  }catch{return null}finally{clearTimeout(timer)}
 })();
 // A failure is shared for 30 s (the posted screen, the result and the seed ask together), then may be retried.
 verified.set(key,task);void task.then(blob=>{if(!blob)setTimeout(()=>{if(verified.get(key)===task)verified.delete(key)},30000);while(verified.size>16)verified.delete(verified.keys().next().value!)});
 return task;
}
const receiptMatches=(reference:unknown,receiptId:string)=>typeof reference==='string'&&/^[0-9a-f-]{36}$/.test(receiptId)&&new RegExp('/'+receiptId.replace(/-/g,'')+'\\.(png|jpg)$').test(reference);
/** Seeds only a Posted payment whose receiptReference is this upload and which has a receiptAt. */
export function seedPaymentReceipt(access:Access,payment:any,receipt:OwnReceipt&{requestId:string}):Promise<'seeded'|'fetched'|'stored'|'skipped'>{
 if(payment?.status!=='Posted'||typeof payment.id!=='string'||!receiptMatches(payment.receiptReference,receipt.receiptId)||seededReceiptTime(payment.receiptAt)===null)return Promise.resolve('skipped');
 return seedOwnReceipt(access,payment.id,payment.receiptAt,receipt);
}
const seeding=new Map<string,Promise<'seeded'|'fetched'|'stored'|'skipped'>>();
/** Stores the payment's receipt under its media key with savedAt = receiptAt (the coordinator's freshness). */
export function seedOwnReceipt(access:Access,paymentId:string,receiptAt:unknown,{file,descriptor,requestId,receiptId}:OwnReceipt):Promise<'seeded'|'fetched'|'stored'|'skipped'>{
 const repo=access.offline,savedAt=seededReceiptTime(receiptAt);if(!repo||savedAt===null)return Promise.resolve('skipped');
 const key=ownReceiptKey(access.origin,paymentId),current=seeding.get(key);if(current)return current;
 const task=(async()=>{
  try{
   const stored=await repo.readDatasetMedia(key).catch(()=>null);if(stored?.data instanceof Blob&&stored.savedAt>=savedAt)return 'stored' as const;
   const local=await sameReceipt(file,descriptor);
   const blob=local?file as Blob:requestId?await verifiedOwnReceipt(access,requestId,receiptId,{file,descriptor}):null;if(!blob)return 'skipped' as const;
   const revision=await repo.readRevision();if(revision===null||!await repo.saveDatasetMedia(key,blob,revision,savedAt))return 'skipped' as const;
   return local?'seeded' as const:'fetched' as const;
  }catch{return 'skipped' as const}
 })();
 seeding.set(key,task);void task.finally(()=>{if(seeding.get(key)===task)seeding.delete(key)});
 return task;
}
/** A correction or a loan close with a receipt: its result names the payment; its record gives the receipt. */
export async function seedOperationReceipt(access:Access,requestId:string,paymentId:unknown,receipt:OwnReceipt):Promise<'seeded'|'fetched'|'stored'|'skipped'>{
 if(typeof paymentId!=='string'||!access.offline||access.offlineOnly||!navigator.onLine)return 'skipped';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(access.origin+'/api/payment-records/'+encodeURIComponent(paymentId),{headers:{Authorization:'Bearer '+await access.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
  if(response.status===401||response.status===403){access.authFailure(response.status);return 'skipped'}
  if(!response.ok)return 'skipped';
  const item=(await response.json())?.item;
  return await seedPaymentReceipt(access,item,{...receipt,requestId});
 }catch{return 'skipped'}finally{clearTimeout(timer)}
}
