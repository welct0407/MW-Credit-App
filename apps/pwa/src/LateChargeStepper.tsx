import {Icon} from './Icon';
import {wholeBaht} from './display-money';
import {wholeText} from './whole-number-input';
import {beginRequest} from './request-activity';
import {syncSavedRequest,savedRejectionMessage} from './offline-sync';
import type {CommandAccess} from './SelectedCharges';
import {useEffect,useRef,useState} from 'react';
import {LATE_STEP,stepLate,lateAtFloor,lateRejection} from './late-charge';
export {LATE_STEP,stepLate,lateAtFloor,latePart,lateRejection,latePaidFloorText,lateNote} from './late-charge';
/**
 * R118 (Echo LC-FORM-1, LC-REC-1, LC-COL-2/5): the −/+ buttons that move a late charge by 50, in the loan form's order and
 * markup (span.loan-step-buttons, increase then decrease). context names the charge in the buttons' accessible names
 * ("… for {loan} {date}"); − is disabled at the floor and then points at describedBy (the "already paid" note).
 */
export function LateChargeStepper({value,floor='0',thai,context='',disabled=false,describedBy,onChange}:{value:string;floor?:string|null;thai:boolean;context?:string;disabled?:boolean;describedBy?:string;onChange:(next:string)=>void}){
 const t=(en:string,th:string)=>thai?th:en,suffix=context?t(' for ',' สำหรับ ')+context:'',atFloor=lateAtFloor(value,floor);
 return <span className="loan-step-buttons"><button type="button" disabled={disabled} aria-label={t('Increase late charge by '+LATE_STEP,'เพิ่มค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,LATE_STEP,floor))}><Icon name="increase"/></button><button type="button" disabled={disabled||atFloor} aria-describedby={atFloor?describedBy:undefined} aria-label={t('Decrease late charge by '+LATE_STEP,'ลดค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,-LATE_STEP,floor))}><Icon name="decrease"/></button></span>;
}
/** The before → after figure of a changed amount (Echo LC-FORM-4); an unchanged amount shows once. */
export function ChangedAmount({before,after,thai}:{before:string|null|undefined;after:string;thai:boolean}){
 if(before===undefined||before===null||wholeBaht(before)===wholeBaht(after))return <>{wholeBaht(after)}</>;
 return <><span className="chat-proposal-before">{wholeBaht(before)}</span><span aria-hidden="true"> → </span><span className="visually-hidden">{thai?' เปลี่ยนเป็น ':' becomes '}</span><strong>{wholeBaht(after)}</strong></>;
}
/** R118: the charge.update command of a late-charge step: the record's current fields with the new late charge, at its version. */
export function lateChargeCommand(item:any,lateChargeDue:string){return {requestId:crypto.randomUUID(),operation:'charge.update',targetId:item.id,expectedVersion:item.version,predecessorRequestId:null,receiptId:null,inputs:{loanId:item.loanId,chargeDate:item.chargeDate,principalDue:wholeText(item.principalDue)??'0',interestDue:wholeText(item.interestDue)??'0',lateChargeDue,notes:item.notes??null}};}
export type LateStepOutcome={result:'applied'|'unchanged'|'refused'|'queued'|'failed'|'held';before?:string;paid?:string;after?:string};
/**
 * R118 owner feedback (3 November 2026): the −/+ of the Collection row and the charge details page apply at once, without a
 * Confirm page. Each tap reads the charge live (its version and current late charge), steps it by 50 (never below what was
 * paid), and sends the charge.update exactly as OperationConfirm does: saved as a pending request under a fresh request id,
 * then synchronized once (the version check refuses a stale screen). Taps run one after another, so a second tap reads the
 * version the first produced; a request that stays queued holds that charge's buttons until its outcome arrives, so two
 * commands never go out against one version. The result shows in a bottom toast (role=status, .late-charge-toast) for 3 s.
 */
