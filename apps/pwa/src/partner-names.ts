import {useEffect,useState} from 'react';
import {readCachedJson,subscribeOfflineDataset} from './read-cache';
import type {CommandAccess} from './SelectedCharges';
type Partners={items?:{label?:string|null;partnerRole?:string|null}[]};
const path='/api/management/partners?limit=25';
const pick=(data:Partners|null|undefined)=>{const name=(role:string)=>data?.items?.find(row=>row.partnerRole===role)?.label?.trim()||null;return {a:name('A'),b:name('B')}};
/** APP-UX-CASH-03: Cash Dashboard withdrawal captions name the Partners records with role A and B
 * (V31 cash dashboard); role letters stand in until a record is available. */
export function usePartnerWithdrawLabels(access:CommandAccess,thai:boolean){
 const [names,setNames]=useState<{a:string|null;b:string|null}>({a:null,b:null});
 // biome-ignore lint/correctness/useExhaustiveDependencies: re-read per signed-in repository; the access object is rebuilt every render.
 useEffect(()=>{
  const controller=new AbortController(),apply=(value:Partners)=>{if(!controller.signal.aborted)setNames(pick(value))};
  void readCachedJson<Partners>(access,path,{signal:controller.signal,onCached:apply}).then(({response,data})=>{if(response.ok)apply(data)}).catch(()=>{});
  const stop=subscribeOfflineDataset<Partners>(access,path,apply);
  return()=>{controller.abort();stop()};
 },[access.offline]);
 const label=(name:string|null,role:'A'|'B')=>thai?(name??'หุ้นส่วน '+role)+' ถอนเดือนนี้':(name??'Partner '+role)+' Withdrawn MTD';
 return {a:label(names.a,'A'),b:label(names.b,'B')};
}
