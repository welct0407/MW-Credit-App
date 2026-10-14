import {commandOriginAllowed} from './environment';
import type {CommandAccess} from './SelectedCharges';
import type {PendingSync} from './owner-offline';

export type SavedSyncResult={kind:'queued'|'synced'|'blocked';data?:any;status?:number};
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
 const task=syncOne(access,requestId).catch(()=>({kind:'queued'} as SavedSyncResult));
 inFlight.set(key,task);
 void task.then(result=>{const clear=()=>{if(inFlight.get(key)===task)inFlight.delete(key)};if(result.kind==='queued')clear();else setTimeout(clear,1000)});
 return task;
}
async function syncOne(access:CommandAccess,requestId:string):Promise<SavedSyncResult>{
 const repository=access.offline;
 if(!repository||!navigator.onLine||!allowedOrigin(access)||!await repository.syncAuthorized())return {kind:'queued'};
 const owner=crypto.randomUUID(),row=await repository.claimPending(requestId,owner);
 if(!row){const existing=await repository.pending(requestId);return existing?.sync?.state==='blocked'?{kind:'blocked',data:existing.sync.outcome}:{kind:'queued'}}
 let attempted=row.sync?.attempted??true;
 const settle=async(result:SavedSyncResult,code?:string)=>{
  const sync:PendingSync|null=result.kind==='synced'?null:{state:result.kind==='blocked'?'blocked':'queued',attempted,...(code?{code}:{}),...(result.data?{outcome:result.data}:{})};
  await repository.settlePending(requestId,owner,sync);
  if(result.kind!=='queued')outcome(repository.scopeName,requestId,result);
  return result;
 };
 const request=async(path:string,init:RequestInit={})=>{
  if(!navigator.onLine||!await repository.syncAuthorized())throw Error('Sync paused');
  const controller=new AbortController(),deadline=Date.now()+15000,timer=setTimeout(()=>controller.abort(),15000);
  try{
   const token=await access.token();
   if(controller.signal.aborted||!navigator.onLine||!await repository.syncAuthorized())throw Error('Sync paused');
   const response=await fetch(access.origin+path,{...init,signal:controller.signal,headers:{Authorization:'Bearer '+token,'X-MW-Wake-Deadline':String(deadline),...init.headers},cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('Authentication required')}
   const data=await response.json();return {response,data};
  }finally{clearTimeout(timer)}
 };
 const classify=async(response:Response,data:any):Promise<SavedSyncResult|null>=>{
  if(data?.kind==='recorded'){
   if(['applied','posted'].includes(data.originalOutcome?.status))return settle({kind:'synced',data,status:response.status});
   if(data.originalOutcome?.status==='rejected')return settle({kind:'blocked',data,status:response.status},data.originalOutcome.code??'request_rejected');
  }
  if([400,409,413,415,422].includes(response.status)||data?.kind==='conflict')return settle({kind:'blocked',data,status:response.status},data?.code??'request_requires_review');
  return null;
 };
 try{
  const value=row.value;let command=value?.command??value;
  if(!uuid.test(requestId)||command?.requestId!==requestId)return settle({kind:'blocked'},'unsupported_saved_request');
  const payment=Number.isInteger(command.schemaVersion)&&[3,4,5,6].includes(command.schemaVersion)&&typeof command.borrowerId==='string';
  const operation=typeof command.operation==='string'&&typeof command.targetId==='string'&&command.inputs&&typeof command.inputs==='object';
  if(!payment&&!operation)return settle({kind:'blocked'},'unsupported_saved_request');
  const path=payment?'/api/payment-commands':'/api/operations';
  const status=await request(path+'/'+requestId);
  const known=await classify(status.response,status.data);if(known)return known;
  if(!status.response.ok||status.data?.kind!=='unresolved')return settle({kind:'queued'},'status_unavailable');
  if(value.notePredecessor){
   const predecessor=value.notePredecessor;
   const fields=['name','description','communicationName','instagramUsername','city','workingLocation','address','hidden','referrerId','preferredReceivingAccountId','note'];
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
  }
  const result=await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
  return await classify(result.response,result.data)??settle({kind:'queued'},'outcome_unknown');
 }catch{
  return settle({kind:'queued'},'connection_unavailable').catch(()=>({kind:'queued'}));
 }
}

export async function syncSavedRequests(access:CommandAccess){
 const repository=access.offline;
 if(!repository||!navigator.onLine||!await repository.syncAuthorized())return;
 await repository.migrateSavedNotes();
 const rows=(await repository.list('pending')).sort((a,b)=>a.savedAt-b.savedAt||a.key.localeCompare(b.key));
 for(const row of rows){if(!navigator.onLine||!await repository.syncAuthorized())break;if(row.sync?.state==='blocked')continue;await syncSavedRequest(access,row.key.slice('pending:'.length));}
}

/** One app-scoped coordinator; IndexedDB leases also serialize separate tabs. */
export function startSavedRequestSync(access:CommandAccess){
 if(access.offline?.environment==='prod')return()=>{};
 let active=true,running=false,again=false,timer:ReturnType<typeof setTimeout>|null=null;
 const channel=typeof BroadcastChannel!=='undefined'&&access.offline?new BroadcastChannel('mw-credit-sync:'+access.offline.scopeName):null;
 if(channel)channel.onmessage=event=>{if(active){window.dispatchEvent(new Event('mw-offline-saved'));window.dispatchEvent(new CustomEvent('mw-offline-sync-outcome',{detail:event.data}));}};
 const run=async()=>{
  if(!active)return;if(running){again=true;return;}if(timer)clearTimeout(timer);timer=null;
  if(!navigator.onLine)return;
  running=true;
  try{await syncSavedRequests(access)}catch{/* Durable requests remain for reconnect. */}
  finally{
   running=false;if(!active)return;
   if(again){again=false;timer=setTimeout(()=>void run(),1000)}
   else if(navigator.onLine&&access.offline){const rows=await access.offline.list('pending').catch(()=>[]);if(active&&rows.some(row=>row.sync?.state!=='blocked'))timer=setTimeout(()=>void run(),30000)}
  }
 };
 const wake=()=>void run();window.addEventListener('online',wake);window.addEventListener('focus',wake);window.addEventListener('mw-offline-queued',wake);void run();
 return()=>{active=false;if(timer)clearTimeout(timer);channel?.close();window.removeEventListener('online',wake);window.removeEventListener('focus',wake);window.removeEventListener('mw-offline-queued',wake)};
}
