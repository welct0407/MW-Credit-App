import {Icon} from './Icon';
import React,{useCallback,useSyncExternalStore} from 'react';
import type {OwnerOfflineRepository} from './owner-offline';

/** One shared pending snapshot per owner namespace (R064). `count` is every saved
 * pending row (all are unsynced; sign-out stays blocked while any exist). `visible`
 * is the rows that actually waited: saved offline or re-queued after an attempt
 * (deferred), blocked, queued after an attempt, or older than WAIT_MS. A row in
 * its first in-flight send (an ordinary online save) is therefore not shown, so
 * the badge, the waiting message and the sign-out label do not flash. */
export type PendingSnapshot={count:number;visible:number;authorized:boolean};
type Entry={snapshot:PendingSnapshot;listeners:Set<()=>void>;refresh:()=>void;detach:()=>void};
const WAIT_MS=2000;
const none:PendingSnapshot={count:0,visible:0,authorized:false};
const entries=new Map<string,Entry>();
const events=['mw-offline-saved','mw-offline-queued','mw-offline-synced','focus'];
const waited=(row:any,now:number)=>row.sync?.deferred===true||row.sync?.state==='blocked'||row.sync?.state==='queued'&&row.sync?.attempted===true||now-row.savedAt>=WAIT_MS;
function entry(repository:OwnerOfflineRepository):Entry{
 const existing=entries.get(repository.scopeName);if(existing)return existing;
 let revision=0,timer:ReturnType<typeof setTimeout>|undefined;
 const self:Entry={snapshot:none,listeners:new Set(),refresh(){const current=++revision;clearTimeout(timer);Promise.all([repository.list('pending').then(rows=>rows,()=>[] as any[]),repository.authorized().catch(()=>false)]).then(([rows,authorized])=>{
  if(current!==revision||entries.get(repository.scopeName)!==self)return;
  const now=Date.now(),count=rows.length,visible=rows.filter(row=>waited(row,now)).length;
  // A young row still in its first send: look again once it has waited long enough.
  const young=rows.filter(row=>!waited(row,now));if(young.length)timer=setTimeout(self.refresh,WAIT_MS-Math.max(0,...young.map(row=>now-row.savedAt))+50);
  const previous=self.snapshot;if(previous.count===count&&previous.visible===visible&&previous.authorized===authorized)return;
  self.snapshot={count,visible,authorized};self.listeners.forEach(listener=>{listener()});
 })},detach(){clearTimeout(timer);for(const name of events)window.removeEventListener(name,self.refresh);entries.delete(repository.scopeName)}};
 for(const name of events)window.addEventListener(name,self.refresh);
 entries.set(repository.scopeName,self);self.refresh();return self;
}
export function usePendingSnapshot(repository:OwnerOfflineRepository|null):PendingSnapshot{
 // Stable per repository: a new subscribe function would make React re-subscribe on every render.
 const subscribe=useCallback((listener:()=>void)=>{if(!repository)return()=>{};const current=entry(repository);current.listeners.add(listener);return()=>{current.listeners.delete(listener);if(!current.listeners.size)current.detach()}},[repository]);
 const snapshot=useCallback(()=>repository?entries.get(repository.scopeName)?.snapshot??none:none,[repository]);
 return useSyncExternalStore(subscribe,snapshot);
}
export const usePendingCount=(repository:OwnerOfflineRepository|null):number=>usePendingSnapshot(repository).count;
/** SYNC-UX-07/R02: the entry stays (it opens the saved-changes screen) but is named
 * "All synced" with no badge when nothing is waiting. The badge needs the
 * owner lease; the sign-out guard (usePendingSnapshot.count) does not. */
/** UX-RECON-05: with nothing waiting, a persistent data-check difference adds a warning dot (the count badge wins). */
export function WaitingToSyncButton({repository,thai,compact=false,dataCheck=false,onClick}:{repository:OwnerOfflineRepository|null;thai:boolean;compact?:boolean;dataCheck?:boolean;onClick:()=>void}){
 const entry=usePendingSnapshot(repository),count=entry.authorized?entry.visible:0,title=thai?'รอซิงค์':'Waiting to sync',synced=thai?'ซิงค์ครบแล้ว':'All synced',dot=count===0&&dataCheck;
 const label=count>0?(thai?title+' มีรายการที่บันทึก '+count+' รายการ':title+', '+count+' saved '+(count===1?'change':'changes')):dot?(thai?'ซิงค์ครบแล้ว พบความแตกต่างของข้อมูล':'All synced, data check found a difference'):synced;
 return <button type="button" className={'secondary-button waiting-sync-button'+(count>0?'':' all-synced')+(dot?' data-check':'')} aria-label={label} title={label} onClick={onClick}>{compact?<Icon name="waiting"/>:count>0?title:synced}{count>0&&<span className="waiting-sync-badge" aria-hidden="true">{count}</span>}{dot&&<span className="data-check-dot" aria-hidden="true"/>}</button>;
}
