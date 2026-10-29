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
