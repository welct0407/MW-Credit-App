import {useAppUpdateBlock} from './app-update-safety';
import {draftFailure,type DraftFailure} from './draft-state';
import {useEffect,useRef,useState} from 'react';
import type {OwnerOfflineRepository} from './owner-offline';
export type DraftDomain='borrower'|'loan'|'charge'|'expense'|'preference'|'payment'|'management';
/** Five drafts are enforced once by the owner repository, across every domain. */
export function useDomainDraft({repository,id,domain,label,value,enabled,restore,recoverNew=false,updateBlocked}:{repository?:OwnerOfflineRepository;id:string;domain:DraftDomain;label:string;value:any;enabled:boolean;updateBlocked?:boolean;recoverNew?:boolean;restore:(value:any)=>void}){
 useAppUpdateBlock(updateBlocked??true);
 const [ready,setReady]=useState(false),[error,setError]=useState<DraftFailure|null>(null),serial=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),epoch=useRef(0),suspended=useRef(false),latest=useRef(value),initial=useRef(JSON.stringify(value)),enabledRef=useRef(enabled),restoreRef=useRef(restore);
 latest.current=value;enabledRef.current=enabled;restoreRef.current=restore;
 const key=domain+':'+id,storageKey=useRef(key),restoredDraft=useRef(false);
 useEffect(()=>{const generation=++epoch.current;setReady(false);setError(null);suspended.current=false;storageKey.current=key;restoredDraft.current=false;void(async()=>{try{if(!repository||!await repository.authorized())return;let row=await repository.draft<any>(key);
 if(!row&&recoverNew){
  const context=(draft:any)=>[draft?.kind??null,draft?.loanId??null,draft?.holderId??null,draft?.fields?.borrowerId??draft?.inputs?.borrowerId??null];
  const pending=await repository.list('pending'),rows=await repository.list('draft');
  row=rows.filter(candidate=>candidate.value?.domain===domain&&candidate.value?.draft&&!candidate.value.draft.source&&!candidate.value.draft.record&&JSON.stringify(context(candidate.value.draft))===JSON.stringify(context(value))&&!pending.some(item=>(item.value?.command??item.value)?.targetId===candidate.value.draft.id)).sort((a,b)=>b.savedAt-a.savedAt)[0]??null;
 }
 if(generation!==epoch.current)return;if(row&&row.value.domain===domain&&JSON.stringify(latest.current)===initial.current){restoredDraft.current=true;storageKey.current=row.key.slice('draft:'.length);const restored={...row.value.draft,id};initial.current=JSON.stringify(restored);restoreRef.current(restored)}}catch(error){if(generation===epoch.current)setError(draftFailure(error))}finally{if(generation===epoch.current)setReady(true)}})();return()=>{epoch.current++;if(timer.current)clearTimeout(timer.current)}},[repository,key]);
 function enqueue(){if(!repository||!enabledRef.current||suspended.current)return;const generation=epoch.current,snapshot=structuredClone(latest.current);serial.current=serial.current.catch(()=>{}).then(async()=>{if(generation!==epoch.current||suspended.current||!enabledRef.current)return;try{if(!await repository.authorized())throw Error('Offline owner lease expired');if(generation!==epoch.current||suspended.current)return;await repository.saveDraft(storageKey.current,{domain,label,draft:snapshot});if(generation===epoch.current){initial.current=JSON.stringify(snapshot);setError(null);window.dispatchEvent(new Event('mw-offline-saved'))}}catch(error){if(generation===epoch.current){setError(draftFailure(error));window.dispatchEvent(new Event('mw-offline-save-failed'))}}});}
 useEffect(()=>{if(!ready||!enabled||suspended.current||JSON.stringify(value)===initial.current)return;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(enqueue,400);return()=>{if(timer.current)clearTimeout(timer.current)}},[value,enabled,ready]);
 useEffect(()=>{const save=()=>{if(ready&&enabledRef.current&&!suspended.current)enqueue()};window.addEventListener('offline',save);return()=>window.removeEventListener('offline',save)},[ready,repository,key]);
 return {ready,error,restored:restoredDraft.current,key:storageKey.current,async freeze(){suspended.current=true;if(timer.current)clearTimeout(timer.current);await serial.current;},resume(){suspended.current=false;},async discard(){suspended.current=true;if(timer.current)clearTimeout(timer.current);await serial.current;await repository?.remove('draft',storageKey.current);initial.current=JSON.stringify(latest.current);setError(null);window.dispatchEvent(new Event('mw-offline-saved'));}};
}
