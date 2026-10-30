import {useEffect,useRef,useState} from 'react';
import {Icon} from '../Icon';
import {wholeBaht} from '../display-money';
import {displayDateWithYear} from '../display-date';
import {savedRejectionMessage} from '../offline-sync';
import {proposalView,pollProposal,type CardField,type ChatProposal} from './chat-protocol';
import {ChatAccessError,ChatHttpError,cancelProposal,confirmProposal,getProposal,type ChatAccess} from './chat-client';
import {confirmText,consequenceText,pair,proposalButtons,proposalCodeText,proposalCountdown,proposalStateText,proposalUnresolvedText,savedAtText} from './chat-text';

// R106 chat write proposal card (design D6-D9; Echo's card review). Everything shown comes from the server-built card
// (label, target, values, before/after changes, payment split, consequences, destructive flag), never from model text;
// amounts are the card's decimal strings formatted here. Confirm is online only and nothing is queued on the device.
// A lost confirm answer is reconciled by the proposal read (every 3 s for up to 5 minutes): an unknown outcome is
// never shown as failed and never offers a retry. Echo's review (CWR-01..08): Confirm arms only after the card has
// been fully in view for ARM_MS, its label is the server's short label, the countdown is outside the live region,
// allocation dates and amounts never wrap, failed and expired cards offer Ask again, Done shows the saved time, and
// both buttons need a connection.
export const ARM_MS=600;
export type ProposalRecord=NonNullable<ChatProposal['record']>;
const money=(value:unknown)=>{
 if(typeof value!=='string'||!/^-?\d+(\.\d+)?$/.test(value))return value==null?'—':String(value);
 if(!value.includes('.'))return wholeBaht(value);
 const n=Number(value);return (n<0?'-':'')+'฿'+new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n));
};
const MONEY=new Set(['money','signed-money','whole','signed-whole']);
function shown(field:CardField,value:unknown,display:string|undefined,thai:boolean){
 if(value===null||value===undefined||value==='')return '—';
 if(display)return display;
 if(MONEY.has(field.type))return money(value);
 if(field.type==='date')return displayDateWithYear(value,thai);
 if(typeof value==='boolean')return value?(thai?'ใช่':'Yes'):(thai?'ไม่':'No');
 if(Array.isArray(value))return value.join(', ');
 return String(value);
}
/** The failed state's text: a chat-layer code in chat wording, a command-service code in the app's own table. */
const failureLine=(code:string|null,thai:boolean)=>proposalCodeText(code,thai)??savedRejectionMessage({code:code??'request_rejected'},thai);

