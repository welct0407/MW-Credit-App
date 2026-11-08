import {validBorrowerId} from './borrowers.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
import {paymentLoanDisplayKey} from '../payment-command/draft.mjs';
import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
export const loanInputFields=Object.freeze({borrowerId:'Ref Borrowers',loanDate:'Loan Date',principal:'Principal Amount',transferFee:'Transfer Fee',disbursingAccountId:'Ref Disbursed From Cash Account',type:'Loan Type',dueDate:'Due Date',dailyPayment:'Daily Payment Amount',fixedInterest:'Fixed Interest',currentDailyInterest:'Current Daily Interest',paymentInterval:'Interest Payment Interval',arrangement:'Loan Arrangement',autoChargeEnabled:'Auto Charge Enabled'});
const money=new Set(['principal','transferFee','dailyPayment','fixedInterest','currentDailyInterest']);
// R109: the latest default loss (date and amount of the newest df10: posting) and the unpaid charges a loss keeps or writes off.
export async function readLoanRecord(client,id){
 const columns=Object.entries(loanInputFields).map(([key,column])=>`l."${column}"${money.has(key)?'::numeric::text':key.endsWith('Date')?'::text':''} AS "${key}"`).join(',');
 const row=(await client.query(`SELECT l."Row ID" AS id,${columns},l."Original Daily Interest Rate" AS "originalRate",l."Interest Schedule Anchor Date"::text AS "scheduleAnchor",l."Loan Status" AS status,l."Defaulted" AS defaulted,l."Close Date"::text AS "closeDate",l."Default Loss Amount"::numeric::text AS "defaultLoss",l."Outstanding Principal"::text AS "outstandingPrincipal",l."Total Principal Received"::text AS "principalReceived",l."Total Interest Received"::text AS "interestReceived",l."Total Amount Received"::text AS "amountReceived",(SELECT max(c."Charge Date")::text FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND starts_with(c."Row ID",'df10:')) AS "defaultLossDate",(SELECT c."Principal Due"::numeric::text FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND starts_with(c."Row ID",'df10:') ORDER BY c."Charge Date" DESC,c."Row ID" COLLATE "C" DESC LIMIT 1) AS "lastDefaultLoss",(SELECT count(*)::integer FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND NOT starts_with(c."Row ID",'df10:') AND c."Amount Remaining"::numeric>0) AS "unpaidChargeCount",(SELECT coalesce(sum(c."Amount Remaining"::numeric),0)::text FROM public."Charges" c WHERE c."Ref Loans"=l."Row ID" AND NOT starts_with(c."Row ID",'df10:') AND c."Amount Remaining"::numeric>0) AS "unpaidChargeAmount",b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",a."Account Label" AS "disbursingAccountLabel" FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=l."Ref Disbursed From Cash Account" WHERE l."Row ID"=$1`,[id])).rows[0];
 if(!row)return null;
 row.borrowerDisplayName=borrowerDisplayName(row.borrowerName,row.borrowerDescription);delete row.borrowerName;delete row.borrowerDescription;
 // R136 (V138): the rollover links, read through to_jsonb so a database before V138 reads none.
 Object.assign(row,await readRolloverLinks(client,id));
 row.version=(await client.query('SELECT public.pwa_loan_version_v2($1) version',[id])).rows[0].version;return row;
}
const LINK_COLUMNS=`x."Row ID",'principal',x."Principal Amount"::numeric::text,'loanDate',x."Loan Date"::text,'closeDate',x."Close Date"::text,'rate',x."Original Daily Interest Rate"::text,'name',b."Borrower Name",'description',b."Description"`;
const LINK_SQL=`SELECT (SELECT jsonb_build_object('id',${LINK_COLUMNS}) FROM public."Loans" x JOIN public."Borrowers" b ON b."Row ID"=x."Ref Borrowers" WHERE x."Row ID"=(SELECT l."Ref Rollover Source Loan" FROM public."Loans" l WHERE l."Row ID"=$1)) AS source,
 (SELECT jsonb_build_object('id',${LINK_COLUMNS}) FROM public."Loans" x JOIN public."Borrowers" b ON b."Row ID"=x."Ref Borrowers" WHERE x."Ref Rollover Source Loan"=$1 ORDER BY x."Loan Date" DESC,x."Row ID" COLLATE "C" LIMIT 1) AS next`;
