import {useEffect,useState} from 'react';
import {heldChatLinksMap,type ChatLinks} from './ig-group-url';
/** R161 (owner's change of 15 November 2026): the offline dataset stays v12; a member's records bundle
 * already holds every borrower's detail record (aiCollectionEnabled, instagramUsername, igGroupUrl, igGroupInviteLink). The
 * Collection and Borrowers lists derive a borrower's chat links from it when a row carries none (rowChatLinks). One map per
 * signed-in scope, rebuilt when the records bundle changes; empty until the bundle is there, and on any failure. */
type Repository={scopeName?:string;syncAuthorized:()=>Promise<boolean>;readDataset:(domain:string)=>Promise<any>};
export type HeldChatLinks=ReadonlyMap<string,ChatLinks>;
const empty:HeldChatLinks=new Map();
const cache=new Map<string,HeldChatLinks>();
// A records change while no list is shown drops the scope's map; the next list reads the bundle again.
if(typeof window!=='undefined')window.addEventListener('mw-offline-dataset-ready',event=>{const detail=(event as CustomEvent).detail;if(detail?.domain==='records'&&detail.changed!==false&&typeof detail.scopeName==='string')cache.delete(detail.scopeName)});
async function readHeld(repository:Repository):Promise<HeldChatLinks>{
 try{
  if(!await repository.syncAuthorized())return empty;
  const bundle=await repository.readDataset('records');
  return bundle?.schemaVersion===1&&bundle.complete?heldChatLinksMap(bundle.data?.borrowers):empty;
 }catch{return empty}
}
export function useHeldChatLinks(repository:Repository|null|undefined):HeldChatLinks{
 const scope=repository?.scopeName;
 const [links,setLinks]=useState<HeldChatLinks>(()=>scope?cache.get(scope)??empty:empty);
 useEffect(()=>{
  if(!repository||!scope){setLinks(empty);return}
  let active=true;
  const load=()=>void readHeld(repository).then(value=>{cache.set(scope,value);if(active)setLinks(value)});
  const update=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.scopeName===scope&&detail.domain==='records'&&detail.changed!==false)load()};
  const held=cache.get(scope);if(held)setLinks(held);else load();
  window.addEventListener('mw-offline-dataset-ready',update);
  return()=>{active=false;window.removeEventListener('mw-offline-dataset-ready',update)};
 },[repository,scope]);
 return links;
}
