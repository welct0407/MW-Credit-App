import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {OperationConfirm} from './OperationConfirm';
import {useDomainDraft} from './domain-draft';
import {wholeBaht} from './display-money';
import {shortDate} from './pay-forward-text';
import {displayDateWithYear} from './display-date';
import {invalidateCachedReads,readCachedJson} from './read-cache';
import {borrowerLabel} from './borrower-label';
import {useEffect,useId,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {moneySum,sortedIds} from './referrer-text';
/** R129 (V137): one pending rebate of the referrer (GET /api/referrers/:id unpaid). */
export type UnpaidRebate={expenseId:string;loanId:string|null;loanDisplayKey:string|null;borrowerLabel:string;closeDate:string;amount:string;offsetAmount:string;pendingAmount:string};
const cents=(value:string)=>Math.round(Number(value)*100);
const sumOf=(rows:UnpaidRebate[])=>moneySum(rows.map(row=>row.pendingAmount));
const sameList=(a:UnpaidRebate[],b:UnpaidRebate[])=>JSON.stringify(a.map(r=>[r.expenseId,r.pendingAmount]))===JSON.stringify(b.map(r=>[r.expenseId,r.pendingAmount]));
const validReference=(value:string)=>!!value.trim()&&new TextEncoder().encode(value).length<=256&&!/[\0\r\n]/.test(value);
/**
 * R129: the Pay rebates page. Whole pending rebates of one referrer (all ticked), one cash movement out of Lisa on the
 * settlement date: Review, then Confirm through OperationConfirm (one rebate-settlement.create under a request id kept
 * across retries of the attempt). Online only; a draft keeps the ticks and fields when the phone is backgrounded.
 */
export function RebateSettlementForm({access,thai,detail,onBack,onDone}:{access:CommandAccess;thai:boolean;detail:any;onBack:()=>void;onDone:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,fieldId=useId(),referrer=detail.referrer,options=detail.settleOptions;
 const name=borrowerLabel(referrer.name,referrer.description);
 const [rows,setRows]=useState<UnpaidRebate[]>(detail.unpaid);
 const [ticked,setTicked]=useState<string[]>(()=>detail.unpaid.map((r:UnpaidRebate)=>r.expenseId));
 const [date,setDate]=useState<string>(options.businessDate),[account,setAccount]=useState<string>(options.defaultAccountId??options.accounts[0]?.id??''),[method,setMethod]=useState<'Bank Transfer'|'Cash'>('Bank Transfer');
 const [reference,setReference]=useState(''),[notes,setNotes]=useState(''),[error,setError]=useState(''),[checking,setChecking]=useState(false),[command,setCommand]=useState<any>(null),[result,setResult]=useState<any>(null),[dirty,setDirty]=useState(false);
 const flight=useRef(false),allBox=useRef<HTMLInputElement>(null);
 const draft=useDomainDraft({updateBlocked:!command,repository:access.offline,id:'settle:'+referrer.id,domain:'referrer',label:t('Pay rebates','จ่ายค่าแนะนำ')+' · '+name,value:{ticked,date,account,method,reference,notes},enabled:dirty&&!command&&!result,
  restore:value=>{if(Array.isArray(value?.ticked)){setTicked(value.ticked.filter((id:unknown)=>typeof id==='string'));setDate(value.date??options.businessDate);setAccount(value.account??account);setMethod(value.method==='Cash'?'Cash':'Bank Transfer');setReference(value.reference??'');setNotes(value.notes??'');setDirty(true)}}});
 const change=(apply:()=>void)=>{if(flight.current)return;setDirty(true);setError('');apply()};
 const chosen=rows.filter(row=>ticked.includes(row.expenseId)),total=sumOf(chosen),newest=chosen.map(r=>r.closeDate).sort().at(-1)??'';
 // Echo PAY-3: "Select all" is mixed while only some rebates are ticked.
 useEffect(()=>{if(allBox.current)allBox.current.indeterminate=chosen.length>0&&chosen.length<rows.length},[chosen.length,rows.length]);
 const offline=access.offlineOnly||!navigator.onLine,networkTitle=t('Needs the network','ต้องเชื่อมต่ออินเทอร์เน็ต');
 const referenceInvalid=method==='Bank Transfer'&&reference!==''&&!validReference(reference);
 const dateInvalid=!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>options.businessDate||(!!newest&&date<newest);
 const footer=t('Pay '+wholeBaht(total)+' · '+chosen.length+(chosen.length===1?' rebate':' rebates'),'จ่าย '+wholeBaht(total)+' · '+chosen.length+' รายการ');
 const read=async()=>{const {response,data}=await readCachedJson<any>(access,'/api/referrers/'+encodeURIComponent(referrer.id),{policy:'network-only'});if(!response.ok)throw Error();return data};
 // The page refuses a list older than the server's: the current unpaid list is read again before Review.
 async function review(){if(flight.current||!chosen.length||offline||!account||dateInvalid||referenceInvalid||!draft.ready)return;flight.current=true;setChecking(true);setError('');
  try{const fresh=await read();if(!sameList(fresh.unpaid,rows)){setRows(fresh.unpaid);setTicked(previous=>previous.filter(id=>fresh.unpaid.some((r:UnpaidRebate)=>r.expenseId===id)));setError(t('The unpaid list changed. Review it again.','รายการค้างจ่ายเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง'));return;}
   await draft.freeze();
   setCommand({requestId:crypto.randomUUID(),operation:'rebate-settlement.create',targetId:crypto.randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,
    inputs:{referrerId:referrer.id,expenseIds:sortedIds(chosen.map(r=>r.expenseId)),settlementDate:date,cashAccountId:account,paymentMethod:method,bankReference:method==='Bank Transfer'&&reference.trim()?reference:null,notes:notes===''?null:notes}});
  }catch{setError(t('The unpaid rebates could not be checked. Connect and try again.','ตรวจสอบค่าแนะนำค้างจ่ายไม่ได้ เชื่อมต่อแล้วลองอีกครั้ง'))}finally{flight.current=false;setChecking(false)}}
 const accountLabel=(id:string)=>options.accounts.find((a:any)=>a.id===id)?.label??'—';
 const methodLabel=(value:string)=>value==='Cash'?t('Cash','เงินสด'):t('Bank transfer','โอนเงิน');
 if(result){const rest=(cents(referrer.unpaidAmount)-cents(result.total))/100;
  return <section className="borrower-record rebate-settlement-result" aria-label={t('Rebates paid','จ่ายค่าแนะนำแล้ว')}><div className="related-loans-heading"><HeaderBack navigationKey="rebate-settle-result" className="icon-action" aria-label={t('Back to referrer','กลับหน้าผู้แนะนำ')} onClick={onDone}><Icon name="back"/></HeaderBack><h2>{t('Rebates paid','จ่ายค่าแนะนำแล้ว')}</h2></div>
   <p role="status">{t('Paid '+wholeBaht(result.total)+' to '+name+', '+result.count+(result.count===1?' rebate':' rebates'),'จ่ายค่าแนะนำ '+wholeBaht(result.total)+' ให้ '+name+' แล้ว '+result.count+' รายการ')}</p>
   <p>{shortDate(result.date,thai)} · {accountLabel(result.account)}</p>{rest>0&&<p>{t(wholeBaht(rest)+' still unpaid',wholeBaht(rest)+' ยังค้างจ่าย')}</p>}
   <button type="button" onClick={onDone}>{t('Back to referrer page','กลับหน้าผู้แนะนำ')}</button></section>;}
 if(command)return <OperationConfirm access={access} command={command} domain="referrer" draftKey={draft.key} label={t('Pay rebates','จ่ายค่าแนะนำ')+' · '+name} thai={thai}
  onBack={()=>{setCommand(null);draft.resume()}}
  onBlocked={code=>{if(['record_requires_reconciliation','source_conflict','invalid_date'].includes(code))void read().then(fresh=>{setRows(fresh.unpaid);setTicked(previous=>previous.filter(id=>fresh.unpaid.some((r:UnpaidRebate)=>r.expenseId===id)))}).catch(()=>{})}}
  rejectionText={code=>code==='record_requires_reconciliation'||code==='source_conflict'?t('The unpaid list changed. Review it again.','รายการค้างจ่ายเปลี่ยนแล้ว โปรดตรวจสอบอีกครั้ง'):code==='invalid_date'?t('The settlement date must be today or earlier, and not before the newest close.','วันที่จ่ายต้องไม่เกินวันนี้ และไม่ก่อนวันปิดล่าสุด'):null}
  onApplied={()=>{void invalidateCachedReads(access);void draft.discard().catch(()=>{});setResult({total,count:chosen.length,date,account})}}>
  <ul className="rebate-settle-review">{chosen.map(row=><li key={row.expenseId}><span>{row.loanDisplayKey??row.borrowerLabel} · {shortDate(row.closeDate,thai)}</span><strong>{wholeBaht(row.pendingAmount)}</strong></li>)}</ul>
  <dl><div><dt>{t('Total','รวม')}</dt><dd>{wholeBaht(total)}</dd></div><div><dt>{t('Settlement date','วันที่จ่าย')}</dt><dd>{shortDate(date,thai)}</dd></div><div><dt>{t('Paying account','บัญชีที่จ่าย')}</dt><dd>{accountLabel(account)}</dd></div><div><dt>{t('Method','วิธีจ่าย')}</dt><dd>{methodLabel(method)}</dd></div>
  {command.inputs.bankReference&&<div><dt>{t('Bank reference','เลขอ้างอิงธนาคาร')}</dt><dd className="borrower-field-value">{command.inputs.bankReference}</dd></div>}{notes&&<div><dt>{t('Notes','หมายเหตุ')}</dt><dd className="borrower-field-value">{notes}</dd></div>}</dl></OperationConfirm>;
 return <section className="borrower-record rebate-settlement-form" aria-busy={checking}><div className="related-loans-heading"><HeaderBack navigationKey="rebate-settle" className="icon-action" aria-label={t('Back to referrer','กลับหน้าผู้แนะนำ')} disabled={checking} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{t('Pay rebates','จ่ายค่าแนะนำ')} · {name}</h2></div>
  {draft.error&&<p role="alert">{t('Draft not saved. Device storage is unavailable or full.','บันทึกร่างไม่ได้ พื้นที่จัดเก็บใช้ไม่ได้หรือเต็ม')}</p>}{error&&<p role="alert">{error}</p>}
  {!rows.length?<><p>{t('No unpaid rebates for '+name,'ไม่มีค่าแนะนำค้างจ่ายของ '+name)}</p><button type="button" onClick={onBack}>{t('Back','กลับ')}</button></>:
  <form onSubmit={event=>{event.preventDefault();void review()}}>
   <fieldset className="rebate-settle-list"><legend>{t('Unpaid rebates','ค่าแนะนำค้างจ่าย')}</legend>
    <label className="rebate-settle-row rebate-settle-all"><input ref={allBox} type="checkbox" checked={chosen.length===rows.length} disabled={checking} onChange={event=>{const all=event.target.checked;change(()=>setTicked(all?rows.map(r=>r.expenseId):[]))}}/><span>{t('Select all','เลือกทั้งหมด')}</span></label>
    {rows.map(row=><label className="rebate-settle-row" key={row.expenseId}><input type="checkbox" checked={ticked.includes(row.expenseId)} disabled={checking} onChange={event=>{const on=event.target.checked;change(()=>setTicked(previous=>on?[...previous,row.expenseId]:previous.filter(id=>id!==row.expenseId)))}}/>
     <span>{row.loanDisplayKey??row.borrowerLabel}<small>{shortDate(row.closeDate,thai)}</small></span><strong>{wholeBaht(row.pendingAmount)}</strong></label>)}
   </fieldset>
   <label htmlFor={fieldId+'date'}><span className="field-title">{t('Settlement date','วันที่จ่าย')}</span><span className="cash-date-picker"><span className="cash-date-text" aria-hidden="true">{displayDateWithYear(date,thai)}</span><Icon name="upcoming"/><input id={fieldId+'date'} type="date" aria-label={t('Settlement date','วันที่จ่าย')} required value={date} max={options.businessDate} min={newest||undefined} disabled={checking} aria-invalid={dateInvalid||undefined} onChange={event=>change(()=>setDate(event.target.value))}/></span></label>
   {dateInvalid&&<p className="field-help">{t('Choose today or an earlier day, not before the newest close.','เลือกวันนี้หรือก่อนหน้า แต่ไม่ก่อนวันปิดล่าสุด')}</p>}
   <label><span className="field-title">{t('Paying account','บัญชีที่จ่าย')}</span><select required value={account} disabled={checking} onChange={event=>change(()=>setAccount(event.target.value))}>{options.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   <label><span className="field-title">{t('Method','วิธีจ่าย')}</span><select value={method} disabled={checking} onChange={event=>change(()=>setMethod(event.target.value==='Cash'?'Cash':'Bank Transfer'))}><option value="Bank Transfer">{methodLabel('Bank Transfer')}</option><option value="Cash">{methodLabel('Cash')}</option></select></label>
   {method==='Bank Transfer'&&<label htmlFor={fieldId+'reference'}><span className="field-title">{t('Bank reference (optional)','เลขอ้างอิงธนาคาร (ไม่บังคับ)')}</span><input id={fieldId+'reference'} autoComplete="off" spellCheck={false} maxLength={256} value={reference} disabled={checking} aria-invalid={referenceInvalid||undefined} onChange={event=>change(()=>setReference(event.target.value))}/></label>}
   {referenceInvalid&&<p className="field-help">{t('One line, up to 256 bytes.','หนึ่งบรรทัด ไม่เกิน 256 ไบต์')}</p>}
   <label><span className="field-title">{t('Notes (optional)','หมายเหตุ (ไม่บังคับ)')}</span><textarea value={notes} disabled={checking} onChange={event=>change(()=>setNotes(event.target.value))}/></label>
   <p className="visually-hidden" aria-live="polite">{footer}</p>
   <div className="form-sticky-actions rebate-settle-footer"><button type="submit" disabled={checking||!chosen.length||offline||!account||dateInvalid||referenceInvalid||!draft.ready} title={offline?networkTitle:undefined}>{footer}</button></div>
  </form>}
 </section>;
}
