import {useEffect,useRef,useState} from 'react';
import {Icon} from '../Icon';
import {wholeBaht} from '../display-money';
import {displayDateWithYear} from '../display-date';
import {savedRejectionMessage} from '../offline-sync';
import {choicePurpose,groupView,pollGroup,proposalView,seenThrough,type CardField,type ChatProposal,type LineView,type PurposeChoice,type PurposeOptions} from './chat-protocol';
import {dateRange,forwardRuns,runAmount,shortDate} from '../pay-forward-text';
import {ChatAccessError,ChatHttpError,cancelProposalGroup,confirmProposalGroup,getProposalGroup,type ChatAccess} from './chat-client';
import {armHintText,consequenceText,destructiveCounts,destructiveTagText,destructiveWarningText,groupConfirmText,groupCountText,groupProgressText,groupSummaryText,lineChipText,pair,proposalButtons,proposalCodeText,proposalCountdown,proposalStateText,proposalUnresolvedText,savedAtText,unchangedText} from './chat-text';

// R106 chat write proposal card (design D6-D9; Echo's card review). Everything shown comes from the server-built card
// (label, target, values, before/after changes, payment split, consequences, destructive flag), never from model text;
// amounts are the card's decimal strings formatted here. Confirm is online only and nothing is queued on the device.
// A lost confirm answer is reconciled by the proposal read (every 3 s for up to 5 minutes): an unknown outcome is
// never shown as failed and never offers a retry. Echo's review (CWR-01..08): Confirm arms only after the card has
// been seen whole (at once or scrolled through) and stayed in view for ARM_MS, its label is the server's short label, the countdown is outside the live region,
// allocation dates and amounts never wrap, failed and expired cards offer Ask again, Done shows the saved time, and
// both buttons need a connection. D12: one card for a group of 1..20 lines ("Confirm 6 changes", then "Confirm N
// remaining"); each line shows only its changed fields (unchanged ones collapse to their labels, so a long carried
// note is never repeated), a status chip and its own record link; Confirm streams the lines' results as they settle.
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

/** One line's body: changed fields (or the values of a create), the unchanged count, the split and consequences. */
/** R112 CH-2/CH-3: the Remainder choice of a payment card above its Allocation, nothing checked; once chosen it collapses
 * to the choice and Change (which reopens it and re-arms Confirm). The previews are the server card's. */
