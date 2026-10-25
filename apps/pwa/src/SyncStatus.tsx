import {useEffect,useRef,useState} from 'react';
import type {OfflinePreparation} from './offline-dataset';
import {pausedSections,shortSectionName} from './paused-sections';

const STALE_MS=10*60*1000,NOT_STARTED_MS=2000,ANNOUNCE_MS=5000;
const clock=(thai:boolean,at:number)=>new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
/** The status left of the header refresh icon (owner, 17 October 2026: one refresh icon does everything).
 * While the first download runs, or a sync started with the refresh icon (mw-offline-prepare with
 * detail.all) is checking its domains, it shows a progress bar and percentage; then the time of the
 * last completed check, "Updated HH:MM", or "Saved data from HH:MM" after ~10 minutes. Failed domains
 * read "Cash not updated" (several: "Update failed") until a check succeeds. Automatic checks (poll,
 * focus) stay quiet and only move the time. It is text, not a control. */
export function SyncStatus({preparation,thai,visible}:{preparation:OfflinePreparation;thai:boolean;visible:boolean}){
 const [,tick]=useState(0),[requestedAt,setRequestedAt]=useState<number|null>(null),seenPending=useRef(false);
 const [announcement,setAnnouncement]=useState(''),wasSyncing=useRef(false),fullSync=useRef(false),texts=useRef({start:'',outcome:''}),clearTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const manual=(event:Event)=>{if((event as CustomEvent).detail?.full&&navigator.onLine)fullSync.current=true;if((event as CustomEvent).detail?.all&&navigator.onLine)setRequestedAt(current=>{if(current===null)seenPending.current=false;return current??Date.now()})};window.addEventListener('mw-offline-prepare',manual);return()=>window.removeEventListener('mw-offline-prepare',manual)},[]);
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
 const firstDownload=preparation.syncActive&&(preparation.state!=='ready'||preparation.foreground),syncing=firstDownload||requestedAt!==null&&navigator.onLine;
 const failed=preparation.updateFailed?preparation.failedDomains.split(',').filter(Boolean):[],names=pausedSections(preparation.failedDomains,thai),short=failed.length?shortSectionName(failed[0],thai):'';
 // HDR-SYNC-04: one failed section shows its short name; the hidden detail then carries only the advice, several sections list the full names.
 const failedText=failed.length>1?t('Update failed','อัปเดตไม่สำเร็จ'):t(short+' not updated','ยังไม่อัปเดต '+short),failedDetail=failed.length>1?t('Not updated: '+names+'. Saved data is still available; refresh to try again.','ยังไม่อัปเดต: '+names+' ข้อมูลที่บันทึกยังใช้ได้ รีเฟรชเพื่อลองอีกครั้ง'):t('Saved data is still available; refresh to try again.','ข้อมูลที่บันทึกยังใช้ได้ รีเฟรชเพื่อลองอีกครั้ง');
 const incomplete=at===null&&preparation.state==='incomplete',incompleteDetail=t('Saved data is not complete yet; refresh to continue.','ข้อมูลที่บันทึกยังไม่ครบ รีเฟรชเพื่อทำต่อ');
 const stale=at!==null&&Date.now()-at>=STALE_MS,time=at===null?'':clock(thai,at),timeText=stale?t('Saved data from '+time,'ข้อมูล ณ '+time):t('Updated '+time,'อัปเดต '+time);
 // HDR-SYNC-03: one hidden live region that is never re-mounted receives only transitions: "Syncing…" when a tap-started sync
 // or the first download begins, then its outcome (the time, or the failure sentence). Minute ticks and quiet automatic checks
 // never write to it, and the visible variants carry no role.
 texts.current={start:t('Syncing…','กำลังซิงค์…'),outcome:failed.length?failedText+'. '+failedDetail:incomplete?t('Download incomplete','ดาวน์โหลดไม่ครบ')+'. '+incompleteDetail:at===null?'':fullSync.current?t('Full sync complete · '+timeText,'ซิงค์ทั้งหมดเสร็จแล้ว · '+timeText):timeText};
 // Each announcement is cleared after ~5 s (like the synced toast), so it is not read twice and a stale time is never re-read.
 useEffect(()=>{const text=syncing&&!wasSyncing.current?texts.current.start:!syncing&&wasSyncing.current?texts.current.outcome:null;wasSyncing.current=syncing;if(text===null)return;if(!syncing)fullSync.current=false;setAnnouncement(text);clearTimeout(clearTimer.current);clearTimer.current=setTimeout(()=>setAnnouncement(''),ANNOUNCE_MS)},[syncing]);
 useEffect(()=>()=>clearTimeout(clearTimer.current),[]);
 const region=<span className="visually-hidden sync-announcement" role="status" aria-live="polite">{announcement}</span>;
 if(!visible)return region;
 // HDR-SYNC-PCT-01: the percentage sits above the bar (owner, 17 October 2026), so it comes first in the DOM.
 if(syncing){const percent=Math.floor(preparation.progress);
  return <>{region}<span className="live-sync-status syncing"><span className="header-load-percent" aria-hidden="true">{percent}%</span><progress className="header-load-progress" max={100} value={percent} aria-label={t('Sync progress','ความคืบหน้าการซิงค์')}/></span></>}
 // HDR-SYNC-01/02/09: Thai keeps the section name, and "ไม่ครบ", on one line (.sync-section); the advice is visually hidden detail, not a title.
 if(failed.length)return <>{region}<span className="live-sync-status failed">{failed.length>1||!thai?failedText:<>ยังไม่อัปเดต <span className="sync-section">{short}</span></>}<span className="visually-hidden">{' '+failedDetail}</span></span></>;
 if(incomplete)return <>{region}<span className="live-sync-status failed">{thai?<>ดาวน์โหลด<span className="sync-section">ไม่ครบ</span></>:'Download incomplete'}<span className="visually-hidden">{' '+incompleteDetail}</span></span></>;
 if(at===null)return region;
 return <>{region}<span className={'live-sync-status'+(stale?' stale':'')}>{timeText}</span></>;
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
