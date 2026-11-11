import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {paymentLoanDisplayKey} from '../payment-command/draft.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
import {validBorrowerId} from './borrowers.mjs';
/**
 * R129 (V137) referral rebate settlement reads: the Referrers page (every borrower who referred someone, what each is owed
 * and is accruing), a referrer's detail (unpaid rebates, open referred loans, settlement history, settle options) and one
 * settlement. The figures are the SQL rules: pwa_rebate_pending_v1 and pwa_rebates_owed_v1 for what is owed,
 * referral_rebate_terms for the accruing estimate. Money is a decimal string (two places), as in the other reads.
 */
/** Whether V137 is applied (one catalog read, no table privilege). A database before V137 has no settlement table. */
export async function rebateSettlementSchema(client){
 try{return (await client.query(`SELECT to_regclass('public.pwa_rebate_settlements') IS NOT NULL AS present`))?.rows?.[0]?.present===true;}catch{return false;}
}
export {rebatePendingSql,rebateStateSql} from './rebate-state.mjs';
/** The date and paying account of each linked settlement id (one read, only when a row links one). The ids travel as one JSON
 * text parameter, not a text[]: the offline records walk reads through bulkReadClient, which takes scalar parameters only. */
export async function settlementDates(client,ids){
 const wanted=[...new Set(ids.filter(id=>typeof id==='string'&&id))];
 if(!wanted.length)return new Map();
 return new Map((await client.query('SELECT s.id,s.settlement_date::text AS date,a."Account Label" AS "accountLabel" FROM public.pwa_rebate_settlements s LEFT JOIN public."Cash Accounts" a ON a."Row ID"=s.paid_by_cash_account WHERE s.id IN (SELECT jsonb_array_elements_text($1::jsonb))',[JSON.stringify(wanted)])).rows.map(r=>[r.id,{date:r.date,accountLabel:r.accountLabel}]));
}
/** The version of a settlement for rebate-settlement.delete: the SQL text of pwa_rebate_settlement_version_v1. */
export const settlementVersionSql=`SELECT encode(sha256(convert_to(((to_jsonb(s)-'created_at')||jsonb_build_object('created_at',to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'UTF8')),'hex')
 FROM public.pwa_rebate_settlements s WHERE s.id=$1`;
const money=expression=>`(${expression})::numeric(20,2)::text`;
const LISA='ch:lisa';
const REFERRER_LIMIT=200;
const loanKey=row=>row.loanPrincipal==null&&row.loanDate==null?null:paymentLoanDisplayKey({principal:row.loanPrincipal,loanDate:row.loanDate,rate:row.loanRate,name:borrowerDisplayName(row.borrowerName,row.borrowerDescription)});
// One row per referrer: the terms, what is owed (pending V3 rebates), what is accruing on open referred loans (the referrer's
// rate of interest and late charges received so far, at most the cap; self-referral excluded by the borrower check), what was
// paid (settlements plus legacy paid-at-close remainders) and what offsets settled.
const referrerSql=filter=>`WITH referrers AS (
  SELECT r."Row ID" id FROM public."Borrowers" r WHERE ${filter} AND (EXISTS(SELECT 1 FROM public."Borrowers" b WHERE b."Ref Referrer"=r."Row ID" AND b."Row ID"<>r."Row ID")
   OR EXISTS(SELECT 1 FROM public."Business Expenses" x WHERE x."Ref Payee Borrower"=r."Row ID" AND x."Source Type"='Referral Rebate'))),
 rebates AS (
  SELECT x."Ref Payee Borrower" payee,x."Row ID" id,x."Amount"::numeric amount,coalesce(o."Amount Received"::numeric,0) offset_amount,x."Rule Version" rule,
   public.pwa_rebate_pending_v1(x."Row ID") pending,coalesce(l."Close Date",x."Expense Date") close_date
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan"
  WHERE x."Source Type"='Referral Rebate' AND x."Ref Payee Borrower" IN (SELECT id FROM referrers)),
 accruing AS (
  SELECT b."Ref Referrer" referrer,l."Row ID" loan,coalesce((SELECT sum(y."Interest Paid"::numeric+y."Late Charge Paid"::numeric) FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID"),0) profit
  FROM public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
  WHERE b."Ref Referrer" IN (SELECT id FROM referrers) AND b."Row ID"<>b."Ref Referrer" AND l."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(l."Defaulted",false))
 SELECT r.id,b."Borrower Name" AS name,b."Description" AS description,t.terms,
  (SELECT count(*)::int FROM public."Borrowers" x WHERE x."Ref Referrer"=r.id AND x."Row ID"<>r.id) AS "referredCount",
  ${money('public.pwa_rebates_owed_v1(r.id)')} AS "unpaidAmount",
  (SELECT count(*)::int FROM rebates x WHERE x.payee=r.id AND x.pending>0) AS "unpaidCount",
  (SELECT min(x.close_date)::text FROM rebates x WHERE x.payee=r.id AND x.pending>0) AS "oldestUnpaidCloseDate",
  ${money(`coalesce((SELECT sum(CASE WHEN a.profit>0 AND (t.terms->>'rate')::numeric>0 THEN least(round(a.profit*(t.terms->>'rate')::numeric/100),(t.terms->>'cap')::numeric) ELSE 0 END) FROM accruing a WHERE a.referrer=r.id),0)`)} AS "accruingAmount",
  (SELECT count(*)::int FROM accruing a WHERE a.referrer=r.id) AS "accruingLoanCount",
  ${money(`coalesce((SELECT sum(s.amount) FROM public.pwa_rebate_settlements s WHERE s.payee_borrower_id=r.id),0)
   +coalesce((SELECT sum(greatest(x.amount-x.offset_amount,0)) FROM rebates x WHERE x.payee=r.id AND x.rule IS DISTINCT FROM 'REFERRAL_REBATE_V3'),0)`)} AS "paidToDate",
  ${money('coalesce((SELECT sum(least(x.offset_amount,x.amount)) FROM rebates x WHERE x.payee=r.id),0)')} AS "offsetToDate"
 FROM referrers r JOIN public."Borrowers" b ON b."Row ID"=r.id CROSS JOIN LATERAL (SELECT public.referral_rebate_terms(r.id) AS terms) t`;
