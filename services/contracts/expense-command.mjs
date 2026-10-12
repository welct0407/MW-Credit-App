import {validBorrowerId} from '../business/borrowers.mjs';
export const expenseCategories=Object.freeze(['Collection Cost / ค่าใช้จ่ายติดตามหนี้','Transportation / ค่าเดินทาง','Bank / Transfer Fee / ค่าธรรมเนียมธนาคารและโอนเงิน','Software / Subscription / ค่าซอฟต์แวร์และสมาชิก','Other / อื่น ๆ','Referral Rebate / เงินคืนค่าแนะนำลูกค้า']);
export const expenseFields=Object.freeze(['expenseDate','category','amount','payeeName','relatedBorrowerId','relatedLoanId','notes','paidByAccountId']);
/** Source-aware category/account compatibility is checked under lock, never inferred by the client. */
export function canonicalExpenseFields(input,{create=false}={}){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==expenseFields.slice().sort().join(','))throw Error('invalid_request');
 const result={};
 for(const key of expenseFields){
  const value=input[key];
  if(key==='amount'){
   if(typeof value!=='string'||! /^-?[1-9][0-9]*$/.test(value)||value.length>18||BigInt(value)>92233720368547758n||BigInt(value)<-92233720368547758n)throw Error('invalid_request');
  }else if(key==='expenseDate'){
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('invalid_request');
  }else if(key.endsWith('Id')){if(value!==null&&!validBorrowerId(value))throw Error('invalid_request');}
  else if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
  result[key]=value;
 }
 if(typeof result.category!=='string'||!result.category.trim()||(create&&!expenseCategories.includes(result.category)))throw Error('invalid_request');
 if(BigInt(result.amount)<0&&(typeof result.notes!=='string'||!result.notes.trim()))throw Error('invalid_request');
 if(create&&BigInt(result.amount)>0&&result.paidByAccountId===null)throw Error('invalid_request');
 return result;
}
