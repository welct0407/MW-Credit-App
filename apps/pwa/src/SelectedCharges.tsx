import React,{useEffect,useRef,useState} from 'react';
type Draft={businessDate:string;borrower:{id:string;displayName:string};charges:{id:string;chargeDate:string;loanDisplayKey:string;amountRemaining:string}[];accounts:{id:string;label:string}[]};
type Command={schemaVersion:3;requestId:string;borrowerId:string;selectedChargeIds:string[];cashAccountId:string;paymentDate:string;amountReceived:string;paymentMethod:'Bank Transfer';allocationMethod:'Selected Charges';notes:string|null;receiptId:string|null};
type Outcome={status:'posted'|'rejected';paymentId:string|null;code:string|null;recordedAt:string};
export type CommandAccess={origin:string;fixtureBorrowerId:string;token:()=>Promise<string>;authFailure:(status:number)=>void};
const pendingKey='mw-credit.pending-command';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function SelectedCharges({access,borrowerId,thai,onBack}:{access:CommandAccess;borrowerId:string;thai:boolean;onBack:()=>void}) {
 const t=(en:string,th:string)=>thai?th:en;
 const [draft,setDraft]=useState<Draft|null>(null),[selected,setSelected]=useState<string[]>([]),[account,setAccount]=useState(''),[notes,setNotes]=useState('');
 const [state,setState]=useState<'loading'|'edit'|'review'|'sending'|'unknown'|'posted'|'rejected'|'conflict'|'error'>('loading');
 const [error,setError]=useState(''),[receipt,setReceipt]=useState<string|null>(null),[preview,setPreview]=useState<string|null>(null),[uploading,setUploading]=useState(false),[uploadFailed,setUploadFailed]=useState(false);
 const [checking,setChecking]=useState(false),[receiptReadError,setReceiptReadError]=useState(''),[verifiedPreview,setVerifiedPreview]=useState<string|null>(null);
 const checkOperation=useRef(0),checkingRef=useRef(false);
 const [outcome,setOutcome]=useState<Outcome|null>(null),[checked,setChecked]=useState(false),[storageBlocked,setStorageBlocked]=useState(false);
 const command=useRef<Command|null>(null),requestId=useRef<string>(crypto.randomUUID()),generation=useRef(0),uploadGeneration=useRef(0);
 const selectedRows=draft?.charges.filter(row=>selected.includes(row.id))??[];
 const total=selectedRows.reduce((sum,row)=>sum+BigInt(row.amountRemaining),0n).toString();
 const money=(value:string)=>'฿'+BigInt(value).toLocaleString(thai?'th-TH':'en-US');
 async function call(path:string,init:RequestInit={}) {
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
 function clearPending(){try{sessionStorage.removeItem(pendingKey)}catch{}}
 useEffect(()=>{
  const current=++generation.current;
  let prior:string|null=null;try{prior=sessionStorage.getItem(pendingKey)}catch{setStorageBlocked(true)}
  if(prior&&uuid.test(prior)){requestId.current=prior;setState('unknown');return()=>{generation.current++;uploadGeneration.current++;};}
  void call('/api/payment-drafts/'+encodeURIComponent(borrowerId)).then(({response,data})=>{if(current!==generation.current)return;if(!response.ok)throw Error();setDraft(data);setAccount(data.accounts[0]?.id??'');setState('edit')}).catch(()=>{if(current===generation.current){setError(t('Unable to load payment draft.','ไม่สามารถโหลดร่างการรับชำระได้'));setState('error')}});
  return()=>{generation.current++;uploadGeneration.current++;};
 },[borrowerId]);
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 async function upload(file:File|undefined){
  const seq=++uploadGeneration.current,current=generation.current;setUploading(false);setReceipt(null);setPreview(null);setUploadFailed(false);
  if(!file)return;
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
 async function confirm(){
  if(!navigator.onLine)return;
  if(!command.current){if(!draft||BigInt(total)<=0n||uploading||uploadFailed)return;command.current={schemaVersion:3,requestId:requestId.current,borrowerId,selectedChargeIds:[...selected].sort(),cashAccountId:account,paymentDate:draft.businessDate,amountReceived:total,paymentMethod:'Bank Transfer',allocationMethod:'Selected Charges',notes:notes===''?null:notes,receiptId:receipt};}
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
 <p className="payment-demo-notice">{t('DEV synthetic payment verification only','ตรวจสอบการรับชำระข้อมูลทดสอบ DEV เท่านั้น')}</p>
 {!['sending','unknown'].includes(state)&&<button className="secondary-button" onClick={onBack}>{t('Back to Collection','กลับงานติดตาม')}</button>}
 <h2>{t('Selected charges','รายการเรียกเก็บที่เลือก')}</h2>{error&&<p role="alert">{error}</p>}
 {state==='loading'&&<p role="status">{t('Loading…','กำลังโหลด…')}</p>}
 {state==='edit'&&draft&&<>
 <h3>{draft.borrower.displayName}</h3><p>{t('Selected total','ยอดรวมที่เลือก')}: <output aria-live="polite">{money(total)}</output></p>
 <div className="payment-charge-scroll" role="region" tabIndex={0} aria-label={t('Charge selection','เลือกรายการเรียกเก็บ')}>{draft.charges.map(row=><label className="payment-charge-choice" key={row.id}><input type="checkbox" checked={selected.includes(row.id)} onChange={event=>setSelected(values=>event.target.checked?[...values,row.id]:values.filter(id=>id!==row.id))}/><span>{row.chargeDate}<br/>{row.loanDisplayKey}<br/><strong>{money(row.amountRemaining)}</strong></span></label>)}</div>
 <label>{t('Receiving account','บัญชีรับชำระ')}<select value={account} onChange={event=>setAccount(event.target.value)}>{draft.accounts.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
 <label>{t('Notes','หมายเหตุ')}<textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label>
 <label>{t('Receipt (optional PNG/JPEG)','หลักฐาน (PNG/JPEG ไม่บังคับ)')}<input type="file" accept="image/png,image/jpeg" onChange={event=>void upload(event.target.files?.[0])}/></label>
 {(receipt||uploadFailed||uploading)&&<button className="secondary-button" onClick={()=>{uploadGeneration.current++;setReceipt(null);setPreview(null);setUploadFailed(false);setUploading(false);setError('')}}>{t('Remove receipt / proceed without receipt','นำหลักฐานออก / ดำเนินการโดยไม่มีหลักฐาน')}</button>}
 {uploading&&<p role="status">{t('Uploading receipt…','กำลังอัปโหลดหลักฐาน…')}</p>}{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}
 <button className="secondary-button" disabled={!selected.length||!account||uploading||uploadFailed||new TextEncoder().encode(notes).length>65536||notes.includes('\0')} onClick={()=>setState('review')}>{t('Review payment','ตรวจสอบการรับชำระ')}</button>
 </>}
 {state==='review'&&draft&&<><p>{draft.borrower.displayName}</p><ul>{selectedRows.map(row=><li key={row.id}>{row.chargeDate} · {money(row.amountRemaining)}</li>)}</ul><p>{t('Amount to receive','ยอดรับชำระ')}: <strong>{money(total)}</strong></p><p>{draft.accounts.find(row=>row.id===account)?.label}</p><p>{draft.businessDate} · Bank Transfer</p><pre>{notes}</pre>{preview&&<img className="payment-receipt-preview" src={preview} alt={t('Selected receipt','หลักฐานที่เลือก')}/>}<button className="secondary-button" onClick={()=>setState('edit')}>{t('Edit','แก้ไข')}</button><button className="secondary-button" disabled={!navigator.onLine} onClick={()=>void confirm()}>{t('Confirm payment online','ยืนยันรับชำระขณะออนไลน์')}</button></>}
 {state==='sending'&&<p role="status">{t('Confirming. Do not submit another payment.','กำลังยืนยัน กรุณาอย่าส่งการรับชำระซ้ำ')}</p>}
 {state==='unknown'&&<><h3>{t('Outcome unknown','ยังไม่ทราบผลการรับชำระ')}</h3><p>{t('A missing response does not mean the payment failed. Check the original request.','ไม่ได้รับคำตอบไม่ได้หมายความว่าการรับชำระล้มเหลว ตรวจสอบคำขอเดิม')}</p><button className="secondary-button" disabled={checking||!navigator.onLine} onClick={()=>void check()}>{t('Check status','ตรวจสอบสถานะ')}</button>{command.current&&<button className="secondary-button" disabled={checking||!checked||!navigator.onLine} onClick={()=>void confirm()}>{t('Retry same command','ลองคำขอเดิมอีกครั้ง')}</button>}</>}
 {state==='posted'&&<><h3>{t('Original payment recorded as Posted','บันทึกผลคำขอเดิมว่ารับชำระแล้ว')}</h3>{command.current&&<><p>{draft?.borrower.displayName}</p><p>{t('Amount received','ยอดรับชำระ')}: <strong>{money(command.current.amountReceived)}</strong></p><p>{draft?.accounts.find(row=>row.id===command.current?.cashAccountId)?.label}</p><pre aria-label={t('Notes','หมายเหตุ')}>{command.current.notes}</pre></>}{verifiedPreview&&<img className="payment-receipt-preview" src={verifiedPreview} alt={t('Verified uploaded receipt','หลักฐานที่อัปโหลดและตรวจสอบแล้ว')}/>} {receiptReadError&&<p role="status">{receiptReadError}</p>}</>}{state==='rejected'&&<h3>{t('Original request recorded as rejected','บันทึกผลคำขอเดิมว่าปฏิเสธ')}</h3>}{state==='conflict'&&<h3>{t('Request identity conflict — do not resend changed details','คำขอขัดแย้ง — อย่าส่งรายละเอียดที่เปลี่ยนแล้วซ้ำ')}</h3>}
 {outcome&&<p>{outcome.recordedAt}</p>}{['sending','unknown','posted','rejected','conflict'].includes(state)&&<p>{t('Request reference','หมายเลขอ้างอิงคำขอ')}: <code>{requestId.current}</code> <button className="secondary-button" onClick={()=>void navigator.clipboard?.writeText(requestId.current)}>{t('Copy','คัดลอก')}</button></p>}{storageBlocked&&<p>{t('This browser cannot retain the reference. Copy it before leaving.','เบราว์เซอร์นี้เก็บหมายเลขอ้างอิงไม่ได้ กรุณาคัดลอกก่อนออก')}</p>}
 </section>;
}

