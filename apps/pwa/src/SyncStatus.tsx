import React,{useEffect,useRef,useState} from 'react';
import type {OfflinePreparation} from './offline-dataset';
import {pausedSections} from './paused-sections';

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
 if(firstDownload||requestedAt!==null&&navigator.onLine){const percent=Math.floor(preparation.progress);
  return <span className="live-sync-status syncing" role="status"><progress className="header-load-progress" max={100} value={percent} aria-label={t('Sync progress','ความคืบหน้าการซิงค์')}/><span className="header-load-percent" aria-hidden="true">{percent}%</span></span>}
 const failed=preparation.updateFailed?preparation.failedDomains.split(',').filter(Boolean):[];
 if(failed.length){const names=pausedSections(preparation.failedDomains,thai),text=failed.length===1?t(names+' not updated','ยังไม่อัปเดต '+names):t('Update failed','อัปเดตไม่สำเร็จ');
  return <span className="live-sync-status failed" role="status" title={t('Not updated: '+names+'. Saved data remains available; tap refresh to try again.','ยังไม่อัปเดต: '+names+' ข้อมูลที่บันทึกยังใช้ได้ แตะรีเฟรชเพื่อลองอีกครั้ง')}>{text}</span>}
 if(at===null)return preparation.state==='incomplete'?<span className="live-sync-status failed" role="status" title={t('Saved data is not complete yet; tap refresh to continue.','ข้อมูลที่บันทึกยังไม่ครบ แตะรีเฟรชเพื่อทำต่อ')}>{t('Download incomplete','ดาวน์โหลดไม่ครบ')}</span>:null;
 const stale=Date.now()-at>=STALE_MS,time=clock(thai,at);
 return <span className={'live-sync-status'+(stale?' stale':'')} role="status">{stale?t('Saved data from '+time,'ข้อมูล ณ '+time):t('Updated '+time,'อัปเดต '+time)}</span>;
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
