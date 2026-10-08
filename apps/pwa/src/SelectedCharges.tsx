import {PaymentResult} from './PaymentResult';
import type {OwnerOfflineRepository} from './owner-offline';
import React,{useEffect,useRef,useState} from 'react';
type Draft={nextCursor?:string|null;asOf?:string;businessDate:string;borrower:{id:string;displayName:string};charges:{id:string;chargeDate:string;loanDisplayKey:string;amountRemaining:string}[];accounts:{id:string;label:string}[]};
type Command={schemaVersion:3|4;requestId:string;borrowerId:string;selectedChargeIds:string[];cashAccountId:string;paymentDate:string;amountReceived:string;paymentMethod:'Bank Transfer';allocationMethod:'Selected Charges'|'Single Full'|'Receive All';notes:string|null;receiptId:string|null};
type Outcome={status:'posted'|'rejected';paymentId:string|null;code:string|null;recordedAt:string};
export type CommandAccess={origin:string;fixtureBorrowerId:string;ownerTesting?:boolean;offline?:OwnerOfflineRepository;offlineOnly?:boolean;token:()=>Promise<string>;authFailure:(status:number)=>void};
const pendingKey='mw-credit.pending-command';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function SelectedCharges({access,borrowerId,thai,onBack}:{access:CommandAccess;borrowerId:string;thai:boolean;onBack:()=>void}) {
 const t=(en:string,th:string)=>thai?th:en;
 const [draft,setDraft]=useState<Draft|null>(null),[selected,setSelected]=useState<string[]>([]),[account,setAccount]=useState(''),[notes,setNotes]=useState('');
 const [state,setState]=useState<'loading'|'edit'|'review'|'sending'|'unknown'|'posted'|'rejected'|'conflict'|'error'>('loading');
 const [error,setError]=useState(''),[receipt,setReceipt]=useState<string|null>(null),[preview,setPreview]=useState<string|null>(null),[uploading,setUploading]=useState(false),[uploadFailed,setUploadFailed]=useState(false);
 const [checking,setChecking]=useState(false),[receiptReadError,setReceiptReadError]=useState(''),[verifiedPreview,setVerifiedPreview]=useState<string|null>(null);
 const confirming=useRef(false);
 const checkOperation=useRef(0),checkingRef=useRef(false);
 const [outcome,setOutcome]=useState<Outcome|null>(null),[checked,setChecked]=useState(false),[storageBlocked,setStorageBlocked]=useState(false);
 const command=useRef<Command|null>(null),requestId=useRef<string>(crypto.randomUUID()),generation=useRef(0),uploadGeneration=useRef(0);
 const [selectionRows,setSelectionRows]=useState<Draft['charges']>([]),[savedAt,setSavedAt]=useState<number|null>(null),[localImage,setLocalImage]=useState<Blob|null>(null);
 const [allMode,setAllMode]=useState(false);
 const [scope,setScope]=useState<'due'|'future'>('due');
 const allocationMethod=allMode?'Receive All':selected.length===1?'Single Full':'Selected Charges';
 const selectedRows=selectionRows;
 const total=selectedRows.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString();
 const money=(value:string)=>'฿'+BigInt(value).toLocaleString(thai?'th-TH':'en-US');
 async function call(path:string,init:RequestInit={}) {
  if(access.offlineOnly||!navigator.onLine)throw Error('Offline');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try {
   const token=await access.token();
   const response=await fetch(access.origin+path,{...init,signal:controller.signal,headers:{...init.headers,Authorization:'Bearer '+token}});
   const data=await response.json();
   if(response.status===401||response.status===403){access.authFailure(response.status);throw Error('access_denied');}
   return {response,data};
  } finally {clearTimeout(timer);}
 }
 function retainPending(){try{sessionStorage.setItem(pendingKey,requestId.current)}catch{setStorageBlocked(true)}}
 function clearPending(){try{sessionStorage.removeItem(pendingKey)}catch{}void access.offline?.remove('pending',requestId.current).catch(()=>{})}
 useEffect(()=>{
  const current=++generation.current;
  void(async()=>{
   try{
    const pending=await access.offline?.list('pending');
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
     const response=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId));if(!response.response.ok)throw Error();data=response.data;
     if(current!==generation.current)return;
     try{await access.offline?.saveSnapshot(borrowerId,data)}catch{setStorageBlocked(true)}
    }
    if(current!==generation.current)return;setDraft(data);setAccount(saved?.value.account??data.accounts[0]?.id??'');
    if(saved){setNotes(saved.value.notes);setSelectionRows(saved.value.selectionRows);setSelected(saved.value.selectionRows.map((row:any)=>row.id));setLocalImage(saved.value.image??null);setAllMode(saved.value.allMode===true);setScope(saved.value.scope==='future'?'future':'due');if(saved.value.image)setPreview(URL.createObjectURL(saved.value.image));}
    setState('edit');
   }catch{if(current===generation.current){setError(t('Unable to load payment draft.','ไม่สามารถโหลดร่างการรับชำระได้'));setState('error')}}
  })();
  return()=>{generation.current++;uploadGeneration.current++;};
 },[borrowerId]);
 async function saveDraft(){try{if(!access.offline)throw Error();await access.offline.saveDraft(borrowerId,{notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,image:localImage});setError(t('Unsent draft saved on this device.','บันทึกร่างที่ยังไม่ส่งบนอุปกรณ์นี้แล้ว'));}catch{setError(t('Draft could not be saved. Storage is unavailable or the five-draft limit is reached.','บันทึกร่างไม่ได้ พื้นที่จัดเก็บใช้ไม่ได้หรือมีร่างครบห้ารายการแล้ว'));}}
 const latestDraft=useRef({notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,image:localImage});
 latestDraft.current={notes,account,selectionRows,selectedChargeIds:selected,allMode,scope,image:localImage};
 const editable=useRef(false);editable.current=state==='edit'||state==='review';
 useEffect(()=>{
  const saveOnDisconnect=()=>{if(editable.current&&access.offline)void access.offline.saveDraft(borrowerId,latestDraft.current).then(()=>window.dispatchEvent(new Event('mw-offline-saved'))).catch(()=>window.dispatchEvent(new Event('mw-offline-save-failed')));};
  const leaving=(event:BeforeUnloadEvent)=>{if(editable.current||command.current&&state==='unknown'){event.preventDefault();event.returnValue='';}};
  window.addEventListener('offline',saveOnDisconnect);window.addEventListener('beforeunload',leaving);
  return()=>{window.removeEventListener('offline',saveOnDisconnect);window.removeEventListener('beforeunload',leaving);};
 },[access.offline,borrowerId,state]);
 async function discardDraft(){await access.offline?.remove('draft',borrowerId);setNotes('');setSelected([]);setSelectionRows([]);setLocalImage(null);setReceipt(null);setPreview(null);setAllMode(false);setError(t('Unsent draft discarded.','ลบร่างที่ยังไม่ส่งแล้ว'));}
 async function refreshSelection(){
  if(access.offlineOnly||!navigator.onLine)return false;
  if(localImage&&!receipt){setError(t('Upload the saved receipt or explicitly remove it before review.','อัปโหลดหลักฐานที่บันทึกไว้หรือนำออกก่อนตรวจสอบ'));return false;}
  const current=generation.current;
  try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+(allMode?'/select-all':'/review'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(allMode?{}:{selectedChargeIds:selected,allocationMethod})});
   if(current!==generation.current)return false;
   const changed=!response.ok||data.businessDate!==draft?.businessDate||data.charges.length!==selectedRows.length||data.charges.some((row:any)=>selectedRows.find(old=>old.id===row.id)?.amountRemaining!==row.amountRemaining)||!data.accounts.some((row:any)=>row.id===account);
   if(changed){if(response.ok){setDraft(data);setSelectionRows(data.charges);setSelected(data.charges.map((row:any)=>row.id));}setState('edit');setError(t('The selection changed. Review current amounts and dates again.','รายการเปลี่ยนแปลง กรุณาตรวจสอบยอดและวันที่ปัจจุบันอีกครั้ง'));return false;}return true;
  }catch{setError(t('Connect and refresh before reviewing.','เชื่อมต่อและรีเฟรชก่อนตรวจสอบ'));return false;}
 }
 async function selectAll(){const current=generation.current;try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'/select-all',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(current!==generation.current)return;if(!response.ok){setError(data.code==='selection_limit_exceeded'?t('The complete selection exceeds the 10,000-charge technical limit. Nothing has been selected automatically.','รายการทั้งหมดเกินขีดจำกัดทางเทคนิค 10,000 รายการ ระบบไม่ได้เลือกบางส่วนให้อัตโนมัติ'):t('Unable to select all charges.','เลือกรายการทั้งหมดไม่ได้'));return;}setDraft(data);setSelectionRows(data.charges);setSelected(data.charges.map((row:any)=>row.id));setAllMode(true);setScope('due');setError('');}catch{setError(t('Connect to select all current charges.','เชื่อมต่อเพื่อเลือกรายการปัจจุบันทั้งหมด'));}}
 async function changeScope(next:'due'|'future'){const current=generation.current;try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope='+next);if(current!==generation.current)return;if(!response.ok)throw Error();setDraft(data);setScope(next);setSelected([]);setSelectionRows([]);setAllMode(false);setError('');}catch{setError(t('Unable to load charges.','โหลดรายการเรียกเก็บไม่ได้'));}}
 async function nextPage(){if(!draft?.nextCursor)return;const current=generation.current;try{const {response,data}=await call('/api/payment-drafts/'+encodeURIComponent(borrowerId)+'?scope='+scope+'&cursor='+encodeURIComponent(draft.nextCursor));if(current===generation.current&&response.ok)setDraft(data)}catch{setError(t('Unable to load the next page.','โหลดหน้าถัดไปไม่ได้'));}}
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
  if(data.kind==='recorded'){setOutcome(data.originalOutcome);setState(data.originalOutcome.status);clearPending();}
  else if(data.code==='command_conflict'||data.kind==='conflict'){setState('conflict');clearPending();}
  else{setState('unknown');setChecked(data.kind==='unresolved');}
 }
 async function confirm(){if(confirming.current)return;confirming.current=true;try{await confirmOnce()}finally{confirming.current=false}}
 async function confirmOnce(){
  if(!navigator.onLine)return;
  if(!command.current && !(await refreshSelection()))return;
  if(!command.current){if(!draft||BigInt(total)<=0n||uploading||uploadFailed)return;command.current={schemaVersion:4,requestId:requestId.current,borrowerId,selectedChargeIds:[...selected].sort(),cashAccountId:account,paymentDate:draft.businessDate,amountReceived:total,paymentMethod:'Bank Transfer',allocationMethod,notes:notes===''?null:notes,receiptId:receipt};}
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

 return <section className="selected-payment" aria-label={t('Selected charges payment','รับชำระรายการที่เลือก')}>
 <p className="payment-demo-notice">{access.ownerTesting?t('DEV payment entry','รับชำระเงิน DEV'):t('DEV synthetic payment verification only','ตรวจสอบการรับชำระข้อมูลทดสอบ DEV เท่านั้น')}</p>
 {!['sending','unknown'].includes(state)&&<button className="secondary-button" onClick={onBack}>{t('Back to Collection','กลับงานติดตาม')}</button>}
 {savedAt&&<p>{t('Offline saved copy — not current','สำเนาออฟไลน์ — ไม่ใช่ข้อมูลปัจจุบัน')}: {new Date(savedAt).toLocaleString()}</p>}
 <h2>{t('Selected charges','รายการเรียกเก็บที่เลือก')}</h2>{error&&<p role="alert">{error}</p>}
 {state==='loading'&&<p role="status">{t('Loading…','กำลังโหลด…')}</p>}
 {state==='edit'&&draft&&<>
 <h3>{draft.borrower.displayName}</h3><p>{t('Selected total','ยอดรวมที่เลือก')}: <output aria-live="polite">{money(total)}</output></p>
 <div className="payment-scope-controls"><button className="secondary-button" disabled={access.offlineOnly||scope==='due'} onClick={()=>void changeScope('due')}>{t('Due charges','รายการครบกำหนด')}</button><button className="secondary-button" disabled={access.offlineOnly||scope==='future'} onClick={()=>void changeScope('future')}>{t('Future charge — Single Full','รายการอนาคต — รับเต็มหนึ่งรายการ')}</button></div><button className="secondary-button" disabled={access.offlineOnly||!navigator.onLine} onClick={()=>void selectAll()}>{t('Receive all due charges','รับชำระรายการครบกำหนดทั้งหมด')}</button><p>{t('Selected','เลือกแล้ว')}: {selected.length} / 10,000</p>
 <div className="payment-charge-scroll" role="region" tabIndex={0} aria-label={t('Charge selection','เลือกรายการเรียกเก็บ')}>{draft.charges.map(row=><label className="payment-charge-choice" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={event=>{setAllMode(false);if(event.target.checked){if(selected.length>=10000){setError(t('Select at most 10,000 charges.','เลือกได้ไม่เกิน 10,000 รายการ'));return;}setSelected(values=>scope==='future'?[row.id]:[...values,row.id]);setSelectionRows(values=>scope==='future'?[row]:[...values,row]);}else{setSelected(values=>values.filter(id=>id!==row.id));setSelectionRows(values=>values.filter(item=>item.id!==row.id));}}}/><span>{row.chargeDate}<br/>{row.loanDisplayKey}<br/><strong>{money(row.amountRemaining)}</strong></span></label>)}</div>{draft.nextCursor&&<button className="secondary-button" disabled={access.offlineOnly} onClick={()=>void nextPage()}>{t('Next charge page','รายการเรียกเก็บหน้าถัดไป')}</button>}
 <label>{t('Receiving account','บัญชีรับชำระ')}<select value={account} onChange={event=>setAccount(event.target.value)}>{draft.accounts.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
 <label>{t('Notes','หมายเหตุ')}<textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label>
 <label>{t('Receipt (optional PNG/JPEG)','หลักฐาน (PNG/JPEG ไม่บังคับ)')}<input type="file" accept="image/png,image/jpeg" onChange={event=>void upload(event.target.files?.[0])}/></label>
 {(receipt||localImage||uploadFailed||uploading)&&<button className="secondary-button" onClick={()=>{uploadGeneration.current++;setReceipt(null);setLocalImage(null);setPreview(null);setUploadFailed(false);setUploading(false);setError('')}}>{t('Remove receipt / proceed without receipt','นำหลักฐานออก / ดำเนินการโดยไม่มีหลักฐาน')}</button>}
 {localImage&&!receipt&&!access.offlineOnly&&<button className="secondary-button" disabled={uploading} onClick={()=>void upload(new File([localImage],'receipt',{type:localImage.type}))}>{t('Upload saved receipt','อัปโหลดหลักฐานที่บันทึกไว้')}</button>}{uploading&&<p role="status">{t('Uploading receipt…','กำลังอัปโหลดหลักฐาน…')}</p>}{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}
 <button className="secondary-button" onClick={()=>void discardDraft()}>{t('Discard unsent draft','ลบร่างที่ยังไม่ส่ง')}</button><button className="secondary-button" onClick={()=>void saveDraft()}>{t('Save unsent draft','บันทึกร่างที่ยังไม่ส่ง')}</button><button className="secondary-button" disabled={access.offlineOnly||!navigator.onLine||!selected.length||!account||uploading||uploadFailed||new TextEncoder().encode(notes).length>65536||notes.includes('\0')} onClick={()=>void refreshSelection().then(valid=>{if(valid)setState('review')})}>{t('Review payment','ตรวจสอบการรับชำระ')}</button>
 </>}
 {state==='review'&&draft&&<><p>{draft.borrower.displayName}</p><ul>{selectedRows.map(row=><li key={row.id}>{row.chargeDate} · {money(row.amountRemaining)}</li>)}</ul><p>{t('Amount to receive','ยอดรับชำระ')}: <strong>{money(total)}</strong></p><p>{draft.accounts.find(row=>row.id===account)?.label}</p><p>{draft.businessDate} · Bank Transfer</p><pre>{notes}</pre>{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}<button className="secondary-button" onClick={()=>setState('edit')}>{t('Edit','แก้ไข')}</button><button className="secondary-button" disabled={!navigator.onLine} onClick={()=>void confirm()}>{t('Confirm payment online','ยืนยันรับชำระขณะออนไลน์')}</button></>}
 {state==='sending'&&<p role="status">{t('Confirming. Do not submit another payment.','กำลังยืนยัน กรุณาอย่าส่งการรับชำระซ้ำ')}</p>}
 {state==='unknown'&&<><h3>{t('Outcome unknown','ยังไม่ทราบผลการรับชำระ')}</h3><p>{t('A missing response does not mean the payment failed. Check the original request.','ไม่ได้รับคำตอบไม่ได้หมายความว่าการรับชำระล้มเหลว ตรวจสอบคำขอเดิม')}</p><button className="secondary-button" disabled={checking||access.offlineOnly||!navigator.onLine} onClick={()=>void check()}>{t('Check status','ตรวจสอบสถานะ')}</button>{command.current&&<button className="secondary-button" disabled={checking||access.offlineOnly||!checked||!navigator.onLine} onClick={()=>void confirm()}>{t('Retry same command','ลองคำขอเดิมอีกครั้ง')}</button>}</>}
 {state==='posted'&&<><h3>{t('Original payment recorded as Posted','บันทึกผลคำขอเดิมว่ารับชำระแล้ว')}</h3>{command.current&&<><p>{draft?.borrower.displayName}</p><p>{t('Amount received','ยอดรับชำระ')}: <strong>{money(command.current.amountReceived)}</strong></p><p>{draft?.accounts.find(row=>row.id===command.current?.cashAccountId)?.label}</p><pre aria-label={t('Notes','หมายเหตุ')}>{command.current.notes}</pre></>}{verifiedPreview&&<img className="payment-receipt-preview" src={verifiedPreview} alt={t('Verified uploaded receipt','หลักฐานที่อัปโหลดและตรวจสอบแล้ว')}/>} {receiptReadError&&<p role="status">{receiptReadError}</p>}</>}{state==='rejected'&&<h3>{t('Original request recorded as rejected','บันทึกผลคำขอเดิมว่าปฏิเสธ')}</h3>}{state==='conflict'&&<h3>{t('Request identity conflict — do not resend changed details','คำขอขัดแย้ง — อย่าส่งรายละเอียดที่เปลี่ยนแล้วซ้ำ')}</h3>}
 {outcome&&<p>{outcome.recordedAt}</p>}{state==='posted'&&!access.offlineOnly&&<PaymentResult access={access} requestId={requestId.current} thai={thai}/>}{(storageBlocked||['sending','unknown','posted','rejected','conflict'].includes(state))&&<p>{t('Request reference','หมายเลขอ้างอิงคำขอ')}: <code>{requestId.current}</code> <button className="secondary-button" onClick={()=>void navigator.clipboard?.writeText(requestId.current)}>{t('Copy','คัดลอก')}</button></p>}{storageBlocked&&<p>{t('This browser cannot retain the reference. Copy it before leaving.','เบราว์เซอร์นี้เก็บหมายเลขอ้างอิงไม่ได้ กรุณาคัดลอกก่อนออก')}</p>}
 </section>;
}


