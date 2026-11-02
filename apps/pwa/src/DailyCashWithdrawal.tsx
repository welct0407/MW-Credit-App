import {useEffect,useId,useRef,useState} from 'react';
import {Icon} from './Icon';
import {HeaderBack} from './HeaderBack';
import {OperationConfirm} from './OperationConfirm';
import {readCachedJson} from './read-cache';
import {wholeBaht} from './display-money';
import {displayDate} from './display-date';
import {wholeNumberProps,normalizeWhole,isWhole} from './whole-number-input';
import type {CommandAccess} from './SelectedCharges';
/** R115 Daily cash withdrawal: Dad's bank accounts into Dad's on-hand cash for one date and 10-minute time. */
const pad=(n:number)=>String(n).padStart(2,'0');
export const withdrawalHours=Array.from({length:24},(_,h)=>pad(h));
export const withdrawalMinutes=['00','10','20','30','40','50'];
/** The default destination: Dad's on-hand cash account. */
export const cashAccountPattern=/cash|เงินสด/i;
const shiftDay=(day:string,days:number)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
/** Bangkok time now, minutes rounded down to 10. */
export function bangkokTimeNow(now=new Date()):{hour:string;minute:string}{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);const get=(type:string)=>parts.find(part=>part.type===type)?.value??'00';return {hour:pad(Number(get('hour'))%24),minute:pad(Math.floor(Number(get('minute'))/10)*10)}}
type Basis={date:string;time:string;covered:boolean;future:boolean;accounts:{id:string;label:string|null;initialized:boolean;availableAsOf:string|null;maxWithdrawable:string|null}[]};
export function DailyCashWithdrawal({access,thai,businessDate,onBack,onApplied}:{access:CommandAccess;thai:boolean;businessDate:string;onBack:()=>void;onApplied:()=>void}){
 const t=(en:string,th:string)=>thai?th:en,fieldId=useId(),title=t('Daily cash withdrawal','ถอนเงินสดประจำวัน'),initialTime=useRef(bangkokTimeNow()).current;
 const [date,setDate]=useState(shiftDay(businessDate,-1)),[hour,setHour]=useState(initialTime.hour),[minute,setMinute]=useState(initialTime.minute),time=hour+':'+minute;
 const [basis,setBasis]=useState<Basis|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const [destination,setDestination]=useState<string|null>(null),[amounts,setAmounts]=useState<Record<string,string>>({}),[command,setCommand]=useState<any>(null),[blocked,setBlocked]=useState('');
 const offline=!!access.offlineOnly;
 // DCW-3: reload the as-of balances whenever the date or time changes; the previous figures stay, dimmed, while loading.
 // biome-ignore lint/correctness/useExhaustiveDependencies: access is rebuilt every render; date, time and an explicit retry are the triggers
 useEffect(()=>{if(offline||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;const controller=new AbortController();setLoading(true);setFailed(false);
  void readCachedJson<Basis>(access,'/api/management/cash-withdrawal?date='+encodeURIComponent(date)+'&time='+encodeURIComponent(time),{signal:controller.signal,policy:'network-only'}).then(({response,data})=>{if(controller.signal.aborted)return;if(!response.ok)throw Error();setBasis(data);setDestination(current=>current&&data.accounts.some(a=>a.id===current)?current:(data.accounts.find(a=>cashAccountPattern.test(a.label??''))??data.accounts[0])?.id??null)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort()},[date,time,offline,retry]);
 const destinationLabel=basis?.accounts.find(a=>a.id===destination)?.label??'—';
 const lines=(basis?.accounts??[]).filter(a=>a.id!==destination).map(account=>{const text=amounts[account.id]??'',valid=text===''||isWhole(text),amount=valid&&text!==''?Number(text):0,available=account.availableAsOf==null?null:Number(account.availableAsOf),max=account.maxWithdrawable==null?null:Math.max(0,Math.floor(Number(account.maxWithdrawable))),remaining=max==null?null:max-amount;return {...account,text,valid,amount,available,max,limited:available!=null&&max!=null&&max<available,remaining,exceeds:remaining!=null&&remaining<0}});
 // Chase/owner: a back-dated withdrawal may not turn a later balance negative, so the limit is maxWithdrawable (<= the as-of balance).
 const chosen=lines.filter(line=>line.valid&&line.amount>0),total=chosen.reduce((sum,line)=>sum+line.amount,0);
 const ready=!loading&&!failed&&!!basis&&basis.date===date&&basis.time===time&&basis.covered&&!basis.future&&!!destination&&chosen.length>0&&lines.every(line=>line.valid&&!line.exceeds)&&chosen.every(line=>line.max!=null);
 const online=!(!access.offline&&(access.offlineOnly||!navigator.onLine));
 const setAmount=(id:string,value:string)=>setAmounts(previous=>({...previous,[id]:value}));
 function review(){if(!ready||!destination)return;setBlocked('');setCommand({requestId:crypto.randomUUID(),operation:'cash-withdrawal.create',targetId:crypto.randomUUID(),expectedVersion:null,predecessorRequestId:null,receiptId:null,inputs:{movementDate:date,movementTime:time,toAccountId:destination,lines:chosen.map(line=>({fromAccountId:line.id,amount:line.text}))}});}
 const transfers=(n:number)=>thai?n+' รายการโอน':n===1?'1 transfer':n+' transfers';
 if(command){const reviewed=(command.inputs.lines as {fromAccountId:string}[]).map(line=>lines.find(l=>l.id===line.fromAccountId)).filter(line=>line!==undefined);return <OperationConfirm access={access} thai={thai} command={command} domain="management" label={title} onBack={()=>setCommand(null)} onApplied={onApplied} onBlocked={code=>setBlocked(code==='insufficient_funds'?t('Exceeds available balance. Go back and check the amounts.','เกินยอดคงเหลือ กลับไปตรวจสอบจำนวนเงิน'):code==='invalid_date'?t('This date and time can no longer be used.','ใช้วันที่และเวลานี้ไม่ได้แล้ว'):'')}>
  <dl className="dcw-summary"><div><dt>{t('Date and time','วันที่และเวลา')}</dt><dd>{displayDate(date)} {time}</dd></div>{reviewed.map(line=><div key={line.id}><dt>{(line.label??'—')+' → '+destinationLabel}</dt><dd>{wholeBaht(line.amount)} ({t('remaining','คงเหลือ')} {wholeBaht(line.remaining)})</dd></div>)}<div><dt>{t('Total','รวม')}</dt><dd>{wholeBaht(total)}</dd></div></dl><p>{transfers(reviewed.length)}</p>{blocked&&<p role="alert">{blocked}</p>}</OperationConfirm>;}
 return <section className="borrower-record daily-cash-withdrawal" aria-label={title}><div className="related-loans-heading"><HeaderBack navigationKey="daily-cash-withdrawal" className="icon-action" aria-label={t('Back to Cash Position','กลับสถานะเงินสด')} onClick={onBack}><Icon name="back"/></HeaderBack><h2>{title}</h2></div>
  {offline?<p role="status">{t('Daily cash withdrawal is unavailable offline.','ถอนเงินสดประจำวันใช้งานไม่ได้ขณะออฟไลน์')}</p>:<form onSubmit={event=>{event.preventDefault();review()}}>
   <div className="dcw-when"><label htmlFor={fieldId+'date'}><span className="field-title">{t('Date','วันที่')}</span><input id={fieldId+'date'} type="date" min={shiftDay(businessDate,-14)} max={businessDate} value={date} onChange={event=>{if(event.target.value)setDate(event.target.value)}}/></label>
    <fieldset className="dcw-time" aria-labelledby={fieldId+'time'}><span className="field-title" id={fieldId+'time'}>{t('Time','เวลา')}</span><div className="dcw-time-selects"><select aria-label={t('Hour','ชั่วโมง')} value={hour} onChange={event=>setHour(event.target.value)}>{withdrawalHours.map(value=><option key={value}>{value}</option>)}</select><span aria-hidden="true">:</span><select aria-label={t('Minute','นาที')} value={minute} onChange={event=>setMinute(event.target.value)}>{withdrawalMinutes.map(value=><option key={value}>{value}</option>)}</select></div></fieldset></div>
   <label htmlFor={fieldId+'to'}><span className="field-title">{t('To account','เข้าบัญชี')}</span><select id={fieldId+'to'} value={destination??''} disabled={!basis?.accounts.length} onChange={event=>setDestination(event.target.value||null)}>{(basis?.accounts??[]).map(account=><option key={account.id} value={account.id}>{account.label??account.id}</option>)}</select></label>
   <p className="dcw-asof" role="status">{t('As of','ณ')} {displayDate(date)} {time}{loading?' …':''}</p>
   {failed&&<p role="alert">{t('Balances unavailable.','ไม่สามารถโหลดยอดคงเหลือ')} <button type="button" onClick={()=>setRetry(n=>n+1)}>{t('Retry','ลองอีกครั้ง')}</button></p>}
   {basis&&!basis.covered&&<p role="alert">{t('Balances are available for the last 15 days only.','ดูยอดคงเหลือได้เฉพาะ 15 วันล่าสุด')}</p>}
   {basis?.future&&<p role="alert">{t('The date and time cannot be in the future.','วันที่และเวลาต้องไม่อยู่ในอนาคต')}</p>}
   <div className={'dcw-lines'+(loading?' is-loading':'')} aria-busy={loading}><table className="dcw-table"><thead><tr><th>{t('Account','บัญชี')}</th><th>{t('Available balance','ยอดคงเหลือ')}</th><th>{t('Withdraw amount','จำนวนถอน')}</th><th>{t('Remaining','คงเหลือหลังถอน')}</th></tr></thead><tbody>
    {lines.map(line=><tr key={line.id} className="dcw-line"><th scope="row">{line.label??line.id}</th><td data-label={t('Available balance','ยอดคงเหลือ')}>{line.available==null?<span>— <small>{line.initialized?t('Unavailable','ไม่พร้อมใช้งาน'):t('Not initialized','ยังไม่กำหนดยอดยกมา')}</small></span>:<>{wholeBaht(line.available)}{line.limited&&<small className="dcw-max">{thai?'ถอนได้สูงสุด '+wholeBaht(line.max)+' เพื่อไม่ให้ยอดภายหลังติดลบ':'Max '+wholeBaht(line.max)+' — keeps later balances from going negative'}</small>}</>}</td>
     <td data-label={t('Withdraw amount','จำนวนถอน')}><div className="dcw-amount"><span aria-hidden="true">฿</span><input {...wholeNumberProps} aria-label={t('Withdraw amount','จำนวนถอน')+' '+(line.label??line.id)} aria-invalid={!line.valid||line.exceeds} disabled={line.max==null} value={line.text} onChange={event=>setAmount(line.id,normalizeWhole(event.target.value))}/><button type="button" className="text-action" disabled={line.max==null||line.max<=0} onClick={()=>setAmount(line.id,String(line.max??0))}>{t('Withdraw all','ถอนทั้งหมด')}</button></div>{!line.valid&&<small className="dcw-negative" role="alert">{t('Whole baht only.','กรอกเป็นบาทเต็มเท่านั้น')}</small>}</td>
     <td data-label={t('Remaining','คงเหลือหลังถอน')}><span className={line.exceeds?'dcw-negative':''}>{line.remaining==null?'—':wholeBaht(line.remaining)}</span>{line.exceeds&&<small className="dcw-negative" role="alert">{t('Exceeds available balance','เกินยอดคงเหลือ')}</small>}</td></tr>)}
   </tbody></table></div>
   <p className="dcw-total">{chosen.length?transfers(chosen.length)+' · '+t('Total','รวม')+' '+wholeBaht(total):t('Enter an amount for at least one account.','กรอกจำนวนถอนอย่างน้อยหนึ่งบัญชี')}</p>
   <button type="submit" disabled={!ready||!online}>{t('Confirm withdrawal','ยืนยันการถอน')}</button>
  </form>}
 </section>;
}
