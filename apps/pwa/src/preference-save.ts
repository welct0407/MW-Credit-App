import {useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {readCachedJson} from './read-cache';
import {syncSavedRequest,savedRejectionMessage} from './offline-sync';
import {useAppUpdateBlock} from './app-update-safety';
const flights=new Set<string>();
const changed=()=>window.dispatchEvent(new Event('mw-preference-save'));
export function usePreferenceSave(access:CommandAccess|undefined,thai:boolean){
 const [pending,setPending]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState<{en:string;th:string}|null>(null),generation=useRef(0),hadPending=useRef(false);
 // Keep both languages so a message set before a language switch renders in the new language.
 const t=(en:string,th:string)=>({en,th});
 useAppUpdateBlock(busy);
 useEffect(()=>{const current=++generation.current;setPending(null);setBusy(false);setMessage(null);hadPending.current=false;const refresh=async()=>{const rows=await access?.offline?.list('pending');if(current!==generation.current)return;const row=rows?.find(row=>row.value.command?.operation==='preference.update');setPending(row?.value??null);if(!row&&hadPending.current)setMessage(null);hadPending.current=!!row;/* This tab's own save in flight keeps the saving message; its outcome sets the final one. */if(row&&!flights.has(access?.offline?.scopeName??''))setMessage(row.sync?.state==='blocked'?t('Preference needs attention in Waiting to sync.','การตั้งค่าต้องตรวจสอบในรายการรอซิงค์'):t('Saved on this device. Waiting to sync.','บันทึกบนอุปกรณ์แล้ว รอซิงค์'));};const update=()=>{void refresh().catch(()=>{})};update();window.addEventListener('mw-offline-saved',update);window.addEventListener('mw-preference-save',update);window.addEventListener('mw-offline-sync-outcome',update);return()=>{generation.current++;window.removeEventListener('mw-offline-saved',update);window.removeEventListener('mw-preference-save',update);window.removeEventListener('mw-offline-sync-outcome',update)}},[access?.offline]);
 async function save(patch:{language?:string;statementAccountId?:string|null;statementDate?:string|null}){
  const repository=access?.offline;if(!access||!repository)throw Error('Preference storage unavailable');const scope=repository.scopeName;
  if(flights.has(scope)||pending)throw Error('A preference is waiting to sync');
  flights.add(scope);setBusy(true);setMessage(t('Saving preferences…','กำลังบันทึกการตั้งค่า…'));const current=generation.current;
  try{
   const rows=await repository.list('pending');if(rows.some(row=>row.value.command?.operation==='preference.update'))throw Error('A preference is waiting to sync');
   const {response,data}=await readCachedJson<any>(access,'/api/preferences');if(!response.ok||!data.item?.version)throw Error('Preferences unavailable');
   const item=data.item;
   if(Object.hasOwn(patch,'statementDate')&&patch.statementDate!==item.statementDate&&(!patch.statementDate||!data.dates?.includes(patch.statementDate)))throw Error('invalid_default_date');
   if(Object.hasOwn(patch,'statementAccountId')&&patch.statementAccountId!==item.statementAccountId&&patch.statementAccountId!==null&&!data.accounts?.some((row:any)=>row.id===patch.statementAccountId))throw Error('invalid_default_account');
   const command={requestId:crypto.randomUUID(),operation:'preference.update',targetId:item.id,expectedVersion:item.version,predecessorRequestId:null,inputs:{language:item.language??(thai?'ไทย':'English'),statementAccountId:item.statementAccountId??null,statementDate:item.statementDate??null,...patch},receiptId:null};
   if(current!==generation.current)throw Error('Preference session changed');
   await repository.savePending(command.requestId,{domain:'preference',command});changed();
   const result=await syncSavedRequest(access,command.requestId);
   if(current===generation.current)setMessage(result.kind==='synced'?t('Preferences saved.','บันทึกการตั้งค่าแล้ว'):result.kind==='blocked'?{en:savedRejectionMessage(result,false),th:savedRejectionMessage(result,true)}:t('Saved on this device. Waiting to sync.','บันทึกบนอุปกรณ์แล้ว รอซิงค์'));
   return {accepted:true,inputs:command.inputs};
  }catch(error){if(current===generation.current)setMessage(error instanceof Error&&error.message==='invalid_default_date'?t('Choose a default date from the last 15 days. Report filters can still use other dates.','เลือกวันที่เริ่มต้นภายใน 15 วันล่าสุด ตัวกรองรายงานยังใช้วันที่อื่นได้'):error instanceof Error&&error.message==='invalid_default_account'?t('Choose an active account for the default.','เลือกบัญชีที่ใช้งานอยู่เป็นค่าเริ่มต้น'):t('Preferences not saved. Retry after checking Waiting to sync.','ยังไม่บันทึกการตั้งค่า ตรวจสอบรายการรอซิงค์แล้วลองอีกครั้ง'));throw error}
  finally{flights.delete(scope);if(current===generation.current)setBusy(false);changed()}
 }
 return {save,busy,blocked:busy||!!pending,pending,message:message?(thai?message.th:message.en):''};
}
