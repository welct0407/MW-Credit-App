import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {OperationConfirm} from './OperationConfirm';
import {useDomainDraft} from './domain-draft';
import {wholeBaht} from './display-money';
import {dateRange,shortDate} from './pay-forward-text';
import {displayDateWithYear} from './display-date';
import {invalidateCachedReads,readCachedJson} from './read-cache';
import {borrowerLabel} from './borrower-label';
import {useEffect,useId,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {applyOldestFirst,cleanAmountInput,defaultSettleAmount,offsetPreviewRuns,settleAmountState,settlementAllocations,wholeAmount,type OffsetPreviewLine} from './referrer-text';
/** R129 (V137): one pending rebate of the referrer (GET /api/referrers/:id unpaid). R184: settledAmount is what settlements
 * already paid toward it (a part-paid rebate). */
export type UnpaidRebate={expenseId:string;loanId:string|null;loanDisplayKey:string|null;borrowerLabel:string;closeDate:string;amount:string;offsetAmount:string;pendingAmount:string;settledAmount?:string};
/** R184 (V155): whether a settlement can be offset to the referrer's own loan (settleOptions.offset) and the offset preview
 * of an amount (GET /api/referrers/:id/offset-preview). */
type OffsetOption={available:boolean;dueAmount:string;maxAmount:string;loanLabels?:string[]};
type OffsetPreview={available:boolean;dueAmount:string;maxAmount:string;amount:string;covered:string;planHash:string|null;lines:OffsetPreviewLine[];loans:Record<string,string>;paidThrough:Record<string,string>};
type Destination='referrer'|'offset';
type Reviewed={destination:Destination;amount:number;lines:{row:UnpaidRebate;applied:number;remaining:number}[];date:string;account:string;method:string;reference:string|null;notes:string;owedAfter:number;plan:OffsetPreview|null};
const sameList=(a:UnpaidRebate[],b:UnpaidRebate[])=>JSON.stringify(a.map(r=>[r.expenseId,r.pendingAmount]))===JSON.stringify(b.map(r=>[r.expenseId,r.pendingAmount]));
const validReference=(value:string)=>!!value.trim()&&new TextEncoder().encode(value).length<=256&&!/[\0\r\n]/.test(value);
const sameOffset=(a:OffsetOption|null,b:OffsetOption|null)=>!!a?.available===!!b?.available&&(a?.maxAmount??'0')===(b?.maxAmount??'0')&&(a?.dueAmount??'0')===(b?.dueAmount??'0');
/**
 * R129 and R184: the Pay rebates page. An amount is paid toward the ticked pending rebates of one referrer, oldest close first
 * (the full ticked total unless the owner types less), either to the referrer (one cash movement out of Lisa on the
 * settlement date) or as an offset to the referrer's own loan (today, the Loan Close offset plan, no cash moves). Review, then
 * Confirm through OperationConfirm (one rebate-settlement.create under a request id kept across retries of the attempt).
 * Online only; a draft keeps the ticks, the amount, whether it was typed, the destination and the fields when the phone is
 * backgrounded. Echo PAY-PART-01 to 08 and PAY-DEST-01 to 08.
 */
export function RebateSettlementForm({access,thai,detail,onBack,onDone}:{access:CommandAccess;thai:boolean;detail:any;onBack:()=>void;onDone:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,fieldId=useId(),referrer=detail.referrer,options=detail.settleOptions;
 const name=borrowerLabel(referrer.name,referrer.description);
 const [rows,setRows]=useState<UnpaidRebate[]>(detail.unpaid);
 const [ticked,setTicked]=useState<string[]>(()=>detail.unpaid.map((r:UnpaidRebate)=>r.expenseId));
 const [offset,setOffset]=useState<OffsetOption|null>(options.offset??null),[destination,setDestination]=useState<Destination>('referrer');
 // PAY-PART-03: an amount the owner typed is never changed by the page; until then it follows the ticks and the destination.
 const [amountText,setAmountText]=useState(''),[edited,setEdited]=useState(false);
 const [date,setDate]=useState<string>(options.businessDate),[account,setAccount]=useState<string>(options.defaultAccountId??options.accounts[0]?.id??''),[method,setMethod]=useState<'Bank Transfer'|'Cash'>('Bank Transfer');
 const [reference,setReference]=useState(''),[notes,setNotes]=useState(''),[error,setError]=useState(''),[checking,setChecking]=useState(false),[command,setCommand]=useState<any>(null),[reviewed,setReviewed]=useState<Reviewed|null>(null),[result,setResult]=useState<any>(null),[dirty,setDirty]=useState(false);
 const [preview,setPreview]=useState<OffsetPreview|null>(null),[previewBusy,setPreviewBusy]=useState(false),[spoken,setSpoken]=useState('');
 const flight=useRef(false),allBox=useRef<HTMLInputElement>(null),previewGeneration=useRef(0);
 const draft=useDomainDraft({updateBlocked:!command,repository:access.offline,id:'settle:'+referrer.id,domain:'referrer',label:t('Pay rebates','จ่ายค่าแนะนำ')+' · '+name,value:{ticked,date,account,method,reference,notes,amount:amountText,edited,destination},enabled:dirty&&!command&&!result,
  restore:value=>{if(Array.isArray(value?.ticked)){setTicked(value.ticked.filter((id:unknown)=>typeof id==='string'));setDate(value.date??options.businessDate);setAccount(value.account??account);setMethod(value.method==='Cash'?'Cash':'Bank Transfer');setReference(value.reference??'');setNotes(value.notes??'');
   setEdited(value.edited===true);setAmountText(typeof value.amount==='string'?cleanAmountInput(value.amount):'');setDestination(value.destination==='offset'&&options.offset?.available?'offset':'referrer');setDirty(true)}}});
 const change=(apply:()=>void)=>{if(flight.current)return;setDirty(true);setError('');apply()};
 const offline=access.offlineOnly||!navigator.onLine,networkTitle=t('Needs the network','ต้องเชื่อมต่ออินเทอร์เน็ต');
 const byOffset=destination==='offset',today=options.businessDate;
 const chosen=rows.filter(row=>ticked.includes(row.expenseId)),total=chosen.reduce((sum,row)=>sum+wholeAmount(row.pendingAmount),0),newest=chosen.map(r=>r.closeDate).sort().at(-1)??'';
 const most=wholeAmount(offset?.maxAmount),cap=byOffset?most:null,limit=cap===null?total:Math.min(total,cap);
 // Nothing ticked: the field is empty and disabled. Not edited: the default of the destination.
 const amountValue=!chosen.length?'':edited?amountText:String(defaultSettleAmount(destination,total,offset));
 const amountState=chosen.length?settleAmountState(amountValue,total,cap):'empty',amount=amountState==='ok'?Number(amountValue):0;
 const applied=applyOldestFirst(chosen,amount),paying=applied.filter(line=>line.applied>0),appliedOf=(id:string)=>applied.find(line=>line.row.expenseId===id);
 const offsetGone=byOffset&&!offset?.available;
 // Echo PAY-3: "Select all" is mixed while only some rebates are ticked.
 useEffect(()=>{if(allBox.current)allBox.current.indeterminate=chosen.length>0&&chosen.length<rows.length},[chosen.length,rows.length]);
 const referenceInvalid=!byOffset&&method==='Bank Transfer'&&reference!==''&&!validReference(reference);
 const dateInvalid=!byOffset&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||(!!newest&&date<newest));
 const count=(n:number)=>t(n+(n===1?' rebate':' rebates'),n+' รายการ');
 const footer=!chosen.length||amountState==='ok'?t((byOffset?'Offset ':'Pay ')+wholeBaht(amount)+' · '+count(paying.length),(byOffset?'หัก ':'จ่าย ')+wholeBaht(amount)+' · '+count(paying.length)):t('Check the amount','ตรวจสอบจำนวนเงิน');
 const referrerPath='/api/referrers/'+encodeURIComponent(referrer.id);
 const read=async()=>{const {response,data}=await readCachedJson<any>(access,referrerPath,{policy:'network-only'});if(!response.ok)throw Error();return data};
 const readPreview=async(value:number):Promise<OffsetPreview>=>{const {response,data}=await readCachedJson<any>(access,referrerPath+'/offset-preview?amount='+value,{policy:'network-only'});if(!response.ok)throw Error();return data};
 // PAY-DEST-02: the charges an offset of this amount pays, read after a pause in typing ("Updating…" meanwhile).
 // biome-ignore lint/correctness/useExhaustiveDependencies: one preview read per amount and destination; readPreview is recreated every render
 useEffect(()=>{const generation=++previewGeneration.current;
  if(!byOffset||amountState!=='ok'||offline||command||result){setPreviewBusy(false);if(!command&&!result)setPreview(null);return;}
  setPreviewBusy(true);
  const timer=setTimeout(()=>{void readPreview(amount).then(data=>{if(generation===previewGeneration.current){setPreview(data);setPreviewBusy(false)}}).catch(()=>{if(generation===previewGeneration.current){setPreview(null);setPreviewBusy(false)}})},450);
  return()=>clearTimeout(timer)},[byOffset,amountState,amount,offline,!!command,!!result]);
 // PAY-PART-07: the hidden live region follows the ticks and the destination, and the amount when its field loses focus;
 // not every keystroke. The help line is tied to the input through aria-describedby.
 // biome-ignore lint/correctness/useExhaustiveDependencies: announces on ticks and destination only; the footer text is read at that moment
 useEffect(()=>{setSpoken(footer)},[ticked.join('|'),destination,rows.length]);
 const loanNames=(plan:OffsetPreview|null)=>{const ids=[...new Set((plan?.lines??[]).map(line=>line.loanId??''))],labels=ids.map(id=>plan?.loans?.[id]).filter(Boolean);return labels.length?labels.join(', '):(offset?.loanLabels??[]).join(', ')||t("the referrer's loan",'สินเชื่อผู้แนะนำ')};
 const through=(plan:OffsetPreview|null)=>Object.values(plan?.paidThrough??{}).sort().at(-1)??null;
 // "LOAN · 1–30 Nov (฿500 × 30) · paid through 30 Nov", one line per loan the plan pays.
 const previewLines=(plan:OffsetPreview)=>offsetPreviewRuns(plan.lines,plan.paidThrough).map(run=>(plan.loans?.[run.loanId]??t('Loan','สินเชื่อ'))+' · '+dateRange(run.first,run.last,thai)
  +' ('+(run.count>1&&run.each?wholeBaht(run.each)+' × '+run.count:wholeBaht(String(run.amount)))+')'+(run.paidThrough?' · '+t('paid through ','ชำระถึง ')+shortDate(run.paidThrough,thai):''));
 // The page refuses a list older than the server's: the unpaid list, the offset option and (for an offset) the plan are
 // read again before Review. PAY-DEST-04: the destination is never switched silently.
 async function review(){if(flight.current||!chosen.length||amountState!=='ok'||offline||offsetGone||(!byOffset&&!account)||dateInvalid||referenceInvalid||!draft.ready)return;flight.current=true;setChecking(true);setError('');
  try{const fresh=await read(),freshOffset:OffsetOption|null=fresh.settleOptions?.offset??null,listChanged=!sameList(fresh.unpaid,rows),loanChanged=byOffset&&!sameOffset(freshOffset,offset);
   setOffset(freshOffset);
   if(listChanged){setRows(fresh.unpaid);setTicked(previous=>previous.filter(id=>fresh.unpaid.some((r:UnpaidRebate)=>r.expenseId===id)));setError(t('The unpaid list changed. Review it again.','รายการค้างจ่ายเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง'));return;}
   const changed=t("The referrer's loan changed. Review it again.",'สินเชื่อผู้แนะนำเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง');
   if(loanChanged){setError(changed);return;}
   let plan:OffsetPreview|null=null;
   if(byOffset){plan=await readPreview(amount);setPreview(plan);if(!plan.available||!plan.planHash||plan.covered!==String(amount)){setError(changed);return;}}
   await draft.freeze();
   const settlementDate=byOffset?fresh.settleOptions.businessDate:date,bankReference=!byOffset&&method==='Bank Transfer'&&reference.trim()?reference:null;
   setReviewed({destination,amount,lines:paying,date:settlementDate,account,method,reference:bankReference,notes,owedAfter:Math.max(0,wholeAmount(fresh.referrer.unpaidAmount)-amount),plan});
   // D5: per-rebate lines, only those that get more than ฿0, ascending by expense id; expectedPending is what this page read.
   setCommand({requestId:crypto.randomUUID(),operation:'rebate-settlement.create',targetId:crypto.randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
    inputs:{referrerId:referrer.id,destination,allocations:settlementAllocations(chosen,amount),settlementDate,cashAccountId:byOffset?null:account,paymentMethod:byOffset?null:method,bankReference,notes:notes===''?null:notes,expectedPlanHash:byOffset?plan?.planHash??null:null}});
  }catch{setError(t('The unpaid rebates could not be checked. Connect and try again.','ตรวจสอบค่าแนะนำค้างจ่ายไม่ได้ เชื่อมต่อแล้วลองอีกครั้ง'))}finally{flight.current=false;setChecking(false)}}
 // After a refusal the page reads the referrer again, so the next Review starts from the server's list and loan.
 const refresh=()=>void read().then(fresh=>{setRows(fresh.unpaid);setOffset(fresh.settleOptions?.offset??null);setTicked(previous=>previous.filter(id=>fresh.unpaid.some((r:UnpaidRebate)=>r.expenseId===id)))}).catch(()=>{});
 // PAY-DEST-06: "Pay the rest" reads the list fresh and opens the form with every remaining rebate ticked, the amount set to
 // the remainder (not edited), the payment to the referrer preselected and the same date.
 async function payRest(){if(flight.current)return;flight.current=true;setChecking(true);setError('');
  try{const fresh=await read();setRows(fresh.unpaid);setTicked(fresh.unpaid.map((r:UnpaidRebate)=>r.expenseId));setOffset(fresh.settleOptions?.offset??null);
   setDestination('referrer');setEdited(false);setAmountText('');setReference('');setNotes('');setPreview(null);setReviewed(null);setCommand(null);setResult(null);setDirty(false);draft.resume();
  }catch{setError(t('The unpaid rebates could not be checked. Connect and try again.','ตรวจสอบค่าแนะนำค้างจ่ายไม่ได้ เชื่อมต่อแล้วลองอีกครั้ง'))}finally{flight.current=false;setChecking(false)}}
 const accountLabel=(id:string)=>options.accounts.find((a:any)=>a.id===id)?.label??'—';
 const methodLabel=(value:string)=>value==='Cash'?t('Cash','เงินสด'):t('Bank transfer','โอนเงิน');
 const settleBy=(value:Destination)=>value==='offset'?t("Offset to referrer's loan",'หักกับสินเชื่อผู้แนะนำ'):t('Payment to referrer','จ่ายเงินให้ผู้แนะนำ');
 if(result&&reviewed){const done=result.detail,offsetDone=reviewed.destination==='offset',paid=done&&/^\d+$/.test(done.amount??'')?Number(done.amount):reviewed.amount,lines=Array.isArray(done?.lines)?done.lines.length:reviewed.lines.length;
  // PAY-DEST-08 (D13): what is still owed is the server's figure, exact when the settlement was recorded.
  const rest=done&&/^\d+$/.test(done.owedAfter??'')?Number(done.owedAfter):reviewed.owedAfter,day=through(reviewed.plan),heading=offsetDone?t('Rebates offset','หักค่าแนะนำแล้ว'):t('Rebates paid','จ่ายค่าแนะนำแล้ว');
  return <section className="borrower-record rebate-settlement-result" aria-label={heading} aria-busy={checking}><div className="related-loans-heading"><HeaderBack navigationKey="rebate-settle-result" className="icon-action" aria-label={t('Back to referrer','กลับหน้าผู้แนะนำ')} disabled={checking} onClick={onDone}><Icon name="back"/></HeaderBack><h2>{heading}</h2></div>
   {error&&<p role="alert">{error}</p>}
   <p role="status">{offsetDone?t('Offset '+wholeBaht(paid)+' to '+loanNames(reviewed.plan)+(day?', paid through '+shortDate(day,false):'')+' · '+count(lines),'หัก '+wholeBaht(paid)+' กับ '+loanNames(reviewed.plan)+(day?' ชำระถึง '+shortDate(day,true):'')+' · '+count(lines))
    :t('Paid '+wholeBaht(paid)+' to '+name+', '+count(lines),'จ่ายค่าแนะนำ '+wholeBaht(paid)+' ให้ '+name+' แล้ว '+count(lines))}</p>
   <p>{shortDate(reviewed.date,thai)} · {offsetDone?t('No transfer from Lisa','ไม่มีการโอนเงินจาก Lisa'):accountLabel(reviewed.account)}</p>{rest>0&&<p className="rebate-settle-rest">{t(wholeBaht(rest)+' still owed to '+name,'ยังค้างจ่าย '+name+' '+wholeBaht(rest))}</p>}
   <div className="rebate-settle-result-actions"><button type="button" disabled={checking} onClick={onDone}>{t('Back to referrer page','กลับหน้าผู้แนะนำ')}</button>
   {rest>0&&<button type="button" className="secondary-button" disabled={checking||offline} onClick={()=>void payRest()}>{t('Pay the rest '+wholeBaht(rest),'จ่ายส่วนที่เหลือ '+wholeBaht(rest))}</button>}</div>
   {rest>0&&offline&&<p className="field-help">{t('Connect to pay rebates','เชื่อมต่อเพื่อจ่ายค่าแนะนำ')}</p>}</section>;}
 if(command&&reviewed){const offsetReview=reviewed.destination==='offset',plan=reviewed.plan;
  const rejected=(code:string)=>code==='record_requires_reconciliation'||code==='source_conflict'?t('The unpaid list changed. Review it again.','รายการค้างจ่ายเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง')
   :code==='plan_changed'?t("The referrer's loan changed. Review it again.",'สินเชื่อผู้แนะนำเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง')
   :code==='invalid_date'?(offsetReview?t('An offset is recorded today. Review it again.','การหักบันทึกวันนี้ โปรดตรวจสอบอีกครั้ง'):t('The settlement date must be today or earlier, and not before the newest close.','วันที่จ่ายต้องไม่เกินวันนี้ และไม่ก่อนวันปิดล่าสุด'))
   :code==='account_unavailable'&&offsetReview?t("Lisa has no default account for the offset. Pay the referrer instead, or set Lisa's default account.",'Lisa ไม่มีบัญชีหลักสำหรับการหัก ให้จ่ายเงินให้ผู้แนะนำ หรือกำหนดบัญชีหลักของ Lisa'):null;
  return <OperationConfirm access={access} command={command} domain="referrer" draftKey={draft.key} label={t('Pay rebates','จ่ายค่าแนะนำ')+' · '+name} thai={thai}
   onBack={()=>{setCommand(null);setReviewed(null);draft.resume()}}
   onBlocked={code=>{if(['record_requires_reconciliation','source_conflict','invalid_date','plan_changed','account_unavailable'].includes(code))refresh()}}
   rejectionText={rejected}
   onApplied={applied=>{void invalidateCachedReads(access);void draft.discard().catch(()=>{});setResult({detail:applied?.rebateSettlement??null})}}>
   {/* PAY-DEST-07: what each rebate gets ("of ฿1,500" when it is only part), the totals and the destination. */}
   <ul className="rebate-settle-review">{reviewed.lines.map(line=><li key={line.row.expenseId}><span>{line.row.loanDisplayKey??line.row.borrowerLabel} · {shortDate(line.row.closeDate,thai)}</span><strong>{wholeBaht(line.applied)}{line.remaining>0&&<small>{t('of ','จาก ')+wholeBaht(line.row.pendingAmount)}</small>}</strong></li>)}</ul>
   <dl><div><dt>{offsetReview?t('Offsetting now','หักรอบนี้'):t('Paying now','จ่ายรอบนี้')}</dt><dd>{wholeBaht(reviewed.amount)}</dd></div>
   <div><dt>{t('Owed to '+name+' after this','ค้างจ่ายหลังรายการนี้')}</dt><dd>{wholeBaht(reviewed.owedAfter)}</dd></div>
   <div><dt>{t('Settle by','ชำระโดย')}</dt><dd>{settleBy(reviewed.destination)}</dd></div>
   <div><dt>{t('Settlement date','วันที่จ่าย')}</dt><dd>{shortDate(reviewed.date,thai)}</dd></div>
   {offsetReview?<><div><dt>{t('Loan','สินเชื่อ')}</dt><dd className="borrower-field-value">{loanNames(plan)}</dd></div>
    {plan&&<div><dt>{t('Charges','ค่างวด')}</dt><dd className="borrower-field-value">{previewLines(plan).map(line=><span className="rebate-offset-run" key={line}>{line}</span>)}</dd></div>}</>
   :<><div><dt>{t('Paying account','บัญชีที่จ่าย')}</dt><dd>{accountLabel(reviewed.account)}</dd></div><div><dt>{t('Method','วิธีจ่าย')}</dt><dd>{methodLabel(reviewed.method)}</dd></div>
    {reviewed.reference&&<div><dt>{t('Bank reference','เลขอ้างอิงธนาคาร')}</dt><dd className="borrower-field-value">{reviewed.reference}</dd></div>}</>}
   {reviewed.notes&&<div><dt>{t('Notes','หมายเหตุ')}</dt><dd className="borrower-field-value">{reviewed.notes}</dd></div>}</dl>
   {offsetReview&&<p className="field-help" role="note">{t('No transfer from Lisa','ไม่มีการโอนเงินจาก Lisa')}</p>}</OperationConfirm>;}
 // PAY-PART-04/06: one help line, the offset preview, then an error with its one-tap fix, all directly under the input so they
 // stay above the iPhone keyboard. Errors use field-help with aria-invalid and aria-describedby (no role=alert while typing).
 const helpId=fieldId+'amount-help',errorId=fieldId+'amount-error',offsetHelpId=fieldId+'offset-help',referrerHelpId=fieldId+'referrer-help';
 const setAmountTo=(value:number)=>change(()=>{setEdited(true);setAmountText(String(value));setSpoken(footer)});
 const amountError=!chosen.length?null:amountState==='empty'?t('Enter an amount','ใส่จำนวนเงิน'):amountState==='zero'?t('At least ฿1','อย่างน้อย ฿1'):amountState==='format'?t('Whole baht only','ใส่เป็นบาทเต็มเท่านั้น')
  :amountState==='over-cap'?t("The referrer's loan can take up to "+wholeBaht(most),'สินเชื่อผู้แนะนำรับได้สูงสุด '+wholeBaht(most)):amountState==='over-total'?t('More than the ticked rebates ('+wholeBaht(total)+')','มากกว่ายอดที่เลือก ('+wholeBaht(total)+')'):null;
 const amountHelp=!chosen.length||amountState!=='ok'?null:byOffset&&amount<total?t(wholeBaht(amount)+' offset · '+wholeBaht(total-amount)+' stays unpaid. Pay it after this.','หัก '+wholeBaht(amount)+' · ค้างต่อ '+wholeBaht(total-amount)+' จ่ายต่อได้หลังรายการนี้')
  :amount<total?t('Paying '+wholeBaht(amount)+' of '+wholeBaht(total)+' · '+wholeBaht(total-amount)+' stays unpaid','จ่าย '+wholeBaht(amount)+' จาก '+wholeBaht(total)+' · ค้างจ่ายต่อ '+wholeBaht(total-amount)):t('Full amount of the ticked rebates','ยอดเต็มของรายการที่เลือก');
 const partPaid=(row:UnpaidRebate)=>wholeAmount(row.settledAmount)>0;
 const rowNote=(row:UnpaidRebate)=>{const line=ticked.includes(row.expenseId)&&amountState==='ok'?appliedOf(row.expenseId):null;
  if(!line)return null;if(line.applied===0)return t('Not paid this time','ไม่จ่ายรอบนี้');
  return line.remaining>0?t(wholeBaht(line.applied)+' now · '+wholeBaht(line.remaining)+' stays unpaid','จ่ายรอบนี้ '+wholeBaht(line.applied)+' · ค้างต่อ '+wholeBaht(line.remaining)):null};
 const offsetLabels=(offset?.loanLabels??[]).join(', ');
 const blocked=checking||!chosen.length||amountState!=='ok'||offline||offsetGone||(!byOffset&&!account)||dateInvalid||referenceInvalid||!draft.ready;
 return <section className="borrower-record rebate-settlement-form" aria-busy={checking}><div className="related-loans-heading"><HeaderBack navigationKey="rebate-settle" className="icon-action" aria-label={t('Back to referrer','กลับหน้าผู้แนะนำ')} disabled={checking} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{t('Pay rebates','จ่ายค่าแนะนำ')} · {name}</h2></div>
  {draft.error&&<p role="alert">{t('Draft not saved. Device storage is unavailable or full.','บันทึกร่างไม่ได้ พื้นที่จัดเก็บใช้ไม่ได้หรือเต็ม')}</p>}{error&&<p role="alert">{error}</p>}
  {!rows.length?<><p>{t('No unpaid rebates for '+name,'ไม่มีค่าแนะนำค้างจ่ายของ '+name)}</p><button type="button" onClick={onBack}>{t('Back','กลับ')}</button></>:
  <form onSubmit={event=>{event.preventDefault();void review()}}>
   <fieldset className="rebate-settle-list"><legend>{t('Unpaid rebates','ค่าแนะนำค้างจ่าย')}</legend>
    <label className="rebate-settle-row rebate-settle-all"><input ref={allBox} type="checkbox" checked={chosen.length===rows.length} disabled={checking} onChange={event=>{const all=event.target.checked;change(()=>setTicked(all?rows.map(r=>r.expenseId):[]))}}/><span>{t('Select all','เลือกทั้งหมด')}</span></label>
    {rows.map(row=>{const note=rowNote(row);return <label className="rebate-settle-row" key={row.expenseId}><input type="checkbox" checked={ticked.includes(row.expenseId)} disabled={checking} onChange={event=>{const on=event.target.checked;change(()=>setTicked(previous=>on?[...previous,row.expenseId]:previous.filter(id=>id!==row.expenseId)))}}/>
     <span>{row.loanDisplayKey??row.borrowerLabel}<small>{shortDate(row.closeDate,thai)}{partPaid(row)?' · '+t('part paid','จ่ายบางส่วนแล้ว'):''}</small>{note&&<small className="rebate-settle-applied">{note}</small>}</span><strong>{wholeBaht(row.pendingAmount)}</strong></label>})}
   </fieldset>
   {/* PAY-DEST-02: shown only when an offset is possible (or was chosen and is no longer). Native radios; the small lines are
       tied to them by aria-describedby so the radio names stay short. */}
   {(offset?.available||byOffset)&&<fieldset className="loan-type-options remainder-options rebate-options rebate-destination"><legend>{t('Settle by','ชำระโดย')}</legend>
    <label><input type="radio" name={fieldId+'destination'} value="referrer" checked={!byOffset} disabled={checking} aria-describedby={referrerHelpId} onChange={()=>change(()=>setDestination('referrer'))}/><span>{settleBy('referrer')}</span><small id={referrerHelpId}>{t('Transfer or cash from Lisa','โอนหรือเงินสดจาก Lisa')}</small></label>
    <label><input type="radio" name={fieldId+'destination'} value="offset" checked={byOffset} disabled={checking||offline||!offset?.available} aria-describedby={offsetHelpId} onChange={()=>change(()=>setDestination('offset'))}/><span>{settleBy('offset')}</span>
     <small id={offsetHelpId}>{!offset?.available?t('No open loan to offset now','ไม่มีสินเชื่อให้หักแล้ว'):offline?networkTitle:(offsetLabels?offsetLabels+' · ':'')+t('up to '+wholeBaht(most)+' · no cash moves','สูงสุด '+wholeBaht(most)+' · ไม่มีเงินออก')}</small></label>
   </fieldset>}
   <label htmlFor={fieldId+'amount'}><span className="field-title">{byOffset?t('Amount to offset','จำนวนที่หัก'):t('Amount to pay','จำนวนเงินที่จ่าย')}</span>
    <input id={fieldId+'amount'} className="rebate-settle-amount" inputMode="numeric" pattern="[0-9]*" autoComplete="off" enterKeyHint="done" value={amountValue} disabled={checking||!chosen.length} aria-invalid={!!amountError||undefined} aria-describedby={[amountHelp?helpId:'',amountError?errorId:''].filter(Boolean).join(' ')||undefined}
     onFocus={event=>{const input=event.currentTarget;requestAnimationFrame(()=>{try{input.setSelectionRange(0,input.value.length)}catch{/* not selectable */}})}}
     onBlur={()=>setSpoken(footer)} onChange={event=>{const text=cleanAmountInput(event.target.value);change(()=>{setEdited(true);setAmountText(text)})}}/></label>
   {amountHelp&&<p className="field-help" id={helpId}>{amountHelp}</p>}
   {byOffset&&amountState==='ok'&&<p className="field-help rebate-offset-preview" aria-live="off">{previewBusy||!preview?(offline?networkTitle:t('Updating…','กำลังคำนวณ…')):previewLines(preview).map(line=><span className="rebate-offset-run" key={line}>{line}</span>)}</p>}
   {amountError&&<p className="field-help rebate-settle-error" id={errorId}>{amountError}{(amountState==='over-total'||amountState==='over-cap')&&<button type="button" className="text-action" disabled={checking} onClick={()=>setAmountTo(limit)}>{t('Use ','ใช้ ')+wholeBaht(limit)}</button>}</p>}
   {edited&&amountState==='ok'&&amount<limit&&<p className="rebate-settle-full"><button type="button" className="text-action" disabled={checking} onClick={()=>byOffset?setAmountTo(limit):change(()=>{setEdited(false);setAmountText('');setSpoken(footer)})}>{byOffset?t('Offset the most, ','หักเต็มที่ ')+wholeBaht(limit):t('Pay in full ','จ่ายเต็ม ')+wholeBaht(limit)}</button></p>}
   <label htmlFor={fieldId+'date'}><span className="field-title">{t('Settlement date','วันที่จ่าย')}</span><span className="cash-date-picker"><span className="cash-date-text" aria-hidden="true">{displayDateWithYear(byOffset?today:date,thai)}</span><Icon name="upcoming"/><input id={fieldId+'date'} type="date" aria-label={t('Settlement date','วันที่จ่าย')} required value={byOffset?today:date} max={today} min={byOffset?today:newest||undefined} disabled={checking||byOffset} aria-invalid={dateInvalid||undefined} aria-describedby={byOffset?fieldId+'date-help':undefined} onChange={event=>change(()=>setDate(event.target.value))}/></span></label>
   {/* PAY-DEST-05: an offset posts a payment today, so the date is locked instead of being refused at Confirm. */}
   {byOffset&&<p className="field-help" id={fieldId+'date-help'}>{t('Offset is recorded today','บันทึกการหักวันนี้')}</p>}
   {dateInvalid&&<p className="field-help">{t('Choose today or an earlier day, not before the newest close.','เลือกวันนี้หรือก่อนหน้า แต่ไม่ก่อนวันปิดล่าสุด')}</p>}
   {!byOffset&&<><label><span className="field-title">{t('Paying account','บัญชีที่จ่าย')}</span><select required value={account} disabled={checking} onChange={event=>change(()=>setAccount(event.target.value))}>{options.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   <label><span className="field-title">{t('Method','วิธีจ่าย')}</span><select value={method} disabled={checking} onChange={event=>change(()=>setMethod(event.target.value==='Cash'?'Cash':'Bank Transfer'))}><option value="Bank Transfer">{methodLabel('Bank Transfer')}</option><option value="Cash">{methodLabel('Cash')}</option></select></label>
   {method==='Bank Transfer'&&<label htmlFor={fieldId+'reference'}><span className="field-title">{t('Bank reference (optional)','เลขอ้างอิงธนาคาร (ไม่บังคับ)')}</span><input id={fieldId+'reference'} autoComplete="off" spellCheck={false} maxLength={256} value={reference} disabled={checking} aria-invalid={referenceInvalid||undefined} onChange={event=>change(()=>setReference(event.target.value))}/></label>}
   {referenceInvalid&&<p className="field-help">{t('One line, up to 256 bytes.','หนึ่งบรรทัด ไม่เกิน 256 ไบต์')}</p>}</>}
   <label><span className="field-title">{t('Notes (optional)','หมายเหตุ (ไม่บังคับ)')}</span><textarea value={notes} disabled={checking} onChange={event=>change(()=>setNotes(event.target.value))}/></label>
   <p className="visually-hidden" aria-live="polite">{spoken}</p>
   {/* PAY-PART-06: iOS never shows a title, so the offline reason is a visible line. */}
   {offline&&<p className="field-help rebate-settle-offline">{t('Connect to pay rebates','เชื่อมต่อเพื่อจ่ายค่าแนะนำ')}</p>}
   <div className="form-sticky-actions rebate-settle-footer"><button type="submit" disabled={blocked} title={offline?networkTitle:undefined}>{footer}</button></div>
  </form>}
 </section>;
}
