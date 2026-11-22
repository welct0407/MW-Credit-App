import {Icon} from './Icon';
import {readCachedJson} from './read-cache';
import {HeaderBack} from './HeaderBack';
import {displayDate} from './display-date';
import {wholeBaht} from './display-money';
import {PaymentRecord} from './PaymentRecord';
import {useEffect,useId,useRef,useState} from 'react';
import type {CommandAccess} from './SelectedCharges';
import {PaymentResult} from './PaymentResult';
import {CompactPager} from './CompactPager';
import {beginRequest} from './request-activity';
import {useListReturn} from './list-return';
const LONG_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const LONG_MONTHS_TH=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
/** R182: the month heading of a payment date ("November 2026", "พฤศจิกายน 2569"); a missing or malformed date groups under "No date". */
export function historyMonth(date:unknown,thai:boolean):string{
 const match=typeof date==='string'?/^(\d{4})-(\d{2})-\d{2}$/.exec(date):null,index=match?Number(match[2])-1:-1;
 return match&&index>=0&&index<12?(thai?LONG_MONTHS_TH:LONG_MONTHS)[index]+' '+(Number(match[1])+(thai?543:0)):thai?'ไม่มีวันที่':'No date';
}
/** R182: only an exception is flagged; a Posted payment shows nothing. */
export function historyFlag(row:{status?:unknown;localPending?:unknown}):'confirming'|'processing'|'error'|'cancelled'|'unknown'|null{
 return row.localPending?'confirming':row.status==='Posted'?null:row.status==='Processing'?'processing':row.status==='Error'?'error':row.status==='Cancelled'?'cancelled':'unknown';
}
/**
 * R182 (owner request of 22 November 2026): the history button is a toggle (aria-expanded, never disabled; a second tap
 * closes the panel in every state: list, loading, error or an open payment), and the list is the Payments page row idiom
 * in two lines under month headings: date, account and amount, then an exception flag, the note on one line and a receipt
 * marker. The whole row opens the payment when it can be opened.
 */
