import {useEffect,useRef} from 'react';
import {datasetChangeCount} from './read-cache';
import {datasetDomainSyncing,noteDatasetDomainUsed} from './offline-dataset';
type Access={offline?:{scopeName:string}};
/**
 * R140 (owner, 11 November 2026): for a view that reads without a bundle subscription (subscribeOfflineDataset), reload
 * when its data domain changes while it is enabled, and once when it is enabled again after a change it missed (a form or
 * a child record was on top). It follows the same per-domain change counter as the bundle subscriptions; reload decides
 * how to read (it may go to the network). A domain being fetched is skipped: its ready event follows.
 */
export function useDatasetRefresh(access:Access,domain:string,enabled:boolean,reload:()=>void){
 const scope=access.offline?.scopeName,seen=useRef(datasetChangeCount(scope,domain)),enabledRef=useRef(enabled),reloadRef=useRef(reload);
 enabledRef.current=enabled;reloadRef.current=reload;
 useEffect(()=>{noteDatasetDomainUsed(domain);seen.current=datasetChangeCount(scope,domain);if(!scope)return;
  // An unchanged check reloads only for a change missed while that check was running.
  const changed=(event:Event)=>{const detail=(event as CustomEvent).detail,now=datasetChangeCount(scope,domain);if(detail?.scopeName!==scope||detail.domain!==domain||!enabledRef.current||detail.changed===false&&seen.current===now)return;seen.current=now;reloadRef.current()};
  window.addEventListener('mw-offline-dataset-ready',changed);return()=>window.removeEventListener('mw-offline-dataset-ready',changed)},[scope,domain]);
 useEffect(()=>{if(!enabled||!scope)return;const now=datasetChangeCount(scope,domain);if(now!==seen.current&&!datasetDomainSyncing(scope,domain)){seen.current=now;reloadRef.current()}},[enabled,scope,domain]);
}
