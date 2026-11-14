import {Icon} from './Icon';
import {useContextRefresh} from './context-refresh';
import type React from 'react';
import {useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import {useOnline} from './online-status';
import {getOfflinePreparation,subscribeOfflinePreparation} from './offline-dataset';
import {DataCheckWarning} from './DataCheck';
import {displayTimestamp} from './display-date';
import type {CommandAccess} from './SelectedCharges';
import {discardSavedRequest,savedChangeDraftKey,syncSavedRequest,syncSavedRequests,savedRejectionMessage} from './offline-sync';
import {HeaderBack} from './HeaderBack';
import {BorrowerRecord} from './BorrowerRecord';
import {LoanRecord} from './LoanRecord';
import {ChargeRecord} from './ChargeRecord';
import {PaymentRecord} from './PaymentRecord';
import {ExpenseRecords} from './ExpenseRecords';
import {useListReturn} from './list-return';
/** UX-FULL-01..06 (owner, 19 October 2026; on this page since the owner's 19 October move): Full sync sends saved
 * changes first, then walks every domain from the start (mw-offline-prepare {all, full}); the stored data stays
 * readable and each domain is replaced only when its walk commits. Shown even when nothing is waiting. */
function FullSync({access,thai,busy,rows,onTroubleshooting,onStatus,onDiscarded}:{access:CommandAccess;thai:boolean;busy:boolean;rows:any[];onTroubleshooting?:()=>void;onStatus:(text:string)=>void;onDiscarded:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,online=useOnline(),[starting,setStarting]=useState(false),[choice,setChoice]=useState<{drafts:number}|null>(null),dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),opener=useRef<HTMLButtonElement>(null),titleId=useId(),bodyId=useId();
 const preparation=useSyncExternalStore(subscribeOfflinePreparation,()=>getOfflinePreparation(access.offline?.scopeName));
 const unavailable=!online||!!access.offlineOnly,running=starting||busy||preparation.fullSync,label=unavailable?t('Full sync needs a connection','ซิงค์ทั้งหมดต้องเชื่อมต่ออินเทอร์เน็ต'):t('Full sync','ซิงค์ทั้งหมด');
 // R156 D5/D7: with saved changes waiting, a dialog (initial focus Cancel, the destructive choice last) replaces the confirm.
 useEffect(()=>{const element=dialog.current;if(!choice||!element)return;if(!element.open)element.showModal();cancel.current?.focus()},[choice]);
 const close=()=>{dialog.current?.close();setChoice(null);opener.current?.focus()};
 const prepare=()=>window.dispatchEvent(new CustomEvent('mw-offline-prepare',{detail:{all:true,full:true}}));
 async function send(){
  setStarting(true);
  try{await syncSavedRequests(access);window.dispatchEvent(new Event('mw-offline-saved'))}catch{/* The full sync runs whatever the saved changes' outcome; they stay queued. */}
  finally{prepare();setStarting(false)}
 }
 async function run(){
  if(starting||busy||preparation.fullSync||!navigator.onLine||access.offlineOnly)return;
  if(rows.length&&access.offline){const drafts=(await access.offline.list('draft').catch(()=>[])).length;setChoice({drafts});return}
  if(!window.confirm(t('Re-download all data? Saved data stays usable; this takes about 20 seconds.','ดาวน์โหลดข้อมูลทั้งหมดใหม่หรือไม่ ข้อมูลที่บันทึกยังใช้ได้ ใช้เวลาประมาณ 20 วินาที')))return;
  await send();
 }
 // Discard all: every saved change is checked and discarded one by one (discardSavedRequest), every draft is removed, then
 // every domain walks. A change found applied is kept as applied; one that cannot be checked stays.
 async function discardAll(){
  close();if(!access.offline)return;setStarting(true);let discarded=0,applied=0,kept=0,draftsRemoved=0;
  try{
   const removed=new Set<string>(),keptDrafts=new Set<string>();
   for(const row of [...rows].sort((a,b)=>a.savedAt-b.savedAt)){const id=row.key.slice('pending:'.length);if(removed.has(id))continue;
    const result=await discardSavedRequest(access,id);
    if(result.result==='discarded'){for(const value of result.removed)removed.add(value);discarded+=result.removed.length}else if(result.result==='applied')applied++;
    else if(result.result!=='missing'){kept++;const key=savedChangeDraftKey(row.value);if(key)keptDrafts.add(key)}}
   // The drafts of the changes kept (not checked) stay with them; every other draft goes.
   for(const draft of await access.offline.list('draft').catch(()=>[])){const key=draft.key.slice('draft:'.length);if(!keptDrafts.has(key)&&await access.offline.remove('draft',key).then(()=>true,()=>false))draftsRemoved++}
   // UX-FSYNC-05: only the parts that happened, with the drafts removed.
   const parts=thai?[discarded&&`ทิ้งรายการที่บันทึก ${discarded} รายการ`,applied&&`ถูกนำไปใช้แล้ว ${applied} รายการ`,kept&&`เก็บไว้ ${kept} รายการ (ตรวจสอบไม่ได้)`,draftsRemoved&&`ลบแบบร่าง ${draftsRemoved} รายการ`]
    :[discarded&&`Discarded ${discarded} saved change${discarded===1?'':'s'}.`,applied&&`${applied} already applied.`,kept&&`Kept ${kept} (could not be checked).`,draftsRemoved&&`Removed ${draftsRemoved} draft${draftsRemoved===1?'':'s'}.`];
   onStatus(parts.filter(Boolean).join(' ')||t('Nothing was discarded.','ไม่มีรายการที่ถูกทิ้ง'));
  }finally{window.dispatchEvent(new Event('mw-offline-saved'));prepare();setStarting(false);onDiscarded()}
 }
 const n=rows.length;
 return <div className="full-sync-section"><DataCheckWarning preparation={preparation} thai={thai} onTroubleshooting={onTroubleshooting}/><button ref={opener} type="button" className="secondary-button full-sync-button" disabled={unavailable||running} aria-busy={running||undefined} title={label} onClick={()=>void run()}><Icon name="refresh"/> {t('Full sync','ซิงค์ทั้งหมด')}</button>
  {choice&&<dialog ref={dialog} className="saved-discard-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event=>{event.preventDefault();close()}}>
   <h3 id={titleId}>{t(n===1?'1 saved change is not synced':`${n} saved changes are not synced`,`มีรายการที่บันทึก ${n} รายการยังไม่ซิงค์`)}</h3>
   <p id={bodyId}>{t(`Send tries to apply them first; any that fail stay saved here. Discard removes them${choice.drafts?`, and ${choice.drafts} unfinished draft${choice.drafts===1?'':'s'},`:''} from this device; changes already applied are kept.`,`ส่ง: ระบบจะลองนำไปใช้ก่อน รายการที่ไม่สำเร็จจะยังเก็บไว้ ทิ้ง: รายการเหล่านี้${choice.drafts?`และแบบร่าง ${choice.drafts} รายการ`:''}จะถูกลบจากอุปกรณ์นี้ รายการที่ถูกนำไปใช้แล้วยังคงอยู่`)}</p>
   <div className="saved-discard-actions"><button ref={cancel} type="button" className="secondary-button" onClick={close}>{t('Cancel','ยกเลิก')}</button><button type="button" className="saved-send-button" onClick={()=>{close();void send()}}>{t('Send saved changes, then re-download','ส่งรายการที่บันทึกก่อน แล้วดาวน์โหลดใหม่')}</button><button type="button" className="destructive-action" onClick={()=>void discardAll()}>{t('Discard unsynced changes and re-download','ทิ้งรายการที่ยังไม่ซิงค์แล้วดาวน์โหลดใหม่')}</button></div>
  </dialog>}</div>;
}
export function OfflinePayments({access,thai,onTroubleshooting}:{access:CommandAccess;thai:boolean;onTroubleshooting?:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,[rows,setRows]=useState<any[]>([]),[locked,setLocked]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<any>(null),[syncing,setSyncing]=useState(false),[syncStatus,setSyncStatus]=useState(''),syncFlight=useRef(false);
 // R156 D4/D7: Discard on every saved change (and in its details), confirmed in a dialog; the result in role=status.
 const [confirm,setConfirm]=useState<{row:any;origin:HTMLElement|null;dependants:number}|null>(null),[discarding,setDiscarding]=useState<string|null>(null),[discardStatus,setDiscardStatus]=useState('');
 const focusAfter=useRef<{next:string|null;origin:HTMLElement|null}|null>(null),confirmDialog=useRef<HTMLDialogElement>(null),confirmCancel=useRef<HTMLButtonElement>(null),heading=useRef<HTMLHeadingElement>(null),confirmTitle=useId(),confirmBody=useId();
 useEffect(()=>{const element=confirmDialog.current;if(!confirm||!element)return;if(!element.open)element.showModal();confirmCancel.current?.focus()},[confirm]);
 const kindLabel=(value:any)=>value?.borrowerLabel??value?.label??({borrower:t('Borrower change','แก้ไขผู้กู้'),loan:t('Loan change','แก้ไขสินเชื่อ'),charge:t('Charge change','แก้ไขยอดเรียกเก็บ'),expense:t('Expense change','แก้ไขค่าใช้จ่าย'),management:t('Account change','แก้ไขบัญชี'),preference:t('Preference change','แก้ไขการตั้งค่า')} as Record<string,string>)[value?.domain]??t('Payment','รับชำระ');
 const readOnly=locked||!!access.offlineOnly||!access.offline;
 const requestOf=(row:any)=>row.key.slice('pending:'.length);
 /** The later note changes chained to a saved change (they are discarded with it). */
 const dependantsOf=(row:any)=>{const ids=new Set([requestOf(row)]);for(let grew=true;grew;){grew=false;for(const other of rows){const predecessor=other.value?.notePredecessor?.requestId;if(predecessor&&ids.has(predecessor)&&!ids.has(requestOf(other))){ids.add(requestOf(other));grew=true}}}return ids.size-1};
 const askDiscard=(row:any,origin:HTMLElement|null)=>{setDiscardStatus('');setConfirm({row,origin,dependants:dependantsOf(row)})};
 const closeConfirm=(focus=true)=>{confirmDialog.current?.close();const origin=confirm?.origin;setConfirm(null);if(focus)origin?.focus()};
 async function discard(){
  if(!confirm)return;const row=confirm.row,id=requestOf(row),order=rows.map(requestOf),afterDetails=!!selected;closeConfirm(false);setDiscarding(id);
  try{
   const result=await discardSavedRequest(access,id);
   const also=result.removed.length-1;
   setDiscardStatus(result.result==='discarded'?t('Discarded. Nothing was applied.','ทิ้งแล้ว ไม่มีการนำไปใช้')+(also>0?' '+t(also===1?'Also discarded 1 later note change.':`Also discarded ${also} later note changes.`,`ทิ้งการแก้ไขหมายเหตุที่ต่อกันอีก ${also} รายการ`):''):result.result==='applied'?t('This change was already applied, so it was not discarded.','รายการนี้ถูกนำไปใช้แล้ว จึงไม่ได้ทิ้ง'):result.result==='sending'?t('This change is being sent. Try again in a minute.','กำลังส่งรายการนี้ ลองอีกครั้งในอีกสักครู่'):result.result==='unchecked'?t('Could not check this change with the server. It is kept. Connect and try again.','ตรวจสอบรายการนี้กับเซิร์ฟเวอร์ไม่ได้ จึงเก็บไว้ เชื่อมต่อแล้วลองอีกครั้ง'):'');
   if(result.result==='discarded'||result.result==='applied'){
    if(afterDetails)setSelected(null);
    // Focus moves to the next saved change's first button, or to the page heading when none follows.
    const gone=new Set(result.result==='discarded'?result.removed:[id]),next=order.slice(order.indexOf(id)+1).find(value=>!gone.has(value))??order.slice(0,order.indexOf(id)).reverse().find(value=>!gone.has(value));
    focusAfter.current={next:next??null,origin:null};
   }else focusAfter.current={next:null,origin:confirm.origin};
  }finally{setDiscarding(null);window.dispatchEvent(new Event('mw-offline-saved'))}
 }
 // D7: once the list has settled (the buttons enabled again), focus the next change, the page heading or the button
 // that opened the dialog (a change that was kept).
 useEffect(()=>{const target=focusAfter.current;if(!target||discarding)return;
  if(target.origin){if(target.origin.isConnected){focusAfter.current=null;target.origin.focus()}return}
  if(target.next&&rows.some(row=>requestOf(row)===target.next)){const button=document.querySelector<HTMLElement>(`[data-request-id="${target.next}"] button:not(:disabled)`);if(button){focusAfter.current=null;button.focus()}return}
  focusAfter.current=null;heading.current?.focus();
 });
 const discardButton=(row:any,label:string)=>readOnly?null:<button type="button" className="secondary-button saved-discard-button" aria-label={t('Discard ','ทิ้งรายการนี้ ')+label} disabled={syncing||discarding!==null||row.sync?.state==='syncing'} onClick={event=>askDiscard(row,event.currentTarget)}>{t('Discard','ทิ้งรายการนี้')}</button>;
 const confirmation=confirm&&(()=>{const row=confirm.row,label=kindLabel(row.value),time=displayTimestamp(row.savedAt),sent=row.sync?.attempted!==false,rejected=row.sync?.state==='blocked'&&row.sync?.outcome?.originalOutcome?.status==='rejected',receipt=!!row.value?.receipt,n=confirm.dependants;
  return <dialog ref={confirmDialog} className="saved-discard-dialog" aria-labelledby={confirmTitle} aria-describedby={confirmBody} onCancel={event=>{event.preventDefault();closeConfirm()}}>
   <h3 id={confirmTitle}>{t('Discard this saved change?','ทิ้งรายการที่บันทึกนี้หรือไม่')}</h3>
   <div id={confirmBody}><p>{rejected?t(`${label}, saved ${time}. It was not applied.`,`${label} บันทึกเมื่อ ${time} รายการนี้ไม่ได้ถูกนำไปใช้`):sent?t(`${label}, saved ${time}. The app will first check that it was not applied.`,`${label} บันทึกเมื่อ ${time} ระบบจะตรวจสอบก่อนว่ารายการนี้ยังไม่ถูกนำไปใช้`):t(`${label}, saved ${time}. It was not sent and will not be applied.`,`${label} บันทึกเมื่อ ${time} รายการนี้ยังไม่ได้ส่งและจะไม่ถูกนำไปใช้`)}</p>
    {receipt&&<p>{t('The attached slip photo is removed from this device.','รูปสลิปที่แนบจะถูกลบออกจากอุปกรณ์นี้')}</p>}
    {n>0&&<p>{t(n===1?'1 later note change that depends on it is discarded too.':`${n} later note changes that depend on it are discarded too.`,`การแก้ไขหมายเหตุ ${n} รายการที่ต่อจากรายการนี้จะถูกทิ้งด้วย`)}</p>}</div>
   <div className="saved-discard-actions"><button ref={confirmCancel} type="button" className="secondary-button" onClick={()=>closeConfirm()}>{t('Cancel','ยกเลิก')}</button><button type="button" className="destructive-action" onClick={()=>void discard()}>{t('Discard','ทิ้งรายการนี้')}</button></div>
  </dialog>})();
 // biome-ignore lint/correctness/useExhaustiveDependencies: t derives from thai, so thai is the language trigger; access.offline is the repository identity and t itself is recreated every render
 useEffect(()=>{let active=true;const load=async()=>{try{if(!access.offline){if(active){setLocked(true);setRows([])}return;}const authorized=await access.offline.authorized();const pending=await access.offline.list('pending');if(active){setLocked(!authorized);setRows(pending.sort((a,b)=>b.savedAt-a.savedAt||a.key.localeCompare(b.key)));setError('')}}catch{if(active)setError(t('Saved changes are unavailable on this device.','ไม่สามารถเปิดรายการที่บันทึกบนอุปกรณ์'))}};void load();window.addEventListener('mw-offline-saved',load);window.addEventListener('focus',load);const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer);window.removeEventListener('mw-offline-saved',load);window.removeEventListener('focus',load)}},[access.offline,thai]);
 async function syncNow(){if(syncFlight.current)return;syncFlight.current=true;setSyncing(true);setSyncStatus('');try{const result=await syncSavedRequests(access);setSyncStatus(result.reason==='offline'?t('Waiting for a connection. Saved changes remain on this device.','รอการเชื่อมต่อ รายการที่บันทึกยังอยู่บนอุปกรณ์'):result.reason==='authorization'?t('Reconnect and verify this account to sync saved changes.','เชื่อมต่อและตรวจสอบบัญชีเพื่อซิงค์รายการที่บันทึก'):result.reason==='attention'||result.blocked>0?t('Some changes could not be applied. Reasons are shown below.','บางรายการดำเนินการไม่สำเร็จ แสดงสาเหตุด้านล่าง'):result.reason||result.remaining>0?t('Some changes are still waiting to sync. Try again when connected.','บางรายการยังรอซิงค์ ลองอีกครั้งเมื่อเชื่อมต่อ'):t('Saved changes synced.','ซิงค์รายการที่บันทึกแล้ว'))}catch{setSyncStatus(t('Could not sync. Saved changes remain on this device.','ไม่สามารถซิงค์ รายการที่บันทึกยังอยู่บนอุปกรณ์'))}finally{syncFlight.current=false;setSyncing(false);window.dispatchEvent(new Event('mw-offline-saved'))}}
 const savedReturn=useListReturn();// R131: Back from a saved change returns to its row
 useContextRefresh(!selected,t('Refresh waiting changes','รีเฟรชรายการรอซิงค์'),()=>void syncNow(),10);
 // Without a verified lease the saved rows are listed read-only: sign-out stays blocked by them, so the user must be able to see them.
 if(locked&&!rows.length)return <p>{t('Connect to verify this account before accessing saved records.','เชื่อมต่อเพื่อตรวจสอบบัญชีก่อนเปิดข้อมูลที่บันทึกไว้')}</p>;
 if(selected){const command=selected.value.command??selected.value,domain=selected.value.domain,id=command.targetId;const back=()=>{setSelected(null);savedReturn.restore()};let record:React.ReactNode=null;
  if(id&&domain==='borrower')record=<BorrowerRecord access={access} id={id} thai={thai} onBack={back} onSaved={back}/>;
  else if(id&&domain==='loan')record=<LoanRecord access={access} id={id} thai={thai} onBack={back}/>;
  else if(id&&domain==='charge')record=<ChargeRecord access={access} id={id} thai={thai} onBack={back}/>;
  else if(id&&domain==='payment')record=<PaymentRecord access={access} id={id} thai={thai} onBack={back}/>;
  else if(id&&domain==='expense')record=<ExpenseRecords access={access} initialId={id} thai={thai} onBack={back}/>;
  return <section><HeaderBack navigationKey="saved-change-review" aria-label={t('Back to saved changes','กลับรายการที่บันทึก')} onClick={back}><Icon name="back"/></HeaderBack><h3>{t('Change could not be applied','ดำเนินการไม่สำเร็จ')}</h3><p role="alert">{savedRejectionMessage({code:selected.sync?.code,data:selected.sync?.outcome},thai,command?.operation)}</p><dl>{Object.entries(command.inputs??command).filter(([key,value])=>key!=='requestId'&&value!==null&&typeof value!=='object').map(([key,value])=><div key={key}><dt>{key.replace(/([A-Z])/g,' $1').replace(/^./,letter=>letter.toUpperCase())}</dt><dd>{String(value)}</dd></div>)}</dl>{record}{/* R156 D1/D4: Discard checks a sent change with the server first (it replaces the 16 October "remove anyway"). Read-only access (revoked repository) cannot discard. */}{access.offlineOnly?<p role="status">{t('Connect to verify this account before accessing saved records.','เชื่อมต่อเพื่อตรวจสอบบัญชีก่อนเปิดข้อมูลที่บันทึกไว้')}</p>:discardButton(selected,kindLabel(selected.value))}{discardStatus&&<p role="status">{discardStatus}</p>}{confirmation}</section>;
 }
 return <section aria-label={t('Saved unsynced changes','รายการที่บันทึกและยังไม่ซิงค์')}><h3 ref={heading} tabIndex={-1}>{t('Saved changes','รายการที่บันทึก')}</h3><p>{t('Waiting changes sync automatically when connected. Changes that could not be applied are kept with their failure reasons.','รายการที่รอจะซิงค์อัตโนมัติเมื่อเชื่อมต่อ รายการที่ไม่สำเร็จจะเก็บไว้พร้อมสาเหตุ')}</p><p className="offline-retention-note">{t('Offline data is removed after 7 days without an online check; saved changes are kept until they sync.','ข้อมูลออฟไลน์จะถูกลบหากไม่ได้ตรวจสอบออนไลน์เกิน 7\u00a0วัน รายการที่บันทึกจะเก็บไว้จนกว่าจะซิงค์')}</p>{locked&&<p role="status">{t('Connect to verify this account before accessing saved records.','เชื่อมต่อเพื่อตรวจสอบบัญชีก่อนเปิดข้อมูลที่บันทึกไว้')}</p>}{!locked&&rows.some(row=>row.sync?.state!=='blocked')&&<button type="button" disabled={syncing} aria-busy={syncing} onClick={()=>void syncNow()}>{syncing?t('Syncing…','กำลังซิงค์…'):t('Sync now','ซิงค์ตอนนี้')}</button>}{syncStatus&&<p role="status">{syncStatus}</p>}{discardStatus&&<p role="status" className="saved-discard-status">{discardStatus}</p>}{error&&<p role="alert">{error}</p>}{rows.map(row=>{const value=row.value,command=value.command??value,id=command.requestId,state=row.sync?.state??'queued';const label=kindLabel(value);return <article className="borrower-card saved-change-card" key={row.key} data-request-id={id}><strong>{label}</strong><time>{displayTimestamp(row.savedAt)}</time><span>{state==='syncing'?t('Syncing…','กำลังซิงค์…'):state==='blocked'?savedRejectionMessage({code:row.sync?.code,data:row.sync?.outcome},thai,(row.value?.command??row.value)?.operation):t('Waiting to sync when connected','รอซิงค์เมื่อเชื่อมต่อ')}</span><details><summary>{t('Request reference','รหัสคำขอ')}</summary><code>{id}</code></details>{state==='blocked'?<button type="button" data-record-id={row.key} onClick={event=>{savedReturn.leave(event.currentTarget);setSelected(row)}}>{t('View failure details','ดูรายละเอียดที่ไม่สำเร็จ')}</button>:row.sync?.code&&state==='queued'?<button type="button" disabled={locked||access.offlineOnly||!navigator.onLine} onClick={()=>void syncSavedRequest(access,id)}>{t('Retry sync','ลองซิงค์อีกครั้ง')}</button>:null}{discardButton(row,label)}</article>})}{!rows.length&&<p>{t('No unsynced changes.','ไม่มีรายการที่ยังไม่ซิงค์')}</p>}{access.offline&&<FullSync access={access} thai={thai} busy={syncing||discarding!==null} rows={rows} onTroubleshooting={onTroubleshooting} onStatus={setDiscardStatus} onDiscarded={()=>window.setTimeout(()=>heading.current?.focus(),0)}/>}{confirmation}</section>;
}