const item=row=>({id:row.id,name:row.name,description:row.description,terms:{rate:Number(row.terms.rate),cap:Number(row.terms.cap),custom:row.terms.custom===true},
 referredCount:row.referredCount,unpaidAmount:row.unpaidAmount,unpaidCount:row.unpaidCount,oldestUnpaidCloseDate:row.oldestUnpaidCloseDate,
 accruingAmount:row.accruingAmount,accruingLoanCount:row.accruingLoanCount,paidToDate:row.paidToDate,offsetToDate:row.offsetToDate});
/** Sort: unpaid amount descending, then accruing descending, then the Thai name (then the id). */
export const compareReferrers=(a,b)=>Number(b.unpaidAmount)-Number(a.unpaidAmount)||Number(b.accruingAmount)-Number(a.accruingAmount)
 ||(a.name??'').localeCompare(b.name??'','th')||Buffer.compare(Buffer.from(a.id),Buffer.from(b.id));
// One row per referred borrower of $1 (self-referral excluded), plus any borrower a rebate of $1 was booked for (a referral
// later moved), so the rows add up to the referrer's tiles: unpaid is pwa_rebate_pending_v1; paid is what a settlement paid
// (a settled V3 rebate, its amount less its offset, the settlement's own total) plus the legacy paid-at-close remainders;
// offset and the accruing estimate are the tiles' rules per rebate and per open loan.
const refereeSql=`WITH t AS (SELECT public.referral_rebate_terms($1) AS terms),
 rebates AS (
  SELECT x."Ref Related Borrower" borrower,x."Amount"::numeric amount,coalesce(o."Amount Received"::numeric,0) offset_amount,x."Rule Version" rule,x."Ref Rebate Settlement" settlement,
   public.pwa_rebate_pending_v1(x."Row ID") pending
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment"
  WHERE x."Ref Payee Borrower"=$1 AND x."Source Type"='Referral Rebate'),
 referees AS (SELECT b."Row ID" id FROM public."Borrowers" b WHERE b."Ref Referrer"=$1 AND b."Row ID"<>$1 UNION SELECT borrower FROM rebates)
 SELECT b."Row ID" AS "borrowerId",b."Borrower Name" AS name,b."Description" AS description,
  (SELECT count(*)::int FROM public."Loans" l WHERE l."Ref Borrowers"=b."Row ID") AS "loanCount",
  (SELECT count(*)::int FROM public."Loans" l WHERE l."Ref Borrowers"=b."Row ID" AND l."Loan Status"='ยังไม่ปิดยอด') AS "openLoanCount",
  ${money('coalesce((SELECT sum(x.pending) FROM rebates x WHERE x.borrower=b."Row ID"),0)')} AS "unpaidAmount",
  ${money(`coalesce((SELECT sum(greatest(x.amount-x.offset_amount,0)) FROM rebates x WHERE x.borrower=b."Row ID" AND (x.settlement IS NOT NULL OR x.rule IS DISTINCT FROM 'REFERRAL_REBATE_V3')),0)`)} AS "paidAmount",
  ${money('coalesce((SELECT sum(least(x.offset_amount,x.amount)) FROM rebates x WHERE x.borrower=b."Row ID"),0)')} AS "offsetAmount",
  ${money(`CASE WHEN b."Ref Referrer"=$1 AND b."Row ID"<>$1 THEN coalesce((SELECT sum(CASE WHEN p.profit>0 AND (t.terms->>'rate')::numeric>0 THEN least(round(p.profit*(t.terms->>'rate')::numeric/100),(t.terms->>'cap')::numeric) ELSE 0 END)
    FROM public."Loans" l CROSS JOIN LATERAL (SELECT coalesce(sum(y."Interest Paid"::numeric+y."Late Charge Paid"::numeric),0) profit FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID") p
    WHERE l."Ref Borrowers"=b."Row ID" AND l."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(l."Defaulted",false)),0) ELSE 0 END`)} AS "accruingAmount"
 FROM referees r JOIN public."Borrowers" b ON b."Row ID"=r.id CROSS JOIN t`;
/** Referees sort: unpaid descending, then accruing descending, then the Thai name (then the id). */
export const compareReferees=(a,b)=>Number(b.unpaidAmount)-Number(a.unpaidAmount)||Number(b.accruingAmount)-Number(a.accruingAmount)
 ||(a.name??'').localeCompare(b.name??'','th')||Buffer.compare(Buffer.from(a.borrowerId),Buffer.from(b.borrowerId));
// The PWA's borrowerLabel: the Thai and English names that are set, joined by " - " (a row's first line, so no dangling dash).
const refereeLabel=(name,description)=>[name,description].map(v=>v==null?'':String(v).trim()).filter(Boolean).join(' - ')||'—';
const referee=({name,description,...row})=>({borrowerId:row.borrowerId,borrowerLabel:refereeLabel(name,description),loanCount:row.loanCount,openLoanCount:row.openLoanCount,
 unpaidAmount:row.unpaidAmount,paidAmount:row.paidAmount,offsetAmount:row.offsetAmount,accruingAmount:row.accruingAmount});
/** GET /api/referrers: every borrower who referred at least one borrower (D6), with what they are owed and accruing. */
/** R141 (owner, 11 November 2026): owed=1 narrows the list to referrers still owed rebates (pwa_rebates_owed_v1 > 0) and
 * answers the filter's total: the referrers and the amount they are owed, which is the Cash Position "Rebates payable"
 * amount (every referral rebate's payee is a listed referrer, and pwa_rebates_owed_v1 sums pwa_rebate_pending_v1). */
export async function readReferrers(client,{owed=null}={}){
 if(owed!==null&&owed!=='1')throw Error('invalid_request');
 const businessDate=(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day,filtered=owed==='1';
 if(!await rebateSettlementSchema(client))return {items:[],businessDate,...(filtered?{filter:{owed:true,total:{count:0,amount:'0.00'}}}:{})};
 const rows=(await client.query(`${referrerSql('true')}${filtered?' WHERE public.pwa_rebates_owed_v1(r.id)>0':''} ORDER BY r.id COLLATE "C" LIMIT ${REFERRER_LIMIT+1}`)).rows;
 const total=filtered?(await client.query(`SELECT count(*)::int AS count,${money('coalesce(sum(owed),0)')} AS amount FROM (SELECT public.pwa_rebates_owed_v1(p.payee) AS owed FROM (SELECT DISTINCT x."Ref Payee Borrower" AS payee FROM public."Business Expenses" x WHERE x."Source Type"='Referral Rebate' AND x."Ref Payee Borrower" IS NOT NULL) p) s WHERE owed>0`)).rows[0]:null;
 return {items:rows.slice(0,REFERRER_LIMIT).map(item).sort(compareReferrers),businessDate,...(filtered?{filter:{owed:true,total}}:{})};
}
/** GET /api/referrers/:id: the referrer and its unpaid rebates, open referred loans, history and settle options; null (404)
 * when the borrower referred nobody and has no rebate history. */
export async function readReferrerRecord(client,id){
 if(!validBorrowerId(id))throw Error('invalid_request');
 if(!await rebateSettlementSchema(client))return null;
 const row=(await client.query(`${referrerSql('r."Row ID"=$1')}`,[id])).rows[0];
 if(!row)return null;
 const referrer=item(row);
 const unpaid=(await client.query(`SELECT x."Row ID" AS "expenseId",l."Row ID" AS "loanId",l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS "loanRate",
   b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",coalesce(l."Close Date",x."Expense Date")::text AS "closeDate",${money('x."Amount"::numeric')} AS amount,
   ${money('coalesce(o."Amount Received"::numeric,0)')} AS "offsetAmount",${money('public.pwa_rebate_pending_v1(x."Row ID")')} AS "pendingAmount"
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan" LEFT JOIN public."Borrowers" b ON b."Row ID"=x."Ref Related Borrower"
  WHERE x."Ref Payee Borrower"=$1 AND x."Source Type"='Referral Rebate' AND public.pwa_rebate_pending_v1(x."Row ID")>0
  ORDER BY coalesce(l."Close Date",x."Expense Date"),x."Row ID" COLLATE "C"`,[id])).rows
  .map(r=>({expenseId:r.expenseId,loanId:r.loanId,loanDisplayKey:loanKey(r),borrowerLabel:borrowerDisplayName(r.borrowerName,r.borrowerDescription),closeDate:r.closeDate,amount:r.amount,offsetAmount:r.offsetAmount,pendingAmount:r.pendingAmount}));
 const accruing=(await client.query(`SELECT l."Row ID" AS "loanId",l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS "loanRate",
   b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",${money('p.profit')} AS profit,
   ${money(`CASE WHEN p.profit>0 AND (t.terms->>'rate')::numeric>0 THEN least(round(p.profit*(t.terms->>'rate')::numeric/100),(t.terms->>'cap')::numeric) ELSE 0 END`)} AS estimate
  FROM (SELECT public.referral_rebate_terms($1) AS terms) t CROSS JOIN public."Loans" l JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
  CROSS JOIN LATERAL (SELECT coalesce(sum(y."Interest Paid"::numeric+y."Late Charge Paid"::numeric),0) profit FROM public."Repayments" y WHERE y."Ref Loans"=l."Row ID") p
  WHERE b."Ref Referrer"=$1 AND b."Row ID"<>$1 AND l."Loan Status"='ยังไม่ปิดยอด' AND NOT coalesce(l."Defaulted",false)
  ORDER BY l."Loan Date",l."Row ID" COLLATE "C"`,[id])).rows
  .map(r=>({loanId:r.loanId,loanDisplayKey:loanKey(r),borrowerLabel:borrowerDisplayName(r.borrowerName,r.borrowerDescription),loanDate:r.loanDate,profitToDate:r.profit,estimatedRebate:r.estimate}));
 const referees=(await client.query(refereeSql,[id])).rows.sort(compareReferees).map(referee);
 // History, newest first: settlements, offsets (the referrer's loan they paid) and legacy rows Lisa paid on the close date.
 const settlements=(await client.query(`SELECT s.id AS "settlementId",s.settlement_date::text AS date,${money('s.amount')} AS amount,a."Account Label" AS "accountLabel",s.payment_method AS "paymentMethod",s.bank_reference AS "bankReference",
   (SELECT count(*)::int FROM public."Business Expenses" x WHERE to_jsonb(x)->>'Ref Rebate Settlement'=s.id) AS "rebateCount",s.created_at
  FROM public.pwa_rebate_settlements s LEFT JOIN public."Cash Accounts" a ON a."Row ID"=s.paid_by_cash_account WHERE s.payee_borrower_id=$1`,[id])).rows;
 const events=(await client.query(`SELECT x."Row ID" AS "expenseId",x."Rule Version" AS rule,x."Amount"::numeric amount,coalesce(l."Close Date",x."Expense Date")::text AS "closeDate",
   o."Row ID" AS "offsetPaymentId",o."Payment Date"::text AS "offsetDate",coalesce(o."Amount Received"::numeric,0) AS "offsetAmount",
   ol."Principal Amount"::numeric::text AS "loanPrincipal",ol."Loan Date"::text AS "loanDate",ol."Original Daily Interest Rate"::text AS "loanRate",rb."Borrower Name" AS "borrowerName",rb."Description" AS "borrowerDescription"
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan"
  LEFT JOIN LATERAL (SELECT r."Ref Loans" AS loan FROM public."Repayments" r WHERE r."Ref Payment"=o."Row ID" ORDER BY r."Ref Loans" COLLATE "C" LIMIT 1) orl ON true
  LEFT JOIN public."Loans" ol ON ol."Row ID"=orl.loan LEFT JOIN public."Borrowers" rb ON rb."Row ID"=ol."Ref Borrowers"
  WHERE x."Ref Payee Borrower"=$1 AND x."Source Type"='Referral Rebate'`,[id])).rows;
 const history=[
  ...settlements.map(s=>({kind:'settlement',date:s.date,amount:s.amount,settlementId:s.settlementId,rebateCount:s.rebateCount,accountLabel:s.accountLabel,paymentMethod:s.paymentMethod,bankReference:s.bankReference,order:new Date(s.created_at).toISOString()})),
  ...events.filter(e=>e.offsetPaymentId&&Number(e.offsetAmount)>0).map(e=>({kind:'offset',date:e.offsetDate??e.closeDate,amount:Number(e.offsetAmount).toFixed(2),offsetPaymentId:e.offsetPaymentId,offsetLoanLabel:loanKey(e),expenseId:e.expenseId,order:''})),
  ...events.filter(e=>e.rule!=='REFERRAL_REBATE_V3'&&Number(e.amount)>Number(e.offsetAmount)).map(e=>({kind:'paid-at-close',date:e.closeDate,amount:(Number(e.amount)-Number(e.offsetAmount)).toFixed(2),expenseId:e.expenseId,order:''})),
 ].sort((a,b)=>b.date.localeCompare(a.date)||b.order.localeCompare(a.order)||(a.settlementId??a.expenseId??'').localeCompare(b.settlementId??b.expenseId??''))
  .map(({order,...entry})=>entry);
 const accounts=(await client.query(`SELECT a."Row ID" id,a."Account Label" label FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder"
  WHERE h."Row ID"=$1 AND a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`,[LISA])).rows;
 const defaultAccountId=(await client.query('SELECT public.default_cash_account($1) AS id',[LISA])).rows[0]?.id??null;
 const businessDate=(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day;
 return {referrer,referees,unpaid,accruing,history,settleOptions:{accounts,defaultAccountId,businessDate}};
}
/** GET /api/rebate-settlements/:id: one settlement, its version (for delete) and the rebates it paid. */
export async function readRebateSettlement(client,id){
 if(!validBorrowerId(id))throw Error('invalid_request');
 if(!await rebateSettlementSchema(client))return null;
 const row=(await client.query(`SELECT s.id,s.payee_borrower_id AS "referrerId",r."Borrower Name" AS "referrerName",r."Description" AS "referrerDescription",s.settlement_date::text AS "settlementDate",${money('s.amount')} AS amount,
   s.paid_by_cash_account AS "accountId",a."Account Label" AS "accountLabel",s.payment_method AS "paymentMethod",s.bank_reference AS "bankReference",s.notes,s.created_by AS "createdBy",s.created_at AS "createdAt"
  FROM public.pwa_rebate_settlements s LEFT JOIN public."Borrowers" r ON r."Row ID"=s.payee_borrower_id LEFT JOIN public."Cash Accounts" a ON a."Row ID"=s.paid_by_cash_account WHERE s.id=$1`,[id])).rows[0];
 if(!row)return null;
 const version=(await client.query(settlementVersionSql,[id])).rows[0]?.encode??null;
 const rebates=(await client.query(`SELECT x."Row ID" AS "expenseId",l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS "loanRate",
   b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",coalesce(l."Close Date",x."Expense Date")::text AS "closeDate",${money('x."Amount"::numeric')} AS amount,
   ${money('coalesce(o."Amount Received"::numeric,0)')} AS "offsetAmount",${money('greatest(x."Amount"::numeric-coalesce(o."Amount Received"::numeric,0),0)')} AS "paidAmount"
  FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=x."Ref Offset Payment" LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan" LEFT JOIN public."Borrowers" b ON b."Row ID"=x."Ref Related Borrower"
  WHERE x."Ref Rebate Settlement"=$1 ORDER BY coalesce(l."Close Date",x."Expense Date"),x."Row ID" COLLATE "C"`,[id])).rows
  .map(r=>({expenseId:r.expenseId,loanDisplayKey:loanKey(r),borrowerLabel:borrowerDisplayName(r.borrowerName,r.borrowerDescription),closeDate:r.closeDate,amount:r.amount,offsetAmount:r.offsetAmount,paidAmount:r.paidAmount}));
 const {referrerName,referrerDescription,createdAt,...rest}=row;
 return {item:{...rest,referrerLabel:borrowerDisplayName(referrerName,referrerDescription),createdAt:new Date(createdAt).toISOString(),version,rebates}};
}
