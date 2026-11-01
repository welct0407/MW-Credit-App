import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {wholeBaht} from './display-money';
import {OperationConfirm} from './OperationConfirm';
import {wholeNumberProps,normalizeWhole} from './whole-number-input';
import {beginRequest} from './request-activity';
import {defaultKeepCharges,defaultLossHeading,defaultLossPrefill,defaultLossSummary,planDefaultLoss} from './default-loss';
import {useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
/** R109 Default Loan sheet (Echo R109-UX-S01..S09): a loss amount and the keep-charges switch, then OperationConfirm. */
export function LoanDefault({access,item,thai,onBack,onApplied,onEditLoan}:{access:CommandAccess;item:any;thai:boolean;onBack:()=>void;onApplied:()=>void;onEditLoan:()=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 const [businessDate,setBusinessDate]=useState<string|null>(null),[loadError,setLoadError]=useState(false),[amountText,setAmountText]=useState(()=>defaultLossPrefill(item));
 // The Partner's last explicit choice, restored when the amount returns to the full outstanding principal (UX-S03).
 const [keepChoice,setKeepChoice]=useState(()=>defaultKeepCharges(item)),[command,setCommand]=useState<any>(null),[blockedCode,setBlockedCode]=useState(''),generation=useRef(0);
 async function load(){const current=++generation.current,done=beginRequest(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);setLoadError(false);try{const response=await fetch(access.origin+'/api/loan-options',{signal:controller.signal,headers:{Authorization:'Bearer '+await access.token()},cache:'no-store',credentials:'omit',redirect:'error'});if(response.status===401||response.status===403)access.authFailure(response.status);if(!response.ok)throw Error();const value=(await response.json()).businessDate;if(typeof value!=='string')throw Error();if(current===generation.current)setBusinessDate(value)}catch{if(current===generation.current)setLoadError(true)}finally{clearTimeout(timer);done()}}
 // biome-ignore lint/correctness/useExhaustiveDependencies: reads the business date once per sheet; load is recreated every render
 useEffect(()=>{void load();return()=>{generation.current++}},[]);
 const plan=planDefaultLoss(item,{amountText,keepChoice,businessDate});
 const money=(value:number)=>wholeBaht(value),heading=defaultLossHeading(plan,thai),summary=defaultLossSummary(plan,thai,money);
 const outstandingText=wholeBaht(plan.outstanding),offline=access.offlineOnly||!navigator.onLine;
 const unpaid=plan.unpaidCount===null||plan.unpaidAmount===null?t('Unavailable','ไม่มีข้อมูล'):plan.unpaidCount===0?t('None','ไม่มี'):plan.unpaidCount+' · '+wholeBaht(plan.unpaidAmount);
 const messages:Record<string,string>={
  amount:t(`Enter whole baht from ฿1 to ${wholeBaht(plan.maxAmount)}.`,`ระบุจำนวนเต็มบาทตั้งแต่ ฿1 ถึง ${wholeBaht(plan.maxAmount)}`),
  'partial-type':t('Only Daily interest loans can take a partial loss. Use the full amount to write off and close.','การตัดหนี้สูญบางส่วนใช้ได้กับสินเชื่อดอกเบี้ยรายวันเท่านั้น ใช้ยอดเต็มเพื่อตัดหนี้สูญและปิดสินเชื่อ'),
  'rate-missing':t('Original Daily Interest Rate is missing. Set it in Edit loan before recording this loss.','ยังไม่มีอัตราดอกเบี้ยรายวันเริ่มต้น กรุณาระบุในแก้ไขสินเชื่อก่อนบันทึกหนี้สูญนี้'),
  'same-day':t('A loss was already recorded today. Record the next one tomorrow, or Undo Default first.','บันทึกหนี้สูญไปแล้ววันนี้ บันทึกครั้งถัดไปพรุ่งนี้ หรือยกเลิกการผิดนัดก่อน'),
  'unpaid-unavailable':t('Unpaid charges could not be read. Go back and refresh the loan before recording a loss.','อ่านรายการเรียกเก็บค้างชำระไม่ได้ กลับไปโหลดสินเชื่อใหม่ก่อนบันทึกหนี้สูญ')};
 const keepHelp=plan.keepReason==='fully-lost'?t('The principal is already fully lost; only write off and close remains.','เงินต้นถูกตัดเป็นหนี้สูญทั้งหมดแล้ว เหลือเพียงตัดหนี้สูญและปิดสินเชื่อ')
  :plan.keepReason==='type'?t('Only Daily interest loans can keep unpaid charges.','การเก็บรายการเรียกเก็บไว้ใช้ได้กับสินเชื่อดอกเบี้ยรายวันเท่านั้น')
  :plan.keepReason==='partial'?t('A partial loss always keeps unpaid charges.','การตัดหนี้สูญบางส่วนจะเก็บรายการเรียกเก็บไว้เสมอ')
  :plan.keepReason==='nothing-unpaid'?t('Nothing unpaid to keep: a full loss writes off and closes the loan.','ไม่มีรายการเรียกเก็บค้างชำระให้เก็บไว้ การตัดหนี้สูญเต็มจำนวนจะปิดสินเชื่อ')
  :plan.keep?t('Unpaid charges stay collectable and the loan stays open.','รายการเรียกเก็บค้างชำระยังติดตามเก็บได้และสินเชื่อยังเปิดอยู่'):t('Unpaid charges are written off and the loan closes.','รายการเรียกเก็บค้างชำระจะถูกตัดออกและปิดสินเชื่อ');
 const reviewDisabled=!businessDate||offline||plan.outcome===null||plan.blockers.length>0;
 function review(){if(reviewDisabled||plan.amount===null)return;setBlockedCode('');setCommand({requestId:crypto.randomUUID(),operation:'loan.default',targetId:item.id,expectedVersion:item.version,predecessorRequestId:null,receiptId:null,inputs:{businessDate,amount:plan.amount,keepCharges:plan.keep}})}
 // Server refusals the pre-checks did not catch (UX-S07, S08), shown above OperationConfirm's generic message.
 const blockedHint=blockedCode==='invalid_date'?t('The business date changed. Reopen Default Loan.','วันที่ทำรายการเปลี่ยนแล้ว เปิดบันทึกผิดนัดใหม่')
  :blockedCode==='record_requires_reconciliation'?(item.type==='ดอกเบี้ยรายวัน'&&(item.originalRate===null||item.originalRate===undefined)?messages['rate-missing']:item.defaultLossDate===businessDate?messages['same-day']:''):'';
 const detail=<dl>
  <div><dt>{t('Borrower','ผู้กู้')}</dt><dd>{item.borrowerDisplayName}</dd></div>
  <div><dt>{t('Principal loss amount','จำนวนเงินต้นที่ตัดเป็นหนี้สูญ')}</dt><dd>{wholeBaht(plan.amount)}</dd></div>
  <div><dt>{t('Principal after','เงินต้นคงเหลือหลังบันทึก')}</dt><dd>{wholeBaht(plan.principalAfter)}</dd></div>
  <div><dt>{t('Keep unpaid charges for collection','เก็บรายการเรียกเก็บค้างชำระไว้ติดตาม')}</dt><dd>{plan.keep?t('Yes','ใช่'):t('No','ไม่')}</dd></div>
 </dl>;
 if(command)return <OperationConfirm key={command.requestId} access={access} command={command} domain="loan" label={heading} thai={thai} onBack={()=>{setCommand(null);setBlockedCode('')}} onApplied={onApplied} onBlocked={setBlockedCode}>{detail}<p>{summary}</p>{blockedHint&&<p role="alert">{blockedHint}</p>}</OperationConfirm>;
 return <section className="borrower-record loan-default" aria-label={t('Default Loan','บันทึกผิดนัด')}>
  <div className="related-loans-heading"><HeaderBack navigationKey="loan-default" className="icon-action" aria-label={t('Back to loan details','กลับรายละเอียดสินเชื่อ')} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{t('Default Loan','บันทึกผิดนัด')} · {item.borrowerDisplayName}</h2></div>
  {loadError&&<p role="alert">{t('Default Loan is unavailable. Try again when connected.','บันทึกผิดนัดไม่ได้ ลองอีกครั้งเมื่อเชื่อมต่อ')}<button type="button" onClick={()=>void load()}>{t('Retry','ลองอีกครั้ง')}</button></p>}
  <form onSubmit={event=>{event.preventDefault();review()}}>
   <section className="close-summary" aria-label={t('Current position','สถานะปัจจุบัน')}><dl>
    <div><dt>{t('Outstanding principal','เงินต้นคงเหลือ')}</dt><dd>{outstandingText}</dd></div>
    <div><dt>{t('Unpaid charges','รายการเรียกเก็บค้างชำระ')}</dt><dd>{unpaid}</dd></div>
    {item.type==='ดอกเบี้ยรายวัน'&&<div><dt>{t('Current daily interest','ดอกเบี้ยรายวันปัจจุบัน')}</dt><dd>{wholeBaht(item.currentDailyInterest)}</dd></div>}
   </dl></section>
   {/* R109-UX-P01: what blocks Review sits right under the position, above the fold on a phone. */}
   {plan.blockers.filter(code=>code!=='amount').map(code=><p role="alert" key={code}>{messages[code]}{code==='rate-missing'&&<button type="button" onClick={onEditLoan}>{t('Edit loan','แก้ไขสินเชื่อ')}</button>}{code==='unpaid-unavailable'&&<button type="button" onClick={onBack}>{t('Back to loan details','กลับรายละเอียดสินเชื่อ')}</button>}</p>)}
   {!plan.fullyLost&&<label><span className="field-title">{t('Principal loss amount','จำนวนเงินต้นที่ตัดเป็นหนี้สูญ')}</span><input {...wholeNumberProps} name="defaultLossAmount" required value={amountText} aria-describedby="default-loss-amount-help" aria-invalid={plan.blockers.includes('amount')} onChange={event=>setAmountText(normalizeWhole(event.target.value))}/></label>}
   {!plan.fullyLost&&<p className="field-help" id="default-loss-amount-help">{t(`Whole baht, ฿1 to ${wholeBaht(plan.maxAmount)}`,`จำนวนเต็มบาท ฿1 ถึง ${wholeBaht(plan.maxAmount)}`)}{plan.amount!==null&&Number(plan.amount)<plan.maxAmount&&<> <button type="button" className="text-action" onClick={()=>setAmountText(String(plan.maxAmount))}>{t('Use full amount','ใช้ยอดเต็ม')}</button></>}</p>}
   {!plan.fullyLost&&plan.blockers.includes('amount')&&<p role="alert">{messages.amount}</p>}
   <label><span className="field-title">{t('Keep unpaid charges for collection','เก็บรายการเรียกเก็บค้างชำระไว้ติดตาม')}</span><input type="checkbox" name="keepCharges" checked={plan.keep} disabled={plan.keepForced!==null} aria-describedby="default-loss-keep-help" onChange={event=>setKeepChoice(event.target.checked)}/></label>
   <p className="field-help" id="default-loss-keep-help">{keepHelp}</p>
   {plan.outcome&&<><h3>{heading}</h3><p aria-live="polite">{summary}</p></>}
   <button type="submit" disabled={reviewDisabled}>{t('Review default','ตรวจสอบการบันทึกผิดนัด')}</button>
  </form>
 </section>;
}