const ROLLOVER_SCHEMA_SQL=`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public."Loans"') AND attname='Ref Rollover Source Loan' AND NOT attisdropped) AS present`;
const NO_LINKS=Object.freeze({rolloverSourceLoanId:null,rolloverSourceDisplayKey:null,rolloverSourceCloseDate:null,rolledOverToLoanId:null,rolledOverToDisplayKey:null,rolledOverToLoanDate:null});
/** R136: the original loan this loan rolled over from (with its close date) and the loan it rolled over to (with its loan
 * date), each with the display key the app shows; null when there is none, before V138, or for a client that cannot answer
 * the catalog read (a scripted test client reads as an older schema, as lateChargeSchema does). */
export async function readRolloverLinks(client,id){
 let present=false;try{present=(await client.query(ROLLOVER_SCHEMA_SQL))?.rows?.[0]?.present===true}catch{present=false}
 if(!present)return {...NO_LINKS};
 const key=row=>row?paymentLoanDisplayKey({principal:row.principal,loanDate:row.loanDate,rate:row.rate,name:borrowerDisplayName(row.name,row.description)}):null;
 const {source,next}=(await client.query(LINK_SQL,[id])).rows[0]??{};
 return {rolloverSourceLoanId:source?.id??null,rolloverSourceDisplayKey:key(source),rolloverSourceCloseDate:source?.closeDate??null,
  rolledOverToLoanId:next?.id??null,rolledOverToDisplayKey:key(next),rolledOverToLoanDate:next?.loanDate??null};
}
const ROLLOVER_TYPES=Object.freeze(['ผ่อนชำระรายวัน','ดอกเบี้ยรายวัน']);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/**
 * R136: the rollover preview of a loan for a day (today or yesterday, Bangkok) and a penalty (whole baht; default 4 days of the
 * daily payment or daily interest): the SQL quote (loan_rollover_calculation_v1), the original loan's terms the new loan is
 * prefilled from, and Lisa's active accounts. Read only. Throws invalid_request for a bad day or penalty; null when the loan
 * does not exist. An ineligible loan returns {eligible:false, reason}.
 */