/** onDetail: told when a payment opens from the list or closes, so the page around it knows a child page is open. */
export function PaymentHistory({access,borrowerId,thai,compact=false,onDetail}:{access:CommandAccess;borrowerId:string;thai:boolean;compact?:boolean;onDetail?:(open:boolean)=>void}){
 const t=(en:string,th:string)=>thai?th:en;
 const [open,setOpen]=useState(false),[items,setItems]=useState<any[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[loaded,setLoaded]=useState(false),[page,setPage]=useState(0),[detail,setDetail]=useState<string|null>(null);
 const generation=useRef(0),cursors=useRef<(string|undefined)[]>([undefined]);
 const panelId=useId(),titleId=useId();
 const heading=useRef<HTMLHeadingElement|null>(null),paged=useRef(false),onDetailRef=useRef(onDetail);onDetailRef.current=onDetail;
 const detailOpen=detail!==null;
 useEffect(()=>{onDetailRef.current?.(detailOpen);return()=>{if(detailOpen)onDetailRef.current?.(false)}},[detailOpen]);
 // PH-UX-09: after the pager's Next or Previous the pressed button is gone: the panel heading comes into view below the
 // top bar and takes the focus.
 // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a pager load settles (busy) on its new page
 useEffect(()=>{if(busy||!paged.current)return;paged.current=false;const node=heading.current;if(!node)return;const bar=document.querySelector('.topbar'),fixed=bar&&/^(sticky|fixed)$/.test(getComputedStyle(bar).position)?bar.getBoundingClientRect().bottom:0;node.style.scrollMarginTop=Math.max(0,Math.round(fixed))+8+'px';node.scrollIntoView({block:'start'});node.focus({preventScroll:true})},[busy,page]);
 const detailReturn=useListReturn();// R131: Back from a payment returns to its row in the history
 // biome-ignore lint/correctness/useExhaustiveDependencies: resets the history panel when borrowerId changes; borrowerId is the reset trigger
 useEffect(()=>{generation.current++;setOpen(false);setItems([]);setCursor(null);setDetail(null);setError(false);setBusy(false);setLoaded(false);cursors.current=[undefined];return()=>{generation.current++}},[borrowerId]);
 async function load(next?:string,index=0){const current=++generation.current;setOpen(true);setBusy(true);setError(false);const done=beginRequest(),controller=new AbortController();
  const show=(result:any)=>{if(index===0)cursors.current=[undefined];cursors.current[index]=next;setPage(index);setItems(result.items);setCursor(result.nextCursor);setLoaded(true)};
  try{const {response,data:result}=await readCachedJson<any>(access,'/api/borrowers/'+encodeURIComponent(borrowerId)+'/payments'+(next?'?cursor='+encodeURIComponent(next):''),{signal:controller.signal,onCached:(result)=>{if(current===generation.current){show(result);setBusy(false)}}});if(response.status===401||response.status===403)access.authFailure(response.status);if(!response.ok)throw Error();if(current===generation.current)show(result)}catch{if(current===generation.current)setError(true)}finally{done();if(current===generation.current)setBusy(false)}}
 // PH-TGL: closing drops whatever the panel was doing (a load in flight is ignored by its generation) and whatever it showed;
 // an open payment closes the way its Back does (no confirmation; that Back has none either), without moving the page.
 function close(){paged.current=false;generation.current++;detailReturn.cancel();setOpen(false);setDetail(null);setError(false);setBusy(false);setItems([]);setCursor(null);setLoaded(false);setPage(0);cursors.current=[undefined]}
 const label=t('Payment history','ประวัติรับชำระ');
 const flagText={confirming:t('Confirming…','กำลังยืนยัน…'),processing:t('Processing','กำลังดำเนินการ'),error:t('Error','ผิดพลาด'),cancelled:t('Cancelled','ยกเลิกแล้ว'),unknown:t('Unavailable','ไม่มีข้อมูล')};
 const row=(item:any)=>{
  const flag=historyFlag(item),tone=flag==='confirming'||flag==='processing'?' processing':flag==='error'?' error':'',note=typeof item.notes==='string'?item.notes.replace(/\s+/g,' ').trim():'',target=access.ownerTesting?item.id:item.requestId;
  const content=<><time className="ph-date" dateTime={typeof item.paymentDate==='string'?item.paymentDate:undefined}>{displayDate(item.paymentDate,thai)}</time><span className="ph-account">{item.accountLabel??'—'}</span><strong className={'ph-amount'+tone}>{wholeBaht(item.amountReceived)}</strong>
   {(flag||note||item.receiptReference)&&<span className="ph-meta">{flag&&<span className={'ph-flag '+(flag==='confirming'?'processing':flag)}>{flag!=='unknown'&&flag!=='cancelled'&&<Icon name={flag==='error'?'warning':'clock'}/>}{flagText[flag]}</span>}{note&&<span className="ph-note">{note}</span>}{item.receiptReference&&<span className="ph-receipt">{(flag||note?'· ':'')+t('Receipt','มีหลักฐาน')}</span>}</span>}</>;
  return <li key={item.id}>{target?<button type="button" className="ph-row" data-record-id={item.id} onClick={event=>{detailReturn.leave(event.currentTarget);setDetail(target)}}>{content}</button>:<div className="ph-row" data-record-id={item.id}>{content}</div>}</li>;
 };
 const months:{month:string;rows:any[]}[]=[];
 for(const item of items){const month=historyMonth(item.paymentDate,thai);if(months.at(-1)?.month===month)months.at(-1)!.rows.push(item);else months.push({month,rows:[item]})}
 return <><button type="button" className={(compact?'secondary-button icon-action':'secondary-button')+' payment-history-toggle'} aria-label={label} title={label} aria-expanded={open} aria-controls={open?panelId:undefined} onClick={()=>{if(open)close();else void load()}}>{compact?<Icon name="history"/>:label}</button>{open&&(detail?<div className="payment-history-panel" id={panelId}><HeaderBack navigationKey="payment-history-detail" aria-label={t('Back to payment history','กลับประวัติรับชำระ')} onClick={()=>{setDetail(null);detailReturn.restore()}}/>{access.ownerTesting?<PaymentRecord access={access} id={detail} thai={thai} onBack={()=>{setDetail(null);void load(cursors.current[page],page);detailReturn.restore()}}/>:<PaymentResult access={access} requestId={detail} thai={thai}/>}</div>
  :<section className="payment-history-panel ph-panel" id={panelId} aria-labelledby={titleId} aria-busy={busy}><div className="ph-head"><h3 id={titleId} ref={heading} tabIndex={-1}>{label}</h3></div>
   {error&&<p className="ph-state error" role="alert">{t('Payment history unavailable.','ประวัติรับชำระใช้ไม่ได้')} <button type="button" className="text-action" onClick={()=>void load(cursors.current[page],page)}>{t('Try again','ลองอีกครั้ง')}</button></p>}
   {!error&&loaded&&!items.length&&<p className="ph-state">{t('No payments yet.','ยังไม่มีรายการรับชำระ')}</p>}
   {!error&&months.map(group=><div key={group.month}><h4 className="ph-month">{group.month}</h4><ul className="ph-list">{group.rows.map(row)}</ul></div>)}
   {!error&&<CompactPager busy={busy} previous={page>0?()=>{paged.current=true;void load(cursors.current[page-1],page-1)}:undefined} next={cursor?()=>{paged.current=true;void load(cursor,page+1)}:undefined} previousLabel={t('Previous payment history page','ประวัติรับชำระหน้าก่อน')} nextLabel={t('Next payment history page','ประวัติรับชำระหน้าถัดไป')}/>}
  </section>)}</>;
}