export function ChatProposalCard({proposal,access,thai,online,onChange,onOpenRecord,onAskAgain}:{proposal:ChatProposal;access:ChatAccess;thai:boolean;online:boolean;onChange:(next:ChatProposal)=>void;onOpenRecord?:(record:ProposalRecord)=>void;onAskAgain?:()=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 const [busy,setBusy]=useState(false),[note,setNote]=useState<string|null>(null),[unresolved,setUnresolved]=useState(false),[,setTick]=useState(0);
 const [seen,setSeen]=useState(()=>typeof IntersectionObserver==='undefined');
 const cardRef=useRef<HTMLElement|null>(null);
 const accessRef=useRef(access);accessRef.current=access;
 const changeRef=useRef(onChange);changeRef.current=onChange;
 const view=proposalView(proposal,{online,busy,seen});
 // CWR-01: armed once the whole card (or a viewport-full of a taller one) has stayed in view for ARM_MS.
 useEffect(()=>{
  const element=cardRef.current;if(seen||proposal.state!=='pending'||!element)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const observer=new IntersectionObserver(([entry])=>{
   clearTimeout(timer);
   const full=entry.isIntersecting&&(entry.intersectionRatio>=0.99||(!!entry.rootBounds&&entry.intersectionRect.height>=entry.rootBounds.height*0.9));
   if(full)timer=setTimeout(()=>setSeen(true),ARM_MS);
  },{threshold:Array.from({length:21},(_,i)=>i/20)});
  observer.observe(element);
  return()=>{observer.disconnect();clearTimeout(timer)};
 },[seen,proposal.state]);
 const card=proposal.card,label=pair([card.label.en,card.label.th],thai);
 // The countdown re-renders once a second while the card waits for a decision.
 useEffect(()=>{if(proposal.state!=='pending')return;const timer=setInterval(()=>setTick(n=>n+1),1000);return()=>clearInterval(timer)},[proposal.state]);
 // Unknown (or executing after a reload) is reconciled by the service on each read.
 // biome-ignore lint/correctness/useExhaustiveDependencies: one poll per proposal and state; access and onChange are read through refs.
 useEffect(()=>{
  if(!view.poll)return;
  const controller=new AbortController();setUnresolved(false);
  void pollProposal(()=>getProposal(accessRef.current,proposal.threadId,proposal.id,controller.signal),{signal:controller.signal})
   .then(value=>{if(controller.signal.aborted)return;if(value)changeRef.current(value);else setUnresolved(true)})
   .catch(()=>{if(!controller.signal.aborted)setUnresolved(true)});
  return()=>controller.abort();
 },[proposal.id,view.poll]);
 async function act(kind:'confirm'|'cancel'){
  if(busy||(kind==='confirm'&&!view.canConfirm)||(kind==='cancel'&&!view.canCancel))return;
  setBusy(true);setNote(null);
  if(kind==='confirm')changeRef.current({...proposal,state:'executing'});
  try{changeRef.current(await (kind==='confirm'?confirmProposal:cancelProposal)(accessRef.current,proposal.threadId,proposal.id))}
  catch(error){
   // A ChatAccessError is a 401 answer (these routes keep 403 local): the chat handler verifies the session before any
   // claim, so nothing ran and the card may return to pending (tests/unit/chat-handler.test.mjs, 401 on Confirm).
   if(error instanceof ChatAccessError){changeRef.current(proposal);return}
   if(error instanceof ChatHttpError&&error.status===409&&error.code==='proposal_executing'){changeRef.current({...proposal,state:'executing'});setNote(proposalCodeText('proposal_executing',thai));return}
   if(error instanceof ChatHttpError&&error.status===403){changeRef.current(proposal);setNote(proposalCodeText(error.code,thai)??failureLine(error.code,thai));return}
   // No answer to a confirm: the outcome is unknown until the read reconciles it (never resent from here).
   if(kind==='confirm')changeRef.current({...proposal,state:'unknown',outcome:{code:'outcome_unknown'}});
   else{changeRef.current(proposal);setNote(t('Cancel not confirmed. Try again.','ยังยกเลิกไม่สำเร็จ ลองอีกครั้ง'))}
  }finally{setBusy(false)}
 }
 const fields=card.changes.length?card.changes:card.values;
 const total=card.split?.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest),0n);
 const saved=view.state==='done'?savedAtText(proposal.outcome?.recordedAt??proposal.settledAt,thai):null;
 return <section ref={cardRef} className="chat-proposal" data-armed={view.state==='pending'&&seen?'true':undefined} data-state={view.state} data-destructive={card.destructive?'true':undefined} aria-label={t('Change to confirm: ','การเปลี่ยนแปลงที่รอยืนยัน: ')+label}>
  <header className="chat-proposal-head">
   <Icon name={card.destructive?'warning':'edit'} className="chat-proposal-icon"/>
   <div><h3>{label}</h3>{card.target.label&&<p className="chat-proposal-target">{card.target.label}</p>}</div>
  </header>
  {card.destructive&&<p className="chat-proposal-destructive" role="note">{consequenceText({code:'destructive'},thai)}</p>}
  {fields.length>0&&<dl className="chat-proposal-fields">{fields.map(field=><div key={field.field} className={card.changes.length?'chat-proposal-change':undefined}>
   <dt>{pair([field.label.en,field.label.th],thai)}</dt>
   {card.changes.length?<dd><span className="chat-proposal-before">{shown(field,field.before,field.beforeDisplay,thai)}</span><span aria-hidden="true"> → </span><span className="visually-hidden">{t(' becomes ',' เป็น ')}</span><strong>{shown(field,field.after,field.afterDisplay,thai)}</strong></dd>
    :<dd>{shown(field,field.value,field.display,thai)}</dd>}
  </div>)}</dl>}
  {card.split&&card.split.length>0&&<div className="chat-proposal-split"><h4>{t('Allocation','การจัดสรร')}{total!==undefined?' · '+money(String(total)):''}</h4><ul>{card.split.map(row=><li key={row.chargeId}>
   <span>{row.loanDisplayKey??t('Loan','สินเชื่อ')} · <span className="chat-nowrap">{displayDateWithYear(row.chargeDate,thai)}</span>{row.projected?' · '+t('next charge','รายการถัดไป'):''}</span>
   <span>{t('Principal','เงินต้น')} <span className="chat-nowrap">{money(row.principal)}</span> · {t('Interest','ดอกเบี้ย')} <span className="chat-nowrap">{money(row.interest)}</span></span>
  </li>)}</ul></div>}
  {card.consequences.filter(item=>item.code!=='destructive').map(item=><p key={item.code} className="chat-proposal-consequence">{consequenceText(item,thai,item.amount?money(item.amount):undefined)}</p>)}
  <footer className="chat-proposal-foot">
   <p className="chat-proposal-state" role="status" aria-live="polite">
    {(view.state==='executing'||(view.state==='unknown'&&!unresolved))&&<span className="collection-spinner" aria-hidden="true"/>}
    <span>{view.state==='pending'?proposalStateText('pending',thai)
     :view.state==='done'?saved??proposalStateText('done',thai)
     :view.state==='failed'?failureLine(view.code,thai)
     :view.state==='unknown'?(unresolved?proposalUnresolvedText(thai):proposalCodeText('outcome_unknown',thai))
     :view.state==='expired'||view.state==='cancelled'?proposalCodeText(view.code,thai)
     :proposalStateText(view.state,thai)}</span>
   </p>
   {view.state==='pending'&&<p className="chat-proposal-countdown">{proposalCountdown(view.remainingSeconds,thai)}</p>}
   {note&&<p className="chat-proposal-note" role="alert">{note}</p>}
   {view.state==='pending'&&<div className="chat-proposal-actions">
    <button type="button" className={card.destructive?'chat-proposal-confirm destructive-action':'chat-proposal-confirm'} disabled={!view.canConfirm} onClick={()=>void act('confirm')}>{confirmText(card.confirmLabel,thai)}</button>
    <button type="button" className="secondary-button" disabled={!view.canCancel} onClick={()=>void act('cancel')}>{pair(proposalButtons.cancel,thai)}</button>
    {!online&&<span className="chat-proposal-offline">{pair(proposalButtons.offline,thai)}</span>}
   </div>}
   {(view.state==='failed'||view.state==='expired')&&onAskAgain&&<button type="button" className="secondary-button chat-proposal-again" onClick={onAskAgain}>{pair(proposalButtons.askAgain,thai)}</button>}
   {view.state==='done'&&proposal.record&&onOpenRecord&&<button type="button" data-proposal-id={proposal.id} className="text-action chat-proposal-open" onClick={()=>onOpenRecord(proposal.record as ProposalRecord)}>{pair(proposalButtons.open,thai)}</button>}
  </footer>
 </section>;
}
