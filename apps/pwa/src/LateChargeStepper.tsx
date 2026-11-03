import {Icon} from './Icon';
import {wholeBaht} from './display-money';
import {wholeText} from './whole-number-input';
import {beginRequest} from './request-activity';
import {syncSavedRequest,savedRejectionMessage} from './offline-sync';
import type {CommandAccess} from './SelectedCharges';
import {useEffect,useRef,useState} from 'react';
import {LATE_STEP,stepLate,lateAtFloor,lateRejection,lateNote} from './late-charge';
export {LATE_STEP,stepLate,lateAtFloor,latePart,lateRejection,latePaidFloorText,lateNote} from './late-charge';
/**
 * R118 (Echo LC-FORM-1, LC-REC-1, LC-COL-2/5): the −/+ buttons that move a late charge by 50, in the loan form's order and
 * markup (span.loan-step-buttons, increase then decrease). context names the charge in the buttons' accessible names
 * ("… for {loan} {date}"); − is disabled at the floor and then points at describedBy (the "already paid" note).
 */
export function LateChargeStepper({value,floor='0',thai,context='',disabled=false,describedBy,onChange,saving=null}:{value:string;floor?:string|null;thai:boolean;context?:string;disabled?:boolean;describedBy?:string;onChange:(next:string)=>void;saving?:'increase'|'decrease'|'held'|null}){
 const t=(en:string,th:string)=>thai?th:en,suffix=context?t(' for ',' สำหรับ ')+context:'',atFloor=lateAtFloor(value,floor);
 // R118 (Echo LC-BUSY-1/7): while a step saves the pair is dimmed (.saving) and the tapped button shows the spinner; a held
 // (queued) step is dimmed without one.
 const icon=(name:'increase'|'decrease')=>saving===name?<span className="collection-spinner" aria-hidden="true"></span>:<Icon name={name}/>;
 return <span className={'loan-step-buttons'+(saving?' saving'+(saving==='held'?' held':''):'')} aria-busy={saving?true:undefined}><button type="button" disabled={disabled||!!saving} aria-label={t('Increase late charge by '+LATE_STEP,'เพิ่มค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,LATE_STEP,floor))}>{icon('increase')}</button><button type="button" disabled={disabled||!!saving||atFloor} aria-describedby={atFloor?describedBy:undefined} aria-label={t('Decrease late charge by '+LATE_STEP,'ลดค่าปรับล่าช้า '+LATE_STEP)+suffix} onClick={()=>onChange(stepLate(value,-LATE_STEP,floor))}>{icon('decrease')}</button></span>;
}
/** The before → after figure of a changed amount (Echo LC-FORM-4); an unchanged amount shows once. */
export function ChangedAmount({before,after,thai}:{before:string|null|undefined;after:string;thai:boolean}){
 if(before===undefined||before===null||wholeBaht(before)===wholeBaht(after))return <>{wholeBaht(after)}</>;
 return <><span className="chat-proposal-before">{wholeBaht(before)}</span><span aria-hidden="true"> → </span><span className="visually-hidden">{thai?' เปลี่ยนเป็น ':' becomes '}</span><strong>{wholeBaht(after)}</strong></>;
}
/** R118: the charge.update command of a late-charge step: the record's current fields with the new late charge, at its version. */
export function lateChargeCommand(item:any,lateChargeDue:string){return {requestId:crypto.randomUUID(),operation:'charge.update',targetId:item.id,expectedVersion:item.version,predecessorRequestId:null,receiptId:null,inputs:{loanId:item.loanId,chargeDate:item.chargeDate,principalDue:wholeText(item.principalDue)??'0',interestDue:wholeText(item.interestDue)??'0',lateChargeDue,notes:item.notes??null}};}
export type LateStepOutcome={result:'applied'|'unchanged'|'refused'|'queued'|'failed'|'held';before?:string;paid?:string;after?:string;item?:any};
/**
 * R118 owner feedback (3 November 2026): the −/+ of the Collection row and the charge details page apply at once, without a
 * Confirm page. Each tap reads the charge live (its version and current late charge), steps it by 50 (never below what was
 * paid), and sends the charge.update exactly as OperationConfirm does: saved as a pending request under a fresh request id,
 * then synchronized once (the version check refuses a stale screen). Taps run one after another, so a second tap reads the
 * version the first produced; a request that stays queued holds that charge's buttons until its outcome arrives, so two
 * commands never go out against one version. The result shows in a bottom toast (role=status, .late-charge-toast) for 3 s.
 * Owner feedback (a tap can take seconds): in the same frame as the tap the charge is marked pending (its buttons disabled
 * and dimmed, a spinner and the target figure "฿100 · saving" in place of the figure) and the toast says "Saving late
 * charge…"; everything stays disabled until the outcome and the caller's refresh (then) are done; a refusal reverts the figure.
 */
/** known: the record the screen holds, read when the step runs (details: its latest load), so the live read is skipped; reread:
 *  after an applied step the charge is read once more and returned as outcome.item (Collection patches its row from it). */
export type LateStepScreen={due:string;paid:string;known?:()=>any;reread?:boolean;refresh?:(outcome:LateStepOutcome)=>Promise<unknown>|unknown};
/** A charge's step in progress: the figure it moves from and to, the tapped direction, and whether it is saving, was refused
 *  (figure back to the old one, buttons still held until the refresh lands) or is held queued. */
export type LatePending={before:string;after:string;direction:'increase'|'decrease';state:'saving'|'reverted'|'held'};
export function useLateChargeShortcut(access:CommandAccess|undefined,thai:boolean){
 const t=(en:string,th:string)=>thai?th:en;
 const [pending,setPending]=useState<Record<string,LatePending>>({}),[held,setHeld]=useState<Record<string,string>>({}),[toast,setToast]=useState<{text:string;refused:boolean}|null>(null);
 // R118 part B: the record each applied step read back (its new version), so the next tap on that charge needs no live read.
 const latest=useRef<Record<string,any>>({});
 const chain=useRef<Promise<unknown>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),heldRef=useRef(held);heldRef.current=held;
 // LC-BUSY-3: one toast at a time; "Saving…" is sticky until replaced, results 3 s, refusals and failures 6 s.
 const show=(text:string,{refused=false,sticky=false}:{refused?:boolean;sticky?:boolean}={})=>{clearTimeout(timer.current);setToast({text,refused});if(!sticky)timer.current=setTimeout(()=>setToast(null),refused?6000:3000);};
 const mark=(chargeId:string,value:LatePending|null)=>setPending(old=>{const next={...old};if(value===null)delete next[chargeId];else next[chargeId]=value;return next});
 const update=(chargeId:string,patch:Partial<LatePending>)=>setPending(old=>old[chargeId]?{...old,[chargeId]:{...old[chargeId],...patch}}:old);
 useEffect(()=>{
  // A queued request's later outcome releases its charge (and its pending figure).
  const outcome=(event:Event)=>{const detail=(event as CustomEvent).detail;const chargeId=Object.entries(heldRef.current).find(([,request])=>request===detail?.requestId)?.[0];if(!chargeId||!['synced','blocked'].includes(detail.kind))return;setHeld(old=>{const next={...old};delete next[chargeId];return next});setPending(old=>{const next={...old};delete next[chargeId];return next});};
  window.addEventListener('mw-offline-sync-outcome',outcome);return()=>{window.removeEventListener('mw-offline-sync-outcome',outcome);clearTimeout(timer.current)};
 },[]);
 const unavailable=()=>show(t('Charge could not be loaded. Try again.','โหลดรายการเรียกเก็บไม่ได้ ลองอีกครั้ง'),{refused:true});
 async function read(a:CommandAccess,chargeId:string,signal:AbortSignal){
  const response=await fetch(a.origin+'/api/charge-records/'+encodeURIComponent(chargeId),{headers:{Authorization:'Bearer '+await a.token()},signal,cache:'no-store',credentials:'omit',redirect:'error'});
  if(response.status===401||response.status===403)a.authFailure(response.status);
  const item=response.ok?(await response.json())?.item:null;if(!item||item.id!==chargeId||typeof item.version!=='string')throw Error('unavailable');return item;
 }
 async function once(chargeId:string,step:number,label:string,screen:LateStepScreen):Promise<LateStepOutcome>{
  if(heldRef.current[chargeId]){show(t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ'));return {result:'held'};}
  const done=beginRequest(),controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);
  try{
   const a=access;if(!a?.offline||a.offlineOnly||!navigator.onLine)throw Error('offline');const offline=a.offline;
   // The version comes from a read, never a guess: the screen's own latest record, else the previous step's read-back, else a
   // live read. A stale one is refused by the version check (source_conflict) and the caller refreshes.
   const held=screen.known?.(),known=held&&held.id===chargeId&&typeof held.version==='string'?held:latest.current[chargeId];
   const item=known??await read(a,chargeId,controller.signal);
   const before=wholeText(item.lateChargeDue??'0')??'0',paid=wholeText(item.lateChargePaid??'0')??'0',after=stepLate(before,step,paid);
   // LC-BUSY-5: nothing to change is an ordinary status, not a refusal.
   if(after===before){update(chargeId,{state:'reverted'});show(lateNote(before,paid,thai)||lateNote(paid,paid,thai));return {result:'unchanged',before,paid};}
   update(chargeId,{before,after});
   const command=lateChargeCommand(item,after);
   await offline.savePending(command.requestId,{domain:'charge',command,borrowerLabel:label,recoveryKind:'action'});
   // fresh: saved just now and sent nowhere else, so the status read is skipped (offline-sync.ts).
   const outcome=await syncSavedRequest(a,command.requestId,{fresh:true});
   if(outcome.kind==='synced'){
    const diff=BigInt(after)-BigInt(before),sign=diff<0n?'−':'+',amount=wholeBaht((diff<0n?-diff:diff).toString());
    show(t('Late charge '+sign+amount+' · now '+wholeBaht(after),'ค่าปรับล่าช้า '+sign+amount+' · ตอนนี้ '+wholeBaht(after)));
    delete latest.current[chargeId];let fresh:any;if(screen.reread){try{fresh=await read(a,chargeId,controller.signal);latest.current[chargeId]=fresh}catch{}}
    return {result:'applied',before,paid,after,item:fresh};
   }
   delete latest.current[chargeId];
   if(outcome.kind==='blocked'){update(chargeId,{state:'reverted'});const code=outcome.code??outcome.data?.originalOutcome?.code??outcome.data?.code??'request_rejected';show(lateRejection(code,thai)??savedRejectionMessage(outcome,thai),{refused:true});return {result:'refused',before,paid};}
   setHeld(old=>({...old,[chargeId]:command.requestId}));update(chargeId,{state:'held'});show(t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ'));return {result:'queued',before,paid,after};
  }catch{delete latest.current[chargeId];update(chargeId,{state:'reverted'});unavailable();return {result:'failed'};}
  finally{clearTimeout(deadline);done();}
 }
 /** One step of the charge's late charge, after any step still running. In the tap's frame the charge is pending (the pair
  *  dimmed with the spinner on the tapped button, "฿50 → ฿100" from the screen) and the sticky "Saving late charge…" toast
  *  shows; the pending look stays through the outcome and screen.refresh, so the old figure never flashes back. */
 function step(chargeId:string,by:number,label:string,screen:LateStepScreen):Promise<LateStepOutcome>{
  mark(chargeId,{before:screen.due,after:stepLate(screen.due,by,screen.paid),direction:by>0?'increase':'decrease',state:'saving'});
  show(t('Saving late charge…','กำลังบันทึกค่าปรับล่าช้า…'),{sticky:true});
  const run=chain.current.then(async()=>{let outcome:LateStepOutcome={result:'failed'};try{outcome=await once(chargeId,by,label,screen);try{await screen.refresh?.(outcome)}catch{}return outcome}finally{if(outcome.result!=='queued')mark(chargeId,null)}});
  chain.current=run.catch(()=>undefined);return run;
 }
 const busy=Object.keys(pending)[0]??null;
 const toastElement=<p role="status" aria-live="polite" className={'sync-toast late-charge-toast'+(toast?.refused?' refused':'')+(toast?'':' idle')}>{toast?.text??''}</p>;
 return {busy,pending,held,step,toastElement,show};
}
/** LC-BUSY-2/7: the pending figure while a step saves ("฿50 → ฿100", the old one struck), or held ("· Waiting to sync"). */
export function LateChargeSaving({pending,thai}:{pending:LatePending;thai:boolean}){
 return <span className="payment-status-processing"><ChangedAmount before={pending.before} after={pending.after} thai={thai}/>{pending.state==='held'?(thai?' · รอซิงค์':' · Waiting to sync'):''}</span>;
}
