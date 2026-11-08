// R136 (V138): the rollover statement (design 5.3, B4) and the rollover form's pure rules. The original loan's side comes from
// the server quote (loan_rollover_calculation_v1 through /api/loan-records/:id/rollover-preview); the new loan's side from the
// form, with the same first-day components the server books (first_day_components_v83). Whole baht throughout.
import {INSTALMENT,DAILY_INTEREST,instalmentSchedule,addDays} from './loan-form-values';
import {shortDate} from './pay-forward-text';
export const ROLLOVER_TYPES=[INSTALMENT,DAILY_INTEREST] as const;
const whole=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
export const baht=(value:number)=>(value<0?'−':'')+'฿'+whole.format(Math.abs(value));
const amount=(value:unknown)=>typeof value==='string'&&/^-?\d+(\.\d+)?$/.test(value)?Number(value):typeof value==='number'&&Number.isFinite(value)?value:null;
const dmy=(day:string|null|undefined)=>day&&/^\d{4}-\d{2}-\d{2}$/.test(day)?`${day.slice(8,10)}/${day.slice(5,7)}/${day.slice(0,4)}`:'—';
/** Whether the loan record offers Rollover: an open, auto-enabled, non-defaulted daily-instalment or daily-interest loan with outstanding principal (a read without the figure keeps it). */
export function rolloverOffered(item:any){
 if(item?.status!=='ยังไม่ปิดยอด'||!item.autoChargeEnabled||item.defaulted||!(ROLLOVER_TYPES as readonly string[]).includes(item.type))return false;
 return !(item.outstandingPrincipal!=null&&item.outstandingPrincipal!==''&&Number(item.outstandingPrincipal)===0);
}
/** One day of the original loan's daily amount (daily payment or current daily interest), the penalty stepper's step. */
export const penaltyStep=(source:any)=>Math.round(amount(source?.type===INSTALMENT?source?.dailyPayment:source?.currentDailyInterest)??0);
/** "฿2,000 = 4 days of ฿500", "฿2,250 = 4.5 days of ฿500" (Echo R136-UX-07). */
export function penaltyHelper(penalty:string|null,step:number,thai:boolean){
 const value=amount(penalty);if(value===null||step<=0)return null;
 const days=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value/step);
 return thai?`${baht(value)} = ${days} วัน × ${baht(step)}`:`${baht(value)} = ${days} days of ${baht(step)}`;
}
/** The new loan's prefill from the original loan on day D: type, principal, fee, interval, the term T0 (due date D + T0 − 1,
 * 25 when unknown) and the daily payment, or the current daily interest. */
export function rolloverPrefill(source:any,day:string){
 const instalment=source.type===INSTALMENT,term=source.term&&source.term>0?source.term:25;
 return {type:source.type,principal:wholeText(source.principal),transferFee:wholeText(source.transferFee)??'0',paymentInterval:source.paymentInterval??1,
  dueDate:instalment?addDays(day,term-1):null,dailyPayment:instalment?wholeText(source.dailyPayment):null,currentDailyInterest:instalment?null:wholeText(source.currentDailyInterest)};
}
function wholeText(value:unknown):string|null{const n=amount(value);return n===null?null:String(Math.round(n));}
/** The bilingual arrangement note naming the original loan, then a blank line and the original loan's own arrangement. */
export function rolloverArrangement(source:any,day:string,penalty:string|null,sourceKey:string){
 const instalment=source.type===INSTALMENT,p=baht(amount(source.principal)??0),daily=baht(amount(instalment?source.dailyPayment:source.currentDailyInterest)??0),fine=baht(amount(penalty)??0);
 const en=`Rollover of loan ${sourceKey} (loan date ${dmy(source.loanDate)}, principal ${p}, ${instalment?`daily payment ${daily}, due ${dmy(source.dueDate)}`:`daily interest ${daily}`}), closed on ${dmy(day)} with early closure penalty ${fine}.`;
 const th=`ต่อสัญญาจากสินเชื่อ ${sourceKey} (วันที่กู้ ${dmy(source.loanDate)} เงินต้น ${p} ${instalment?`ยอดชำระรายวัน ${daily} ครบกำหนด ${dmy(source.dueDate)}`:`ดอกเบี้ยรายวัน ${daily}`}) ปิดเมื่อ ${dmy(day)} ค่าปรับปิดก่อนกำหนด ${fine}`;
 const own=typeof source.arrangement==='string'&&source.arrangement.trim()?'\n\n'+source.arrangement:'';
 return en+'\n'+th+own;
}
/** True when the arrangement text still starts with a generated note (so a day or penalty change may rewrite it). */
export const generatedArrangement=(text:string|null)=>!!text&&/^Rollover of loan .*\nต่อสัญญาจากสินเชื่อ /.test(text);
export type StatementRow={key:string;label:string;value:number;detail?:string;kind?:'total'|'heading'|'cash'|'memo'};
export type RolloverStatement={rows:StatementRow[];available:number;settlement:number;cashIssued:number;profit:number;firstDayPayment:number;fee:number;principal:number;negative:boolean;unpaid:number};
/**
 * The statement for the form's new-loan terms and the server quote: available for disbursement = principal − fee − first-day
 * payment; deducted for the original loan = the quote's settlement; cash issued = available − settlement; profit recognized
 * today = interest (and late charge) the settlement pays + the new loan's first-day interest (fee included).
 */
