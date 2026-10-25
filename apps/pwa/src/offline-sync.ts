import {commandOriginAllowed} from './environment';
import type {CommandAccess} from './SelectedCharges';
import type {PendingSync} from './owner-offline';
import {confirmOwnPayment,seedOperationReceipt,type OwnReceipt} from './own-write-apply';
/** The server's descriptor of each receipt this session uploaded (sha256, sizeBytes), by request. */
const uploaded=new Map<string,OwnReceipt['descriptor']>();

export type SavedSyncResult={kind:'queued'|'synced'|'blocked';data?:any;status?:number;code?:string};
/** Busy (409 command_busy): nothing applied, same request id retried automatically. Distinct from outcome unknown and from a rejection. */
export const isBusyOutcome=(result:{kind?:string;code?:string;data?:any}|null|undefined)=>!!result&&result.kind!=='synced'&&result.kind!=='blocked'&&(result.code==='command_busy'||result.data?.code==='command_busy');
export const busyMessage=(thai:boolean)=>thai?'ระบบกำลังยุ่ง — ยังไม่ได้บันทึก ยังไม่มีการบันทึกรายการ กำลังลองใหม่อัตโนมัติ':'Busy — not saved yet. Nothing was applied. Retrying automatically.';
export type SavedSyncSummary={remaining:number;blocked:number;synced:number;reason?:'offline'|'authorization'|'connection'|'waiting'|'attention'};
/** Stable reason codes are retained for unknown server rejections; never display arbitrary server text. */
export function savedRejectionMessage(result:{code?:string;data?:any},thai:boolean):string{
 const code=result.code??result.data?.originalOutcome?.code??result.data?.code??'request_rejected';
 const messages:Record<string,[string,string]>={
  dependency_conflict:['Related records still depend on this record.','ยังมีรายการอื่นอ้างอิงข้อมูลนี้'],
  record_requires_reconciliation:['Financial records require reconciliation.','ต้องกระทบยอดข้อมูลทางการเงิน'],
  payment_requires_reconciliation:['Payment balances require reconciliation.','ต้องกระทบยอดการรับชำระ'],
  source_conflict:['The record changed since it was opened.','ข้อมูลเปลี่ยนหลังจากเปิดรายการ'],
  source_changed:['The source data changed.','ข้อมูลต้นทางเปลี่ยนแล้ว'],
  record_conflict:['The record conflicts with current data.','รายการขัดแย้งกับข้อมูลปัจจุบัน'],
  command_conflict:['This request reference is already used for different details.','รหัสคำขอนี้ถูกใช้กับรายละเอียดอื่นแล้ว'],
  not_found:['The record no longer exists.','ไม่พบรายการนี้แล้ว'],
  invalid_reference:['A related record is missing or invalid.','รายการอ้างอิงหายไปหรือไม่ถูกต้อง'],
  invalid_request:['The submitted details are invalid.','รายละเอียดที่ส่งไม่ถูกต้อง'],
  borrower_name_exists:['A borrower with this name already exists.','มีผู้กู้ชื่อนี้แล้ว'],
  borrower_name_required:['Add the borrower name before creating a loan.','กรุณาใส่ชื่อผู้กู้ก่อนสร้างสินเชื่อ'],
  account_unavailable:['The selected account is unavailable.','บัญชีที่เลือกไม่สามารถใช้งานได้'],
  selection_changed:['The selected charges changed.','ยอดเรียกเก็บที่เลือกเปลี่ยนแล้ว'],
  plan_changed:['The payment allocation changed.','การจัดสรรยอดรับชำระเปลี่ยนแล้ว'],
  business_date_changed:['The business date changed.','วันที่ทำรายการเปลี่ยนแล้ว'],
  receipt_conflict:['The receipt conflicts with the saved request.','หลักฐานขัดแย้งกับคำขอที่บันทึก'],
  receipt_unsupported:['The receipt format is not supported.','ไม่รองรับรูปแบบหลักฐานนี้'],
  body_too_large:['The submitted data is too large.','ข้อมูลที่ส่งมีขนาดใหญ่เกินไป'],
  unsupported_saved_request:['The saved request format is invalid or unsupported.','รูปแบบคำขอที่บันทึกไม่ถูกต้องหรือไม่รองรับ'],
  saved_receipt_invalid:['The saved receipt is invalid.','หลักฐานที่บันทึกไม่ถูกต้อง'],
  saved_note_invalid:['The saved note change is invalid.','การแก้ไขหมายเหตุที่บันทึกไม่ถูกต้อง'],
  previous_note_not_applied:['The preceding note change was not applied.','การแก้ไขหมายเหตุก่อนหน้าไม่สำเร็จ'],
  current_note_unavailable:['The current note record no longer exists.','ไม่พบข้อมูลหมายเหตุปัจจุบันแล้ว'],
 };
 const reason=messages[code]?.[thai?1:0]??(thai?'คำขอนี้ไม่สามารถดำเนินการได้':'This request could not be applied.');
 const reference=typeof code==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(code)?' ('+code+')':'';
 return (thai?'ไม่สำเร็จ: ':'Could not apply: ')+reason+reference;
}
const inFlight=new Map<string,Promise<SavedSyncResult>>();
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const outcome=(scopeName:string,requestId:string,result:SavedSyncResult)=>{
 const detail={requestId,...result};window.dispatchEvent(new CustomEvent('mw-offline-sync-outcome',{detail}));
 if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('mw-credit-sync:'+scopeName);channel.postMessage(detail);channel.close();}
};
function allowedOrigin(access:CommandAccess){
 const repository=access.offline;if(!repository)return false;
 if(repository.environment==='synthetic'){try{return new URL(access.origin||location.origin).origin===location.origin}catch{return false}}
 return commandOriginAllowed(access.origin,repository.environment);
}

