import {beginRequest} from './request-activity';
import {CompactPager,ReceiveIcon} from './CompactPager';
import {PaymentResult} from './PaymentResult';
import type {OwnerOfflineRepository} from './owner-offline';
import React,{useEffect,useRef,useState} from 'react';
type Draft={nextCursor?:string|null;asOf?:string;businessDate:string;borrower:{id:string;displayName:string};charges:{id:string;chargeDate:string;loanDisplayKey:string;amountRemaining:string;principalRemaining:string;interestRemaining:string}[];accounts:{id:string;label:string}[]};
type Allocation={chargeId:string;principal:string;interest:string;expectedPrincipalRemaining:string;expectedInterestRemaining:string;chargeDate:string};
type Command={schemaVersion:3|4|5|6;requestId:string;borrowerId:string;selectedChargeIds?:string[];allocations?:Allocation[];cashAccountId:string;paymentDate:string;amountReceived:string;paymentMethod:'Bank Transfer'|'Cash'|'Net-off at Disbursement';allocationMethod?:'Selected Charges'|'Single Full'|'Receive All';notes:string|null;receiptId:string|null};
type Outcome={status:'posted'|'rejected';paymentId:string|null;code:string|null;recordedAt:string};
export type CommandAccess={origin:string;fixtureBorrowerId:string;ownerTesting?:boolean;offline?:OwnerOfflineRepository;offlineOnly?:boolean;onPosted?:(requestId:string)=>void;token:()=>Promise<string>;authFailure:(status:number)=>void};
const pendingKey='mw-credit.pending-command';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function SelectedCharges({access,borrowerId,thai,onBack,onPosted}:{access:CommandAccess;borrowerId:string;thai:boolean;onBack:()=>void;onPosted?:(requestId:string)=>void}) {
 const t=(en:string,th:string)=>thai?th:en;
 const [draft,setDraft]=useState<Draft|null>(null),[selected,setSelected]=useState<string[]>([]),[account,setAccount]=useState(''),[notes,setNotes]=useState('');
 const [state,setState]=useState<'loading'|'edit'|'review'|'sending'|'unknown'|'posted'|'rejected'|'conflict'|'error'>('loading');
 const [error,setError]=useState(''),[receipt,setReceipt]=useState<string|null>(null),[preview,setPreview]=useState<string|null>(null),[uploading,setUploading]=useState(false),[uploadFailed,setUploadFailed]=useState(false);
 const [checking,setChecking]=useState(false),[receiptReadError,setReceiptReadError]=useState(''),[verifiedPreview,setVerifiedPreview]=useState<string|null>(null);
 const confirming=useRef(false),autosaveSuspended=useRef(false),legacyDraft=useRef(false);
 const checkOperation=useRef(0),checkingRef=useRef(false);
 const [outcome,setOutcome]=useState<Outcome|null>(null),[checked,setChecked]=useState(false),[storageBlocked,setStorageBlocked]=useState(false);
 const command=useRef<Command|null>(null),requestId=useRef<string>(crypto.randomUUID()),generation=useRef(0),uploadGeneration=useRef(0);
 const [selectionRows,setSelectionRows]=useState<Draft['charges']>([]),[savedAt,setSavedAt]=useState<number|null>(null),[localImage,setLocalImage]=useState<Blob|null>(null);
 const [allMode,setAllMode]=useState(false);
 const [changedBalances,setChangedBalances]=useState<{operation:number;generation:number;charges:Draft['charges'];businessDate:string}|null>(null),[unavailableLines,setUnavailableLines]=useState<string[]>([]);
 const [received,setReceived]=useState(''),[allocations,setAllocations]=useState<Allocation[]>([]);
 const [paymentMethod,setPaymentMethod]=useState<Command['paymentMethod']>('Bank Transfer'),[reviewing,setReviewing]=useState(false);
 const reviewOperation=useRef(0),autosaveChain=useRef(Promise.resolve()),autosaveTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pageCursors=useRef<(string|undefined)[]>([undefined]);const [pageIndex,setPageIndex]=useState(0),[paging,setPaging]=useState(false);
 const [scope,setScope]=useState<'due'|'future'|'all'>('all');
 const allocationMethod=allMode?'Receive All':selected.length===1?'Single Full':'Selected Charges';
 const selectedRows=selectionRows;
 const integer=(value:string)=>/^(0|[1-9][0-9]{0,16})$/.test(value);
 const allocated=allocations.reduce((sum,row)=>sum+(integer(row.principal)?BigInt(row.principal):0n)+(integer(row.interest)?BigInt(row.interest):0n),0n);
 const total=integer(received)?received:'0';
 const validPlan=integer(received)&&BigInt(total)>0n&&BigInt(total)<=92233720368547758n&&allocated===BigInt(total)&&allocations.length>0&&allocations.length<=10000&&allocations.every(row=>!unavailableLines.includes(row.chargeId)&&integer(row.principal)&&integer(row.interest)&&BigInt(row.principal)+BigInt(row.interest)>0n&&BigInt(row.principal)<=BigInt(row.expectedPrincipalRemaining)&&BigInt(row.interest)<=BigInt(row.expectedInterestRemaining));
 const money=(value:string)=>typeof value==='string'&&/^-?[0-9]+$/.test(value)?'฿'+BigInt(value).toLocaleString(thai?'th-TH':'en-US'):t('Unavailable','ไม่มีข้อมูล');
 async function call(path:string,init:RequestInit={}) {
  if(access.offlineOnly||!navigator.onLine)throw Error('Offline');
  const done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
   const token=await access.token();
   const response=await fetch(access.origin+path,{...init,signal:controller.signal,headers:{...init.headers,Authorization:'Bearer '+token}});
   const data=await response.json();
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('access_denied');}
   return {response,data};
  } finally {clearTimeout(timer);done();}
 }
 function retainPending(){try{sessionStorage.setItem(pendingKey,requestId.current)}catch{setStorageBlocked(true)}}
 function clearPending(){try{sessionStorage.removeItem(pendingKey)}catch{}void access.offline?.remove('pending',requestId.current).catch(()=>{})}
 useEffect(()=>{
  const current=++generation.current;
  void(async()=>{
   try{
    const pending=(await access.offline?.list('pending'))?.filter(row=>(row.value.domain===undefined||row.value.domain==='payment')&&row.value.recoveryKind!=='action');
    let prior:string|null=null;try{prior=sessionStorage.getItem(pendingKey)}catch{setStorageBlocked(true)}
    const retained=pending?.find(row=>row.value.borrowerId===borrowerId)||pending?.[0];
    if(current!==generation.current)return;
    if(retained){requestId.current=retained.value.requestId;command.current=retained.value;setState('unknown');return;}
    if(prior&&uuid.test(prior)){requestId.current=prior;setState('unknown');return;}
    const saved=await access.offline?.draft<any>(borrowerId);
    let data:Draft;
    if(access.offlineOnly||!navigator.onLine){
     if(!await access.offline?.authorized())throw Error();
     const snapshot=await access.offline!.snapshot<Draft>(borrowerId);if(!snapshot)throw Error();data=snapshot.value;setSavedAt(snapshot.savedAt);
    }else{
     const response=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all');if(!response.response.ok)throw Error();data=response.data;
     if(current!==generation.current)return;
     try{await access.offline?.saveSnapshot(borrowerId,data)}catch{setStorageBlocked(true)}
    }
    if(current!==generation.current)return;setDraft(data);setAccount(saved?.value.account??data.accounts[0]?.id??'');
    if(saved){legacyDraft.current=saved.value.formVersion===5||(saved.value.received===undefined&&saved.value.allocations===undefined);setReceived(saved.value.received??'');setAllocations(saved.value.allocations??[]);setNotes(saved.value.notes);setPaymentMethod(saved.value.paymentMethod??'Bank Transfer');setSelectionRows(saved.value.selectionRows);setSelected(saved.value.selectionRows.map((row:any)=>row.id));setLocalImage(saved.value.image??null);setAllMode(saved.value.allMode===true);setScope('all');if(saved.value.image)setPreview(URL.createObjectURL(saved.value.image));}
    if(saved&&legacyDraft.current&&(saved.value.selectionRows?.length??0)>0){
     setError(t('Saved selection needs conversion review with current component balances.','รายการที่บันทึกไว้ต้องตรวจสอบการแปลงด้วยยอดเงินต้นและดอกเบี้ยปัจจุบัน'));
     if(!access.offlineOnly&&navigator.onLine){
      const ids=saved.value.selectionRows.map((row:any)=>row.id),method=ids.length===1?'Single Full':'Selected Charges';
      const refreshed=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selectedChargeIds:ids,allocationMethod:method})});
      if(current!==generation.current)return;
      if(refreshed.response.ok&&refreshed.data.charges.every((row:any)=>integer(row.principalRemaining)&&integer(row.interestRemaining))){
       const lines=refreshed.data.charges.map((row:any)=>({chargeId:row.id,principal:row.principalRemaining,interest:row.interestRemaining,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}));
       setAllocations(lines);setSelectionRows(refreshed.data.charges);setReceived(lines.reduce((sum:bigint,row:Allocation)=>sum+BigInt(row.principal)+BigInt(row.interest),0n).toString());legacyDraft.current=false;
      }
     }
    }
    setState('edit');
   }catch{if(current===generation.current){setError(t('Unable to load payment draft.','ไม่สามารถโหลดร่างการรับชำระได้'));setState('error')}}
  })();
  return()=>{generation.current++;uploadGeneration.current++;};
 },[borrowerId]);
 const latestDraft=useRef({formVersion:legacyDraft.current?5:6,notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,paymentMethod,received,allocations,image:localImage});
 latestDraft.current={formVersion:legacyDraft.current?5:6,notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,paymentMethod,received,allocations,image:localImage};
 useEffect(()=>{
  if(state!=='edit'||command.current||autosaveSuspended.current||!draft||!access.offline)return;
  const current=generation.current;
  autosaveTimer.current=setTimeout(()=>{autosaveChain.current=autosaveChain.current.catch(()=>{}).then(async()=>{if(current!==generation.current||command.current||autosaveSuspended.current)return;await access.offline!.saveDraft(borrowerId,latestDraft.current)}).catch(()=>{if(current===generation.current)setError(t('Draft could not be saved on this device.','บันทึกร่างบนอุปกรณ์นี้ไม่สำเร็จ'))});},400);
  return()=>clearTimeout(autosaveTimer.current);
 },[notes,account,selectionRows,allMode,localImage,paymentMethod,received,allocations,state,draft]);
 const editable=useRef(false);editable.current=state==='edit'||state==='review';
 useEffect(()=>{
  const saveOnDisconnect=()=>{if(editable.current&&access.offline&&!command.current&&!autosaveSuspended.current)void (autosaveChain.current=autosaveChain.current.catch(()=>{}).then(async()=>{if(!command.current&&editable.current&&!autosaveSuspended.current)await access.offline!.saveDraft(borrowerId,latestDraft.current)})).then(()=>window.dispatchEvent(new Event('mw-offline-saved'))).catch(()=>window.dispatchEvent(new Event('mw-offline-save-failed')));};
  const leaving=(event:BeforeUnloadEvent)=>{if(editable.current||command.current&&state==='unknown'){event.preventDefault();event.returnValue='';}};
  window.addEventListener('offline',saveOnDisconnect);window.addEventListener('beforeunload',leaving);
  return()=>{window.removeEventListener('offline',saveOnDisconnect);window.removeEventListener('beforeunload',leaving);};
 },[access.offline,borrowerId,state]);
 async function discardDraft(){
  if(command.current)return;autosaveSuspended.current=true;clearTimeout(autosaveTimer.current);uploadGeneration.current++;setState('loading');
  try{await autosaveChain.current;await access.offline?.remove('draft',borrowerId);setReceived('');setAllocations([]);setUnavailableLines([]);setChangedBalances(null);setSelected([]);setSelectionRows([]);setNotes('');setReceipt(null);setLocalImage(null);setPreview(null);setAllMode(false);setUploading(false);setUploadFailed(false);setError('');}catch{setError(t('The draft could not be cleared.','ล้างร่างไม่สำเร็จ'));}finally{setState('edit')}
 }
 async function refreshSelection(){
  const operation=++reviewOperation.current;
  if(access.offlineOnly||!navigator.onLine)return false;
  if(localImage&&!receipt){setError(t('Upload the saved receipt or explicitly remove it before review.','อัปโหลดหลักฐานที่บันทึกไว้หรือนำออกก่อนตรวจสอบ'));return false;}
  const current=generation.current;
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountReceived:received,allocations})});
   if(current!==generation.current||operation!==reviewOperation.current)return false;
   if(!response.ok||data.businessDate!==draft?.businessDate||!data.accounts?.some((row:any)=>row.id===account)){
    if(data.code==='plan_changed'&&Array.isArray(data.charges))setChangedBalances({operation,generation:current,charges:data.charges,businessDate:data.businessDate});
    setState('edit');setError(t('The allocation plan changed. Refresh balances and review each amount again.','แผนรับชำระเปลี่ยน กรุณารีเฟรชยอดและตรวจสอบแต่ละรายการอีกครั้ง'));return false;
   }return true;
  }catch{if(current!==generation.current||operation!==reviewOperation.current)return false;setState('edit');setError(t('Connect and refresh before reviewing.','เชื่อมต่อและรีเฟรชก่อนตรวจสอบ'));return false;}
 }
 function useCurrentBalances(){
  if(!changedBalances||command.current||changedBalances.operation!==reviewOperation.current||changedBalances.generation!==generation.current)return;
  const current=changedBalances;reviewOperation.current++;
  const unavailable:string[]=[];
  const next=allocations.map(line=>{const row=current.charges.find(row=>row.id===line.chargeId);if(!row||!integer(row.principalRemaining)||!integer(row.interestRemaining)){unavailable.push(line.chargeId);return line;}return {...line,expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate};});
  setAllocations(next);setUnavailableLines(unavailable);setChangedBalances(null);setState('edit');
  setDraft(old=>old?{...old,businessDate:current.businessDate,charges:old.charges.map(row=>current.charges.find(item=>item.id===row.id)??row)}:old);
  setError(t('Current balances adopted. Paid amounts are unchanged; resolve unavailable or over-limit lines, then review again.','ใช้ยอดปัจจุบันแล้ว ยอดจัดสรรไม่เปลี่ยน กรุณาแก้ไขรายการที่ใช้ไม่ได้หรือเกินยอด แล้วตรวจสอบอีกครั้ง'));
 }
 async function autoAssign(){
  if(allocations.some(row=>(integer(row.principal)&&BigInt(row.principal)>0n)||(integer(row.interest)&&BigInt(row.interest)>0n))&&!window.confirm(t('Replace the current allocation plan with Auto-assign?','แทนที่แผนจัดสรรปัจจุบันด้วยการจัดสรรอัตโนมัติหรือไม่')))return;
  if(!integer(received)||BigInt(total)<=0n)return;const current=generation.current,operation=++reviewOperation.current;
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/auto-assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountReceived:received})});if(current!==generation.current||operation!==reviewOperation.current)return;if(!response.ok)throw Error();legacyDraft.current=false;setUnavailableLines([]);setChangedBalances(null);setAllocations(data.allocations);setSelectionRows(data.charges.filter((row:any)=>data.allocations.some((line:Allocation)=>line.chargeId===row.id)));setSelected(data.allocations.map((line:Allocation)=>line.chargeId));setError('');}catch{if(current===generation.current)setError(t('Unable to auto-assign. Refresh and try again.','จัดสรรอัตโนมัติไม่สำเร็จ กรุณารีเฟรชและลองอีกครั้ง'));}
 }
 function editLine(row:Draft['charges'][number],field:'principal'|'interest',value:string){
  if(!integer(row.principalRemaining)||!integer(row.interestRemaining)){setError(t('Refresh current balances online before editing this saved charge.','รีเฟรชยอดปัจจุบันขณะออนไลน์ก่อนแก้ไขรายการที่บันทึกไว้'));return;}
  legacyDraft.current=false;reviewOperation.current++;setError('');
  setAllocations(old=>{const existing=old.find(line=>line.chargeId===row.id)??{chargeId:row.id,principal:'0',interest:'0',expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate};const next={...existing,[field]:value};return [...old.filter(line=>line.chargeId!==row.id),...(next.principal==='0'&&next.interest==='0'?[]:[next])];});
  setSelectionRows(old=>old.some(item=>item.id===row.id)?old:[...old,row]);
 }
 function toggleLine(row:Draft['charges'][number],checked:boolean){
  legacyDraft.current=false;reviewOperation.current++;
  if(!checked){setAllocations(old=>old.filter(line=>line.chargeId!==row.id));return;}
  if(!integer(row.principalRemaining)||!integer(row.interestRemaining))return;
  const available=BigInt(total)-allocated;if(available<=0n)return;
  const interest=available<BigInt(row.interestRemaining)?available:BigInt(row.interestRemaining),rest=available-interest,principal=rest<BigInt(row.principalRemaining)?rest:BigInt(row.principalRemaining);
  setAllocations(old=>[...old.filter(line=>line.chargeId!==row.id),{chargeId:row.id,principal:principal.toString(),interest:interest.toString(),expectedPrincipalRemaining:row.principalRemaining,expectedInterestRemaining:row.interestRemaining,chargeDate:row.chargeDate}]);setSelectionRows(old=>old.some(item=>item.id===row.id)?old:[...old,row]);
 }
 async function chargePage(index:number){
  if(paging)return;
  const cursor=index>pageIndex?draft?.nextCursor:pageCursors.current[index];if(index>pageIndex&&!cursor)return;
  const current=generation.current;setPaging(true);
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope=all'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(current!==generation.current)return;if(!response.ok)throw Error();pageCursors.current[index]=cursor??undefined;setDraft(data);setPageIndex(index)}catch{if(current===generation.current)setError(t('Unable to load the page.','โหลดหน้านี้ไม่ได้'));}finally{if(current===generation.current)setPaging(false)}
 }
 async function review(){if(reviewing)return;setState('review');setReviewing(true);try{await refreshSelection()}finally{setReviewing(false)}}
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 async function upload(file:File|undefined){
  const seq=++uploadGeneration.current,current=generation.current;setUploading(false);setReceipt(null);setPreview(null);setUploadFailed(false);
  setLocalImage(file??null);if(!file)return;
  if(access.offlineOnly||!navigator.onLine){if(['image/png','image/jpeg'].includes(file.type)&&file.size<=5242880){setPreview(URL.createObjectURL(file));return;}setUploadFailed(true);return;}
  if(!navigator.onLine||!['image/png','image/jpeg'].includes(file.type)||!file.size||file.size>5242880){setUploadFailed(true);setError(t('Choose a PNG or JPEG up to 5 MiB while online.','เลือก PNG หรือ JPEG ไม่เกิน 5 MiB ขณะออนไลน์'));return;}
  setUploading(true);const id=crypto.randomUUID();
  try{const {response}=await call('/api/payment-commands/'+requestId.current+'/receipts/'+id,{method:'POST',headers:{'Content-Type':file.type,'X-Borrower-ID':borrowerId},body:file});if(!response.ok)throw Error();if(seq!==uploadGeneration.current||current!==generation.current)return;setReceipt(id);setPreview(URL.createObjectURL(file));setError('');}
  catch{if(seq===uploadGeneration.current&&current===generation.current){setUploadFailed(true);setError(t('Receipt upload failed. Retry or remove the receipt before confirming.','อัปโหลดหลักฐานไม่สำเร็จ ลองอีกครั้งหรือนำหลักฐานออกก่อนยืนยัน'));}}
  finally{if(seq===uploadGeneration.current&&current===generation.current)setUploading(false);}
 }
 function result(data:any){
  if(data.kind==='recorded'){setOutcome(data.originalOutcome);setState(data.originalOutcome.status);clearPending();if(data.originalOutcome.status==='posted')(onPosted??access.onPosted)?.(requestId.current);}
  else if(data.code==='command_conflict'||data.kind==='conflict'){setState('conflict');clearPending();}
  else{setState('unknown');setChecked(data.kind==='unresolved');}
 }
 async function confirm(){if(confirming.current)return;confirming.current=true;setReviewing(true);try{await confirmOnce()}finally{confirming.current=false;setReviewing(false)}}
 async function confirmOnce(){
  if(!navigator.onLine)return;
  if(!command.current && !(await refreshSelection()))return;
  if(!command.current){if(!draft||!validPlan||uploading||uploadFailed)return;command.current={schemaVersion:6,requestId:requestId.current,borrowerId,allocations:allocations.map(row=>({...row})),cashAccountId:account,paymentDate:draft.businessDate,amountReceived:received,paymentMethod,notes:notes===''?null:notes,receiptId:receipt};}
  clearTimeout(autosaveTimer.current);await autosaveChain.current;
  try{if(access.offline){await access.offline.savePending(requestId.current,command.current);await access.offline.remove('draft',borrowerId)}}catch{setStorageBlocked(true);setState('unknown');setChecked(false);retainPending();setError(t('The original command is locked. Storage could not be completed and no payment was sent by this attempt. Keep the reference, check status, and retry only this same command.','คำขอเดิมถูกล็อก บันทึกในอุปกรณ์ไม่สำเร็จและครั้งนี้ยังไม่ได้ส่งรับชำระ เก็บหมายเลขอ้างอิง ตรวจสอบสถานะ แล้วลองเฉพาะคำขอเดิม'));return;}
  checkOperation.current++;setChecking(false);retainPending();setState('sending');setChecked(false);setError('');const current=generation.current;
  try{const {data}=await call('/api/payment-commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command.current)});if(current===generation.current)result(data)}
  catch{if(current===generation.current)setState('unknown');}
 }
 async function check(){
  if(checkingRef.current)return;checkingRef.current=true;
  const current=generation.current,operation=++checkOperation.current;setChecking(true);setError('');setChecked(false);
  try{const {response,data}=await call('/api/payment-commands/'+requestId.current);if(current!==generation.current||operation!==checkOperation.current)return;if(!response.ok)throw Error();result(data)}
  catch{if(current===generation.current&&operation===checkOperation.current)setError(t('Status is unavailable. Keep this reference and check again.','ไม่สามารถตรวจสอบสถานะได้ เก็บหมายเลขอ้างอิงนี้และลองอีกครั้ง'));}
  finally{if(current===generation.current&&operation===checkOperation.current){checkingRef.current=false;setChecking(false);}}
 }
 useEffect(()=>{
  if(state!=='posted'||!command.current?.receiptId)return;
  const current=generation.current,controller=new AbortController();let objectUrl:string|undefined,active=true;
  const timer=setTimeout(()=>controller.abort(),15000);setReceiptReadError('');
  void(async()=>{
   try{
    const token=await access.token();
    const response=await fetch(access.origin+'/api/payment-commands/'+requestId.current+'/receipts/'+command.current!.receiptId,{headers:{Authorization:'Bearer '+token},cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
    if(response.status===401||response.status===403){access.authFailure(response.status);throw Error();}
    if(!response.ok||!['image/png','image/jpeg'].includes(response.headers.get('content-type')??''))throw Error();
    const image=await response.blob();if(current!==generation.current||controller.signal.aborted)return;
    objectUrl=URL.createObjectURL(image);setVerifiedPreview(objectUrl);
   }catch{if(current===generation.current&&active)setReceiptReadError(t('Payment remains Posted. The receipt could not be loaded.','ผลรับชำระยังคงบันทึกแล้ว แต่ไม่สามารถโหลดหลักฐานได้'));}
   finally{clearTimeout(timer);}
  })();
  return()=>{active=false;clearTimeout(timer);controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[state]);

 return <section onChangeCapture={()=>{autosaveSuspended.current=false}} className="selected-payment" aria-label={t('Selected charges payment','รับชำระรายการที่เลือก')}>

 <div className="payment-context">{!['sending','unknown'].includes(state)&&<button className="secondary-button icon-action" aria-label={t('Back to Collection','กลับงานติดตาม')} title={t('Back to Collection','กลับงานติดตาม')} onClick={onBack}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 12H5m6-6-6 6 6 6"/></svg></button>}<strong>{draft?.borrower.displayName??t('Receive payment','รับชำระเงิน')}</strong>{state==='edit'&&<details className="payment-options"><summary aria-label={t('Payment options','ตัวเลือกรับชำระ')} title={t('Payment options','ตัวเลือกรับชำระ')}>⋮</summary><button className="secondary-button" onClick={()=>void discardDraft()}>{t('Clear draft','ล้างร่าง')}</button></details>}</div>
 {savedAt&&<p>{t('Offline saved copy — not current','สำเนาออฟไลน์ — ไม่ใช่ข้อมูลปัจจุบัน')}: {new Date(savedAt).toLocaleString()}</p>}
 {error&&<p role="alert">{error}</p>}

 {state==='edit'&&draft&&<>

 <label className="payment-received-input">{t('Amount received','ยอดรับชำระ')}<input inputMode="numeric" value={received} onChange={event=>{legacyDraft.current=false;reviewOperation.current++;setReceived(event.target.value)}}/></label>
 <div className="payment-selection-header allocation-summary"><button className="secondary-button" disabled={access.offlineOnly||!navigator.onLine||!integer(received)||BigInt(total)<=0n} onClick={()=>void autoAssign()}>{t('Auto-assign','จัดสรรอัตโนมัติ')}</button><output aria-live="polite"><span>{t('Received','รับชำระ')}<strong>{money(total)}</strong></span><span>{t('Allocated','จัดสรรแล้ว')}<strong>{money(allocated.toString())}</strong></span><span>{t('Remaining','คงเหลือ')}<strong>{money((BigInt(total)-allocated).toString())}</strong></span></output><button className="secondary-button icon-action" aria-label={t('Review payment','ตรวจสอบการรับชำระ')} disabled={access.offlineOnly||!navigator.onLine||!validPlan||!account||uploading||uploadFailed||new TextEncoder().encode(notes).length>65536||notes.includes('\0')} onClick={()=>void review()}><ReceiveIcon/></button></div>
 {changedBalances&&changedBalances.operation===reviewOperation.current&&changedBalances.generation===generation.current&&!command.current&&<button className="secondary-button" onClick={useCurrentBalances}>{t('Use current balances','ใช้ยอดคงเหลือปัจจุบัน')}</button>}
 <div className="payment-charge-scroll" role="region" tabIndex={0} aria-label={t('Payment allocation','จัดสรรการรับชำระ')}>{draft.charges.map(row=>{const line=allocations.find(line=>line.chargeId===row.id);return <article className="payment-allocation-row" key={row.id}><div><label><input type="checkbox" aria-label={t('Allocate to ','จัดสรรให้ ')+row.loanDisplayKey+' '+row.chargeDate} checked={!!line} onChange={event=>toggleLine(row,event.target.checked)}/><span>{row.chargeDate}</span></label><strong>{row.loanDisplayKey}</strong>{unavailableLines.includes(row.id)&&<span role="status">{t('Unavailable — remove this allocation before review','รายการใช้ไม่ได้ กรุณานำยอดจัดสรรนี้ออกก่อนตรวจสอบ')}</span>}</div><label>{t('Principal','เงินต้น')} <small>{t('Remaining','คงเหลือ')} {money(row.principalRemaining)}</small><input aria-label={t('Principal for ','เงินต้นสำหรับ ')+row.loanDisplayKey+' '+row.chargeDate} inputMode="numeric" value={line?.principal??'0'} onChange={event=>editLine(row,'principal',event.target.value)}/></label><label>{t('Interest','ดอกเบี้ย')} <small>{t('Remaining','คงเหลือ')} {money(row.interestRemaining)}</small><input aria-label={t('Interest for ','ดอกเบี้ยสำหรับ ')+row.loanDisplayKey+' '+row.chargeDate} inputMode="numeric" value={line?.interest??'0'} onChange={event=>editLine(row,'interest',event.target.value)}/></label></article>})}</div>
 <CompactPager busy={paging} previous={pageIndex>0?()=>void chargePage(pageIndex-1):undefined} next={draft.nextCursor?()=>void chargePage(pageIndex+1):undefined} previousLabel={t('Previous charge page','หน้ารายการก่อนหน้า')} nextLabel={t('Next charge page','หน้ารายการถัดไป')}/>
 <label>{t('Payment method','วิธีชำระเงิน')}<select value={paymentMethod} onChange={event=>{reviewOperation.current++;setPaymentMethod(event.target.value as Command['paymentMethod'])}}><option value="Bank Transfer">{t('Bank Transfer','โอนเงิน')}</option><option value="Cash">{t('Cash','เงินสด')}</option><option value="Net-off at Disbursement">{t('Net-off at Disbursement','หัก ณ วันที่จ่ายเงินกู้')}</option></select></label>
 <label>{t('Receiving account','บัญชีรับชำระ')}<select value={account} onChange={event=>setAccount(event.target.value)}>{draft.accounts.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
 <label>{t('Notes','หมายเหตุ')}<textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label>
 <label>{t('Receipt (optional PNG/JPEG)','หลักฐาน (PNG/JPEG ไม่บังคับ)')}<input type="file" accept="image/png,image/jpeg" onChange={event=>void upload(event.target.files?.[0])}/></label>
 {(receipt||localImage||uploadFailed||uploading)&&<button className="secondary-button" onClick={()=>{uploadGeneration.current++;setReceipt(null);setLocalImage(null);setPreview(null);setUploadFailed(false);setUploading(false);setError('')}}>{t('Remove receipt / proceed without receipt','นำหลักฐานออก / ดำเนินการโดยไม่มีหลักฐาน')}</button>}
 {localImage&&!receipt&&!access.offlineOnly&&<button className="secondary-button" disabled={uploading} onClick={()=>void upload(new File([localImage],'receipt',{type:localImage.type}))}>{t('Upload saved receipt','อัปโหลดหลักฐานที่บันทึกไว้')}</button>}{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}

 </>}
 {state==='review'&&draft&&<><p>{draft.borrower.displayName}</p><ul>{allocations.map(row=><li key={row.chargeId}>{row.chargeDate} · {t('Principal','เงินต้น')} {money(row.principal)} · {t('Interest','ดอกเบี้ย')} {money(row.interest)}</li>)}</ul><p>{t('Amount to receive','ยอดรับชำระ')}: <strong>{money(total)}</strong></p><p>{draft.accounts.find(row=>row.id===account)?.label}</p><p>{draft.businessDate} · {paymentMethod}</p><pre>{notes}</pre>{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}<button className="secondary-button" disabled={reviewing} onClick={()=>{reviewOperation.current++;setState('edit')}}>{t('Edit','แก้ไข')}</button><button className="secondary-button" disabled={reviewing||!navigator.onLine} onClick={()=>void confirm()}>{t('Confirm payment online','ยืนยันรับชำระขณะออนไลน์')}</button></>}

 {state==='unknown'&&<><h3>{t('Outcome unknown','ยังไม่ทราบผลการรับชำระ')}</h3><p>{t('A missing response does not mean the payment failed. Check the original request.','ไม่ได้รับคำตอบไม่ได้หมายความว่าการรับชำระล้มเหลว ตรวจสอบคำขอเดิม')}</p><button className="secondary-button" disabled={checking||access.offlineOnly||!navigator.onLine} onClick={()=>void check()}>{t('Check status','ตรวจสอบสถานะ')}</button>{command.current&&<button className="secondary-button" disabled={checking||access.offlineOnly||!checked||!navigator.onLine} onClick={()=>void confirm()}>{t('Retry same command','ลองคำขอเดิมอีกครั้ง')}</button>}</>}
 {state==='posted'&&<><h3>{t('Original payment recorded as Posted','บันทึกผลคำขอเดิมว่ารับชำระแล้ว')}</h3>{command.current&&<><p>{draft?.borrower.displayName}</p><p>{t('Amount received','ยอดรับชำระ')}: <strong>{money(command.current.amountReceived)}</strong></p><p>{draft?.accounts.find(row=>row.id===command.current?.cashAccountId)?.label}</p><pre aria-label={t('Notes','หมายเหตุ')}>{command.current.notes}</pre></>}{verifiedPreview&&<img className="payment-receipt-preview" src={verifiedPreview} alt={t('Verified uploaded receipt','หลักฐานที่อัปโหลดและตรวจสอบแล้ว')}/>} {receiptReadError&&<p role="status">{receiptReadError}</p>}</>}{state==='rejected'&&<h3>{t('Original request recorded as rejected','บันทึกผลคำขอเดิมว่าปฏิเสธ')}</h3>}{state==='conflict'&&<h3>{t('Request identity conflict — do not resend changed details','คำขอขัดแย้ง — อย่าส่งรายละเอียดที่เปลี่ยนแล้วซ้ำ')}</h3>}
 {outcome&&<p>{outcome.recordedAt}</p>}{state==='posted'&&!access.offlineOnly&&<PaymentResult access={access} requestId={requestId.current} thai={thai}/>}{(storageBlocked||['sending','unknown','posted','rejected','conflict'].includes(state))&&<p>{t('Request reference','หมายเลขอ้างอิงคำขอ')}: <code>{requestId.current}</code> <button className="secondary-button" onClick={()=>void navigator.clipboard?.writeText(requestId.current)}>{t('Copy','คัดลอก')}</button></p>}{storageBlocked&&<p>{t('This browser cannot retain the reference. Copy it before leaving.','เบราว์เซอร์นี้เก็บหมายเลขอ้างอิงไม่ได้ กรุณาคัดลอกก่อนออก')}</p>}
 </section>;
}


