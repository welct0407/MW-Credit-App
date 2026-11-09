import {isWhole,wholeText} from './whole-number-input';
export const loanTypes=['กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน'] as const;
export function loanTypeLabel(value:string|null,thai:boolean){const index=loanTypes.indexOf(value as typeof loanTypes[number]);return index<0?(value??'—'):thai?loanTypes[index]:['Fixed due date','Daily interest','Daily instalment'][index];}
/** One tenth of the principal, rounded half up to whole baht (505 → 51): the default daily interest for a new daily-interest loan. */
export function tenth(value:string|null){if(!value||!/^\d+(\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return String((cents+500n)/1000n);}
export function stepInterval(value:number|null,step:number){return Math.max(1,(value??0)+step);}
export const loanMoneyKeys=['principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest'] as const;
/** Source loan with server numeric text read as whole baht ("100.00" → "100"); a legacy fraction stays exact so an unchanged value still saves. */
export function wholeLoanSource<T extends Record<string,any>>(source:T):T{return {...source,...Object.fromEntries(loanMoneyKeys.filter(key=>key in source).map(key=>[key,wholeText(source[key])]))};}
/** Step a money field in whole baht; a legacy fraction is first rounded half up (1000.50 + 500 → 1501) so the result is always whole. */
export function stepMoney(value:string|null,step:number){if(value&&!/^\d+(\.\d{1,2})?$/.test(value))return value;const [whole,fraction='']=(value||'0').split('.');const amount=(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))+50n)/100n+BigInt(step);return String(amount<0n?0n:amount);}
export function dailyPercentage(principal:string|null,interest:string|null){const p=Number(principal),i=Number(interest);return p>0&&interest!==null&&Number.isFinite(i)?new Intl.NumberFormat('en-GB',{maximumFractionDigits:6}).format(i/p*100)+'%':'—';}

export function loanFieldChange<T extends {principal:string|null;type:string|null;currentDailyInterest:string|null}>(prior:T,key:keyof T,value:any,existing=false):T{return {...prior,[key]:value,...(!existing&&((key==='principal'&&value!==prior.principal&&prior.type==='ดอกเบี้ยรายวัน')||(key==='type'&&value==='ดอกเบี้ยรายวัน'&&prior.currentDailyInterest===null))?{currentDailyInterest:tenth(key==='principal'?value:prior.principal)}:{})};}
export function loanValidation(fields:any,source:any=null):string|null{
 const changed=(...keys:string[])=>!source||keys.some(key=>fields[key]!==source[key]);
 if(loanMoneyKeys.some(key=>changed(key)&&fields[key]!==null&&!isWhole(fields[key])))return 'precision';
 if(changed('principal')&&fields.principal!==null&&!(Number(fields.principal)>0))return 'principal';
 if(fields.type==='กำหนดวันชำระ'&&changed('type','dueDate','loanDate','fixedInterest')&&(!(fields.dueDate>fields.loanDate)||!(Number(fields.fixedInterest)>0)))return 'fixed';
 if(fields.type==='ดอกเบี้ยรายวัน'&&!source&&!(Number(fields.currentDailyInterest)>0))return 'daily';
 if(['ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน'].includes(fields.type)&&changed('type','paymentInterval')&&(!Number.isInteger(fields.paymentInterval)||fields.paymentInterval<1||fields.paymentInterval>2147483647))return 'interval';
 if(fields.type==='ผ่อนชำระรายวัน'&&changed('type','principal','dailyPayment','dueDate','loanDate')){const days=(Date.parse(fields.dueDate+'T00:00:00Z')-Date.parse(fields.loanDate+'T00:00:00Z'))/86400000+1;if(!(days>=1)||!Number.isInteger(Number(fields.principal))||!Number.isInteger(Number(fields.dailyPayment))||!(Number(fields.dailyPayment)>0)||!(Number(fields.dailyPayment)*days>Number(fields.principal)))return 'installment';}
 return null;
}
/** The first field, in form order, that makes loanValidation return this code: Save focuses it and marks it aria-invalid. */
export function loanInvalidField(code:string,fields:any,source:any=null):string|null{
 const changed=(key:string)=>!source||fields[key]!==source[key];
 if(code==='precision')return ['principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest'].find(key=>changed(key)&&fields[key]!==null&&!isWhole(fields[key]))??null;
 if(code==='principal')return 'principal';
 if(code==='fixed')return !(fields.dueDate>fields.loanDate)?'dueDate':'fixedInterest';
 if(code==='daily')return 'currentDailyInterest';
 if(code==='interval')return 'paymentInterval';
 if(code==='installment'){const days=(Date.parse(fields.dueDate+'T00:00:00Z')-Date.parse(fields.loanDate+'T00:00:00Z'))/86400000+1;return !(days>=1)?'dueDate':!Number.isInteger(Number(fields.principal))?'principal':'dailyPayment';}
 return null;
}

