import React,{useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {beginRequest} from './request-activity';
/** One immutable request survives navigation and uncertain transport. Never auto-dispatch. */
export function OperationConfirm({access,command,domain,label,thai,recovery=false,draftKey,children,onBack,onApplied}:{access:CommandAccess;command:any;domain:string;label:string;thai:boolean;recovery?:boolean;draftKey?:string;children?:React.ReactNode;onBack:()=>void;onApplied:(result:any)=>void}){
 const t=(en:string,th:string)=>thai?th:en,payload=useRef(command),generation=useRef(0),inflight=useRef(false);
 const [busy,setBusy]=useState(false),[unknown,setUnknown]=useState(recovery),[error,setError]=useState(''),[retry,setRetry]=useState(false),[rejected,setRejected]=useState(false);
 useEffect(()=>()=>{generation.current++},[]);
 async function request(method:'GET'|'POST'){
  if(inflight.current||access.offlineOnly||!navigator.onLine)return;
  inflight.current=true;setBusy(true);setError('');setRetry(false);const current=generation.current,done=beginRequest();
  if(method==='POST'){
   let retained=false;try{if(!access.offline)throw Error();await access.offline.savePending(payload.current.requestId,{domain,command:payload.current,borrowerLabel:label,recoveryKind:'action'});retained=true;if(draftKey)await access.offline.remove('draft',draftKey);}catch{if(retained)setUnknown(true);inflight.current=false;setBusy(false);done();setError(t('Request not sent. Device storage is unavailable or full.','ยังไม่ได้ส่งคำขอ พื้นที่จัดเก็บใช้ไม่ได้หรือเต็ม'));return;}
   if(current!==generation.current){inflight.current=false;done();return;}setUnknown(true);
  }
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(access.origin+'/api/operations'+(method==='GET'?'/'+payload.current.requestId:''),{method,headers:{Authorization:'Bearer '+await access.token(),'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(payload.current):undefined,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
   if(response.status===401||response.status===403)access.authFailure(response.status);
   const data=await response.json();if(current!==generation.current)return;
   if([400,413,415].includes(response.status)||(response.status===422&&data.kind!=='recorded')){
    await access.offline?.remove('pending',payload.current.requestId);if(current!==generation.current)return;setRejected(true);setUnknown(false);setError(t('The request was not accepted. Return and check the entered values or receipt.','ไม่รับคำขอนี้ กลับไปตรวจสอบข้อมูลหรือหลักฐาน'));return;
   }
   if(data.kind==='recorded'){
    try{await access.offline?.remove('pending',payload.current.requestId)}catch{window.dispatchEvent(new Event('mw-offline-save-failed'))}if(current!==generation.current)return;
    if(data.originalOutcome.status==='applied'){onApplied(data.originalOutcome.result);return;}
    setRejected(true);setUnknown(false);setError(data.originalOutcome.code==='source_conflict'||data.originalOutcome.code==='plan_changed'?t('The source changed. Return and review current details.','ข้อมูลเปลี่ยนแล้ว กลับไปตรวจสอบรายละเอียดปัจจุบัน'):t('The change was not applied. Return and check the record.','ไม่ได้เปลี่ยนแปลงข้อมูล กลับไปตรวจสอบรายการ'));return;
   }
   if(response.status===409){setRejected(true);setUnknown(false);setError(t('This request conflicts with its original recorded content.','คำขอนี้ไม่ตรงกับข้อมูลเดิมที่บันทึกไว้'));return;}
   setUnknown(true);setRetry(method==='GET'&&response.ok&&data.kind==='unresolved');setError(t('Outcome unknown. Check the same request before another change.','ยังไม่ทราบผล ตรวจสอบคำขอเดิมก่อนเปลี่ยนแปลงอีกครั้ง'));
  }catch{if(current===generation.current){setUnknown(true);setError(t('Outcome unknown. Check this request when connected.','ยังไม่ทราบผล ตรวจสอบคำขอนี้เมื่อเชื่อมต่อ'))}}
  finally{clearTimeout(timer);done();inflight.current=false;if(current===generation.current)setBusy(false)}
 }
 return <section className="borrower-record" aria-label={label} aria-busy={busy}><div className="related-loans-heading"><button className="icon-action" disabled={busy||unknown} aria-label={t('Back to details','กลับรายละเอียด')} onClick={onBack}>←</button><h2>{label}</h2></div>{children}{error&&<p role="alert">{error}</p>}{unknown?<><p>{t('Request reference','รหัสคำขอ')}: <code>{payload.current.requestId}</code></p><button disabled={busy||access.offlineOnly||!navigator.onLine} onClick={()=>void request('GET')}>{t('Check request','ตรวจสอบคำขอ')}</button>{retry&&<button disabled={busy||access.offlineOnly||!navigator.onLine} onClick={()=>void request('POST')}>{t('Retry same request','ลองส่งคำขอเดิมอีกครั้ง')}</button>}</>:!rejected&&<button disabled={busy||access.offlineOnly||!navigator.onLine} onClick={()=>void request('POST')}>{t('Confirm','ยืนยัน')}</button>}</section>;
}