export function rolloverStatement(input:{type:string;principal:string|null;transferFee:string|null;dailyPayment:string|null;currentDailyInterest:string|null;loanDate:string;dueDate:string|null;quote:any;sourceKey:string},thai:boolean):RolloverStatement|null{
 const t=(en:string,th:string)=>thai?th:en,q=input.quote;if(!q)return null;
 const principal=amount(input.principal),fee=input.transferFee===null||input.transferFee===''?0:amount(input.transferFee),instalment=input.type===INSTALMENT;
 const payment=amount(instalment?input.dailyPayment:input.currentDailyInterest);
 if(principal===null||fee===null||payment===null)return null;
 const schedule=instalment?instalmentSchedule(input.principal,input.dailyPayment,input.loanDate,input.dueDate):null;
 const firstPrincipal=instalment?(schedule?schedule.base+(schedule.remainder>0?1:0):0):0,firstInterest=payment-firstPrincipal+fee;
 const settlement=amount(q.settlement)??0,unpaid=amount(q.unpaid)??0,missing=amount(q.missingPrincipal)??0,penalty=amount(q.penalty)??0,daily=amount(q.dailyAmount)??0;
 const available=principal-fee-payment,cashIssued=available-settlement;
 const settledInterest=(Array.isArray(q.allocations)?q.allocations:[]).reduce((sum:number,line:any)=>sum+(amount(line.interest)??0)+(amount(line.lateCharge)??0),0);
 const profit=settledInterest+firstInterest;
 const rows:StatementRow[]=[
  {key:'title',label:t('Rollover statement, ','ใบสรุปการต่อสัญญา ')+dmy(input.loanDate),value:0,kind:'heading'},
  {key:'principal',label:t('New loan principal','เงินต้นสินเชื่อใหม่'),value:principal},
  {key:'fee',label:t('− Documentation fee','− ค่าธรรมเนียมเอกสาร'),value:fee},
  {key:'firstDay',label:instalment&&schedule?t(`− First-day payment (day 1 of ${schedule.term})`,`− ยอดชำระวันแรก (วันที่ 1 จาก ${schedule.term})`):t('− First-day payment','− ยอดชำระวันแรก'),value:payment},
  {key:'available',label:t('Available for disbursement','ยอดพร้อมจ่าย'),value:available,kind:'total'},
  {key:'settlementHeading',label:t('Settlement of loan ','ปิดยอดสินเชื่อ ')+input.sourceKey,value:0,kind:'heading'},
  {key:'unpaid',label:t('− Unpaid charges to date','− ยอดเรียกเก็บค้างชำระ'),value:unpaid}];
 if(q.type===INSTALMENT){const days=Number(q.unchargedDays??0),interest=amount(q.remainingInterest)??0;
  rows.push({key:'uncharged',label:t(`− ${days} days not yet charged × ${baht(daily)}`,`− ${days} วันที่ยังไม่เรียกเก็บ × ${baht(daily)}`),value:missing+interest,
   detail:t(`principal ${baht(missing)} · interest ${baht(interest)}`,`เงินต้น ${baht(missing)} · ดอกเบี้ย ${baht(interest)}`)+(q.interestClamped?t(' (interest not below ฿0)',' (ดอกเบี้ยไม่ต่ำกว่า ฿0)'):'')});
 }else{
  rows.push({key:'outstanding',label:t('− Outstanding principal','− เงินต้นคงเหลือ'),value:missing});
  const gap=amount(q.gapInterest)??0,gapDays=Number(q.gapDays??0);
  if(gap>0)rows.push({key:'gap',label:t(`− Interest for ${gapDays} days since the last charge × ${baht(daily)}`,`− ดอกเบี้ย ${gapDays} วันนับจากรายการล่าสุด × ${baht(daily)}`),value:gap});
 }
 const penaltyDays=daily>0?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(penalty/daily):'0';
 rows.push({key:'penalty',label:t(`− Early closure penalty (${penaltyDays} days of ${baht(daily)})`,`− ค่าปรับปิดก่อนกำหนด (${penaltyDays} วัน × ${baht(daily)})`),value:penalty},
  {key:'settlement',label:t('Deducted for the original loan','หักชำระสินเชื่อเดิม'),value:settlement,kind:'total'},
  {key:'cash',label:t('Cash issued to borrower','เงินสดที่จ่ายให้ผู้กู้'),value:cashIssued,kind:'cash'},
  {key:'profit',label:t('Profit recognized today','กำไรรับรู้วันนี้'),value:profit,kind:'memo'});
 return {rows,available,settlement,cashIssued,profit,firstDayPayment:payment,fee,principal,negative:cashIssued<0,unpaid};
}
/** The message above the disabled Review button when cash issued would be negative (D6, Echo R136-UX-06). */
export function negativeCashMessage(statement:RolloverStatement,thai:boolean){
 if(!statement.negative)return null;const short=baht(statement.cashIssued);
 return thai?`เงินสดที่จ่ายจะติดลบ (${short}) เพิ่มเงินต้นหรือลดค่าปรับ${statement.unpaid>0?' หรือบันทึกการชำระยอดค้างของผู้กู้ก่อน':''}`
  :`Cash issued would be negative (${short}). Raise the principal or lower the penalty${statement.unpaid>0?', or record the borrower\'s payment of the unpaid charges first':''}.`;
}
/** The status line on the new loan after the rollover (Echo R136-UX-09). */
export function rolloverResultLine(sourceKey:string,newKey:string,cash:string|number,borrower:string,thai:boolean){
 const value=baht(amount(cash)??0);
 return thai?`ต่อสัญญาแล้ว: ปิดสินเชื่อ ${sourceKey} · จ่ายเงินสด ${value} ให้ ${borrower}`:`Rollover saved: loan ${sourceKey} closed, new loan ${newKey} · ${value} cash to ${borrower}`;
}
/** The reason an ineligible loan cannot be rolled over (the preview's reason code). */
export function ineligibleReason(reason:string|null|undefined,thai:boolean){
 const messages:Record<string,[string,string]>={closed:['The loan is closed.','สินเชื่อปิดแล้ว'],type:['Only daily instalment and daily interest loans can be rolled over.','ต่อสัญญาได้เฉพาะสินเชื่อผ่อนชำระรายวันและดอกเบี้ยรายวัน'],
  defaulted:['The loan is defaulted or has a principal loss.','สินเชื่อผิดนัดหรือมีหนี้สูญเงินต้น'],auto:['Automatic charges are off for this loan.','สินเชื่อนี้ไม่ได้เรียกเก็บอัตโนมัติ'],
  processing:['A payment of this borrower is still processing. Resolve it first.','มีการรับชำระของผู้กู้ที่ยังดำเนินการอยู่ แก้ไขก่อน'],date:['The rollover day is before the loan date.','วันต่อสัญญาอยู่ก่อนวันที่กู้'],
  earlier:['An earlier rollover closing charge is still on the loan. Delete it first.','ยังมีรายการปิดยอดจากการต่อสัญญาครั้งก่อน ลบก่อน'],terms:['The loan terms are incomplete.','เงื่อนไขสินเชื่อไม่ครบ'],
  reconcile:['The loan\'s charges require reconciliation.','ต้องกระทบยอดรายการเรียกเก็บของสินเชื่อ'],nothing:['Nothing to close; create a new loan instead.','ไม่มียอดต้องปิด สร้างสินเชื่อใหม่แทน']};
 const [en,th]=messages[reason??'']??['This loan cannot be rolled over now.','ต่อสัญญาสินเชื่อนี้ไม่ได้ในขณะนี้'];return thai?th:en;
}
/**
 * The referral-rebate line of a rollover whose original loan was referred, in the Loan Close / payment record wording (R111,
 * R129): offset to the referrer's loan (paid through a date; the rest pending), pending to the referrer, or paid on a
 * settlement date. Read from the settlement payment's closeRebates (GET /api/payment-records/:id); '' when there is none.
 */