/** Every saved request is reconciled first. A transport error never authorizes another payload. */
export function syncSavedRequest(access:CommandAccess,requestId:string):Promise<SavedSyncResult>{
 const key=(access.offline?.scopeName??'missing')+':'+access.origin+':'+requestId;
 const current=inFlight.get(key);if(current)return current;
 // A browser lock disappears with its tab. Its next holder can recover that tab's
 // durable claim immediately; browsers without locks retain the timed IDB lease.
 const task=(async():Promise<SavedSyncResult>=>{
  if(typeof navigator.locks!=='undefined'&&access.offline)return await navigator.locks.request('mw-credit-request:'+access.offline.scopeName+':'+requestId,{ifAvailable:true},async lock=>lock?await syncOne(access,requestId,true):{kind:'queued'} as SavedSyncResult);
  return syncOne(access,requestId);
 })().catch(()=>({kind:'queued'} as SavedSyncResult));
 inFlight.set(key,task);
 void task.then(result=>{const clear=()=>{if(inFlight.get(key)===task)inFlight.delete(key)};if(result.kind==='queued')clear();else setTimeout(clear,1000)});
 return task;
}
async function syncOne(access:CommandAccess,requestId:string,exclusive=false):Promise<SavedSyncResult>{
 const repository=access.offline;
 if(!repository||!navigator.onLine||!allowedOrigin(access)||!await repository.syncAuthorized())return {kind:'queued'};
 const owner=crypto.randomUUID(),row=await repository.claimPending(requestId,owner,exclusive);
 if(!row){const existing=await repository.pending(requestId);return existing?.sync?.state==='blocked'?{kind:'blocked',data:existing.sync.outcome,code:existing.sync.code}:{kind:'queued'}}
 let attempted=row.sync?.attempted??true;
 const settle=async(result:SavedSyncResult,code?:string)=>{
  if(code)result={...result,code};
  const sync:PendingSync|null=result.kind==='synced'?null:{state:result.kind==='blocked'?'blocked':'queued',attempted,...(code?{code}:{}),...(result.data?{outcome:result.data}:{})};
  const preference=row.value?.command;
  if(result.kind==='synced'&&preference?.operation==='preference.update'&&['English','ไทย'].includes(preference.inputs?.language))await repository.saveSnapshot('preference-language',{charges:[],language:preference.inputs.language});
  await repository.settlePending(requestId,owner,sync);
  if(result.kind!=='queued')outcome(repository.scopeName,requestId,result);
  // R078 item 6 (UX-PAY-03): a payment the server posted is applied to the offline bundles at once; the
  // confirming check (mw-read-invalidated from settlePending) then replaces it with the server's rows.
  const command=row.value?.command??row.value;
  // R078 follow-up: the receipt sent with it is stored for the payment (verified locally, or downloaded once).
  const image=row.value?.receipt,ownReceipt:OwnReceipt|undefined=image&&typeof image.id==='string'&&image.image instanceof Blob?{receiptId:image.id,file:image.image,descriptor:uploaded.get(requestId)??null}:undefined;uploaded.delete(requestId);
  if(result.kind==='synced'&&Number.isInteger(command?.schemaVersion)&&[3,4,5,6,7,8].includes(command.schemaVersion)&&result.data?.originalOutcome?.status==='posted')void confirmOwnPayment(access,requestId,ownReceipt);
  else if(result.kind==='synced'&&ownReceipt&&['payment.correct','loan.close'].includes(command?.operation)&&result.data?.originalOutcome?.status==='applied')void seedOperationReceipt(access,requestId,result.data.originalOutcome.result?.paymentId,ownReceipt);
  return result;
 };
 const request=async(path:string,init:RequestInit={})=>{
  if(!navigator.onLine||!await repository.syncAuthorized())throw Error('Sync paused');
  const controller=new AbortController(),deadline=Date.now()+15000,timer=setTimeout(()=>controller.abort(),15000);
  const pause=()=>controller.abort();window.addEventListener('offline',pause);window.addEventListener('pagehide',pause);
  try{
   const token=await access.token();
   if(controller.signal.aborted||!navigator.onLine||!await repository.syncAuthorized())throw Error('Sync paused');
   const response=await fetch(access.origin+path,{...init,signal:controller.signal,headers:{Authorization:'Bearer '+token,'X-MW-Wake-Deadline':String(deadline),...init.headers},cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('Authentication required')}
   const data=await response.json();return {response,data};
  }finally{clearTimeout(timer);window.removeEventListener('offline',pause);window.removeEventListener('pagehide',pause)}
 };
 const classify=async(response:Response,data:any):Promise<SavedSyncResult|null>=>{
  if(data?.kind==='recorded'){
   if(['applied','posted'].includes(data.originalOutcome?.status))return settle({kind:'synced',data,status:response.status});
   if(data.originalOutcome?.status==='rejected')return settle({kind:'blocked',data,status:response.status},data.originalOutcome.code??'request_rejected');
  }
  // DB-LOCK-01 / W4-UX-01: a busy refusal applied nothing; the row stays queued under the same request id
  // and the coordinator's existing backoff (retryDelays) resends it after a fresh status read.
  if(response.status===409&&data?.code==='command_busy')return settle({kind:'queued',data,status:response.status},'command_busy');
  if([400,409,413,415,422].includes(response.status)||data?.kind==='conflict')return settle({kind:'blocked',data,status:response.status},data?.code??'request_requires_review');
  return null;
 };
 try{
  const value=row.value;let command=value?.command??value;
  if(!uuid.test(requestId)||command?.requestId!==requestId)return settle({kind:'blocked'},'unsupported_saved_request');
  const payment=Number.isInteger(command.schemaVersion)&&[3,4,5,6,7,8].includes(command.schemaVersion)&&typeof command.borrowerId==='string';
  const operation=typeof command.operation==='string'&&typeof command.targetId==='string'&&command.inputs&&typeof command.inputs==='object';
  if(!payment&&!operation)return settle({kind:'blocked'},'unsupported_saved_request');
  const path=payment?'/api/payment-commands':'/api/operations';
  const status=await request(path+'/'+requestId);
  const known=await classify(status.response,status.data);if(known)return known;
  if(!status.response.ok||status.data?.kind!=='unresolved')return settle({kind:'queued'},'status_unavailable');
  if(value.notePredecessor){
   const predecessor=value.notePredecessor;
   const fields=['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'];
   if(Object.hasOwn(predecessor.inputs??{},'aiCollectionEnabled')||Object.hasOwn(command.inputs,'aiCollectionEnabled'))fields.push('aiCollectionEnabled');
   if(command.operation!=='borrower.update'||attempted||!uuid.test(predecessor.requestId)||!predecessor.inputs||fields.some(key=>!Object.hasOwn(predecessor.inputs,key)||!Object.hasOwn(command.inputs,key))||fields.some(key=>key!=='note'&&command.inputs[key]!==predecessor.inputs[key]))return settle({kind:'blocked'},'saved_note_invalid');
   const previous=await request('/api/operations/'+predecessor.requestId);
   if(previous.data?.kind!=='recorded')return settle({kind:'queued'},'previous_note_pending');
   if(previous.data.originalOutcome?.status!=='applied')return settle({kind:'blocked'},'previous_note_not_applied');
   const current=await request('/api/borrower-records/'+encodeURIComponent(command.targetId));
   if(!current.response.ok)return settle({kind:current.response.status===404?'blocked':'queued'},'current_note_unavailable');
   const record=current.data?.item;
   if(!record||!/^[a-f0-9]{64}$/.test(record.version??'')||fields.some(key=>record[key]!==predecessor.inputs[key]))return settle({kind:'blocked'},'source_conflict');
   command={...command,expectedVersion:record.version};
   if(!await repository.bindPendingNote(requestId,owner,command))return settle({kind:'queued'},'note_binding_unavailable');
  }
  const receipt=value.receipt;
  if(receipt!==undefined&&(!(receipt.image instanceof Blob)||receipt.id!==command.receiptId||!uuid.test(receipt.id)||!['image/png','image/jpeg'].includes(receipt.image.type)||receipt.image.size<=0||receipt.image.size>5242880||typeof(receipt.borrowerId??command.borrowerId)!=='string'))return settle({kind:'blocked'},'saved_receipt_invalid');
  if(!await repository.markPendingDispatched(requestId,owner))return {kind:'queued'};
  attempted=true;
  if(receipt){
   const upload=await request('/api/payment-commands/'+requestId+'/receipts/'+receipt.id,{method:'POST',headers:{'Content-Type':receipt.image.type,'X-Borrower-ID':receipt.borrowerId??command.borrowerId},body:receipt.image});
   if(!upload.response.ok){const rejected=await classify(upload.response,upload.data);return rejected??settle({kind:'queued'},'receipt_unavailable')}
   uploaded.set(requestId,upload.data?.receipt??null);
  }
  const result=await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
  return await classify(result.response,result.data)??settle({kind:'queued'},result.data?.code==='command_unavailable'?'command_unavailable':'outcome_unknown');
 }catch{
  return settle({kind:'queued'},'connection_unavailable').catch(()=>({kind:'queued'}));
 }
}

export async function syncSavedRequests(access:CommandAccess):Promise<SavedSyncSummary>{
 const repository=access.offline;
 const unavailable=(reason:SavedSyncSummary['reason']):SavedSyncSummary=>({remaining:0,blocked:0,synced:0,reason});
 if(!navigator.onLine)return unavailable('offline');
 if(!repository||!allowedOrigin(access))return unavailable('authorization');
 try{await access.prepareSync?.()}catch{return unavailable(navigator.onLine?'connection':'offline')}
 if(!await repository.syncAuthorized())return unavailable('authorization');
 await repository.migrateSavedNotes();
 const rows=(await repository.list('pending')).sort((a,b)=>a.savedAt-b.savedAt||a.key.localeCompare(b.key));
 let synced=0;
 for(const row of rows){if(!navigator.onLine||!await repository.syncAuthorized())break;if(row.sync?.state==='blocked')continue;const result=await syncSavedRequest(access,row.key.slice('pending:'.length));if(result.kind==='synced')synced++;}
 if(!await repository.syncAuthorized())return {...unavailable('authorization'),synced};
 const remaining=await repository.list('pending'),blocked=remaining.filter(row=>row.sync?.state==='blocked').length;
 return {remaining:remaining.length,blocked,synced,...(!navigator.onLine?{reason:'offline' as const}:remaining.length?{reason:remaining.length===blocked?'attention' as const:'waiting' as const}:{})};
}

/** One app-scoped coordinator; IndexedDB leases also serialize separate tabs. */
export function startSavedRequestSync(access:CommandAccess){
 let active=true,running=false,again=false,retries=0,timer:ReturnType<typeof setTimeout>|null=null;
 const retryDelays=[1000,2000,5000,10000,30000];
 const channel=typeof BroadcastChannel!=='undefined'&&access.offline?new BroadcastChannel('mw-credit-sync:'+access.offline.scopeName):null;
 if(channel)channel.onmessage=event=>{if(active){window.dispatchEvent(new Event('mw-offline-saved'));window.dispatchEvent(new CustomEvent('mw-offline-sync-outcome',{detail:event.data}));}};
 const run=async()=>{
  if(!active)return;if(running){again=true;return;}if(timer)clearTimeout(timer);timer=null;
  if(!navigator.onLine)return;
  running=true;
  try{const result=await syncSavedRequests(access);if(result.synced)retries=0}catch{/* Durable requests remain for reconnect. */}
  // The catch above swallows every failure, so this always runs exactly as a finally block would.
  running=false;if(!active)return;
  if(again){again=false;timer=setTimeout(()=>void run(),0)}
  // Unreadable storage (a dropped connection reopens on the next call) keeps the back-off running.
  else if(navigator.onLine&&access.offline){const rows=await access.offline.list('pending').catch(()=>null);if(active&&(rows===null||rows.some(row=>row.sync?.state!=='blocked')))timer=setTimeout(()=>void run(),retryDelays[Math.min(retries++,retryDelays.length-1)])}
 };
 const wake=()=>{retries=0;void run()},visible=()=>{if(document.visibilityState==='visible')wake()};window.addEventListener('online',wake);window.addEventListener('focus',wake);window.addEventListener('pageshow',wake);document.addEventListener('visibilitychange',visible);window.addEventListener('mw-offline-queued',wake);void run();
 return()=>{active=false;if(timer)clearTimeout(timer);channel?.close();window.removeEventListener('online',wake);window.removeEventListener('focus',wake);window.removeEventListener('pageshow',wake);document.removeEventListener('visibilitychange',visible);window.removeEventListener('mw-offline-queued',wake)};
}
