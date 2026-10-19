import {applicationEnvironment} from './environment';
import {useAppUpdateBlock} from './app-update-safety';
import {ReceiptPicker} from './ReceiptPicker';
import {invalidateCachedReads} from './read-cache';
import {displayDate,displayTimestamp,displayValue} from './display-date';
import {beginRequest} from './request-activity';
import {applyOwnPayment,ownReceiptKey,seedOwnReceipt,verifiedOwnReceipt,type OwnReceipt} from './own-write-apply';
import React,{useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
/** receipt (R078 follow-up): the receipt this device uploaded with the payment (file and upload descriptor). */
export function PaymentResult({access,requestId,thai,receipt}:{access:CommandAccess;requestId:string;thai:boolean;receipt?:OwnReceipt}){
 const t=(en:string,th:string)=>thai?th:en;
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[notes,setNotes]=useState(''),[receiptId,setReceiptId]=useState<string|null>(null),[busy,setBusy]=useState(false),[preparingReceipt,setPreparingReceipt]=useState(false),[external,setExternal]=useState(false);
 const [uploadError,setUploadError]=useState(''),[metadataUnknown,setMetadataUnknown]=useState(false);
 const [localReceipt,setLocalReceipt]=useState<Blob|null>(null);
 const [receiptTouched,setReceiptTouched]=useState(false);
 const [image,setImage]=useState<string|null>(null),[imageError,setImageError]=useState('');
 const generation=useRef(0),working=useRef(false);
 useAppUpdateBlock(busy||metadataUnknown||!!uploadError||!!localReceipt||receiptTouched||notes!==(data?.payment?.notes??''));
 const money=(value:string|null)=>value===null?'—':new Intl.NumberFormat(thai?'th-TH':'en-US',{style:'currency',currency:'THB',currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(Number(value));
 async function call(path:string,init:RequestInit={}){if(access.offlineOnly||!navigator.onLine)throw Error();const done=beginRequest(),controller=new AbortController(),deadline=Date.now()+15000,timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(access.origin+path,{...init,headers:{'X-MW-Wake-Deadline':String(deadline),...init.headers,Authorization:'Bearer '+await access.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});if(response.status===401||response.status===403)access.authFailure(response.status);return {response,data:await response.json()}}finally{clearTimeout(timer);done()}}
 function accept(value:any){setMetadataUnknown(false);setUploadError('');setLocalReceipt(null);setReceiptTouched(false);setData(value);setNotes(value.payment?.notes??'');const reference=value.payment?.receiptReference;const match=typeof reference==='string'?new RegExp('^manual-receipts/'+applicationEnvironment+'/pwa/[a-f0-9]{32}/([a-f0-9]{32})\\.(png|jpg)$').exec(reference):null;setReceiptId(match?match[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5'):null);setExternal(!!reference&&!match);
  // R078 item 6: a Posted server result is applied to the offline bundles (no-op once they hold the server row).
  void applyOwnPayment(access,requestId,value,receipt)}
 async function refresh(){if(working.current)return;working.current=true;const current=++generation.current;setBusy(true);setError('');try{const result=await call('/api/payment-commands/'+requestId+'/result');if(!result.response.ok)throw Error();if(current===generation.current)accept(result.data)}catch{if(current===generation.current)setError(t('Recorded payment is unchanged. Current details could not be loaded.','ผลคำขอเดิมไม่เปลี่ยนแปลง แต่โหลดรายละเอียดปัจจุบันไม่ได้'))}finally{if(current===generation.current)setBusy(false);working.current=false}}
 useEffect(()=>{void refresh();return()=>{generation.current++}},[requestId]);
 useEffect(()=>{
  const reference=data?.payment?.receiptReference;
  const match=typeof reference==='string'?new RegExp('^manual-receipts/'+applicationEnvironment+'/pwa/[a-f0-9]{32}/([a-f0-9]{32})\\.(png|jpg)$').exec(reference):null;
  setImage(null);setImageError('');if(!match||access.offlineOnly)return;
  const id=match[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
  const done=beginRequest(),controller=new AbortController();let active=true,url:string|null=null;
  const timer=setTimeout(()=>controller.abort(),15000);
  // R078 item 6: the verified server copy is kept as the payment's offline receipt (UX-SYNC-05: never the local pick),
  // and a copy already stored for this receipt time is shown without a second download (UX-PAY-02).
  const repo=access.offline,paymentId=data?.payment?.id,receiptAt=data?.payment?.receiptAt,seed=repo&&data?.currentSource==='present'&&data?.payment?.status==='Posted'&&typeof paymentId==='string'?ownReceiptKey(access.origin,paymentId):null,receiptTime=Date.parse(receiptAt??'');
  void(async()=>{try{
   const stored=seed&&Number.isFinite(receiptTime)?await repo!.readDatasetMedia(seed).catch(()=>null):null;
   if(stored?.data instanceof Blob&&stored.savedAt>=receiptTime){if(active){url=URL.createObjectURL(stored.data);setImage(url)}return}
   // One verified copy per receipt (shared with the posted screen and the seed): the matching local file or one download.
   const blob=await verifiedOwnReceipt(access,requestId,id,receipt?.receiptId===id?receipt:{});if(!blob)throw Error();if(active){url=URL.createObjectURL(blob);setImage(url)}
   // Fallback seed (the payment's own seed normally stored it already): no second download.
   if(seed&&typeof paymentId==='string')void seedOwnReceipt(access,paymentId,receiptAt,{receiptId:id,file:blob,descriptor:receipt?.receiptId===id?receipt.descriptor:null,requestId});
  }catch{if(active)setImageError(t('Current receipt could not be verified. Recorded payment is unchanged.','ตรวจสอบหลักฐานปัจจุบันไม่ได้ ผลรับชำระเดิมไม่เปลี่ยนแปลง'))}finally{clearTimeout(timer);done()}})();
  return()=>{active=false;controller.abort();clearTimeout(timer);if(url)URL.revokeObjectURL(url)};
 },[data?.payment?.receiptReference,data?.payment?.receiptAt,data?.payment?.id,data?.payment?.status,data?.currentSource,access.offline,requestId]);
 async function replace(file:File|undefined){if(!file||working.current)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>5242880||file.size===0){setUploadError(t('Use PNG/JPEG up to 5 MiB.','ใช้ PNG/JPEG ไม่เกิน 5 MiB'));return}setLocalReceipt(file);working.current=true;setBusy(true);const current=++generation.current,id=crypto.randomUUID();try{const result=await call('/api/payment-commands/'+requestId+'/receipts/'+id,{method:'POST',headers:{'Content-Type':file.type,'X-Borrower-ID':data.originalCommand.borrowerId},body:file});if(!result.response.ok)throw Error();if(current===generation.current){setReceiptId(id);setReceiptTouched(true);setExternal(false);setUploadError('')}}catch{if(current===generation.current)setUploadError(t('Receipt upload failed; payment remains recorded.','อัปโหลดหลักฐานไม่สำเร็จ ผลรับชำระยังคงบันทึกแล้ว'))}finally{if(current===generation.current)setBusy(false);working.current=false}}
 async function save(){if(working.current||preparingReceipt)return;working.current=true;setBusy(true);const current=++generation.current;try{const result=await call('/api/payment-commands/'+requestId+'/metadata',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:data.payment.version,notes:notes===''?null:notes,...(receiptTouched?{receiptId}:{})})});if(!result.response.ok)throw Error();await invalidateCachedReads(access);if(current===generation.current){accept(result.data);setError('')}}catch{if(current===generation.current){setMetadataUnknown(true);setError(t('Metadata outcome needs refresh. The original payment remains recorded; refresh before trying another edit.','กรุณารีเฟรชผลการแก้ไขข้อมูล ผลรับชำระเดิมยังคงบันทึกแล้ว รีเฟรชก่อนแก้ไขอีกครั้ง'));}}finally{if(current===generation.current)setBusy(false);working.current=false}}
 return <section className="payment-result" aria-label={t('Payment result details','รายละเอียดผลรับชำระ')}><button className="secondary-button" disabled={busy||access.offlineOnly} onClick={()=>void refresh()}>{t('Refresh payment details','รีเฟรชรายละเอียดรับชำระ')}</button>{error&&<p role="alert">{error}</p>}{uploadError&&<p role="alert">{uploadError}</p>}{data&&<>
 <h3>{t('Current source','ข้อมูลปัจจุบัน')}: {data.currentSource==='present'?t('Matches original payment','ตรงกับการรับชำระเดิม'):data.currentSource==='changed'?t('Changed since original posting','เปลี่ยนแปลงหลังบันทึกเดิม'):t('Source payment missing','ไม่พบรายการรับชำระต้นทาง')}</h3>
 {data.payment&&<><p>{data.payment.status} · {displayValue(data.payment.paymentDate)} · {money(data.payment.amountReceived)} · {data.payment.accountLabel}</p><p className="field-summary">{t('Posted amount','ยอดที่ลงรายการ')}: <span className="field-summary-value">{money(data.payment.postedAmount)}</span></p><pre>{data.payment.notes}</pre></>}
 <p role="alert">{imageError}</p>{image&&!(data.currentSource==='present'&&data.payment?.status==='Posted')&&<img className="payment-receipt-preview" src={image} alt={t('Verified current receipt','หลักฐานปัจจุบันที่ตรวจสอบแล้ว')}/> }<h3>{t('Allocations','การจัดสรร')}</h3>{data.allocations.map((row:any)=><p key={row.id}>{displayValue(row.chargeDate)} · {t('Principal','เงินต้น')} {money(row.principal)} · {t('Interest','ดอกเบี้ย')} {money(row.interest)} · {money(row.amount)}</p>)}
 <h3>{t('Repayments','รายการชำระ')}</h3>{data.repayments.map((row:any)=><p key={row.id}>{displayValue(row.paymentDate)} · {money(row.principal)} + {money(row.interest)}</p>)}
 <h3>{t('Cash movements','รายการเงินสด')}</h3>{data.cashMovements.map((row:any)=><p key={row.id}>{displayValue(row.movementDate)} · {row.movementType} · {money(row.amount)} · {row.fromAccount??'—'} → {row.toAccount??'—'}</p>)}
 <h3>{t('History','ประวัติ')}</h3><p className="field-summary">{t('Original command recorded','บันทึกคำขอเดิม')}: <span className="field-summary-value">{displayValue(data.history.recordedAt)}</span></p><p className="field-summary">{t('Payment created','สร้างรายการรับชำระ')}: <span className="field-summary-value">{displayValue(data.history.createdAt??'—')}</span></p><p className="field-summary">{t('Payment processed','ประมวลผลรับชำระ')}: <span className="field-summary-value">{displayValue(data.history.processedAt??'—')}</span></p>
 {data.currentSource==='present'&&data.payment.status==='Posted'&&<fieldset disabled={busy||preparingReceipt||access.offlineOnly}><legend>{t('Edit Notes / manual receipt only','แก้ไขเฉพาะหมายเหตุ / หลักฐานที่อัปโหลดเอง')}</legend><label><span className="payment-notes-title">{t('Payment Notes','หมายเหตุรับชำระ')}</span><textarea value={notes} onChange={event=>setNotes(event.target.value)}/></label>{external&&<p>{t('This receipt uses an external reference. Notes-only edits preserve it.','หลักฐานนี้ใช้การอ้างอิงภายนอก การแก้ไขหมายเหตุอย่างเดียวจะเก็บหลักฐานเดิมไว้')}</p>}<ReceiptPicker thai={thai} attached={!!(localReceipt||(receiptTouched?receiptId:data.payment.receiptReference))} image={localReceipt} preview={receiptTouched?null:image} busy={busy} disabled={busy||access.offlineOnly} onPreparing={setPreparingReceipt} onPick={file=>void replace(file)} onRemove={()=>{generation.current++;setLocalReceipt(null);setReceiptId(null);setReceiptTouched(true);setExternal(false);setUploadError('')}}/><button className="secondary-button" disabled={!!error||!!uploadError} onClick={()=>void save()}>{t('Save Notes / receipt','บันทึกหมายเหตุ / หลักฐาน')}</button></fieldset>}
 </>}</section>;
}
