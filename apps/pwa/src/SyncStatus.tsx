import React,{useEffect,useState} from 'react';
import type {OfflinePreparation} from './offline-dataset';

const STALE_MS=10*60*1000;
const clock=(thai:boolean,at:number)=>new Intl.DateTimeFormat(thai?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(at));
/** SYNC-UX-03: "Updated HH:MM" from the last completed check; after ~10 minutes it
 * reads "Saved data from HH:MM". Tapping it starts a manual sync of every domain
 * (mw-offline-prepare without a domain bypasses the recheck throttle). */
export function SyncStatus({preparation,thai}:{preparation:OfflinePreparation;thai:boolean}){
 const [,tick]=useState(0);
 useEffect(()=>{const timer=setInterval(()=>tick(value=>value+1),30000);return()=>clearInterval(timer)},[]);
 const at=preparation.lastChecked;if(at===null)return null;
 const stale=Date.now()-at>=STALE_MS,time=clock(thai,at);
 const text=stale?(thai?'ข้อมูลที่บันทึกเมื่อ '+time:'Saved data from '+time):(thai?'อัปเดต '+time:'Updated '+time);
 const action=thai?'ซิงค์ตอนนี้':'Sync now';
 return <button type="button" className={'live-sync-status'+(stale?' stale':'')} aria-label={text+' — '+action} title={action} onClick={()=>window.dispatchEvent(new Event('mw-offline-prepare'))}>{text}</button>;
}
/** SYNC-UX-07: a brief notice when queued saved changes reach the server. */
export function SyncedToast({thai}:{thai:boolean}){
 const [count,setCount]=useState(0);
 useEffect(()=>{
  let batch=0,hide:ReturnType<typeof setTimeout>|undefined,flush:ReturnType<typeof setTimeout>|undefined;
  const synced=()=>{batch++;clearTimeout(flush);flush=setTimeout(()=>{setCount(batch);batch=0;clearTimeout(hide);hide=setTimeout(()=>setCount(0),4000)},1500)};
  window.addEventListener('mw-offline-synced',synced);
  return()=>{window.removeEventListener('mw-offline-synced',synced);clearTimeout(flush);clearTimeout(hide)};
 },[]);
 if(!count)return null;
 return <p role="status" className="sync-toast">{thai?'ซิงค์รายการที่บันทึกไว้แล้ว '+count+' รายการ':count+' saved '+(count===1?'change':'changes')+' synced'}</p>;
}