// R136 Part A: daily-instalment defaults (new loans only). The documentation fee (column "Transfer Fee") is 10% of the
// principal, the daily payment 5% and the due date loan date + 24 days (25 days, the loan date is day 1); each is filled only
// while the Partner has not typed it (manual flag, kept in the draft), and clearing it brings the default back on the next change.
export const INSTALMENT='ผ่อนชำระรายวัน',DAILY_INTEREST='ดอกเบี้ยรายวัน',DEFAULT_TERM=25;
export type DerivedKey='transferFee'|'dueDate'|'dailyPayment';
export type ManualFlags=Partial<Record<DerivedKey,boolean>>;
const derivedKeys:DerivedKey[]=['transferFee','dueDate','dailyPayment'];
/** Whole-baht percentage of the principal, rounded half up (10,005 × 5% = 500.25 → 500; 10,010 × 5% = 500.5 → 501). */
export function percentOf(value:string|null,percent:number){if(!value||!/^\d+(\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));return String((cents*BigInt(percent)+5000n)/10000n);}
export const twentieth=(value:string|null)=>percentOf(value,5);
export function addDays(day:string|null,days:number){if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;const time=Date.parse(day+'T00:00:00Z');return Number.isFinite(time)?new Date(time+days*86400000).toISOString().slice(0,10):null;}
/** Inclusive term T = due date − loan date + 1, or null. */
export function termDays(loanDate:string|null,dueDate:string|null){const a=Date.parse((loanDate??'')+'T00:00:00Z'),b=Date.parse((dueDate??'')+'T00:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((b-a)/86400000)+1:null;}
/**
 * One field change of a loan form with its manual flags. A typed fee, due date or daily payment counts as the Partner's own
 * from its first keystroke whatever the type; clearing it hands it back to the default. On a new loan, choosing Daily
 * instalment fills the untouched ones, a principal change re-derives the untouched fee and daily payment, and a loan date
 * change moves an untouched due date. Existing loans never re-derive.
 */
export function loanFormChange<T extends Record<string,any>>(prior:T,manual:ManualFlags,key:string,value:any,existing=false):{fields:T;manual:ManualFlags}{
 let fields:any=loanFieldChange(prior as any,key as any,value,existing),flags={...manual};
 if((derivedKeys as string[]).includes(key))flags={...flags,[key]:value!==null&&value!==''};
 // UX-19: leaving Daily instalment clears the fee, due date and daily payment the form filled itself (typed values stay).
 if(!existing&&key==='type'&&prior.type===INSTALMENT&&value!==INSTALMENT)for(const field of derivedKeys)if(!flags[field])fields={...fields,[field]:null};
 if(existing||fields.type!==INSTALMENT||!['type','principal','loanDate'].includes(key))return {fields,manual:flags};
 const fill=(field:DerivedKey,next:string|null)=>{if(!flags[field]&&next!==null)fields={...fields,[field]:next}};
 if(key==='type'||key==='principal'){fill('transferFee',tenth(fields.principal));fill('dailyPayment',twentieth(fields.principal));}
 if(key==='type'||key==='loanDate')fill('dueDate',addDays(fields.loanDate,DEFAULT_TERM-1));
 return {fields,manual:flags};
}
const baht=(value:number)=>'฿'+new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value);
const money=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value)?Number(value):null;
/** The SQL instalment schedule (V8, first_day_components_v83): base daily principal floor(P / T), the remainder spread one baht a day over the first P mod T days, interest = daily payment − principal. */
export function instalmentSchedule(principal:string|null,dailyPayment:string|null,loanDate:string|null,dueDate:string|null){
 const p=money(principal),payment=money(dailyPayment),term=termDays(loanDate,dueDate);
 if(p===null||payment===null||term===null||term<1||p<=0)return null;
 const base=Math.floor(p/term),remainder=p%term,interest=payment-base;
 return {term,base,remainder,interest,total:payment*term,interestTotal:payment*term-p,rate:(interest/p*100).toFixed(2)};
}
export const dueDateHelper=(term:number|null,thai:boolean)=>term===null||term<1?null:thai?`${term} วัน นับวันที่กู้เป็นวันที่ 1`:`${term} days, loan date is day 1`;
export function dailyPaymentHelper(schedule:ReturnType<typeof instalmentSchedule>,thai:boolean){
 if(!schedule)return null;const {base,interest,rate,remainder}=schedule;
 const extra=remainder>0?(thai?` · ${remainder} วันแรก +฿1 เงินต้น`:` · first ${remainder} days +฿1 principal`):'';
 return (thai?`เงินต้นต่อวัน ${baht(base)} · ดอกเบี้ยต่อวัน ${baht(interest)} (${rate}% ของเงินต้นต่อวัน)`:`Daily principal ${baht(base)} · daily interest ${baht(interest)} (${rate}% of principal per day)`)+extra;
}
/** The first-day charge the save will create (first_day_components_v83): instalment = daily payment + fee, daily interest =
 * daily interest + fee; the payment part is what the borrower pays for day 1. */
