import {useEffect,useRef} from 'react';
import {datasetChangeCount,ownWriteCount} from './read-cache';
import {datasetDomainSyncing,noteDatasetDomainUsed} from './offline-dataset';
type Access={offline?:{scopeName:string}};
/**
 * R140 (owner, 11 November 2026): a page that read the network reloads when its data may have changed while it is
 * enabled, and once when it is enabled again after a change it missed (a form or a child record was on top):
 * - an own write settled in this tab (mw-read-invalidated): always, since the saved data follows a write only after the
 *   confirming check, and not at all while that domain's first download is still walking (Chase on DEV, fresh profile);
 * - with changes (default), a changed check of its data domain, skipped while that domain is being fetched (its ready
 *   event follows; an unchanged one then reloads only for a change it missed).
 * A page that follows its domain through subscribeOfflineDataset passes changes:false (read-cache replays those).
 */
export function useDatasetRefresh(access:Access,domain:string,enabled:boolean,reload:()=>void,{changes=true}:{changes?:boolean}={}){
 const scope=access.offline?.scopeName,count=()=>changes?datasetChangeCount(scope,domain):0;
 const seen=useRef(count()),writes=useRef(ownWriteCount()),enabledRef=useRef(enabled),reloadRef=useRef(reload);
 enabledRef.current=enabled;reloadRef.current=reload;
 const run=()=>{seen.current=count();writes.current=ownWriteCount();reloadRef.current()};
 // biome-ignore lint/correctness/useExhaustiveDependencies: count and run read the current scope, domain and options through refs and arguments listed here
 useEffect(()=>{noteDatasetDomainUsed(domain);seen.current=count();writes.current=ownWriteCount();
  const written=()=>{if(enabledRef.current)run()};
  // An unchanged check reloads only for a change missed while that check was running.
  const ready=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!scope||detail?.scopeName!==scope||detail.domain!==domain||!enabledRef.current||detail.changed===false&&seen.current===count())return;run()};
  window.addEventListener('mw-read-invalidated',written);if(changes)window.addEventListener('mw-offline-dataset-ready',ready);
  return()=>{window.removeEventListener('mw-read-invalidated',written);window.removeEventListener('mw-offline-dataset-ready',ready)}},[scope,domain,changes]);
 // biome-ignore lint/correctness/useExhaustiveDependencies: enabled is the trigger; count and run read the rest
 useEffect(()=>{if(!enabled)return;if(writes.current!==ownWriteCount()||scope&&seen.current!==count()&&!datasetDomainSyncing(scope,domain))run()},[enabled,scope,domain,changes]);
}
