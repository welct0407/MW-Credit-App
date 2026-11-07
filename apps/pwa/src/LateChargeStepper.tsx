import {Icon} from './Icon';
import {wholeBaht} from './display-money';
import {wholeText} from './whole-number-input';
import {beginRequest} from './request-activity';
import {syncSavedRequest,savedRejectionMessage,type SavedSyncResult} from './offline-sync';
import type {CommandAccess} from './SelectedCharges';
import {useEffect,useRef,useState} from 'react';
import {useOnline} from './online-status';
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
export type LateStepOutcome={result:'applied'|'unchanged'|'refused'|'queued'|'failed'|'held'|'stale';before?:string;paid?:string;after?:string;item?:any};
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
 * R134 (owner, 7 November 2026: a +50 applied on the server but the screen kept the old figure, so the next tap added 100):
 * - Stale base: a step only applies from the figure the owner saw (the screen's, or the previous chained step's target). When
 *   the server holds another figure nothing is sent; the toast names the server's figure and the screen refreshes ('stale').
 * - Ambiguous send: a request dispatched without a known answer (lost response, timeout) is reconciled at once while online
 *   ("Checking late charge…"): the status read under the same request id, never a second request id. Applied there is the
 *   ordinary applied result; only a still-unknown outcome holds the charge.
 * - Held release: a held charge's later outcome refreshes its screen ('applied' or 'refused') before its buttons return, and
 *   the toast states the result, so a late outcome always lands on screen (Echo LC-SYNC-2/6).
 */
/** known: the record the screen holds, read when the step runs (details: its latest load), so the live read is skipped; reread:
 *  after an applied step the charge is read once more and returned as outcome.item (Collection patches its row from it).
 *  refresh receives a stale step as 'unchanged' (nothing was sent; the screen reloads). */
export type LateStepScreen={due:string;paid:string;known?:()=>any;reread?:boolean;refresh?:(outcome:LateStepOutcome)=>Promise<unknown>|unknown};
/** A charge's step in progress: the figure it moves from and to, the tapped direction, and whether it is saving, was refused
 *  (figure back to the old one, buttons still held until the refresh lands) or is held queued. */
