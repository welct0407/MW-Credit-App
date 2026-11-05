import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {RecordAction} from './RecordAction';
import {OperationConfirm} from './OperationConfirm';
import {ExpenseRecords} from './ExpenseRecords';
import {PaymentRecord} from './PaymentRecord';
import {LoanRecord} from './LoanRecord';
import {SharedBorrowerDetail} from './SharedBorrowerDetail';
import {RebateSettlementForm} from './RebateSettlementForm';
import {wholeBaht} from './display-money';
import {displayDateWithYear,displayTimestamp} from './display-date';
import {shortDate} from './pay-forward-text';
import {borrowerLabel} from './borrower-label';
import {invalidateCachedReads,readCachedJson} from './read-cache';
import {useContextRefresh} from './context-refresh';
import {useLayoutEffect,useEffect,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {matchesReferrer,refereeBreakdown,type Referee} from './referrer-text';
type Referrer={id:string;name:string|null;description:string|null;terms:{rate:number;cap:number;custom:boolean};referredCount:number;unpaidAmount:string;unpaidCount:number;oldestUnpaidCloseDate:string|null;accruingAmount:string;accruingLoanCount:number;paidToDate:string;offsetToDate:string};
type Related={kind:'expense'|'payment'|'borrower'|'loan';id:string};
/**
 * R129 (V137): the Referrers page. The list (every borrower who referred someone: what each is owed and is accruing), a
 * referrer's detail (tiles, referred borrowers, unpaid rebates, open referred loans, settlement history, Pay rebates) and one settlement (its
 * rebates and Delete). Reads are the hybrid cache (saved first, then a refresh in place); nothing here is queued offline.
 */
/** Opened in place from another page (the Borrower page, an expense's settlement), onExit and exitLabel are that page's Back
 * until the user navigates within Referrers (Echo NAV-1). */
export function ReferrerRecords({access,thai,initialReferrerId,initialSettlementId,onExit,exitLabel}:{access:CommandAccess;thai:boolean;readOrigin?:string;initialReferrerId?:string;initialSettlementId?:string;onExit?:()=>void;exitLabel?:string}){
 const t=(en:string,th:string)=>thai?th:en;
 const [entry,setEntry]=useState(!!onExit&&!!(initialReferrerId||initialSettlementId)),exit=entry&&onExit?onExit:null;
 const [list,setList]=useState<{items:Referrer[];businessDate:string}|null>(null),[query,setQuery]=useState('');
 const [referrerId,setReferrerId]=useState<string|null>(initialReferrerId??null),[detail,setDetail]=useState<any>(null);
 const [settlementId,setSettlementId]=useState<string|null>(initialSettlementId??null),[settlement,setSettlement]=useState<any>(null);
 const [paying,setPaying]=useState(false),[deleting,setDeleting]=useState<any>(null),[related,setRelated]=useState<Related|null>(null);
 const [error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),generation=useRef(0),listScroll=useRef(0);
 const offline=access.offlineOnly||!navigator.onLine,networkTitle=t('Needs the network','ต้องเชื่อมต่ออินเทอร์เน็ต');
 async function read(path:string,apply:(data:any)=>void,failure:string,policy?:'network-only'){
  const current=++generation.current,controller=new AbortController();setBusy(true);setError(null);
  try{const {response,data}=await readCachedJson<any>(access,path,{signal:controller.signal,...(policy?{policy}:{}),onCached:data=>{if(current===generation.current){apply(data);setBusy(false)}}});
   if(current!==generation.current)return;if(response.status===404){apply(null);setError(t('No longer available.','ไม่พบรายการนี้แล้ว'));return;}if(!response.ok)throw Error();apply(data);}
  catch{if(current===generation.current)setError(failure)}finally{if(current===generation.current)setBusy(false)}}
 const loadList=(policy?:'network-only')=>read('/api/referrers',setList,t('Referrers unavailable.','ไม่สามารถโหลดผู้แนะนำ'),policy);
 const loadDetail=(id:string,policy?:'network-only')=>read('/api/referrers/'+encodeURIComponent(id),setDetail,t('Referrer details unavailable.','ไม่สามารถโหลดรายละเอียดผู้แนะนำ'),policy);
 const loadSettlement=(id:string,policy?:'network-only')=>read('/api/rebate-settlements/'+encodeURIComponent(id),data=>setSettlement(data?.item??null),t('Settlement details unavailable.','ไม่สามารถโหลดรายการจ่าย'),policy);
 const reload=(policy?:'network-only')=>settlementId?loadSettlement(settlementId,policy):referrerId?loadDetail(referrerId,policy):loadList(policy);
 // biome-ignore lint/correctness/useExhaustiveDependencies: one read per page (list, a referrer, a settlement); the loaders are recreated every render
 useEffect(()=>{void reload();return()=>{generation.current++}},[referrerId,settlementId]);
 useContextRefresh(!paying&&!deleting&&!related,t('Refresh referrers','รีเฟรชผู้แนะนำ'),()=>void reload());
 // Back from a referrer returns to the list where it was (the Borrowers page pattern).
 useLayoutEffect(()=>{if(!referrerId&&!settlementId&&list)window.scrollTo({top:listScroll.current})},[referrerId,settlementId,list]);
 const openReferrer=(id:string)=>{setEntry(false);listScroll.current=window.scrollY;setDetail(null);setReferrerId(id);window.scrollTo({top:0})};
 const closeReferrer=()=>{if(exit){exit();return;}generation.current++;setDetail(null);setReferrerId(null);setError(null)};
 const openSettlement=(id:string)=>{setEntry(false);setSettlement(null);setSettlementId(id);window.scrollTo({top:0})};
 const closeSettlement=()=>{if(exit){exit();return;}generation.current++;const back=settlement?.referrerId??null;setSettlement(null);setSettlementId(null);setError(null);if(back&&back!==referrerId){setDetail(null);setReferrerId(back)}};
 const termsLine=(row:Referrer)=>row.terms.custom?t('Custom terms '+row.terms.rate+'%, max '+wholeBaht(row.terms.cap),'เงื่อนไขเฉพาะ '+row.terms.rate+'% สูงสุด '+wholeBaht(row.terms.cap))
  :t('Default terms ('+row.terms.rate+'%, max '+wholeBaht(row.terms.cap)+')','เงื่อนไขเริ่มต้น ('+row.terms.rate+'% สูงสุด '+wholeBaht(row.terms.cap)+')');
 const unpaidLine=(row:Referrer)=>t('Unpaid '+wholeBaht(row.unpaidAmount),'ค้างจ่าย '+wholeBaht(row.unpaidAmount))+(row.unpaidCount>0?' · '+t(row.unpaidCount+(row.unpaidCount===1?' rebate':' rebates'),row.unpaidCount+' รายการ')+(row.oldestUnpaidCloseDate?' · '+t('since ','ตั้งแต่ ')+shortDate(row.oldestUnpaidCloseDate,thai):''):'');
 const accruingLine=(row:Referrer)=>row.accruingLoanCount===0?t('No open loans','ไม่มีสินเชื่อที่ยังไม่ปิด'):t('Accruing '+wholeBaht(row.accruingAmount)+' · '+row.accruingLoanCount+(row.accruingLoanCount===1?' open loan':' open loans'),'กำลังสะสม '+wholeBaht(row.accruingAmount)+' · '+row.accruingLoanCount+' สินเชื่อ');
 const methodLabel=(value:string)=>value==='Cash'?t('Cash','เงินสด'):t('Bank transfer','โอนเงิน');
 const failure=error&&<p role="alert">{error}<button type="button" className="text-action" onClick={()=>void reload()}>{t('Retry','ลองอีกครั้ง')}</button></p>;
 if(related?.kind==='expense')return <ExpenseRecords access={access} thai={thai} initialId={related.id} onBack={()=>setRelated(null)} backLabel={t('Back to referrer','กลับหน้าผู้แนะนำ')}/>;
 if(related?.kind==='payment')return <PaymentRecord access={access} id={related.id} thai={thai} onBack={()=>setRelated(null)} backLabel={t('Back to referrer','กลับหน้าผู้แนะนำ')}/>;
 if(related?.kind==='borrower')return <SharedBorrowerDetail access={access} id={related.id} thai={thai} onBack={()=>setRelated(null)} backLabel={t('Back to referrer','กลับหน้าผู้แนะนำ')}/>;
 if(related?.kind==='loan')return <LoanRecord access={access} id={related.id} thai={thai} onBack={()=>setRelated(null)} backLabel={t('Back to referrer','กลับหน้าผู้แนะนำ')}/>;
 if(paying&&detail)return <RebateSettlementForm access={access} thai={thai} detail={detail} onBack={()=>setPaying(false)} onDone={()=>{setPaying(false);if(referrerId)void loadDetail(referrerId,'network-only')}}/>;
 if(deleting&&settlement)return <OperationConfirm access={access} command={deleting} domain="referrer" label={t('Delete settlement','ลบรายการจ่าย')} thai={thai} onBack={()=>setDeleting(null)}
  onBlocked={code=>{if(code==='source_conflict')void loadSettlement(settlement.id,'network-only')}}
  onApplied={()=>{void invalidateCachedReads(access);const back=settlement.referrerId;setEntry(false);setDeleting(null);setSettlement(null);setSettlementId(null);setDetail(null);setReferrerId(back);void loadDetail(back,'network-only')}}>
  <p className="destructive-note" role="note">{t('Delete settlement '+wholeBaht(settlement.amount)+'? '+settlement.rebates.length+(settlement.rebates.length===1?' rebate returns':' rebates return')+' to unpaid. The cash entry is removed.',
   'ลบรายการจ่าย '+wholeBaht(settlement.amount)+'? ค่าแนะนำ '+settlement.rebates.length+' รายการจะกลับเป็นค้างจ่าย และลบรายการเงินสด')}</p></OperationConfirm>;
 if(settlementId){const s=settlement;
  return <section className="borrower-record referrer-records" aria-busy={busy}><div className="related-loans-heading"><HeaderBack navigationKey="rebate-settlement" className="icon-action" aria-label={exit&&exitLabel?exitLabel:t('Back to referrer','กลับหน้าผู้แนะนำ')} onClick={closeSettlement}><Icon name="back"/></HeaderBack><h2>{t('Rebate settlement','รายการจ่ายค่าแนะนำ')}</h2>
   {s&&<RecordAction icon="delete" className="icon-action destructive-action" disabled={busy||offline} title={offline?networkTitle:undefined} aria-label={t('Delete settlement','ลบรายการจ่าย')} onClick={()=>setDeleting({requestId:crypto.randomUUID(),operation:'rebate-settlement.delete',targetId:s.id,expectedVersion:s.version,predecessorRequestId:null,receiptId:null,inputs:{}})}/>}</div>
   {failure}{s&&<><dl>{[[t('Date','วันที่'),displayDateWithYear(s.settlementDate,thai)],[t('Referrer','ผู้แนะนำ'),s.referrerLabel],[t('Amount','จำนวนเงิน'),wholeBaht(s.amount)],[t('Paying account','บัญชีที่จ่าย'),s.accountLabel??'—'],[t('Method','วิธีจ่าย'),methodLabel(s.paymentMethod)],[t('Bank reference','เลขอ้างอิงธนาคาร'),s.bankReference??'—'],[t('Notes','หมายเหตุ'),s.notes??'—'],[t('Created by','ผู้สร้าง'),s.createdBy],[t('Created at','สร้างเมื่อ'),displayTimestamp(s.createdAt)]].map(([k,v])=><div key={k}><dt>{k}</dt><dd className="borrower-field-value">{v}</dd></div>)}</dl>
   <h3>{t('Rebates paid','ค่าแนะนำที่จ่าย')}</h3>{s.rebates.map((r:any)=><button type="button" className="borrower-card referrer-line" key={r.expenseId} onClick={()=>setRelated({kind:'expense',id:r.expenseId})}><span>{r.loanDisplayKey??r.borrowerLabel}<small>{shortDate(r.closeDate,thai)}{Number(r.offsetAmount)>0?' · '+t(wholeBaht(r.offsetAmount)+' offset','หัก '+wholeBaht(r.offsetAmount)):''}</small></span><strong>{wholeBaht(r.paidAmount)}</strong></button>)}</>}</section>;}
 if(referrerId){const d=detail,r:Referrer|undefined=d?.referrer;
  const tiles=r?[[t('Unpaid','ค้างจ่าย'),r.unpaidAmount],[t('Accruing on open loans','กำลังสะสมจากสินเชื่อที่ยังไม่ปิด'),r.accruingAmount],[t('Paid to date','จ่ายแล้วทั้งหมด'),r.paidToDate],[t('Settled by offset','หักกับสินเชื่อแล้ว'),r.offsetToDate]]:[];
  return <section className="borrower-record referrer-records" aria-busy={busy}><div className="related-loans-heading"><HeaderBack navigationKey="referrer-record" className="icon-action" aria-label={exit&&exitLabel?exitLabel:t('Back to referrers','กลับรายชื่อผู้แนะนำ')} onClick={closeReferrer}><Icon name="back"/></HeaderBack><h2>{r?borrowerLabel(r.name,r.description):t('Referrer','ผู้แนะนำ')}</h2></div>
   {failure}{r&&<>
   <div className="referrer-tiles">{tiles.map(([label,value])=><div className="referrer-tile" key={label}><span>{label}</span><strong>{wholeBaht(value)}</strong></div>)}</div>
   <p className="field-help referrer-terms">{termsLine(r)}</p><p className="referrer-terms-link"><button type="button" className="text-action" onClick={()=>setRelated({kind:'borrower',id:r.id})}>{t('Borrower record','ข้อมูลผู้กู้')}</button></p>
   {Number(r.unpaidAmount)>0&&<button type="button" className="referrer-pay" disabled={busy||offline} title={offline?networkTitle:undefined} onClick={()=>setPaying(true)}>{t('Pay rebates '+wholeBaht(r.unpaidAmount),'จ่ายค่าแนะนำ '+wholeBaht(r.unpaidAmount))}</button>}
   <h3>{t('Referred borrowers','ผู้ที่แนะนำ')+' · '+(d.referees?.length??0)}</h3>{d.referees?.length?d.referees.map((p:Referee)=>{const b=refereeBreakdown(p,thai,wholeBaht);
    return <button type="button" className="borrower-card referrer-line referrer-referee" key={p.borrowerId} onClick={()=>setRelated({kind:'borrower',id:p.borrowerId})}><span>{p.borrowerLabel}<small>{b.loans} · <span className={b.rebates?undefined:'muted'}>{b.rebates??t('No rebates yet','ยังไม่มีค่าแนะนำ')}</span></small></span></button>}):<p>{t('No referred borrowers','ยังไม่มีผู้ที่แนะนำ')}</p>}
   <h3>{t('Unpaid rebates','ค่าแนะนำค้างจ่าย')}</h3>{d.unpaid.length?d.unpaid.map((u:any)=><button type="button" className="borrower-card referrer-line" key={u.expenseId} onClick={()=>setRelated({kind:'expense',id:u.expenseId})}><span>{u.loanDisplayKey??u.borrowerLabel}<small>{shortDate(u.closeDate,thai)} · {t('rebate ','ค่าแนะนำ ')+wholeBaht(u.amount)}{Number(u.offsetAmount)>0?' · '+t(wholeBaht(u.offsetAmount)+' offset','หัก '+wholeBaht(u.offsetAmount)):''}</small></span><strong>{wholeBaht(u.pendingAmount)}</strong></button>):<p>{t('No unpaid rebates','ไม่มีค่าแนะนำค้างจ่าย')}</p>}
   <h3>{t('Unsettled on open loans','สะสมจากสินเชื่อที่ยังไม่ปิด')}</h3><p className="field-help">{t('Estimated at the current terms from interest and late charges already received. The rebate is booked when the loan closes.','ประมาณจากดอกเบี้ยและค่าปรับที่รับแล้วตามเงื่อนไขปัจจุบัน ค่าแนะนำจะบันทึกเมื่อปิดสินเชื่อ')}</p>
   {d.accruing.length?d.accruing.map((a:any)=><button type="button" className="borrower-card referrer-line" key={a.loanId} onClick={()=>setRelated({kind:'loan',id:a.loanId})}><span>{a.loanDisplayKey??a.borrowerLabel}<small>{shortDate(a.loanDate,thai)} · {t('received ','รับแล้ว ')+wholeBaht(a.profitToDate)}</small></span><strong>{wholeBaht(a.estimatedRebate)}</strong></button>):<p>{t('No open referred loans','ไม่มีสินเชื่อที่แนะนำและยังไม่ปิด')}</p>}
   <h3>{t('Settlement history','ประวัติการจ่าย')}</h3>{d.history.length?d.history.map((h:any)=>{const text=h.kind==='settlement'?t('Paid '+wholeBaht(h.amount)+' · '+h.rebateCount+(h.rebateCount===1?' rebate':' rebates'),'จ่าย '+wholeBaht(h.amount)+' · '+h.rebateCount+' รายการ')+(h.accountLabel?' · '+h.accountLabel:'')+' · '+methodLabel(h.paymentMethod)+(h.bankReference?' · '+t('ref ','อ้างอิง ')+h.bankReference:'')
     :h.kind==='offset'?t('Offset '+wholeBaht(h.amount)+' to '+(h.offsetLoanLabel??'—'),'หัก '+wholeBaht(h.amount)+' กับ '+(h.offsetLoanLabel??'—')):t('Paid at close '+wholeBaht(h.amount),'จ่ายแล้วตอนปิด '+wholeBaht(h.amount));
    const open=()=>h.kind==='settlement'?openSettlement(h.settlementId):h.kind==='offset'?setRelated({kind:'payment',id:h.offsetPaymentId}):setRelated({kind:'expense',id:h.expenseId});
    return <button type="button" className="borrower-card referrer-line" key={h.kind+':'+(h.settlementId??h.offsetPaymentId??h.expenseId)} onClick={open}><span>{text}<small>{shortDate(h.date,thai)}</small></span></button>}):<p>{t('No settlements yet','ยังไม่มีการจ่าย')}</p>}
   </>}</section>;}
 const rows=(list?.items??[]).filter(row=>matchesReferrer(row,query));
 return <section className="borrower-record referrer-records" aria-busy={busy}><div className="section-heading root-record-heading"><h2>{t('Referrers','ผู้แนะนำ')}</h2></div>
  <label className="referrer-search"><span className="field-title">{t('Search referrers','ค้นหาผู้แนะนำ')}</span><input type="search" value={query} autoComplete="off" onChange={event=>setQuery(event.target.value)}/></label>
  {failure}{list&&<p className="field-help" role="status">{t(rows.length+(rows.length===1?' referrer':' referrers'),'ผู้แนะนำ '+rows.length+' ราย')}</p>}
  {rows.map(row=><button type="button" className="borrower-card referrer-row" key={row.id} disabled={busy} onClick={()=>openReferrer(row.id)}><span className="referrer-row-name">{borrowerLabel(row.name,row.description)}{row.terms.custom&&<small>{row.terms.rate}% · {t('max ','สูงสุด ')+wholeBaht(row.terms.cap)}</small>}</span>
   <span className="referrer-row-figures"><span className={Number(row.unpaidAmount)>0?'referrer-unpaid':'referrer-unpaid muted'}>{unpaidLine(row)}</span><span className={row.accruingLoanCount===0?'muted':undefined}>{accruingLine(row)}</span></span></button>)}
  {list&&!rows.length&&!busy&&<p>{query?t('No referrers match.','ไม่พบผู้แนะนำที่ตรงกัน'):t('No referrers yet.','ยังไม่มีผู้แนะนำ')}</p>}</section>;
}
