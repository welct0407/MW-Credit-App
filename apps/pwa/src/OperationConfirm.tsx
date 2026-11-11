import {useAppUpdateBlock} from './app-update-safety';
import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import type React from 'react';
import {useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {busyMessage,onlineOnlyOperation,sendOnlineOnly,syncSavedRequest,savedRejectionMessage} from './offline-sync';
/** Confirmation durably queues one immutable request; synchronization owns transport. */
/** onBlocked (R104) hears the rejection code of a blocked request, after the generic message is set. R118: rejectionText may
 * name a rejection more precisely than the generic message (the late charge below what was paid); null keeps the generic one. */
// R140 (Echo EXP-NEW-2, 16): opt-in confirmLabel and editLabel put the actions in the sticky actions bar (Confirm plus a
// secondary Edit that returns to the form); plainHeading drops the title strip. Without them the screen is unchanged.
export function OperationConfirm({access,command,domain,label,thai,recovery=false,draftKey,receipt,children,onBack,onApplied,onBlocked,rejectionText,confirmLabel,editLabel,plainHeading=false}:{access:CommandAccess;command:any;domain:string;label:string;thai:boolean;recovery?:boolean;draftKey?:string;receipt?:{id:string;image:Blob;borrowerId?:string};children?:React.ReactNode;onBack:()=>void;onApplied:(result:any)=>void;onBlocked?:(code:string)=>void;rejectionText?:(code:string)=>string|null;confirmLabel?:string;editLabel?:string;plainHeading?:boolean}){
 const t=(en:string,th:string)=>thai?th:en,payload=useRef(command),inflight=useRef(false),applied=useRef(false);
 const [busy,setBusy]=useState(false),[saved,setSaved]=useState(recovery),[error,setError]=useState(''),[blocked,setBlocked]=useState(false);
 // R129: an online-only operation (a rebate settlement) is sent directly and never stored in the offline queue; after a busy
 // or unknown answer it is reconciled under the same request id (Check again reads its status before sending again).
 const onlineOnly=onlineOnlyOperation(payload.current?.operation),attempted=useRef(false),[unsettled,setUnsettled]=useState<'busy'|'unknown'|null>(null);
 useAppUpdateBlock(!saved||busy);
 const accept=useRef((_outcome:any)=>{});accept.current=outcome=>{if(outcome.kind==='synced'&&!applied.current){applied.current=true;onApplied(outcome.data?.originalOutcome?.result)}else if(outcome.kind==='blocked'){const code=outcome.code??outcome.data?.originalOutcome?.code??outcome.data?.code??'request_rejected';setBlocked(true);setError(rejectionText?.(code)??savedRejectionMessage(outcome,thai));onBlocked?.(code)}};
 useEffect(()=>{const outcome=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.requestId===payload.current.requestId)accept.current(detail)};window.addEventListener('mw-offline-sync-outcome',outcome);return()=>window.removeEventListener('mw-offline-sync-outcome',outcome)},[]);
 useEffect(()=>{let active=true;void access.offline?.pending(payload.current.requestId).then(row=>{if(active&&row?.sync?.state==='blocked'){setSaved(true);accept.current({kind:'blocked',code:row.sync.code,data:row.sync.outcome})}}).catch(()=>{});return()=>{active=false}},[access.offline]);
 async function send(){inflight.current=true;setBusy(true);setError('');
  try{const result=await sendOnlineOnly(access,payload.current,{check:attempted.current});
   if(result.kind!=='offline')attempted.current=true;
   if(result.kind==='synced'){setUnsettled(null);accept.current({kind:'synced',data:result.data});return;}
   if(result.kind==='blocked'){setUnsettled(null);accept.current({kind:'blocked',code:result.code,data:result.data});return;}
   if(result.kind==='busy'){setUnsettled('busy');setError(busyMessage(thai).replace(/ Retrying automatically\.| กำลังลองใหม่อัตโนมัติ/,''));return;}
   if(result.kind==='offline'){setError(t('Needs the network. Connect and confirm again.','ต้องเชื่อมต่ออินเทอร์เน็ต เชื่อมต่อแล้วยืนยันอีกครั้ง'));return;}
   setUnsettled('unknown');setError(t('The result is not known yet. Check again before doing anything else; it is checked under the same request.','ยังไม่ทราบผล โปรดตรวจสอบอีกครั้งก่อนทำรายการอื่น ระบบตรวจสอบด้วยคำขอเดิม'));
  }finally{inflight.current=false;setBusy(false)}}
 async function save(){if(inflight.current||blocked)return;
  if(onlineOnly&&!saved){await send();return;}
  inflight.current=true;setBusy(true);setError('');try{
  if(!access.offline)throw Error();
  if(!saved){await access.offline.savePending(payload.current.requestId,{domain,command:payload.current,borrowerLabel:label,recoveryKind:'action',...(receipt?{receipt}:{})});setSaved(true);if(draftKey)await access.offline.remove('draft',draftKey);}
  accept.current(await syncSavedRequest(access,payload.current.requestId));
 }catch{setError(t('The change could not be saved on this device. Keep this page open and try again.','บันทึกบนอุปกรณ์ไม่ได้ โปรดเปิดหน้านี้ไว้แล้วลองอีกครั้ง'))}finally{inflight.current=false;setBusy(false)}}
 return <section className="borrower-record" aria-label={label} aria-busy={busy}><div className={'related-loans-heading'+(plainHeading?' expense-form-heading':'')}><HeaderBack navigationKey={'operation-confirm:'+domain} className="icon-action" disabled={busy} aria-label={t('Back to details','กลับรายละเอียด')} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{label}</h2></div>{children}{error&&<p role="alert">{error}</p>}{saved?<><p role="status">{blocked?t('Change could not be applied','ดำเนินการไม่สำเร็จ'):t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ')}</p><p>{t('Request reference','รหัสคำขอ')}: <code>{payload.current.requestId}</code></p>{!blocked&&<button type="button" disabled={busy||access.offlineOnly||!navigator.onLine} onClick={()=>void save()}>{t('Sync now','ซิงค์ตอนนี้')}</button>}</>:<>{unsettled&&<p>{t('Request reference','รหัสคำขอ')}: <code>{payload.current.requestId}</code></p>}{(()=>{const confirm=<button type="button" className={editLabel?'operation-confirm-primary':undefined} disabled={busy||blocked||(onlineOnly&&(access.offlineOnly||!navigator.onLine))} onClick={()=>void save()}>{unsettled?t('Check again','ตรวจสอบอีกครั้ง'):confirmLabel??t('Confirm','ยืนยัน')}</button>;
  return editLabel&&!unsettled?<div className="form-sticky-actions expense-form-actions">{confirm}<button type="button" className="secondary-button" disabled={busy} onClick={onBack}>{editLabel}</button></div>:confirm})()}</>}</section>;
}
