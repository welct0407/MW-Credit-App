import {Icon} from './Icon';
import React,{useCallback,useSyncExternalStore} from 'react';
import type {OwnerOfflineRepository} from './owner-offline';

/** One shared pending counter per owner namespace (R064): every saved pending row
 * counts (including blocked ones); all are unsynced and must not be discarded by
 * sign-out. Refreshes on queue/save/sync/focus events, not on timers. */
type Snapshot={count:number;authorized:boolean};
type Entry={snapshot:Snapshot;listeners:Set<()=>void>;refresh:()=>void;detach:()=>void};
const none:Snapshot={count:0,authorized:false};
const entries=new Map<string,Entry>();
const events=['mw-offline-saved','mw-offline-queued','mw-offline-synced','focus'];
function entry(repository:OwnerOfflineRepository):Entry{
 const existing=entries.get(repository.scopeName);if(existing)return existing;
 let revision=0;
 const self:Entry={snapshot:none,listeners:new Set(),refresh(){const current=++revision;Promise.all([repository.list('pending').then(rows=>rows.length,()=>0),repository.authorized().catch(()=>false)]).then(([count,authorized])=>{if(current!==revision||entries.get(repository.scopeName)!==self||self.snapshot.count===count&&self.snapshot.authorized===authorized)return;self.snapshot={count,authorized};self.listeners.forEach(listener=>{listener()})})},detach(){for(const name of events)window.removeEventListener(name,self.refresh);entries.delete(repository.scopeName)}};
 for(const name of events)window.addEventListener(name,self.refresh);
 entries.set(repository.scopeName,self);self.refresh();return self;
}
function usePendingEntry(repository:OwnerOfflineRepository|null):Snapshot{
 // Stable per repository: a new subscribe function would make React re-subscribe on every render.
 const subscribe=useCallback((listener:()=>void)=>{if(!repository)return()=>{};const current=entry(repository);current.listeners.add(listener);return()=>{current.listeners.delete(listener);if(!current.listeners.size)current.detach()}},[repository]);
 const snapshot=useCallback(()=>repository?entries.get(repository.scopeName)?.snapshot??none:none,[repository]);
 return useSyncExternalStore(subscribe,snapshot);
}
export const usePendingCount=(repository:OwnerOfflineRepository|null):number=>usePendingEntry(repository).count;
/** SYNC-UX-07/R02: the entry stays (it opens the saved-changes screen) but is named
 * "All synced" with no badge when nothing is waiting. The badge needs the
 * owner lease; the sign-out guard (usePendingCount) does not. */
export function WaitingToSyncButton({repository,thai,compact=false,onClick}:{repository:OwnerOfflineRepository|null;thai:boolean;compact?:boolean;onClick:()=>void}){
 const entry=usePendingEntry(repository),count=entry.authorized?entry.count:0,title=thai?'รอซิงค์':'Waiting to sync',synced=thai?'ซิงค์ครบแล้ว':'All synced';
 const label=count>0?(thai?title+' มีรายการที่บันทึก '+count+' รายการ':title+', '+count+' saved '+(count===1?'change':'changes')):synced;
 return <button type="button" className={'secondary-button waiting-sync-button'+(count>0?'':' all-synced')} aria-label={label} title={label} onClick={onClick}>{compact?<Icon name="waiting"/>:count>0?title:synced}{count>0&&<span className="waiting-sync-badge" aria-hidden="true">{count}</span>}</button>;
}
