import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {lateChargeSchema,lateSql} from '../lib/late-charge-schema.mjs';
import {paymentLoanDisplayKey} from '../payment-command/draft.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
import {validBorrowerId} from './borrowers.mjs';
import {rebatePendingSql,rebateStateSql} from './rebate-state.mjs';
import {settlementDates} from './referrers.mjs';
/** Explicit current source projection; immutable operation outcomes are separate. */
export async function readPaymentRecord(client,id){
 if(!validBorrowerId(id))throw Error('invalid_request');
 const L=await lateChargeSchema(client);
 const item=(await client.query(`SELECT p."Row ID" id,p."Ref Borrower" AS "borrowerId",b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::numeric::text AS "postedAmount",p."Payment Date"::text AS "paymentDate",p."Payment Method" AS "paymentMethod",p."Allocation Method" AS "allocationMethod",p."Ref Target Charge" AS "targetChargeId",p."Ref Target Loan" AS "targetLoanId",p."Selected Charge IDs" AS "selectedChargeIdsText",p."Ref Received By Cash Account" AS "cashAccountId",a."Account Label" AS "cashAccountLabel",p."Notes" notes,p."Uploaded Receipt" AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",(nullif(btrim(p."Receipt Image"),'') IS NOT NULL) AS "agentReceiptPresent",p."Receipt Received At"::text AS "agentReceiptAt",p."Status" status,p."Created By" AS "createdBy",p."Created At"::text AS "createdAt",p."Processed At"::text AS "processedAt" FROM public."Payments" p LEFT JOIN public."Borrowers" b ON b."Row ID"=p."Ref Borrower" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account" WHERE p."Row ID"=$1`,[id])).rows[0];
 if(!item)return null;
 item.version=(await client.query('SELECT public.pwa_payment_version_v2($1) version',[id])).rows[0].version;
 item.provenance=(await client.query('SELECT public.pwa_effective_payment_plan_v2($1) value',[id])).rows[0].value;
 const original=(await client.query(`SELECT outcome,"recorded_at" AS "recordedAt" FROM public.pwa_payment_commands WHERE (contract_version=1 AND outcome='posted' AND payment_id=$1) OR (contract_version=2 AND outcome='applied' AND result_json->>'paymentId'=$1 AND canonical_json::jsonb#>>'{command,operation}' IN('loan.create','loan.close','charge.create','payment.create','system.rebate-offset')) ORDER BY recorded_at,request_id LIMIT 2`,[id])).rows;
 if(original.length>1)throw Error('Invalid original receipt lineage');
 item.originalOutcomeStatus=original[0]?.outcome??null;item.originalRecordedAt=original[0]?.recordedAt?new Date(original[0].recordedAt).toISOString():null;
 item.allocations=(await client.query(`SELECT a."Row ID" id,a."Ref Charge" AS "chargeId",a."Charge Date Snapshot"::text AS "chargeDate",a."Allocation Order" AS "allocationOrder",a."Allocated Principal"::numeric::text principal,a."Allocated Interest"::numeric::text interest,${lateSql(L,'a."Allocated Late Charge"::numeric')}::text AS "lateCharge",a."Allocated Amount"::numeric::text amount,l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS rate,b."Borrower Name" AS "loanBorrowerName",b."Description" AS "loanBorrowerDescription",l."Row ID" AS "labelLoanId" FROM public."Payment Allocations" a LEFT JOIN public."Charges" c ON c."Row ID"=a."Ref Charge" LEFT JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE a."Ref Payment"=$1 ORDER BY a."Allocation Order",a."Row ID" COLLATE "C"`,[id])).rows.map(({loanPrincipal,loanDate,rate,loanBorrowerName,loanBorrowerDescription,labelLoanId,...row})=>({...row,loanDisplayKey:labelLoanId?paymentLoanDisplayKey({principal:loanPrincipal,loanDate,rate,name:borrowerDisplayName(loanBorrowerName,loanBorrowerDescription)}):null}));
 item.repayments=(await client.query(`SELECT "Row ID" id,"Ref Charges" AS "chargeId","Ref Payment Allocation" AS "allocationId","Payment Date"::text AS "paymentDate","Principal Paid"::numeric::text principal,"Interest Paid"::numeric::text interest,${lateSql(L,'"Late Charge Paid"::numeric')}::text AS "lateCharge" FROM public."Repayments" WHERE "Ref Payment"=$1 ORDER BY "Payment Date","Row ID" COLLATE "C"`,[id])).rows;
 // R111 V124 (RP-11): each referred loan this payment closed and its rebate: settled by offset on the referrer's loan (the
 // offset payment, its first loan's key and the latest charge it paid in full) or payable. The offset link is read
 // through to_jsonb(e), so a database before V122 reads none.
 // R129 (V137): its state (pending, paid on a settlement date, offset, legacy paid at close), pending amount, settlement
 // and the payee's owed total now. The link is read through to_jsonb(e); the settlement and owed reads run only for a
 // REFERRAL_REBATE_V3 row, which exists only from V137 on, so a database before V137 reads the legacy states.
 const rebates=(await client.query(`SELECT ${rebateStateSql('e','o')} AS "rebateState",(${rebatePendingSql('e','o')})::numeric(20,2)::text AS "pendingAmount",
  to_jsonb(e)->>'Ref Rebate Settlement' AS "settlementId",e."Ref Payee Borrower" AS "payeeId",e."Rule Version" AS "ruleVersion",
  l."Row ID" AS "loanId",l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDay",l."Original Daily Interest Rate"::text AS "loanRate",lb."Borrower Name" AS "loanBorrowerName",lb."Description" AS "loanBorrowerDescription",e."Amount"::numeric::text AS amount,coalesce(rb."Borrower Name",'')||' - '||coalesce(rb."Description",'') AS "referrerLabel",
  o."Row ID" AS "offsetPaymentId",o."Amount Received"::numeric::text AS "offsetAmount",ol."Row ID" AS "offsetLoanId",ol."Principal Amount"::numeric::text AS principal,ol."Loan Date"::text AS "loanDate",ol."Original Daily Interest Rate"::text AS rate,
  (SELECT max(c."Charge Date") FROM public."Repayments" r JOIN public."Charges" c ON c."Row ID"=r."Ref Charges" WHERE r."Ref Payment"=o."Row ID" AND c."Amount Remaining"=0)::text AS "paidThrough"
  FROM public."Loans" l JOIN public."Business Expenses" e ON e."Ref Related Loan"=l."Row ID" AND e."Source Type"='Referral Rebate'
  LEFT JOIN public."Borrowers" lb ON lb."Row ID"=l."Ref Borrowers" LEFT JOIN public."Borrowers" rb ON rb."Row ID"=e."Ref Payee Borrower" LEFT JOIN public."Payments" o ON o."Row ID"=to_jsonb(e)->>'Ref Offset Payment'
  LEFT JOIN LATERAL (SELECT r."Ref Loans" AS loan FROM public."Repayments" r WHERE r."Ref Payment"=o."Row ID" ORDER BY r."Ref Loans" COLLATE "C" LIMIT 1) orl ON true
  LEFT JOIN public."Loans" ol ON ol."Row ID"=orl.loan
  LEFT JOIN LATERAL (SELECT a."Allocation Order" AS ord,a."Row ID" AS aid FROM public."Payment Allocations" a JOIN public."Charges" c ON c."Row ID"=a."Ref Charge" WHERE a."Ref Payment"=$1 AND c."Ref Loans"=l."Row ID" ORDER BY a."Allocation Order",a."Row ID" COLLATE "C" LIMIT 1) fa ON true
  WHERE l."Ref Closing Payment"=$1 ORDER BY fa.ord NULLS LAST,fa.aid COLLATE "C" NULLS LAST,l."Row ID" COLLATE "C"`,[id])).rows;
 // R119 (Echo PR-1/PR-2): every referred loan this payment closed, in the Payment Allocations order (then loan id), with the
 // closed loan's display key as the allocations show it; closeRebate stays the first for a phone on an older bundle.
 const dates=await settlementDates(client,rebates.map(r=>r.settlementId));
 // The payees travel as one JSON text parameter (the offline records walk's bulkReadClient takes scalar parameters only).
 const v3=[...new Set(rebates.filter(r=>r.ruleVersion==='REFERRAL_REBATE_V3'&&r.payeeId).map(r=>r.payeeId))];
 const owed=new Map(v3.length?(await client.query('SELECT p.id,public.pwa_rebates_owed_v1(p.id)::numeric(20,2)::text AS owed FROM jsonb_array_elements_text($1::jsonb) p(id)',[JSON.stringify(v3)])).rows.map(r=>[r.id,r.owed]):[]);
 item.closeRebates=rebates.map(rebate=>({loanId:rebate.loanId,loanDisplayKey:rebate.loanPrincipal==null?null:paymentLoanDisplayKey({principal:rebate.loanPrincipal,loanDate:rebate.loanDay,rate:rebate.loanRate,name:borrowerDisplayName(rebate.loanBorrowerName,rebate.loanBorrowerDescription)}),amount:rebate.amount,referrerLabel:rebate.referrerLabel,offsetPaymentId:rebate.offsetPaymentId??null,offsetAmount:rebate.offsetAmount??null,
  payableAmount:rebate.offsetAmount==null?rebate.amount:(Number(rebate.amount)-Number(rebate.offsetAmount)).toString(),offsetLoanId:rebate.offsetLoanId??null,
  offsetLoanLabel:rebate.offsetLoanId?paymentLoanDisplayKey({name:rebate.referrerLabel,principal:rebate.principal,loanDate:rebate.loanDate,rate:rebate.rate}):null,paidThrough:rebate.paidThrough??null,
  rebateState:rebate.rebateState??null,pendingAmount:rebate.pendingAmount??null,settlementId:rebate.settlementId??null,settlementDate:dates.get(rebate.settlementId)?.date??null,owedTotal:owed.get(rebate.payeeId)??null}));
 item.closeRebate=item.closeRebates[0]??null;
 item.cashMovements=(await client.query(`SELECT c."Row ID" id,c."Movement Date"::text AS "movementDate",c."Movement Type" AS "movementType",c."Amount"::numeric::text amount,f."Account Label" AS "fromAccount",t."Account Label" AS "toAccount" FROM public."Cash Ledger" c LEFT JOIN public."Cash Accounts" f ON f."Row ID"=c."Ref From Cash Account" LEFT JOIN public."Cash Accounts" t ON t."Row ID"=c."Ref To Cash Account" WHERE c."Ref Payment"=$1 ORDER BY c."Movement Date",c."Row ID" COLLATE "C"`,[id])).rows;
 return item;
}
export async function readPaymentCorrectionPreview(client,id,{targetLoanId=null,paymentDate=null,proposedBorrowerId=null}={}){
 const item=await readPaymentRecord(client,id);if(!item)return null;const L=await lateChargeSchema(client);
 const destination=proposedBorrowerId??item.borrowerId;
 if(!validBorrowerId(destination))throw Error('invalid_request');
 const borrower=(await client.query('SELECT "Borrower Name" name,"Description" description FROM public."Borrowers" WHERE "Row ID"=$1',[destination])).rows[0];if(!borrower)throw Error('invalid_request');
 const proposedBorrowerLabel=[borrower.name,borrower.description].filter(Boolean).join(' - ');
 const predecessor=(await client.query(`SELECT j.request_id::text id FROM public.pwa_payment_commands j WHERE j.contract_version=2 AND j.outcome='applied' AND j.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND j.canonical_json::jsonb#>>'{command,targetId}'=$1 AND NOT EXISTS(SELECT 1 FROM public.pwa_payment_commands child WHERE child.contract_version=2 AND child.outcome='applied' AND child.canonical_json::jsonb#>>'{command,operation}'='payment.correct' AND child.canonical_json::jsonb#>>'{command,targetId}'=$1 AND child.canonical_json::jsonb#>>'{command,predecessorRequestId}'=j.request_id::text)`,[id])).rows;
 if(predecessor.length>1)throw Error('Invalid payment revision lineage');
 const _original=(await client.query(`SELECT request_id::text id FROM public.pwa_payment_commands WHERE contract_version=1 AND outcome='posted' AND payment_id=$1`,[id])).rows[0];
 const balances=(await client.query(`SELECT c."Row ID" AS "chargeId",c."Ref Loans" AS "loanId",c."Charge Date"::text AS "chargeDate",l."Principal Amount"::numeric::text AS "loanPrincipal",l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS rate,(c."Principal Due"::numeric-coalesce(paid.p,0))::text AS "principalRemaining",(c."Interest Due"::numeric-coalesce(paid.i,0))::text AS "interestRemaining",(${lateSql(L,'c."Late Charge Due"::numeric-coalesce(paid.l,0)')})::text AS "lateChargeRemaining" FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" LEFT JOIN LATERAL(SELECT sum(r."Principal Paid"::numeric) p,sum(r."Interest Paid"::numeric) i,${lateSql(L,'sum(r."Late Charge Paid"::numeric)','0')} l FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID" AND r."Ref Payment" IS DISTINCT FROM $2) paid ON true WHERE l."Ref Borrowers"=$1 ORDER BY c."Charge Date",c."Row ID" COLLATE "C" LIMIT 10001`,[destination,id])).rows.map(({loanPrincipal,loanDate,rate,...row})=>({...row,loanDisplayKey:paymentLoanDisplayKey({principal:loanPrincipal,loanDate,rate,name:proposedBorrowerLabel})}));
 if(balances.length>10000)throw Error('Correction scope exceeds technical limit');
 const loans=(await client.query(`SELECT "Row ID" id,"Loan Date"::text AS "loanDate","Loan Type" AS type,"Principal Amount"::numeric::text AS principal,"Original Daily Interest Rate"::text AS rate FROM public."Loans" WHERE "Ref Borrowers"=$1 ORDER BY "Loan Date" DESC,"Row ID" COLLATE "C" LIMIT 10001`,[destination])).rows.map(({rate,...row})=>({...row,loanDisplayKey:paymentLoanDisplayKey({...row,rate,name:proposedBorrowerLabel})}));if(loans.length>10000)throw Error('Correction scope exceeds technical limit');
 let closePreparation=null;
 if(targetLoanId!==null||paymentDate!==null){
  if(!item.provenance||!validBorrowerId(targetLoanId)||typeof paymentDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)||!Number.isFinite(Date.parse(paymentDate+'T00:00:00Z'))||new Date(paymentDate+'T00:00:00Z').toISOString().slice(0,10)!==paymentDate)throw Error('invalid_request');
  const target=(await client.query('SELECT "Ref Borrowers" borrower,"Defaulted" defaulted,"Loan Status" status,"Ref Closing Payment" closing FROM public."Loans" WHERE "Row ID"=$1',[targetLoanId])).rows[0];
  const today=(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day;
  if(!target||target.borrower!==destination||target.defaulted||paymentDate!==today||(target.status!=='ยังไม่ปิดยอด'&&target.closing!==id))throw Error('invalid_request');
  const calculation=(await client.query('SELECT public.loan_close_calculation_v83($1,$2::date,$3) value',[targetLoanId,paymentDate,id])).rows[0].value;
  closePreparation={planHash:calculation.planHash,plan:{borrowerId:calculation.borrowerId,amountReceived:calculation.amount,allocations:calculation.allocations,allocationMethod:'Loan Close',targetChargeId:calculation.targetChargeId,targetLoanId,cashAccountId:item.cashAccountId,paymentDate,paymentMethod:item.paymentMethod}};
 }
 const head=(await client.query('SELECT public.pwa_payment_head_v2($1)::text AS id',[id])).rows[0]?.id??null;
 return {proposedBorrowerId:destination,proposedBorrowerLabel,sourceVersion:item.version,predecessorRequestId:head,origin:item.provenance?'pwa-plan':'legacy-source',source:item,effectivePlan:item.provenance?.plan??null,balances,loans,closePreparation};
}