export function rolloverRebateLine(rebates:any[]|null|undefined,thai:boolean):string{
 const t=(en:string,th:string)=>thai?th:en,money=(v:unknown)=>typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v),b=(v:unknown)=>baht(Number(v));
 return (Array.isArray(rebates)?rebates:[]).filter(r=>r&&money(r.amount)).map(r=>{
  if(r.offsetPaymentId&&money(r.offsetAmount)){const rest=money(r.payableAmount)&&Number(r.payableAmount)>0?t(' · '+b(r.payableAmount)+' pending',' · ค้างจ่าย '+b(r.payableAmount)):'';
   return t('rebate '+b(r.offsetAmount)+' offset to '+(r.offsetLoanLabel??r.referrerLabel)+(r.paidThrough?', paid through '+shortDate(r.paidThrough,false):''),
    'หักค่าแนะนำ '+b(r.offsetAmount)+' กับสินเชื่อ '+(r.offsetLoanLabel??r.referrerLabel)+(r.paidThrough?' ชำระถึง '+shortDate(r.paidThrough,true):''))+rest;}
  if(r.rebateState==='paid')return t('rebate '+b(r.amount)+' paid to '+r.referrerLabel+(r.settlementDate?' on '+shortDate(r.settlementDate,false):''),'ค่าแนะนำ '+b(r.amount)+' จ่ายให้ '+r.referrerLabel+(r.settlementDate?' เมื่อ '+shortDate(r.settlementDate,true):''));
  return t('rebate '+b(r.amount)+' pending to '+r.referrerLabel,'ค่าแนะนำ '+b(r.amount)+' ค้างจ่ายให้ '+r.referrerLabel);
 }).join('; ');
}
