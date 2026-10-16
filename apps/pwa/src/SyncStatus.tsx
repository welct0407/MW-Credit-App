import React,{useEffect,useRef,useState} from 'react';
import type {OfflinePreparation} from './offline-dataset';

const STALE_MS=10*60*1000,SYNCING_FALLBACK_MS=30000;
const clock=(thai:boolean,at:number)=>new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
/** SYNC-UX-03: "Updated HH:MM" from the last completed check; after ~10 minutes it
 * reads "Saved data from HH:MM". Tapping it starts a manual sync of every domain
 * (mw-offline-prepare without a domain bypasses the recheck throttle) and reads
 * "Syncing…" until that cycle completes (SYNC-UX-R03). */
export function SyncStatus({preparation,thai}:{preparation:OfflinePreparation;thai:boolean}){
 const [,tick]=useState(0),[requestedAt,setRequestedAt]=useState<number|null>(null),seenActive=useRef(false);
 useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  if(requestedAt===null)return;
  if(preparation.syncActive)seenActive.current=true;
  const finished=(preparation.lastChecked??0)>=requestedAt||seenActive.current&&!preparation.syncActive;
  if(finished){setRequestedAt(null);return}
  const timer=setTimeout(()=>setRequestedAt(null),SYNCING_FALLBACK_MS-(Date.now()-requestedAt));return()=>clearTimeout(timer);
 },[requestedAt,preparation.syncActive,preparation.lastChecked]);
 const at=preparation.lastChecked;if(at===null)return null;
 const syncing=requestedAt!==null,stale=!syncing&&Date.now()-at>=STALE_MS,time=clock(thai,at);
 const text=syncing?(thai?'กำลังซิงค์…':'Syncing…'):stale?(thai?'ข้อมูลที่บันทึกเมื่อ '+time:'Saved data from '+time):(thai?'อัปเดต '+time:'Updated '+time);
 const action=thai?'ซิงค์ตอนนี้':'Sync now';
 const start=()=>{if(syncing)return;seenActive.current=false;setRequestedAt(Date.now());window.dispatchEvent(new Event('mw-offline-prepare'))};
 return <button type="button" className={'live-sync-status'+(stale?' stale':'')+(syncing?' syncing':'')} aria-label={syncing?text:text+' — '+action} aria-busy={syncing} title={action} onClick={start}>{text}</button>;
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
