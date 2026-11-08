import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {OperationConfirm} from './OperationConfirm';
import {useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {beginRequest} from './request-activity';
import {useDomainDraft} from './domain-draft';
import {displayDate} from './display-date';
import {loanTypeLabel,loanValidation,stepMoney,stepInterval,dailyPercentage,instalmentSchedule,termDays,dueDateHelper,dailyPaymentHelper,INSTALMENT} from './loan-form-values';
import {wholeNumberProps,normalizeWhole} from './whole-number-input';
import {rolloverStatement,rolloverPrefill,rolloverArrangement,generatedArrangement,penaltyHelper,penaltyStep,negativeCashMessage,ineligibleReason,rolloverRebateLine,rolloverFieldChange,dmy,baht,type RolloverStatement,type RolloverManual} from './rollover-statement';
type Fields={principal:string|null;transferFee:string|null;disbursingAccountId:string|null;dueDate:string|null;dailyPayment:string|null;currentDailyInterest:string|null;paymentInterval:number|null;arrangement:string|null};
/** The Rollover statement card (design 5.3): label and amount rows, the settlement subheading, Cash issued largest. */
export function RolloverStatementCard({statement,thai}:{statement:RolloverStatement;thai:boolean}){
 return <section className="close-summary rollover-statement" aria-label={thai?'ใบสรุปการต่อสัญญา':'Rollover statement'} data-testid="rollover-statement"><dl>{statement.rows.map(row=>row.kind==='heading'
  ?<div key={row.key} className="rollover-heading"><dt>{row.label}</dt></div>
  :<div key={row.key} className={'rollover-row'+(row.kind?' rollover-'+row.kind:'')+(row.kind==='cash'&&statement.negative?' rollover-negative':'')} data-row={row.key}><dt>{row.label}{row.detail&&<small className="field-help">{row.detail}</small>}</dt><dd className="rollover-amount">{baht(row.value)}</dd></div>)}</dl></section>;
}
/** R136 (V138): the rollover loan form (online only). The new loan of the original loan's type, prefilled from it; the early
 * closure penalty; the live statement from the server quote; Review opens the confirm page; Confirm sends loan.rollover. */
export function LoanRollover({access,item,sourceKey,thai,onBack,onApplied}:{access:CommandAccess;item:any;sourceKey:string;thai:boolean;onBack:()=>void;onApplied:(newLoanId:string,cash:string,rebate:Promise<string>)=>void}){
 const t=(en:string,th:string)=>thai?th:en,generation=useRef(0),targetId=useRef(crypto.randomUUID()),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [preview,setPreview]=useState<any>(null),[day,setDay]=useState<string|null>(null),[penalty,setPenalty]=useState<string|null>(null),[fields,setFields]=useState<Fields|null>(null);
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[command,setCommand]=useState<any>(null),[changed,setChanged]=useState(false),arrangementEdited=useRef(false);
 // R136 (design 5.3): a device draft like the other forms: the day, the penalty, the new-loan fields, whether the Partner
 // edited the arrangement and the new loan's id; the statement is never saved and is re-quoted on restore.
 const restored=useRef<any>(null),[manual,setManual]=useState<RolloverManual>({}),manualRef=useRef(manual);manualRef.current=manual;
 const draft=useDomainDraft({updateBlocked:!command,repository:access.offline,id:'rollover:'+item.id,domain:'loan',label:item.borrowerDisplayName??t('Rollover loan','ต่อสัญญาใหม่'),
  value:{kind:'rollover',loanId:item.id,targetId:targetId.current,day,penalty,fields,manual,arrangementEdited:arrangementEdited.current},enabled:!!fields&&!!day&&!command,
  restore:value=>{if(value?.kind==='rollover'&&value.loanId===item.id&&value.fields){restored.current=value;if(typeof value.targetId==='string')targetId.current=value.targetId;arrangementEdited.current=!!value.arrangementEdited;setManual(value.manual??{});setFields(value.fields);setPenalty(value.penalty??null);setDay(value.day??null)}}});
 const instalment=item.type===INSTALMENT,step=penaltyStep(preview?.source??item);
 async function read(path:string){const done=beginRequest('read'),controller=new AbortController(),stop=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(access.origin+path,{headers:{Authorization:'Bearer '+await access.token()},signal:controller.signal,cache:'no-store',credentials:'omit',redirect:'error'});if(response.status===401||response.status===403)access.authFailure(response.status);return {response,data:await response.json()}}finally{clearTimeout(stop);done()}}
 /** The rebate line of a referred original loan: the settlement payment's closeRebates (best effort, read after the new loan
  * opens, so the confirm page never waits on it; '' when unreadable). */
 async function rebateLine(paymentId:unknown){if(typeof paymentId!=='string')return '';try{const {response,data}=await read('/api/payment-records/'+encodeURIComponent(paymentId));return response.ok?rolloverRebateLine(data?.item?.closeRebates,thai):''}catch{return ''}}
 async function quote(nextDay:string|null,nextPenalty:string|null,first=false){
  const current=++generation.current;setError('');
  if(access.offlineOnly||!navigator.onLine){setBusy(false);setError(t('Connect to review the rollover.','เชื่อมต่อเพื่อตรวจสอบการต่อสัญญา'));return null;}
  setBusy(true);
  try{const query=new URLSearchParams();if(nextDay)query.set('day',nextDay);if(nextPenalty!==null)query.set('penalty',nextPenalty);
   const {response,data}=await read('/api/loan-records/'+encodeURIComponent(item.id)+'/rollover-preview'+(query.size?'?'+query:''));
   if(current!==generation.current)return null;if(!response.ok)throw Error();
   setPreview(data);
   if(first&&restored.current){
    // A restored draft keeps its fields; a saved day that is no longer today or yesterday moves to today (and an untouched
    // arrangement note follows); the statement comes from this fresh quote, or one more for the saved day.
    const saved=restored.current;restored.current=null;
    if([data.today,data.yesterday].includes(saved.day)&&saved.day!==data.businessDate&&!(data.source?.loanDate&&saved.day<data.source.loanDate)){setDay(saved.day);void quote(saved.day,data.penalty);}
    else{setDay(data.businessDate);
     // The same rule as requote(): an untouched due date (the saved day's prefill) moves with the day.
     const savedDue=instalment?rolloverPrefill(data.source,saved.day??data.businessDate).dueDate:null,todayDue=instalment?rolloverPrefill(data.source,data.businessDate).dueDate:null;
     setFields(prior=>{if(!prior)return prior;let next=prior;if(instalment&&prior.dueDate===savedDue)next={...next,dueDate:todayDue};
      if(!saved.arrangementEdited&&generatedArrangement(prior.arrangement))next={...next,arrangement:rolloverArrangement(data.source,data.businessDate,data.penalty,sourceKey)};return next});}
   }else if(first){const prefill=rolloverPrefill(data.source,data.businessDate);setDay(data.businessDate);setPenalty(data.penalty);
    setFields({...prefill,disbursingAccountId:data.accounts.find((a:any)=>a.id===data.source.disbursingAccountId)?.id??data.accounts.find((a:any)=>a.isDefault)?.id??null,arrangement:rolloverArrangement(data.source,data.businessDate,data.penalty,sourceKey)});}
   return data;
  }catch{if(current===generation.current)setError(t('Rollover statement unavailable. Return and try again.','โหลดใบสรุปการต่อสัญญาไม่ได้ กลับแล้วลองอีกครั้ง'));return null}
  finally{if(current===generation.current)setBusy(false)}
 }
 // biome-ignore lint/correctness/useExhaustiveDependencies: reads the preview once the draft is read (a restored draft's penalty is quoted); quote is recreated every render
 useEffect(()=>{if(!draft.ready)return;void quote(null,restored.current?.penalty??null,true);return()=>{generation.current++;if(timer.current)clearTimeout(timer.current)}},[item.id,draft.ready]);
 /** Changing the day or the penalty re-quotes the original loan's side; an untouched arrangement note follows them. */
 function requote(nextDay:string|null,nextPenalty:string|null){
  if(preview&&!arrangementEdited.current&&nextDay)setFields(prior=>prior&&generatedArrangement(prior.arrangement)?{...prior,arrangement:rolloverArrangement(preview.source,nextDay,nextPenalty,sourceKey),
   dueDate:instalment&&prior.dueDate===rolloverPrefill(preview.source,day??nextDay).dueDate?rolloverPrefill(preview.source,nextDay).dueDate:prior.dueDate}:prior);
  if(timer.current)clearTimeout(timer.current);
  if(nextPenalty!==null&&!/^(0|[1-9][0-9]*)$/.test(nextPenalty))return;
  timer.current=setTimeout(()=>void quote(nextDay,nextPenalty),250);
 }
 // UX-13: a principal change re-derives the untouched fee and daily payment or daily interest from the original loan's ratios.
 const update=(key:keyof Fields,value:any)=>{if(key==='arrangement')arrangementEdited.current=true;
  setFields(prior=>{if(!prior)return prior;const next=rolloverFieldChange(prior,manualRef.current,key,value,preview?.source??null);manualRef.current=next.manual;setManual(next.manual);return next.fields})};
 // UX-11: the penalty may be empty while it is edited (no quote then, and an inline message); leading zeros are dropped.
 const changePenalty=(text:string)=>{const value=normalizeWhole(text).replace(/^0+(?=\d)/,'');setPenalty(value);if(/^(0|[1-9][0-9]*)$/.test(value))requote(day,value);else if(timer.current)clearTimeout(timer.current)};
 const loanFields=fields&&day?{...fields,borrowerId:item.borrowerId,loanDate:day,type:item.type,fixedInterest:null,autoChargeEnabled:true}:null;
 const statement=preview?.eligible&&loanFields?rolloverStatement({type:item.type,principal:fields!.principal,transferFee:fields!.transferFee,dailyPayment:fields!.dailyPayment,currentDailyInterest:fields!.currentDailyInterest,loanDate:day!,dueDate:fields!.dueDate,quote:preview.quote,sourceKey,today:preview.today},thai):null;
 const invalid=loanFields?loanValidation(loanFields):null,negative=statement?negativeCashMessage(statement,thai):null;
 const penaltyInvalid=penalty===null||!/^(0|[1-9][0-9]*)$/.test(penalty),penaltyMessage=penalty!==null&&penaltyInvalid?t('Enter the penalty in whole baht (0 or more).','กรอกค่าปรับเป็นบาทเต็ม (ตั้งแต่ 0)'):null,stale=!!preview&&(preview.businessDate!==day||preview.penalty!==penalty);
 const canReview=!busy&&!!statement&&!negative&&!invalid&&!penaltyInvalid&&!stale&&!!fields?.disbursingAccountId&&!access.offlineOnly&&navigator.onLine;
 function review(){if(!canReview||!loanFields||!preview?.quote)return;setChanged(false);
  setCommand({requestId:crypto.randomUUID(),operation:'loan.rollover',targetId:targetId.current,expectedVersion:null,predecessorRequestId:null,receiptId:null,
   inputs:{borrowerId:item.borrowerId,loanDate:day,principal:fields!.principal,transferFee:fields!.transferFee,disbursingAccountId:fields!.disbursingAccountId,type:item.type,
    dueDate:instalment?fields!.dueDate:null,dailyPayment:instalment?fields!.dailyPayment:null,fixedInterest:null,currentDailyInterest:instalment?null:fields!.currentDailyInterest,
    paymentInterval:fields!.paymentInterval,arrangement:fields!.arrangement,autoChargeEnabled:true,sourceLoanId:item.id,sourceExpectedVersion:preview.quote.sourceVersion,
    penalty,expectedSettlement:preview.quote.settlement,expectedPlanHash:preview.quote.planHash}});}
 const borrower=item.borrowerDisplayName??'';
 if(command&&statement)return <OperationConfirm key={command.requestId} access={access} command={command} domain="loan" label={t('Confirm rollover','ยืนยันการต่อสัญญา')} thai={thai} onBack={()=>{setCommand(null);void quote(day,penalty)}}
  onApplied={result=>{void draft.discard();onApplied(result?.targetId??targetId.current,result?.rollover?.statement?.cashIssued??String(statement.cashIssued),rebateLine(result?.settlement?.paymentId))}}
  onBlocked={code=>{if(code==='source_conflict')setChanged(true)}}
  rejectionText={code=>code==='source_conflict'?t('Original loan balances changed. Review the current amount before continuing.','ยอดของสินเชื่อเดิมเปลี่ยนแล้ว ตรวจสอบยอดปัจจุบันก่อนดำเนินการต่อ'):code==='rollover_ineligible'?ineligibleReason(null,thai):null}>
  <p className="rollover-cash-lead">{t('Cash issued to borrower','เงินสดที่จ่ายให้ผู้กู้')} <strong>{baht(statement.cashIssued)}</strong></p>
  <RolloverStatementCard statement={statement} thai={thai}/>
  <h3>{t('New loan','สินเชื่อใหม่')}</h3><dl>{[[t('Loan Date','วันที่กู้'),displayDate(day!)],[t('Loan Type','ประเภทเงินกู้'),loanTypeLabel(item.type,thai)],[t('Principal Amount','เงินต้น'),baht(Number(fields!.principal))],[t('Documentation Fee','ค่าธรรมเนียมเอกสาร'),baht(Number(fields!.transferFee??0))],
   ...(instalment?[[t('Due Date','วันครบกำหนด'),displayDate(fields!.dueDate??'')],[t('Daily Payment Amount','ยอดชำระรายวัน'),baht(Number(fields!.dailyPayment))]]:[[t('Current Daily Interest','ดอกเบี้ยรายวันปัจจุบัน'),baht(Number(fields!.currentDailyInterest))]]),
   [t('Interest Payment Interval','รอบชำระดอกเบี้ย'),String(fields!.paymentInterval??'—')],[t('Disbursing Cash Account','บัญชีจ่ายเงินกู้'),preview.accounts.find((a:any)=>a.id===fields!.disbursingAccountId)?.label??'—'],
   [t('Loan Arrangement','ข้อตกลงการกู้ยืม'),fields!.arrangement??'—']].map(([label,value])=><div key={label}><dt>{label}</dt><dd style={{whiteSpace:'pre-wrap'}}>{value}</dd></div>)}</dl>
  <p className="field-help" data-testid="rollover-cash-lines">{t(`Cash: ${baht(statement.principal)} out (disbursement); in by net-off at disbursement: ${baht(statement.firstDayPayment+statement.fee)} first day of the new loan, ${baht(statement.settlement)} settlement of the original loan.`,`เงินสด: จ่ายออก ${baht(statement.principal)} (จ่ายเงินกู้) · รับเข้าแบบหักกลบ ${baht(statement.firstDayPayment+statement.fee)} (ยอดวันแรกสินเชื่อใหม่) และ ${baht(statement.settlement)} (ปิดยอดสินเชื่อเดิม)`)}</p>
  {changed&&<button type="button" onClick={()=>{setCommand(null);void quote(day,penalty)}}>{t('Use current statement','ใช้ยอดปัจจุบัน')}</button>}
 </OperationConfirm>;
 const money=(key:keyof Fields,en:string,th:string,increment:number|null=null,required=true)=><label><span className="field-title">{t(en,th)}</span><span className="loan-number-control"><input aria-label={t(en,th)} data-field={key} {...wholeNumberProps} required={required} value={String(fields?.[key]??'')} disabled={busy&&!preview} onChange={e=>update(key,normalizeWhole(e.target.value)||null)}/>{increment&&<span className="loan-step-buttons"><button type="button" aria-label={t('Increase '+en+' by '+increment,'เพิ่ม'+th+' '+increment)} onClick={()=>update(key,stepMoney(String(fields?.[key]??''),increment))}><Icon name="increase"/></button><button type="button" aria-label={t('Decrease '+en+' by '+increment,'ลด'+th+' '+increment)} onClick={()=>update(key,stepMoney(String(fields?.[key]??''),-increment))}><Icon name="decrease"/></button></span>}</span></label>;
 const schedule=instalment&&fields&&day?instalmentSchedule(fields.principal,fields.dailyPayment,day,fields.dueDate):null;
 return <section className="borrower-record" aria-label={t('Rollover loan','ต่อสัญญาใหม่')} aria-busy={busy}><div className="related-loans-heading"><HeaderBack navigationKey="loan-rollover" className="icon-action" aria-label={t('Back to loan details','กลับรายละเอียดสินเชื่อ')} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{t('Rollover loan','ต่อสัญญาใหม่')} · {borrower}</h2></div>
  {error&&<p role="alert">{error}</p>}
  {preview&&!preview.eligible&&<p role="alert">{ineligibleReason(preview.reason,thai)}</p>}
  {preview?.eligible&&fields&&<form onSubmit={e=>{e.preventDefault();review()}}>
   <fieldset className="loan-type-options"><legend>{t('Loan Date','วันที่กู้')} *</legend>{[[preview.today,t('Today','วันนี้')],[preview.yesterday,t('Yesterday','เมื่อวาน')]].map(([value,label])=>{const early=!!preview.source?.loanDate&&value<preview.source.loanDate;return <label key={value}><input type="radio" name="rollover-day" disabled={early} checked={day===value} onChange={()=>{setDay(value);requote(value,penalty)}}/><span>{label} · {dmy(value)}{early&&<small className="field-help"> {t('Before the original loan date '+dmy(preview.source.loanDate),'ก่อนวันที่กู้ของสินเชื่อเดิม '+dmy(preview.source.loanDate))}</small>}</span></label>})}</fieldset>
   {/* biome-ignore lint/a11y/noLabelWithoutControl: the type is locked to the original loan's and shown read only */}
   <label><span className="field-title">{t('Loan Type','ประเภทเงินกู้')}</span><span className="borrower-field-value">{loanTypeLabel(item.type,thai)}</span></label>
   {money('principal','Principal Amount','เงินต้น',500)}{money('transferFee','Documentation Fee','ค่าธรรมเนียมเอกสาร',100,false)}
   <label><span className="field-title">{t('Disbursing Cash Account','บัญชีจ่ายเงินกู้')}</span><select required value={fields.disbursingAccountId??''} onChange={e=>update('disbursingAccountId',e.target.value||null)}><option value="">—</option>{preview.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   {instalment&&<><label><span className="field-title">{t('Due Date','วันครบกำหนด')}</span><input type="date" required aria-label={t('Due Date','วันครบกำหนด')} min={day??undefined} value={fields.dueDate??''} onChange={e=>update('dueDate',e.target.value||null)}/></label>
    {dueDateHelper(termDays(day,fields.dueDate),thai)&&<p className="field-help">{dueDateHelper(termDays(day,fields.dueDate),thai)}</p>}
    {money('dailyPayment','Daily Payment Amount','ยอดชำระรายวัน')}{schedule&&<p className="field-help">{dailyPaymentHelper(schedule,thai)}</p>}</>}
   {!instalment&&money('currentDailyInterest','Current Daily Interest','ดอกเบี้ยรายวันปัจจุบัน')}
   {!instalment&&<p className="field-help" data-testid="daily-rate-helper">{t(dailyPercentage(fields.principal,fields.currentDailyInterest)+' of principal per day',dailyPercentage(fields.principal,fields.currentDailyInterest)+' ของเงินต้นต่อวัน')}</p>}
   <label><span className="field-title">{t('Interest Payment Interval','รอบชำระดอกเบี้ย')}</span><span className="loan-number-control"><input aria-label={t('Interest Payment Interval','รอบชำระดอกเบี้ย')} data-field="paymentInterval" {...wholeNumberProps} required value={fields.paymentInterval??''} onChange={e=>{const text=normalizeWhole(e.target.value);if(!text)update('paymentInterval',null);else if(/^[0-9]+$/.test(text))update('paymentInterval',Number(text))}}/><span className="loan-step-buttons"><button type="button" aria-label={t('Increase Interest Payment Interval by 1','เพิ่มรอบชำระดอกเบี้ย 1')} onClick={()=>update('paymentInterval',stepInterval(fields.paymentInterval,1))}><Icon name="increase"/></button><button type="button" disabled={(fields.paymentInterval??1)<=1} aria-label={t('Decrease Interest Payment Interval by 1','ลดรอบชำระดอกเบี้ย 1')} onClick={()=>update('paymentInterval',stepInterval(fields.paymentInterval,-1))}><Icon name="decrease"/></button></span></span></label>
   <label><span className="field-title">{t('Loan Arrangement','ข้อตกลงการกู้ยืม')}</span><textarea value={fields.arrangement??''} onChange={e=>update('arrangement',e.target.value||null)}/></label>
   <label><span className="field-title">{t('Early closure penalty (original loan)','ค่าปรับปิดสินเชื่อเดิมก่อนกำหนด')}</span><span className="loan-number-control"><input aria-label={t('Early closure penalty (original loan)','ค่าปรับปิดสินเชื่อเดิมก่อนกำหนด')} data-field="penalty" {...wholeNumberProps} required aria-invalid={penaltyMessage?true:undefined} value={penalty??''} onChange={e=>changePenalty(e.target.value)}/>{step>0&&<span className="loan-step-buttons"><button type="button" aria-label={t('Increase penalty by one day','เพิ่มค่าปรับหนึ่งวัน')} onClick={()=>changePenalty(stepMoney(penalty||'0',step))}><Icon name="increase"/></button><button type="button" aria-label={t('Decrease penalty by one day','ลดค่าปรับหนึ่งวัน')} onClick={()=>changePenalty(stepMoney(penalty||'0',-step))}><Icon name="decrease"/></button></span>}</span></label>
   {penaltyMessage?<p role="alert" className="rollover-negative-message" data-testid="penalty-message">{penaltyMessage}</p>:penaltyHelper(penalty,step,thai)&&<p className="field-help">{penaltyHelper(penalty,step,thai)}</p>}
   {statement&&<RolloverStatementCard statement={statement} thai={thai}/>}
   {negative&&<p role="alert" className="rollover-negative-message">{negative}</p>}
   {invalid&&statement&&<p role="alert">{t('Check the new loan terms: whole baht, payments through the due date above the principal.','ตรวจสอบเงื่อนไขสินเชื่อใหม่: บาทเต็ม ยอดชำระรวมถึงวันครบกำหนดต้องมากกว่าเงินต้น')}</p>}
   <div className="rollover-review-row">{statement&&<span>{t('Cash issued','เงินสดที่จ่าย')} <strong className={statement.negative?'rollover-negative':undefined}>{baht(statement.cashIssued)}</strong></span>}<button type="submit" disabled={!canReview}>{t('Review rollover','ตรวจสอบการต่อสัญญา')}</button></div>
  </form>}
 </section>;
}