export async function readLoanRolloverPreview(client,id,{day=null,penalty=null}={}){
 const loan=(await readLoanRecord(client,id));if(!loan)return null;
 const today=(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day,yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const businessDate=day??today;if(typeof businessDate!=='string'||!ISO.test(businessDate)||![today,yesterday].includes(businessDate))throw Error('invalid_request');
 const daily=loan.type==='ผ่อนชำระรายวัน'?loan.dailyPayment:loan.currentDailyInterest,unit=daily!==null&&/^\d+(\.\d+)?$/.test(daily)?Number(daily):0;
 const value=penalty??String(Math.round(unit*4));if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,16})$/.test(value))throw Error('invalid_request');
 const term=loan.loanDate&&loan.dueDate?Math.round((Date.parse(loan.dueDate+'T00:00:00Z')-Date.parse(loan.loanDate+'T00:00:00Z'))/86400000)+1:null;
 const source={id:loan.id,borrowerId:loan.borrowerId,borrowerDisplayName:loan.borrowerDisplayName,type:loan.type,principal:loan.principal,transferFee:loan.transferFee,loanDate:loan.loanDate,dueDate:loan.dueDate,
  dailyPayment:loan.dailyPayment,currentDailyInterest:loan.currentDailyInterest,paymentInterval:loan.paymentInterval,arrangement:loan.arrangement,disbursingAccountId:loan.disbursingAccountId,
  originalRate:loan.originalRate,term,version:loan.version,displayKey:paymentLoanDisplayKey({principal:loan.principal,loanDate:loan.loanDate,rate:loan.originalRate,name:loan.borrowerDisplayName})};
 const accounts=(await client.query(`SELECT a."Row ID" AS id,a."Account Label" AS label,a."Default Account" AS "isDefault" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE AND h."Row ID"='ch:lisa' ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
 const base={businessDate,today,yesterday,penalty:value,source,accounts};
 if(!ROLLOVER_TYPES.includes(loan.type))return {...base,eligible:false,reason:'type',quote:null};
 if(!(await client.query(`SELECT to_regprocedure('public.loan_rollover_calculation_v1(text,date,numeric)') IS NOT NULL AS present`)).rows[0].present)return {...base,eligible:false,reason:'unavailable',quote:null};
 const quote=(await client.query('SELECT public.loan_rollover_calculation_v1($1,$2::date,$3::numeric) AS value',[id,businessDate,value])).rows[0].value;
 if(!quote?.eligible)return {...base,eligible:false,reason:quote?.reason??'unavailable',quote:null};
 return {...base,eligible:true,reason:null,quote};
}

export const loanTypes=Object.freeze(['กำหนดวันชำระ','ดอกเบี้ยรายวัน','ผ่อนชำระรายวัน']);
/** R136 (V138): the keys loan.rollover adds after the loan.create inputs, in canonical order. */
export const rolloverInputKeys=Object.freeze(['sourceLoanId','sourceExpectedVersion','penalty','expectedSettlement','expectedPlanHash']);
/** R136: loan.rollover inputs = the loan.create inputs (no schedule anchor) of a daily-instalment or daily-interest loan with
 * automatic charges, then the original loan, its version, the penalty and the reviewed quote's settlement and hash. */
export function canonicalRolloverFields(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.hasOwn(input,'scheduleAnchor')||rolloverInputKeys.some(key=>!Object.hasOwn(input,key)))throw Error('invalid_request');
 const loan=Object.fromEntries(Object.entries(input).filter(([key])=>!rolloverInputKeys.includes(key)));
 const result=canonicalLoanFields(loan,{create:true});
 if(!['ผ่อนชำระรายวัน','ดอกเบี้ยรายวัน'].includes(result.type)||result.autoChargeEnabled!==true)throw Error('invalid_request');
 const v=input,big=value=>BigInt(value)<=92233720368547758n;
 if(!validBorrowerId(v.sourceLoanId)||typeof v.sourceExpectedVersion!=='string'||!/^[a-f0-9]{64}$/.test(v.sourceExpectedVersion)||typeof v.penalty!=='string'||!/^(0|[1-9][0-9]{0,16})$/.test(v.penalty)||!big(v.penalty)
  ||typeof v.expectedSettlement!=='string'||!/^[1-9][0-9]{0,16}$/.test(v.expectedSettlement)||!big(v.expectedSettlement)||typeof v.expectedPlanHash!=='string'||!/^[a-f0-9]{64}$/.test(v.expectedPlanHash))throw Error('invalid_request');
 for(const key of rolloverInputKeys)result[key]=v[key];
 return result;
}
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>0&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
/** Preserve exact nullable source inputs; governed SQL owns calculations and conditional eligibility. */
export function canonicalLoanFields(input,{create=false}={}){
 const keys=Object.keys(loanInputFields);if(input&&Object.hasOwn(input,'scheduleAnchor'))keys.push('scheduleAnchor');
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');
 const result={};
 for(const key of keys){
  const value=input[key];
  if(money.has(key)){
   if(value!==null&&(typeof value!=='string'||! /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(value)||value.length>20))throw Error('invalid_request');
  }else if(key==='autoChargeEnabled'){
   if(value!==null&&typeof value!=='boolean')throw Error('invalid_request');
  }else if(key==='paymentInterval'){
   if(value!==null&&(!Number.isInteger(value)||value<1||value>2147483647))throw Error('invalid_request');
  }else if(key==='type'){
   if(value!==null&&!loanTypes.includes(value))throw Error('invalid_request');
  }else if((key.endsWith('Date')||key==='scheduleAnchor')){
   if(value!==null&&!validDate(value))throw Error('invalid_request');
  }else if(key==='arrangement'){
   if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
  }else if(value!==null&&!validBorrowerId(value))throw Error('invalid_request');
  result[key]=value;
 }
 if(create&&(!validBorrowerId(result.borrowerId)||!validBorrowerId(result.disbursingAccountId)||result.loanDate===null||result.type===null||result.principal===null||!/[1-9]/.test(result.principal)))throw Error('invalid_request');
 return result;
}