function RemainderChoice({options,choice,choosing,thai,onChoose,onChange}:{options:PurposeOptions;choice:PurposeChoice|null;choosing:boolean;thai:boolean;onChoose:(next:PurposeChoice|null)=>void;onChange:()=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 const [loanId,setLoanId]=useState(options.principal[0]?.loanId??''),[amount,setAmount]=useState('');
 const option=options.principal.find(row=>row.loanId===loanId)??options.principal[0];
 const forwardText=options.forward?(options.forward.rows.length?dateRange(options.forward.rows[0].chargeDate,options.forward.rows.at(-1)!.chargeDate,thai):'')+(options.forward.paidThrough?(thai?' ชำระถึง ':', paid through ')+shortDate(options.forward.paidThrough,thai):''):null;
 const principalText=(row:PurposeOptions['principal'][number]|undefined)=>row?(row.loanDisplayKey?row.loanDisplayKey+' · ':'')+money(row.amount)+(row.dailyAfter?t(' · new interest ',' · ดอกเบี้ยใหม่ ')+money(row.dailyAfter)+t('/day','/วัน'):''):'';
 const chosen=choice?.kind==='forward'?t('Pay forward','ชำระล่วงหน้า')+(forwardText?' ('+forwardText+')':''):choice?.kind==='principal'?t('Repay principal','ชำระเงินต้น')+' · '+principalText(options.principal.find(row=>row.loanId===choice.loanId))
  :choice?.kind==='split'?t('Split','แบ่งชำระ')+' · '+t('principal ','เงินต้น ')+money(choice.amount)+t(', the rest pays forward',' ส่วนที่เหลือชำระล่วงหน้า'):'';
 const split=()=>/^[1-9][0-9]{0,16}$/.test(amount)&&option?onChoose({kind:'split',loanId:option.loanId,amount}):onChoose(null);
 if(choice&&!choosing)return <p className="field-summary remainder-choice chat-proposal-remainder">{t('Remainder ','ยอดคงเหลือ ')+money(options.remainder)}: <strong className="field-summary-value">{chosen}</strong> <button type="button" className="secondary-button" onClick={onChange}>{t('Change','เปลี่ยน')}</button></p>;
 return <fieldset className="loan-type-options remainder-options chat-proposal-remainder"><legend>{t('Remainder ','ยอดคงเหลือ ')+money(options.remainder)}</legend>
  {options.forward&&<label><input type="radio" name={'remainder-'+options.businessDate} checked={choice?.kind==='forward'} onChange={()=>onChoose({kind:'forward'})}/><span>{t('Pay forward','ชำระล่วงหน้า')}</span>{forwardText&&<small>{forwardText}</small>}</label>}
  {options.principal.length>0&&<label><input type="radio" name={'remainder-'+options.businessDate} checked={choice?.kind==='principal'} onChange={()=>option&&onChoose({kind:'principal',loanId:option.loanId})}/><span>{t('Repay principal','ชำระเงินต้น')}</span><small>{principalText(option)}</small></label>}
  {options.split&&<label><input type="radio" name={'remainder-'+options.businessDate} checked={choice?.kind==='split'} onChange={split}/><span>{t('Split','แบ่งชำระ')}</span><small>{t('Enter the principal part; the rest pays forward.','กรอกส่วนเงินต้น ส่วนที่เหลือชำระล่วงหน้า')}</small></label>}
  {options.principal.length>1&&<label><span className="field-title">{t('Loan','สัญญา')}</span><select value={option?.loanId??''} onChange={event=>{setLoanId(event.target.value);if(choice?.kind==='principal')onChoose({kind:'principal',loanId:event.target.value});else if(choice?.kind==='split'&&/^[1-9][0-9]{0,16}$/.test(amount))onChoose({kind:'split',loanId:event.target.value,amount});}}>
   {options.principal.map(row=><option key={row.loanId} value={row.loanId}>{row.loanDisplayKey??row.loanId}</option>)}</select></label>}
  {options.split&&<label><span className="field-title">{t('Principal part','ส่วนเงินต้น')}</span><input inputMode="numeric" value={amount} onChange={event=>{const next=event.target.value.trim();setAmount(next);if(/^[1-9][0-9]{0,16}$/.test(next)&&option)onChoose({kind:'split',loanId:option.loanId,amount:next});else if(choice?.kind==='split')onChoose(null);}}/></label>}
  {options.settles&&<p className="field-help" role="status">{t('This settles the loan. Use Close Loan.','ยอดนี้ปิดสินเชื่อได้ กรุณาใช้ ปิดสินเชื่อ')}</p>}
  {options.uncovered&&<p className="field-help" role="status">{t(money(options.uncovered)+' is beyond the next 93 days and cannot be allocated.','ยอด '+money(options.uncovered)+' เกินช่วง 93 วันข้างหน้า ไม่สามารถจัดสรรได้')}</p>}
 </fieldset>;
}
/** R112: the rows a chosen remainder adds to the Allocation (runs of identical forward charges collapse). */
function ChosenRows({options,choice,thai}:{options:PurposeOptions;choice:PurposeChoice;thai:boolean}){
 const t=(en:string,th:string)=>thai?th:en;
 if(choice.kind==='forward'&&options.forward)return <ul className="chat-proposal-chosen">{forwardRuns(options.forward.rows).map(run=><li key={run[0].chargeId}>
  <span>{t('Pay forward','ชำระล่วงหน้า')} · <span className="chat-nowrap">{dateRange(run[0].chargeDate,run.at(-1)!.chargeDate,thai)}</span>{run.length>1?' · '+run.length+' × '+money(runAmount(run[0])):''}</span>
  <span className="chat-nowrap">{money(run.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest),0n).toString())}</span></li>)}</ul>;
 const option=choice.kind!=='forward'?options.principal.find(row=>row.loanId===choice.loanId):undefined;
 if(!option)return null;
 return <ul className="chat-proposal-chosen"><li><span>{t('Principal','เงินต้น')}{option.loanDisplayKey?' · '+option.loanDisplayKey:''}{option.outstandingBefore&&option.outstandingAfter&&choice.kind==='principal'?' · '+money(option.outstandingBefore)+' → '+money(option.outstandingAfter):''}</span>
  <span className="chat-nowrap">{money(choice.kind==='split'?choice.amount:option.amount)}</span></li>
  {choice.kind==='split'&&<li><span>{t('Pay forward','ชำระล่วงหน้า')}</span><span className="chat-nowrap">{money((BigInt(options.remainder)-BigInt(choice.amount)).toString())}</span></li>}</ul>;
}
function LineBody({line,thai}:{line:ChatProposal;thai:boolean}){
 const t=(en:string,th:string)=>thai?th:en,card=line.card;
 const changed=new Set(card.changes.map(field=>field.field));
 const unchanged=card.changes.length?card.values.filter(field=>!changed.has(field.field)):[];
 const fields=card.changes.length?card.changes:card.values;
 const total=card.split?.reduce((sum,row)=>sum+BigInt(row.principal)+BigInt(row.interest),0n);
 return <>
  {fields.length>0&&<dl className="chat-proposal-fields">{fields.map(field=><div key={field.field} className={card.changes.length?'chat-proposal-change':undefined}>
   <dt>{pair([field.label.en,field.label.th],thai)}</dt>
   {card.changes.length?<dd><span className="chat-proposal-before">{shown(field,field.before,field.beforeDisplay,thai)}</span><span aria-hidden="true"> → </span><span className="visually-hidden">{t(' becomes ',' เป็น ')}</span><strong>{shown(field,field.after,field.afterDisplay,thai)}</strong></dd>
    :<dd>{shown(field,field.value,field.display,thai)}</dd>}
  </div>)}</dl>}
  {unchanged.length>0&&<details className="chat-proposal-unchanged"><summary>{unchangedText(unchanged.length,thai)}</summary><p>{unchanged.map(field=>pair([field.label.en,field.label.th],thai)).join(', ')}</p></details>}
  {card.split&&card.split.length>0&&<div className="chat-proposal-split"><h4>{t('Allocation','การจัดสรร')}{total!==undefined?' · '+money(String(total)):''}</h4><ul>{card.split.map(row=><li key={row.chargeId}>
   <span>{row.loanDisplayKey??t('Loan','สินเชื่อ')} · <span className="chat-nowrap">{displayDateWithYear(row.chargeDate,thai)}</span>{row.projected?' · '+t('next charge','รายการถัดไป'):''}</span>
   <span>{t('Principal','เงินต้น')} <span className="chat-nowrap">{money(row.principal)}</span> · {t('Interest','ดอกเบี้ย')} <span className="chat-nowrap">{money(row.interest)}</span></span>
  </li>)}</ul></div>}
  {card.consequences.filter(item=>item.code!=='destructive').map(item=><p key={item.code} className="chat-proposal-consequence">{consequenceText(item,thai,item.amount?money(item.amount):undefined)}</p>)}
 </>;
}
const latestSaved=(lines:ChatProposal[])=>lines.map(line=>line.outcome?.recordedAt??line.settledAt??null).filter((at):at is string=>!!at).sort().at(-1)??null;