export type LatePending={before:string;after:string;direction:'increase'|'decrease';state:'saving'|'reverted'|'held'};
type Held={requestId:string;before:string;paid:string;after:string;screen:LateStepScreen};
const REREAD_MS=10000;
export function useLateChargeShortcut(access:CommandAccess|undefined,thai:boolean){
 const t=(en:string,th:string)=>thai?th:en;
 const [pending,setPending]=useState<Record<string,LatePending>>({}),[held,setHeld]=useState<Record<string,string>>({}),[toast,setToast]=useState<{text:string;refused:boolean}|null>(null);
 // R118 part B: the record each applied step read back (its new version), so the next tap on that charge needs no live read.
 const latest=useRef<Record<string,any>>({});
 const chain=useRef<Promise<unknown>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 // R134: heldInfo is the source of truth for held charges (set synchronously, with the screen to refresh on release); the
 // held state only drives the buttons. chained: the target of the last step still running per charge (the next tap's base).
 // issued/settled: this hook's request ids and any outcome that arrived for them, so an outcome that lands before the
 // charge is recorded as held is not lost.
 const heldInfo=useRef<Record<string,Held>>({}),chained=useRef<Record<string,{after:string;token:object}>>({});
 const issued=useRef(new Set<string>()),settled=useRef(new Map<string,SavedSyncResult>());
 // LC-BUSY-3: one toast at a time; "Saving…" is sticky until replaced, results 3 s, refusals and failures 6 s.
 const show=(text:string,{refused=false,sticky=false}:{refused?:boolean;sticky?:boolean}={})=>{clearTimeout(timer.current);setToast({text,refused});if(!sticky)timer.current=setTimeout(()=>setToast(null),refused?6000:3000);};
 const mark=(chargeId:string,value:LatePending|null)=>setPending(old=>{const next={...old};if(value===null)delete next[chargeId];else next[chargeId]=value;return next});
 const update=(chargeId:string,patch:Partial<LatePending>)=>setPending(old=>old[chargeId]?{...old,[chargeId]:{...old[chargeId],...patch}}:old);
 const forget=(requestId:string)=>{issued.current.delete(requestId);settled.current.delete(requestId)};
 // LC-SYNC-3/4: while online a held step is still being checked, so the toast never says "when connected".
 const heldText=()=>navigator.onLine?t('Saved on this device. Still checking…','บันทึกบนอุปกรณ์แล้ว ยังตรวจสอบอยู่…'):t('Saved on this device. Will sync when connected.','บันทึกบนอุปกรณ์แล้ว จะซิงค์เมื่อเชื่อมต่อ');
 // LC-SYNC-2: the "now" figure is the server's read-back when there is one.
 const appliedText=(before:string,after:string,now:string)=>{const diff=BigInt(after)-BigInt(before),sign=diff<0n?'−':'+',amount=wholeBaht((diff<0n?-diff:diff).toString());return t('Late charge '+sign+amount+' · now '+wholeBaht(now),'ค่าปรับล่าช้า '+sign+amount+' · ตอนนี้ '+wholeBaht(now));};
 const codeOf=(outcome:SavedSyncResult)=>outcome.code??outcome.data?.originalOutcome?.code??outcome.data?.code??'request_rejected';
 const rejectionText=(outcome:SavedSyncResult)=>lateRejection(codeOf(outcome),thai)??savedRejectionMessage(outcome,thai);
 /** R134 stale base: nothing changed; the toast names the server's figure (refused style, 6 s) and the screen refreshes. */
 const stale=(chargeId:string,item:any):LateStepOutcome=>{const before=wholeText(item.lateChargeDue??'0')??'0',paid=wholeText(item.lateChargePaid??'0')??'0';latest.current[chargeId]=item;update(chargeId,{state:'reverted'});show(t('Not changed: late charge is already '+wholeBaht(before),'ไม่ได้เปลี่ยน ค่าปรับล่าช้าเป็น '+wholeBaht(before)+' อยู่แล้ว'),{refused:true});return {result:'stale',before,paid};};
 /** A held charge's outcome arrived: the toast states it, the screen refreshes with it, then the charge is released. */
 const release=(chargeId:string,result:SavedSyncResult)=>{
  const h=heldInfo.current[chargeId];if(!h)return;delete heldInfo.current[chargeId];forget(h.requestId);delete latest.current[chargeId];
  const outcome:LateStepOutcome=result.kind==='synced'?{result:'applied',before:h.before,paid:h.paid,after:h.after}:{result:'refused',before:h.before,paid:h.paid};
  if(result.kind==='synced')update(chargeId,{state:'saving'});else{update(chargeId,{state:'reverted'});show(rejectionText(result),{refused:true});}
  // LC-SYNC-2: an applied release reads the charge once (own timeout) and the toast states that figure; the computed target
  // only when the read fails. A screen that patches from a read-back (reread) gets it as outcome.item.
  const applied=async()=>{let fresh:any;if(access){try{fresh=await reread(access,chargeId);if(h.screen.reread){latest.current[chargeId]=fresh;outcome.item=fresh}}catch{}}show(appliedText(h.before,h.after,(fresh&&wholeText(fresh.lateChargeDue??'0'))||h.after));};
  const run=chain.current.then(async()=>{if(result.kind==='synced')await applied();try{await h.screen.refresh?.(outcome)}catch{}}).finally(()=>{setHeld(old=>{const next={...old};delete next[chargeId];return next});mark(chargeId,null)});
  chain.current=run.catch(()=>undefined);
 };
 const onOutcome=useRef<(detail:any)=>void>(()=>{});
 onOutcome.current=detail=>{
  if(!detail||!['synced','blocked'].includes(detail.kind)||!issued.current.has(detail.requestId))return;
  settled.current.set(detail.requestId,{kind:detail.kind,data:detail.data,status:detail.status,code:detail.code});
  const chargeId=Object.entries(heldInfo.current).find(([,h])=>h.requestId===detail.requestId)?.[0];if(chargeId)release(chargeId,settled.current.get(detail.requestId)!);
 };
 useEffect(()=>{
  // A queued request's later outcome releases its charge (and its pending figure).
  const outcome=(event:Event)=>onOutcome.current((event as CustomEvent).detail);
  window.addEventListener('mw-offline-sync-outcome',outcome);return()=>{window.removeEventListener('mw-offline-sync-outcome',outcome);clearTimeout(timer.current)};
 },[]);
 const unavailable=()=>show(t('Charge could not be loaded. Try again.','โหลดรายการเรียกเก็บไม่ได้ ลองอีกครั้ง'),{refused:true});
 async function read(a:CommandAccess,chargeId:string,signal:AbortSignal){
  const response=await fetch(a.origin+'/api/charge-records/'+encodeURIComponent(chargeId),{headers:{Authorization:'Bearer '+await a.token()},signal,cache:'no-store',credentials:'omit',redirect:'error'});
  if(response.status===401||response.status===403)a.authFailure(response.status);
  const item=response.ok?(await response.json())?.item:null;if(!item||item.id!==chargeId||typeof item.version!=='string')throw Error('unavailable');return item;
 }
 /** R134 item 4: the post-apply read-back has its own timeout, not what is left of the step's 15 s. */
 async function reread(a:CommandAccess,chargeId:string){const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),REREAD_MS);try{return await read(a,chargeId,controller.signal)}finally{clearTimeout(deadline)}}
 /** R134: a queued answer after the send may hide an applied request. While online the outcome is read once more under the
  *  same request id (status first, no fresh); busy and unavailable answers applied nothing and stay with the coordinator. */
 async function reconcile(a:CommandAccess,requestId:string,first:SavedSyncResult):Promise<SavedSyncResult>{
  const arrived=()=>settled.current.get(requestId)??null;
  if(arrived())return arrived()!;
  if(!navigator.onLine||first.code==='command_busy'||first.code==='command_unavailable')return first;
  show(t('Checking late charge…','กำลังตรวจสอบค่าปรับล่าช้า…'),{sticky:true});
  const again=await syncSavedRequest(a,requestId);
  return again.kind==='queued'?arrived()??again:again;
 }
 /** The step's known outcome: applied (toast with the read-back figure), refused, or held until the coordinator settles it. */
 async function conclude(a:CommandAccess,chargeId:string,screen:LateStepScreen,requestId:string,outcome:SavedSyncResult,before:string,paid:string,after:string):Promise<LateStepOutcome>{
  if(outcome.kind==='queued'){const early=settled.current.get(requestId);if(early)outcome=early;}
  if(outcome.kind==='synced'){
   forget(requestId);delete latest.current[chargeId];let fresh:any;if(screen.reread){try{fresh=await reread(a,chargeId);latest.current[chargeId]=fresh}catch{}}
   show(appliedText(before,after,(fresh&&wholeText(fresh.lateChargeDue??'0'))||after));
   return {result:'applied',before,paid,after,item:fresh};
  }
  delete latest.current[chargeId];
  if(outcome.kind==='blocked'){
   forget(requestId);
   // R134 (Chase, DEV): a remembered record with the screen's figure but an old version passes the stale-base guard and the
   // version check refuses the send (source_conflict). Nothing applied: the charge is read once and the step ends as stale
   // with the server's figure; the refusal text only when that read fails.
   if(codeOf(outcome)==='source_conflict'){try{return stale(chargeId,await reread(a,chargeId))}catch{}}
   update(chargeId,{state:'reverted'});show(rejectionText(outcome),{refused:true});return {result:'refused',before,paid};
  }
  heldInfo.current[chargeId]={requestId,before,paid,after,screen};setHeld(old=>({...old,[chargeId]:requestId}));update(chargeId,{state:'held'});show(heldText());return {result:'queued',before,paid,after};
 }
 async function once(chargeId:string,step:number,label:string,screen:LateStepScreen,base:string):Promise<LateStepOutcome>{
  if(heldInfo.current[chargeId]){show(heldText());return {result:'held'};}
  const done=beginRequest('save'),controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);
  let saved:string|null=null,before='0',paid='0',after='0';
  try{
   const a=access;if(!a?.offline||a.offlineOnly||!navigator.onLine)throw Error('offline');const offline=a.offline;
   // The version comes from a read, never a guess: the screen's own latest record, else the previous step's read-back, else a
   // live read. A stale one is refused by the version check (source_conflict) and shown as stale (conclude).
   const shown=screen.known?.(),known=shown&&shown.id===chargeId&&typeof shown.version==='string'?shown:latest.current[chargeId];
   let item=known??await read(a,chargeId,controller.signal);
   // R134 stale base: a remembered record that disagrees with the figure the step starts from is confirmed by a live read.
   if(known&&(wholeText(item.lateChargeDue??'0')??'0')!==base)item=await read(a,chargeId,controller.signal);
   before=wholeText(item.lateChargeDue??'0')??'0';paid=wholeText(item.lateChargePaid??'0')??'0';
   if(before!==base)return stale(chargeId,item);
   after=stepLate(before,step,paid);
   // LC-BUSY-5: nothing to change is an ordinary status, not a refusal.
   if(after===before){update(chargeId,{state:'reverted'});show(lateNote(before,paid,thai)||lateNote(paid,paid,thai));return {result:'unchanged',before,paid};}
   update(chargeId,{before,after});
   const command=lateChargeCommand(item,after);
   await offline.savePending(command.requestId,{domain:'charge',command,borrowerLabel:label,recoveryKind:'action'});
   saved=command.requestId;issued.current.add(saved);
   // fresh: saved just now and sent nowhere else, so the status read is skipped (offline-sync.ts).
   let outcome=await syncSavedRequest(a,saved,{fresh:true});
   if(outcome.kind==='queued')outcome=await reconcile(a,saved,outcome);
   return await conclude(a,chargeId,screen,saved,outcome,before,paid,after);
  }catch{
   // R134: once the command is saved it may have been sent: reconcile it rather than ask for another try.
   if(saved&&access){const requestId=saved;try{return await conclude(access,chargeId,screen,requestId,await reconcile(access,requestId,{kind:'queued'}),before,paid,after)}catch{try{return await conclude(access,chargeId,screen,requestId,{kind:'queued'},before,paid,after)}catch{}}}
   delete latest.current[chargeId];update(chargeId,{state:'reverted'});unavailable();return {result:'failed'};
  }
  finally{clearTimeout(deadline);done();}
 }
 /** One step of the charge's late charge, after any step still running. In the tap's frame the charge is pending (the pair
  *  dimmed with the spinner on the tapped button, "฿50 → ฿100" from the screen) and the sticky "Saving late charge…" toast
  *  shows; the pending look stays through the outcome and screen.refresh, so the old figure never flashes back. */
 function step(chargeId:string,by:number,label:string,screen:LateStepScreen):Promise<LateStepOutcome>{
  // R134 (Chase low #3): a held charge keeps its held figure; the tap only repeats the held status.
  if(heldInfo.current[chargeId]){show(heldText());return Promise.resolve({result:'held'});}
  // R134: a tap chained behind a running step on the same charge starts from that step's target, else from the screen.
  const from=chained.current[chargeId]?.after??screen.due,to=stepLate(from,by,screen.paid),token={};chained.current[chargeId]={after:to,token};
  mark(chargeId,{before:from,after:to,direction:by>0?'increase':'decrease',state:'saving'});
  show(t('Saving late charge…','กำลังบันทึกค่าปรับล่าช้า…'),{sticky:true});
  const run=chain.current.then(async()=>{let outcome:LateStepOutcome={result:'failed'};try{outcome=await once(chargeId,by,label,screen,from);try{await screen.refresh?.(outcome.result==='stale'?{...outcome,result:'unchanged'}:outcome)}catch{}return outcome}finally{if(chained.current[chargeId]?.token===token)delete chained.current[chargeId];if(outcome.result!=='queued'&&outcome.result!=='held')mark(chargeId,null)}});
  chain.current=run.catch(()=>undefined);return run;
 }
 const busy=Object.keys(pending)[0]??null;
 const toastElement=<p role="status" aria-live="polite" className={'sync-toast late-charge-toast'+(toast?.refused?' refused':'')+(toast?'':' idle')}>{toast?.text??''}</p>;
 return {busy,pending,held,step,toastElement,show};
}
/** LC-BUSY-2/7: the pending figure while a step saves ("฿50 → ฿100", the old one struck), or held: online " · Checking…"
 *  (Echo LC-SYNC-4, the coordinator is still reconciling it), offline " · Waiting to sync". */
export function LateChargeSaving({pending,thai}:{pending:LatePending;thai:boolean}){
 const online=useOnline();
 return <span className="payment-status-processing"><ChangedAmount before={pending.before} after={pending.after} thai={thai}/>{pending.state==='held'?(online?(thai?' · กำลังตรวจสอบ…':' · Checking…'):(thai?' · รอซิงค์':' · Waiting to sync')):''}</span>;
}
