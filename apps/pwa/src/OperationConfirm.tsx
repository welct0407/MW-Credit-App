import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import React,{useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {syncSavedRequest} from './offline-sync';
/** Confirmation durably queues one immutable request; synchronization owns transport. */
export function OperationConfirm({access,command,domain,label,thai,recovery=false,draftKey,receipt,children,onBack,onApplied}:{access:CommandAccess;command:any;domain:string;label:string;thai:boolean;recovery?:boolean;draftKey?:string;receipt?:{id:string;image:Blob;borrowerId?:string};children?:React.ReactNode;onBack:()=>void;onApplied:(result:any)=>void}){
 const t=(en:string,th:string)=>thai?th:en,payload=useRef(command),inflight=useRef(false),applied=useRef(false);
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(recovery),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
 const accept=useRef((outcome:any)=>{});accept.current=outcome=>{if(outcome.kind==='synced'&&!applied.current){applied.current=true;onApplied(outcome.data?.originalOutcome?.result)}else if(outcome.kind==='blocked'){setBlocked(true);setError(t('This saved change needs attention. Review the current record before making a new change.','รายการที่บันทึกนี้ต้องตรวจสอบ เปิดข้อมูลปัจจุบันก่อนทำรายการใหม่'))}};
 useEffect(()=>{const outcome=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.requestId===payload.current.requestId)accept.current(detail)};window.addEventListener('mw-offline-sync-outcome',outcome);return()=>window.removeEventListener('mw-offline-sync-outcome',outcome)},[]);
 async function save(){if(inflight.current)return;inflight.current=true;setBusy(true);setError('');try{
  if(!access.offline)throw Error();
  if(!saved){await access.offline.savePending(payload.current.requestId,{domain,command:payload.current,borrowerLabel:label,recoveryKind:'action',...(receipt?{receipt}:{})});setSaved(true);if(draftKey)await access.offline.remove('draft',draftKey);}
  accept.current(await syncSavedRequest(access,payload.current.requestId));
 }catch{setError(t('The change could not be saved on this device. Keep this page open and try again.','บันทึกบนอุปกรณ์ไม่ได้ โปรดเปิดหน้านี้ไว้แล้วลองอีกครั้ง'))}finally{inflight.current=false;setBusy(false)}}
 return <section className="borrower-record" aria-label={label} aria-busy={busy}><div className="related-loans-heading"><HeaderBack navigationKey={'operation-confirm:'+domain} className="icon-action" disabled={busy} aria-label={t('Back to details','กลับรายละเอียด')} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{label}</h2></div>{children}{error&&<p role="alert">{error}</p>}{saved?<><p role="status">{blocked?t('Needs attention','ต้องตรวจสอบ'):t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ')}</p><p>{t('Request reference','รหัสคำขอ')}: <code>{payload.current.requestId}</code></p>{!blocked&&<button type="button" disabled={busy||access.offlineOnly||!navigator.onLine} onClick={()=>void save()}>{t('Sync now','ซิงค์ตอนนี้')}</button>}</>:<button type="button" disabled={busy} onClick={()=>void save()}>{t('Confirm','ยืนยัน')}</button>}</section>;
}