export function useLateChargeShortcut(access:CommandAccess|undefined,thai:boolean){
 const t=(en:string,th:string)=>thai?th:en;
 const [busy,setBusy]=useState<string|null>(null),[held,setHeld]=useState<Record<string,string>>({}),[toast,setToast]=useState<{text:string;refused:boolean}|null>(null);
 const chain=useRef<Promise<unknown>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),heldRef=useRef(held);heldRef.current=held;
 const show=(text:string,refused=false)=>{clearTimeout(timer.current);setToast({text,refused});timer.current=setTimeout(()=>setToast(null),3000);};
 useEffect(()=>{
  // A queued request's later outcome releases its charge.
  const outcome=(event:Event)=>{const detail=(event as CustomEvent).detail;const chargeId=Object.entries(heldRef.current).find(([,request])=>request===detail?.requestId)?.[0];if(!chargeId||!['synced','blocked'].includes(detail.kind))return;setHeld(old=>{const next={...old};delete next[chargeId];return next});};
  window.addEventListener('mw-offline-sync-outcome',outcome);return()=>{window.removeEventListener('mw-offline-sync-outcome',outcome);clearTimeout(timer.current)};
 },[]);
 const unavailable=()=>show(t('Charge could not be loaded. Try again.','โหลดรายการเรียกเก็บไม่ได้ ลองอีกครั้ง'),true);
 async function once(chargeId:string,step:number,label:string):Promise<LateStepOutcome>{
  if(heldRef.current[chargeId]){show(t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ'));return {result:'held'};}
  const done=beginRequest(),controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);setBusy(chargeId);
  try{
   const a=access;if(!a?.offline||a.offlineOnly||!navigator.onLine)throw Error('offline');const offline=a.offline;
   const response=await fetch(a.origin+'/api/charge-records/'+encodeURIComponent(chargeId),{headers:{Authorization:'Bearer '+await a.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});
   if(response.status===401||response.status===403)a.authFailure(response.status);
   const item=response.ok?(await response.json())?.item:null;if(!item||item.id!==chargeId||typeof item.version!=='string')throw Error('unavailable');
   const before=wholeText(item.lateChargeDue??'0')??'0',paid=wholeText(item.lateChargePaid??'0')??'0',after=stepLate(before,step,paid);
   if(after===before)return {result:'unchanged',before,paid};
   const command=lateChargeCommand(item,after);
   await offline.savePending(command.requestId,{domain:'charge',command,borrowerLabel:label,recoveryKind:'action'});
   const outcome=await syncSavedRequest(a,command.requestId);
   if(outcome.kind==='synced'){
    const diff=BigInt(after)-BigInt(before),sign=diff<0n?'−':'+',amount=wholeBaht((diff<0n?-diff:diff).toString());
    show(t('Late charge '+sign+amount+' · now '+wholeBaht(after),'ค่าปรับล่าช้า '+sign+amount+' · ตอนนี้ '+wholeBaht(after)));return {result:'applied',before,paid,after};
   }
   if(outcome.kind==='blocked'){const code=outcome.code??outcome.data?.originalOutcome?.code??outcome.data?.code??'request_rejected';show(lateRejection(code,thai)??savedRejectionMessage(outcome,thai),true);return {result:'refused',before,paid};}
   setHeld(old=>({...old,[chargeId]:command.requestId}));show(t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ'));return {result:'queued',before,paid,after};
  }catch{unavailable();return {result:'failed'};}
  finally{clearTimeout(deadline);done();setBusy(null);}
 }
 /** One step of the charge's late charge, after any step still running. */
 function step(chargeId:string,by:number,label:string):Promise<LateStepOutcome>{const run=chain.current.then(()=>once(chargeId,by,label));chain.current=run.catch(()=>undefined);return run;}
 const toastElement=<p role="status" aria-live="polite" className={'sync-toast late-charge-toast'+(toast?.refused?' refused':'')+(toast?'':' idle')}>{toast?.text??''}</p>;
 return {busy,held,step,toastElement,show};
}
