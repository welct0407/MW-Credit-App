import {validBorrowerId} from './borrowers.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
export const loanInputFields=Object.freeze({borrowerId:'Ref Borrowers',loanDate:'Loan Date',principal:'Principal Amount',transferFee:'Transfer Fee',disbursingAccountId:'Ref Disbursed From Cash Account',type:'Loan Type',dueDate:'Due Date',dailyPayment:'Daily Payment Amount',fixedInterest:'Fixed Interest',currentDailyInterest:'Current Daily Interest',paymentInterval:'Interest Payment Interval',arrangement:'Loan Arrangement',autoChargeEnabled:'Auto Charge Enabled'});
const money=new Set(['principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest']);
export async function readLoanRecord(client,id){
 const columns=Object.entries(loanInputFields).map(([key,column])=>`l."${column}"${money.has(key)?'::numeric::text':key.endsWith('Date')?'::text':''} AS "${key}"`).join(',');
 const row=(await client.query(`SELECT l."Row ID" AS id,${columns},l."Original Daily Interest Rate" AS "originalRate",l."Interest Schedule Anchor Date"::text AS "scheduleAnchor",l."Loan Status" AS status,l."Defaulted" AS defaulted,l."Close Date"::text AS "closeDate",l."Default Loss Amount"::numeric::text AS "defaultLoss",l."Outstanding Principal"::text AS "outstandingPrincipal",l."Total Principal Received"::text AS "principalReceived",l."Total Interest Received"::text AS "interestReceived",l."Total Amount Received"::text AS "amountReceived",b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",a."Account Label" AS "disbursingAccountLabel" FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=l."Ref Disbursed From Cash Account" WHERE l."Row ID"=$1`,[id])).rows[0];
 if(!row)return null;
 row.borrowerDisplayName=borrowerDisplayName(row.borrowerName,row.borrowerDescription);delete row.borrowerName;delete row.borrowerDescription;
 row.version=(await client.query('SELECT public.pwa_loan_version_v2($1) version',[id])).rows[0].version;return row;
}

export const loanTypes=Object.freeze(['กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน']);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>0&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
/** Preserve exact nullable source inputs; governed SQL owns calculations and conditional eligibility. */
export function canonicalLoanFields(input,{create=false}={}){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==Object.keys(loanInputFields).sort().join(','))throw Error('invalid_request');
 const result={};
 for(const key of Object.keys(loanInputFields)){
  const value=input[key];
  if(money.has(key)){
   if(value!==null&&(typeof value!=='string'||! /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)||value.length>20))throw Error('invalid_request');
  }else if(key==='autoChargeEnabled'){
   if(value!==null&&typeof value!=='boolean')throw Error('invalid_request');
  }else if(key==='paymentInterval'){
   if(value!==null&&(!Number.isInteger(value)||value<1||value>2147483647))throw Error('invalid_request');
  }else if(key==='type'){
   if(value!==null&&!loanTypes.includes(value))throw Error('invalid_request');
  }else if(key.endsWith('Date')){
   if(value!==null&&!validDate(value))throw Error('invalid_request');
  }else if(key==='arrangement'){
   if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
  }else if(value!==null&&!validBorrowerId(value))throw Error('invalid_request');
  result[key]=value;
 }
 if(create&&(!validBorrowerId(result.borrowerId)||!validBorrowerId(result.disbursingAccountId)||result.loanDate===null||result.type===null||result.principal===null||!/[1-9]/.test(result.principal)))throw Error('invalid_request');
 return result;
}
