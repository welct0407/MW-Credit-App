import {useEffect,useRef,useState} from 'react';
import {Icon} from './Icon';
import {pausedSections} from './paused-sections';
import type {OfflinePreparation} from './offline-dataset';

/** UX-RECON-01..07 (owner, 19 October 2026): a reconciliation mismatch that persisted after its single heal
 * (offline-dataset.ts dataCheckDomains, stored in IndexedDB meta) is shown on the Saved changes page, as a header
 * indicator on every screen, as a dot on the side-menu "All synced" button, and once as a toast. */
const clock=(thai:boolean,at:number)=>new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
export const DATA_CHECK_WARNING_ID='data-check-warning';
/** Scrolls to an element once a navigation has rendered it (a few frames at most). */
export function revealWhenShown(selector:string){let tries=0;const seek=()=>{const element=document.querySelector(selector);if(element){element.scrollIntoView({block:'center'});return}if(++tries<60)requestAnimationFrame(seek)};requestAnimationFrame(seek)}
export const dataCheckLabel=(thai:boolean)=>thai?'การตรวจข้อมูลพบความแตกต่าง':'Data check found a difference';
/** UX-RECON-01: the full section names joined as the paused-sections status joins them, and the check time. */
export function dataCheckMessage(domains:string,at:number|null,thai:boolean){
 const area=pausedSections(domains,thai),time=at===null?'':' '+(thai?'(ตรวจ '+clock(thai,at)+')':'(checked '+clock(thai,at)+')');
 return (thai?'การตรวจข้อมูลพบความแตกต่างใน'+area+' ข้อมูลที่บันทึกอาจไม่เป็นปัจจุบัน กดซิงค์ทั้งหมด หากข้อความนี้ยังอยู่ ให้ส่งไฟล์การแก้ปัญหาจากหน้าเกี่ยวกับให้เจ้าของ':'Data check found a difference in '+area+'. Your saved data may be out of date. Run Full sync. If this message stays, send the troubleshooting file from About to the owner.')+time;
}
/** UX-RECON-02: inside the Full sync section, directly above the button. */
export function DataCheckWarning({preparation,thai,onTroubleshooting}:{preparation:OfflinePreparation;thai:boolean;onTroubleshooting?:()=>void}){
 if(!preparation.dataCheckDomains)return null;
 return <p id={DATA_CHECK_WARNING_ID} className="field-help data-check-warning" role="status"><Icon name="warning"/> {dataCheckMessage(preparation.dataCheckDomains,preparation.dataCheckAt,thai)}{onTroubleshooting&&<> <button type="button" className="data-check-link" onClick={onTroubleshooting}>{thai?'เปิดการแก้ปัญหา':'Open troubleshooting'}</button></>}</p>;
}
/** UX-RECON-06: beside the header refresh icon on every screen; opens the Saved changes page at the warning. */
export function DataCheckIndicator({preparation,thai,onOpen}:{preparation:OfflinePreparation;thai:boolean;onOpen:()=>void}){
 if(!preparation.dataCheckDomains)return null;
 const label=dataCheckLabel(thai);
 return <button type="button" className="live-header-refresh data-check-indicator" aria-label={label} title={label} onClick={onOpen}><span className="data-check-badge" aria-hidden="true"><Icon name="warning"/></span></button>;
}
/** UX-RECON-07: one notice per new occurrence (the coordinator publishes it only when a flag is first stored). */
export function DataCheckToast({preparation,thai}:{preparation:OfflinePreparation;thai:boolean}){
 const [text,setText]=useState(''),shown=useRef(''),notice=preparation.dataCheckNotice;
 useEffect(()=>{
  if(!notice||notice===shown.current)return;shown.current=notice;
  const area=pausedSections(notice.split('|')[1]??'',thai);
  setText(thai?'การตรวจข้อมูลพบความแตกต่างใน'+area+' แตะไอคอนเตือนเพื่อดูรายละเอียด':'Data check found a difference in '+area+'. Tap the warning icon for details.');
 },[notice,thai]);
 useEffect(()=>{if(!text)return;const hide=setTimeout(()=>setText(''),6000);return()=>clearTimeout(hide)},[text]);
 return <p role="status" aria-live="polite" className={'sync-toast data-check-toast'+(text?'':' idle')}>{text}</p>;
}
