import React,{useEffect,useRef,useState} from 'react';
import type {OfflinePreparation} from './offline-dataset';
import {pausedSections,shortSectionName} from './paused-sections';

const STALE_MS=10*60*1000,NOT_STARTED_MS=2000;
const clock=(thai:boolean,at:number)=>new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
/** The status left of the header refresh icon (owner, 17 October 2026: one refresh icon does everything).
 * While the first download runs, or a sync started with the refresh icon (mw-offline-prepare with
 * detail.all) is checking its domains, it shows a progress bar and percentage; then the time of the
 * last completed check, "Updated HH:MM", or "Saved data from HH:MM" after ~10 minutes. Failed domains
 * read "Cash not updated" (several: "Update failed") until a check succeeds. Automatic checks (poll,
 * focus) stay quiet and only move the time. It is text, not a control. */
export function SyncStatus({preparation,thai}:{preparation:OfflinePreparation;thai:boolean}){
 const [,tick]=useState(0),[requestedAt,setRequestedAt]=useState<number|null>(null),seenPending=useRef(false);
 useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const manual=(event:Event)=>{if((event as CustomEvent).detail?.all&&navigator.onLine)setRequestedAt(current=>{if(current===null)seenPending.current=false;return current??Date.now()})};window.addEventListener('mw-offline-prepare',manual);return()=>window.removeEventListener('mw-offline-prepare',manual)},[]);
 useEffect(()=>{
  if(requestedAt===null)return;
  // Finished once the data domains it queued are checked: a check that was already in flight
  // and completes first does not end it, and a queued domain waiting for a screen read still counts.
  if(preparation.domainsPending)seenPending.current=true;
  if(seenPending.current?!preparation.domainsPending:Date.now()-requestedAt>=NOT_STARTED_MS){setRequestedAt(null);return}
  if(seenPending.current)return;
  const timer=setTimeout(()=>setRequestedAt(null),NOT_STARTED_MS-(Date.now()-requestedAt));return()=>clearTimeout(timer);
 },[requestedAt,preparation.domainsPending]);
 const t=(en:string,th:string)=>thai?th:en,at=preparation.lastChecked;
 const firstDownload=preparation.syncActive&&(preparation.state!=='ready'||preparation.foreground);
 // HDR-SYNC-03: only state changes are announced. The syncing and failed variants are polite live regions (keyed, so a
 // variant is a fresh element rather than a role flipping on one span); the time variant has no role, so a minute tick is silent.
 // HDR-SYNC-PCT-01: the percentage sits above the bar (owner, 17 October 2026), so it comes first in the DOM.
 if(firstDownload||requestedAt!==null&&navigator.onLine){const percent=Math.floor(preparation.progress);
  return <span key="syncing" className="live-sync-status syncing" role="status"><span className="visually-hidden">{t('Syncing…','กำลังซิงค์…')}</span><span className="header-load-percent" aria-hidden="true">{percent}%</span><progress className="header-load-progress" max={100} value={percent} aria-label={t('Sync progress','ความคืบหน้าการซิงค์')}/></span>}
 const failed=preparation.updateFailed?preparation.failedDomains.split(',').filter(Boolean):[];
 // HDR-SYNC-01/02/04: one failed section shows its short name (Thai keeps the name on one line); the full names and the
 // advice are visually hidden detail instead of a title, which touch cannot open.
 if(failed.length){const names=pausedSections(preparation.failedDomains,thai),short=shortSectionName(failed[0],thai);
  return <span key="failed" className="live-sync-status failed" role="status">{failed.length>1?t('Update failed','อัปเดตไม่สำเร็จ'):thai?<>ยังไม่อัปเดต <span className="sync-section">{short}</span></>:short+' not updated'}<span className="visually-hidden">{t(' Not updated: '+names+'. Saved data is still available; refresh to try again.',' ยังไม่อัปเดต: '+names+' ข้อมูลที่บันทึกยังใช้ได้ รีเฟรชเพื่อลองอีกครั้ง')}</span></span>}
 if(at===null)return preparation.state==='incomplete'?<span key="failed" className="live-sync-status failed" role="status">{t('Download incomplete','ดาวน์โหลดไม่ครบ')}<span className="visually-hidden">{t(' Saved data is not complete yet; refresh to continue.',' ข้อมูลที่บันทึกยังไม่ครบ รีเฟรชเพื่อทำต่อ')}</span></span>:null;
 const stale=Date.now()-at>=STALE_MS,time=clock(thai,at);
 return <span key="time" className={'live-sync-status'+(stale?' stale':'')}>{stale?t('Saved data from '+time,'ข้อมูล ณ '+time):t('Updated '+time,'อัปเดต '+time)}</span>;
}
/** SYNC-UX-07/R01/R06: a brief notice when changes that waited in the queue reach
 * the server. The live region stays mounted (empty when idle) so it is announced. */
export function SyncedToast({thai}:{thai:boolean}){
 const [count,setCount]=useState(0);
 useEffect(()=>{
  let batch=0,hide:ReturnType<typeof setTimeout>|undefined,flush:ReturnType<typeof setTimeout>|undefined;
  const synced=()=>{batch++;clearTimeout(flush);flush=setTimeout(()=>{setCount(batch);batch=0;clearTimeout(hide);hide=setTimeout(()=>setCount(0),4000)},1500)};
  window.addEventListener('mw-offline-synced',synced);
  return()=>{window.removeEventListener('mw-offline-synced',synced);clearTimeout(flush);clearTimeout(hide)};
 },[]);
 return <p role="status" aria-live="polite" className={'sync-toast'+(count?'':' idle')}>{count?thai?'ซิงค์รายการที่บันทึกไว้แล้ว '+count+' รายการ':count+' saved '+(count===1?'change':'changes')+' synced':''}</p>;
}