export function firstDayForecast(fields:{type:string|null;principal:string|null;transferFee:string|null;dailyPayment:string|null;currentDailyInterest:string|null;autoChargeEnabled?:boolean|null}){
 const p=money(fields.principal),fee=fields.transferFee===null||fields.transferFee===''?0:money(fields.transferFee);
 const payment=money(fields.type===INSTALMENT?fields.dailyPayment:fields.type===DAILY_INTEREST?fields.currentDailyInterest:null);
 if(p===null||fee===null||payment===null||fields.autoChargeEnabled===false)return null;
 return {principal:p,fee,payment,total:payment+fee,cashIssued:p-payment-fee};
}
/** The two summary rows above Save on a new daily loan: the instalment totals and the cash issued to the borrower. */
export function loanSummaryLines(fields:any,thai:boolean):string[]{
 const forecast=firstDayForecast(fields);if(!forecast)return [];const lines:string[]=[];
 if(fields.type===INSTALMENT){const schedule=instalmentSchedule(fields.principal,fields.dailyPayment,fields.loanDate,fields.dueDate);
  if(schedule)lines.push(thai?`รวม ${baht(schedule.total)} ใน ${schedule.term} วัน · ดอกเบี้ย ${baht(schedule.interestTotal)} + ค่าธรรมเนียมเอกสาร ${baht(forecast.fee)}`:`Total ${baht(schedule.total)} over ${schedule.term} days · interest ${baht(schedule.interestTotal)} + documentation fee ${baht(forecast.fee)}`);}
 lines.push(thai?`เงินสดที่จ่ายให้ผู้กู้ ${baht(forecast.cashIssued)} = เงินต้น ${baht(forecast.principal)} − ค่าธรรมเนียมเอกสาร ${baht(forecast.fee)} − ยอดชำระวันแรก ${baht(forecast.payment)}`
  :`Cash issued to borrower ${baht(forecast.cashIssued)} = ${baht(forecast.principal)} principal − ${baht(forecast.fee)} documentation fee − ${baht(forecast.payment)} first-day payment`);
 return lines;
}
