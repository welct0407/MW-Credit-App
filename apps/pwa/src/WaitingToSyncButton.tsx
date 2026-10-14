import React,{useEffect,useState} from 'react';
import type {OwnerOfflineRepository} from './owner-offline';

export function WaitingToSyncButton({repository,thai,compact=false,onClick}:{repository:OwnerOfflineRepository|null;thai:boolean;compact?:boolean;onClick:()=>void}){
 const [saved,setSaved]=useState<{repository:OwnerOfflineRepository|null;count:number}>({repository:null,count:0});
 useEffect(()=>{
  let active=true,revision=0;
  const refresh=async()=>{const current=++revision;try{
   if(!repository||!await repository.authorized()){if(active&&current===revision)setSaved({repository,count:0});return;}
   const rows=await repository.list('pending');const authorized=await repository.authorized();
   if(active&&current===revision)setSaved({repository,count:authorized?rows.length:0});
  }catch{if(active&&current===revision)setSaved({repository,count:0})}};
  void refresh();window.addEventListener('mw-offline-saved',refresh);window.addEventListener('focus',refresh);const timer=setInterval(refresh,15000);
  return()=>{active=false;revision++;clearInterval(timer);window.removeEventListener('mw-offline-saved',refresh);window.removeEventListener('focus',refresh)};
 },[repository]);
 const count=saved.repository===repository?saved.count:0,title=thai?'รอซิงค์':'Waiting to sync',label=count>0?(thai?title+' มีรายการที่บันทึก '+count+' รายการ':title+', '+count+' saved changes'):title;
 return <button type="button" className="secondary-button waiting-sync-button" aria-label={label} title={label} onClick={onClick}>{compact?'▤':title}{count>0&&<span className="waiting-sync-badge" aria-hidden="true">{count}</span>}</button>;
}
