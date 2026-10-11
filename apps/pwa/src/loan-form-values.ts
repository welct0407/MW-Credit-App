export const loanTypes=['กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน'] as const;
export function loanTypeLabel(value:string|null,thai:boolean){const index=loanTypes.indexOf(value as typeof loanTypes[number]);return index<0?(value??'—'):thai?loanTypes[index]:['Fixed due date','Daily interest','Daily instalment'][index];}
export function tenth(value:string|null){if(!value||!/^\d+(\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const digits=(whole+fraction).replace(/^0+(?=\d)/,'');const places=fraction.length+1;const padded=digits.padStart(places+1,'0');return (padded.slice(0,-places)+'.'+padded.slice(-places)).replace(/\.?0+$/,'')||'0';}
export function stepMoney(value:string|null,step:number){if(value&&!/^\d+(\.\d{1,2})?$/.test(value))return value;const [whole,fraction='']=(value||'0').split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))+BigInt(step)*100n;const amount=cents<0n?0n:cents;return (String(amount/100n)+'.'+String(amount%100n).padStart(2,'0')).replace(/\.?0+$/,'')||'0';}
export function dailyPercentage(principal:string|null,interest:string|null){const p=Number(principal),i=Number(interest);return p>0&&interest!==null&&Number.isFinite(i)?new Intl.NumberFormat('en-GB',{maximumFractionDigits:6}).format(i/p*100)+'%':'—';}

export function loanFieldChange<T extends {principal:string|null;type:string|null;currentDailyInterest:string|null}>(prior:T,key:keyof T,value:any,existing=false):T{return {...prior,[key]:value,...(!existing&&((key==='principal'&&value!==prior.principal&&prior.type==='ดอกเบี้ยรายวัน')||(key==='type'&&value==='ดอกเบี้ยรายวัน'&&prior.currentDailyInterest===null))?{currentDailyInterest:tenth(key==='principal'?value:prior.principal)}:{})};}
export function loanValidation(fields:any,source:any=null):string|null{
 const changed=(...keys:string[])=>!source||keys.some(key=>fields[key]!==source[key]);
 const money=['principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest'];
 if(money.some(key=>changed(key)&&fields[key]!==null&&!/^\d+(\.\d{1,2})?$/.test(fields[key])))return 'precision';
 if(fields.type==='กำหนดวันชำระ'&&changed('type','dueDate','loanDate','fixedInterest')&&(!(fields.dueDate>fields.loanDate)||!(Number(fields.fixedInterest)>0)))return 'fixed';
 if(fields.type==='ดอกเบี้ยรายวัน'&&!source&&!(Number(fields.currentDailyInterest)>0))return 'daily';
 if(['ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน'].includes(fields.type)&&changed('type','paymentInterval')&&(!Number.isInteger(fields.paymentInterval)||fields.paymentInterval<1))return 'interval';
 if(fields.type==='ผ่อนชำระรายวัน'&&changed('type','principal','dailyPayment','dueDate','loanDate')){const days=(Date.parse(fields.dueDate+'T00:00:00Z')-Date.parse(fields.loanDate+'T00:00:00Z'))/86400000+1;if(!(days>=1)||!Number.isInteger(Number(fields.principal))||!Number.isInteger(Number(fields.dailyPayment))||!(Number(fields.dailyPayment)>0)||!(Number(fields.dailyPayment)*days>Number(fields.principal)))return 'installment';}
 return null;
}