export function ChatProposalCard({lines,access,thai,online,onChange,onOpenRecord,canOpenRecord,onAskAgain}:{lines:ChatProposal[];access:ChatAccess;thai:boolean;online:boolean;onChange:(next:ChatProposal[])=>void;onOpenRecord?:(record:ProposalRecord)=>void;canOpenRecord?:(record:ProposalRecord)=>boolean;onAskAgain?:()=>void}){
 const openable=(record:ChatProposal['record'])=>!!record&&!!onOpenRecord&&(canOpenRecord?.(record)??true);
 const t=(en:string,th:string)=>thai?th:en;
 const [busy,setBusy]=useState(false),[note,setNote]=useState<string|null>(null),[unresolved,setUnresolved]=useState(false),[recheck,setRecheck]=useState(0),[,setTick]=useState(0);
 const [seen,setSeen]=useState(()=>typeof IntersectionObserver==='undefined');
 const cardRef=useRef<HTMLElement|null>(null);
 const accessRef=useRef(access);accessRef.current=access;
 const changeRef=useRef(onChange);changeRef.current=onChange;
 const linesRef=useRef(lines);linesRef.current=lines;
 const first=lines[0],headId=first.card.group?.id??first.id,threadId=first.threadId,count=lines.length,several=count>1;
 // R112: a payment card with remainder choices arms only once a choice is made (none is preselected).
 const options=!several&&first.kind==='payment'?first.card.purposeOptions:undefined;
 const [choice,setChoice]=useState<PurposeChoice|null>(null),[choosing,setChoosing]=useState(true);
 const purpose=choicePurpose(options,choice);
 const baseView=groupView(lines,{online,busy,seen});
 const view=options&&!purpose?{...baseView,canConfirm:false}:baseView;
 // CW3-04: while a line is checking (unknown) or running, no Confirm and no countdown.
 const waiting=view.pending>0&&view.state!=='unknown'&&view.state!=='executing'&&(view.state==='pending'||view.remaining);
 // CWR-01: armed once every part of the card has been in view (all at once, or scrolled through for a card taller than
 // the visible pane, as a group card on a phone is) and the card then stayed in view for ARM_MS.
 useEffect(()=>{
  const element=cardRef.current;if(seen||!waiting||!element)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const shown:[number,number][]=[];
  const observer=new IntersectionObserver(([entry])=>{
   clearTimeout(timer);
   if(!entry.isIntersecting)return;
   const box=entry.boundingClientRect;
   shown.push([entry.intersectionRect.top-box.top,entry.intersectionRect.bottom-box.top]);
   if(seenThrough(shown,box.height))timer=setTimeout(()=>setSeen(true),ARM_MS);
  },{threshold:Array.from({length:21},(_,i)=>i/20)});
  observer.observe(element);
  return()=>{observer.disconnect();clearTimeout(timer)};
 },[seen,waiting]);
 // The countdown re-renders once a second while lines wait for a decision.
 useEffect(()=>{if(!waiting)return;const timer=setInterval(()=>setTick(n=>n+1),1000);return()=>clearInterval(timer)},[waiting]);
 // Unknown or running lines (after a reload, a dropped confirm stream, or another tab) are read back; the service
 // reconciles unknown lines from the command journal on each read and never posts them again.
 // biome-ignore lint/correctness/useExhaustiveDependencies: one poll per group, state and recheck; access and onChange are read through refs.
 useEffect(()=>{
  if(!view.poll&&!recheck)return;
  const controller=new AbortController();setUnresolved(false);
  void pollGroup(async()=>{const group=await getProposalGroup(accessRef.current,threadId,headId,controller.signal);changeRef.current(group.lines);return group.lines},{signal:controller.signal})
   .then(value=>{if(!controller.signal.aborted&&!value)setUnresolved(true)})
   .catch(()=>{if(!controller.signal.aborted)setUnresolved(true)});
  return()=>controller.abort();
 },[headId,view.poll,recheck]);
 async function act(kind:'confirm'|'cancel'){
  if(busy||(kind==='confirm'&&!view.canConfirm)||(kind==='cancel'&&!view.canCancel))return;
  setBusy(true);setNote(null);
  try{
   if(kind==='cancel'){changeRef.current((await cancelProposalGroup(accessRef.current,threadId,headId)).lines);return}
   const group=await confirmProposalGroup(accessRef.current,threadId,headId,line=>{
    changeRef.current(linesRef.current.map(item=>item.id===line.id?{...item,state:line.state,outcome:line.code!==undefined?{code:line.code}:item.outcome,record:line.record??item.record}:item));
   },undefined,options?purpose:null);
   if(group)changeRef.current(group.lines);else setRecheck(n=>n+1);
  }catch(error){
   // A ChatAccessError is a 401 answer (these routes keep 403 local): the chat handler verifies the session before any
   // claim, so nothing ran and the card stays as it is (tests/unit/chat-handler.test.mjs, 401 on Confirm).
   if(error instanceof ChatAccessError)return;
   if(error instanceof ChatHttpError&&error.status===409&&error.code==='proposal_executing'){setNote(proposalCodeText('proposal_executing',thai));setRecheck(n=>n+1);return}
   if(error instanceof ChatHttpError&&error.status===403){setNote(proposalCodeText(error.code,thai)??failureLine(error.code,thai));return}
   // No answer: read the group back (reconciled by the service); a line is never resent from here.
   if(kind==='confirm')setRecheck(n=>n+1);
   else setNote(t('Cancel not confirmed. Try again.','ยังยกเลิกไม่สำเร็จ ลองอีกครั้ง'));
  }finally{setBusy(false)}
 }
 const destructive=lines.some(line=>line.card.destructive);
 // CW3-01: the destructive lines named on the card and counted in Confirm (only the lines a Confirm would still run).
 const harmful=destructiveCounts(lines.filter(line=>line.card.destructive).map(line=>line.operation));
 const harmfulToRun=destructiveCounts(lines.filter((line,index)=>line.card.destructive&&(!view.remaining||view.lines[index]==='notrun')).map(line=>line.operation));
 const label=several?groupCountText(count,thai):pair([first.card.label.en,first.card.label.th],thai);
 const targets=[...new Set(lines.map(line=>line.card.target.label).filter((value):value is string=>!!value))];
 const done=view.lines.filter(state=>state==='done').length,failed=view.lines.filter(state=>state==='failed').length,notRun=count-done-failed;
 const single=proposalView(first,{online,busy,seen});
 const saved=view.state==='done'?savedAtText(latestSaved(lines),thai):null;
 const stateText=view.state==='executing'?(several?groupProgressText(done+failed,count,thai):proposalStateText('executing',thai))
  :view.state==='unknown'?(unresolved?proposalUnresolvedText(thai):proposalCodeText('outcome_unknown',thai))
  :view.state==='pending'?proposalStateText('pending',thai)
  :view.state==='done'?(saved??proposalStateText('done',thai))
  :view.state==='partial'||(view.state==='failed'&&several)?groupSummaryText({done,failed,notRun},thai)
  :view.state==='failed'?failureLine(single.code,thai)
  :proposalCodeText(view.state==='expired'?'proposal_expired':'proposal_cancelled',thai);
 return <section ref={cardRef} className="chat-proposal" data-armed={waiting&&seen?'true':undefined} data-state={view.state} data-lines={count} data-destructive={destructive?'true':undefined} aria-label={t('Change to confirm: ','การเปลี่ยนแปลงที่รอยืนยัน: ')+label}>
  <header className="chat-proposal-head">
   <Icon name={destructive?'warning':'edit'} className="chat-proposal-icon"/>
   <div><h3>{label}</h3>{targets.length>0&&<p className="chat-proposal-target">{targets.length>3?targets.slice(0,3).join(', ')+', …':targets.join(', ')}</p>}</div>
  </header>
  {destructive&&<p className="chat-proposal-destructive" role="note">{several?destructiveWarningText(harmful,thai):consequenceText({code:'destructive'},thai)}</p>}
  {several?<ol className="chat-proposal-lines">{lines.map((line,index)=>{const state:LineView=view.lines[index];return <li key={line.id} className="chat-proposal-line" data-state={state} data-destructive={line.card.destructive?'true':undefined}>
   <div className="chat-proposal-line-head">
    <span className="chat-proposal-line-title">{line.card.destructive&&<Icon name="warning" className="chat-proposal-line-icon"/>}{pair([line.card.label.en,line.card.label.th],thai)}{line.card.target.label?' · '+line.card.target.label:''}</span>
    <span className="chat-proposal-line-tags">{line.card.destructive&&<span className="chat-proposal-tag">{destructiveTagText(line.operation,thai)}</span>}<span className="chat-proposal-chip" data-state={state}>{lineChipText(state,thai)}</span></span>
   </div>
   <LineBody line={line} thai={thai}/>
   {state==='failed'&&<p className="chat-proposal-line-failure">{failureLine(line.outcome?.code??null,thai)}</p>}
   {state==='done'&&onOpenRecord&&openable(line.record)&&<button type="button" data-proposal-id={line.id} className="text-action chat-proposal-open" onClick={()=>onOpenRecord(line.record as ProposalRecord)}>{pair(proposalButtons.open,thai)}</button>}
  </li>})}</ol>:<>
   {options&&waiting&&<RemainderChoice options={options} choice={choice} choosing={choosing||!purpose} thai={thai} onChoose={next=>{setChoice(next);if(next&&next.kind!=='split')setChoosing(false);}} onChange={()=>{setChoosing(true);setSeen(typeof IntersectionObserver==='undefined');}}/>}
   {options&&waiting&&choice?.kind==='split'&&purpose&&choosing&&<button type="button" className="secondary-button" onClick={()=>setChoosing(false)}>{t('Use this split','ใช้การแบ่งนี้')}</button>}
   <LineBody line={first} thai={thai}/>
   {options&&purpose&&choice&&<ChosenRows options={options} choice={choice} thai={thai}/>}
  </>}
  <footer className="chat-proposal-foot">
   <p className="chat-proposal-state" role="status" aria-live="polite">
    {(view.state==='executing'||(view.state==='unknown'&&!unresolved)||busy)&&<span className="collection-spinner" aria-hidden="true"/>}
    <span>{stateText}</span>
   </p>
   {waiting&&<p className="chat-proposal-countdown">{proposalCountdown(view.remainingSeconds,thai)}</p>}
   {note&&<p className="chat-proposal-note" role="alert">{note}</p>}
   {waiting&&<div className="chat-proposal-actions">
    <button type="button" className={destructive?'chat-proposal-confirm destructive-action':'chat-proposal-confirm'} disabled={!view.canConfirm} onClick={()=>void act('confirm')}>{groupConfirmText({count,pending:view.pending,remaining:view.remaining,label:first.card.confirmLabel,destructive:several?harmfulToRun:undefined},thai)}</button>
    <button type="button" className="secondary-button" disabled={!view.canCancel} onClick={()=>void act('cancel')}>{pair(proposalButtons.cancel,thai)}</button>
    {!online&&<span className="chat-proposal-offline">{pair(proposalButtons.offline,thai)}</span>}
   </div>}
   {waiting&&several&&!seen&&<p className="chat-proposal-arm-hint">{armHintText(thai)}</p>}
   {waiting&&options&&!purpose&&<p className="chat-proposal-arm-hint field-help">{t('Choose how to use the remainder before review.','เลือกวิธีใช้ยอดคงเหลือก่อนตรวจสอบ')}</p>}
   {(view.state==='failed'||view.state==='partial'||view.state==='expired')&&!waiting&&onAskAgain&&<button type="button" className="secondary-button chat-proposal-again" onClick={onAskAgain}>{pair(proposalButtons.askAgain,thai)}</button>}
   {!several&&single.state==='done'&&onOpenRecord&&openable(first.record)&&<button type="button" data-proposal-id={first.id} className="text-action chat-proposal-open" onClick={()=>onOpenRecord(first.record as ProposalRecord)}>{pair(proposalButtons.open,thai)}</button>}
  </footer>
 </section>;
}
