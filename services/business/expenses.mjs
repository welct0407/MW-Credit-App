import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {validBorrowerId} from './borrowers.mjs';
import {expenseCategories} from '../contracts/expense-command.mjs';
import {expensePendingSql,rebatePendingSql,rebateStateSql} from './rebate-state.mjs';
import {settlementDates} from './referrers.mjs';
// R140 (Echo EXP-PEND-29): a borrower label is "name - description", without the separator when the description is blank.
// R140 (V142): a manual expense's payment state, 'pending' while it has no payer (expensePendingSql) and null otherwise;
// its pendingAmount is then the amount. rebateState stays null on manual rows.
// R129 (V137): a referral rebate's state ('offset' | 'pending' | 'paid' | 'paid-at-close'; null for a manual expense), its
// pending amount (pwa_rebate_pending_v1) and the settlement that paid it (its date read only when a row links one, which
// exists only from V137 on; the link is read through to_jsonb(e), so a database before V137 reads the legacy states).
const columns=`e."Row ID" id,e."Expense Date"::text AS "expenseDate",e."Expense Category" category,e."Amount"::numeric::text amount,e."Payee Name" AS "payeeName",e."Ref Payee Borrower" AS "payeeBorrowerId",CASE WHEN payee."Row ID" IS NULL THEN NULL ELSE coalesce(payee."Borrower Name",'')||CASE WHEN nullif(btrim(payee."Description"),'') IS NULL THEN '' ELSE ' - '||payee."Description" END END AS "payeeBorrowerLabel",e."Ref Related Borrower" AS "relatedBorrowerId",CASE WHEN b."Row ID" IS NULL THEN NULL ELSE coalesce(b."Borrower Name",'')||CASE WHEN nullif(btrim(b."Description"),'') IS NULL THEN '' ELSE ' - '||b."Description" END END AS "relatedBorrowerLabel",e."Ref Related Loan" AS "relatedLoanId",l."Loan Date"::text AS "relatedLoanDate",l."Principal Amount"::numeric::text AS "relatedLoanPrincipal",l."Original Daily Interest Rate"::text AS "relatedLoanOriginalRate",coalesce(lb."Borrower Name",'')||CASE WHEN nullif(btrim(lb."Description"),'') IS NULL THEN '' ELSE ' - '||lb."Description" END AS "relatedLoanBorrowerLabel",e."Notes" notes,e."Ref Paid By Cash Account" AS "paidByAccountId",ca."Account Label" AS "paidByAccountLabel",e."Ref Paid By Cash Holder" AS "paidByHolderId",h."Holder Name" AS "paidByHolderLabel",e."Source Type" AS "sourceType",e."Source Key" AS "sourceKey",e."Gross Profit Basis"::numeric::text AS "grossProfitBasis",e."Allocation Basis" AS "allocationBasis",e."Partner A Share"::text AS "partnerAShare",e."Partner B Share"::text AS "partnerBShare",e."Partner A Expense"::numeric::text AS "partnerAExpense",e."Partner B Expense"::numeric::text AS "partnerBExpense",e."Rule Version" AS "ruleVersion",offset_link.rebate_rate AS "rebateRate",offset_link.rebate_cap AS "rebateCap",
 ${rebateStateSql('e','op')} AS "rebateState",CASE WHEN ${expensePendingSql('e')} THEN 'pending' END AS "paymentState",coalesce(${rebatePendingSql('e','op')},CASE WHEN ${expensePendingSql('e')} THEN e."Amount"::numeric END)::numeric(20,2)::text AS "pendingAmount",to_jsonb(e)->>'Ref Rebate Settlement' AS "settlementId",e."Created At"::text AS "createdAt",e."Created By" AS "createdBy",
 offset_link.id AS "offsetPaymentId",op."Amount Received"::numeric::text AS "offsetAmount",ol."Row ID" AS "offsetLoanId",ol."Loan Date"::text AS "offsetLoanDate",ol."Principal Amount"::numeric::text AS "offsetLoanPrincipal",ol."Original Daily Interest Rate"::text AS "offsetLoanOriginalRate",coalesce(olb."Borrower Name",'')||CASE WHEN nullif(btrim(olb."Description"),'') IS NULL THEN '' ELSE ' - '||olb."Description" END AS "offsetLoanBorrowerLabel"`;
// R111: a referral rebate settled by offset names its Referral Rebate Offset payment and the referrer's loan it paid
// (the first by key when it paid several). The column is read through to_jsonb(e) so a database before V122 (an image
// ahead of its migration, or a rehearsal pinned to an older family head) reads no offset instead of failing. R120: the applied
// referral rebate terms (V135 "Rebate Rate", "Rebate Cap") are read the same way; null before V135 and on earlier rows.
const joins=`FROM public."Business Expenses" e LEFT JOIN public."Borrowers" payee ON payee."Row ID"=e."Ref Payee Borrower" LEFT JOIN public."Borrowers" b ON b."Row ID"=e."Ref Related Borrower" LEFT JOIN public."Loans" l ON l."Row ID"=e."Ref Related Loan" LEFT JOIN public."Borrowers" lb ON lb."Row ID"=l."Ref Borrowers" LEFT JOIN public."Cash Accounts" ca ON ca."Row ID"=e."Ref Paid By Cash Account" LEFT JOIN public."Cash Holders" h ON h."Row ID"=e."Ref Paid By Cash Holder"
 CROSS JOIN LATERAL (SELECT x->>'Ref Offset Payment' AS id,(x->>'Rebate Rate')::float8 AS rebate_rate,(x->>'Rebate Cap')::float8 AS rebate_cap FROM to_jsonb(e) x) offset_link
 LEFT JOIN public."Payments" op ON op."Row ID"=offset_link.id LEFT JOIN LATERAL (SELECT r."Ref Loans" AS loan FROM public."Repayments" r WHERE r."Ref Payment"=offset_link.id ORDER BY r."Ref Loans" COLLATE "C" LIMIT 1) orl ON true
 LEFT JOIN public."Loans" ol ON ol."Row ID"=orl.loan LEFT JOIN public."Borrowers" olb ON olb."Row ID"=ol."Ref Borrowers"`;
const loanLabel=(id,borrower,principal,date,rate)=>id?`${borrower??''}-${principal==null?'':new Intl.NumberFormat('en-US',{style:'currency',currency:'THB',currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(Number(principal))}-${date?date.slice(8,10)+'/'+date.slice(5,7):''}-${rate==null?'Unavailable':rate+'%'}`:null;
function project(row){
 const {offsetLoanDate,offsetLoanPrincipal,offsetLoanOriginalRate,offsetLoanBorrowerLabel,...rest}=row;
 // R111: offsetAmount is what the offset settled; payableAmount the rest that stays payable (null when not offset).
 const settled=row.offsetPaymentId?{offsetLoanLabel:loanLabel(row.offsetLoanId,offsetLoanBorrowerLabel,offsetLoanPrincipal,offsetLoanDate,offsetLoanOriginalRate),payableAmount:row.offsetAmount==null?null:(Number(row.amount)-Number(row.offsetAmount)).toString()}:{offsetLoanLabel:null,payableAmount:null};
 return {...rest,...settled,relatedLoanLabel:loanLabel(row.relatedLoanId,row.relatedLoanBorrowerLabel,row.relatedLoanPrincipal,row.relatedLoanDate,row.relatedLoanOriginalRate),canEdit:row.sourceType==='Manual',canDelete:row.sourceType==='Manual'};
}
export async function readExpenseRecord(client,id){
 if(!validBorrowerId(id))throw Error('invalid_request');
 const row=(await client.query(`SELECT ${columns},public.pwa_expense_version_v2(e."Row ID") version ${joins} WHERE e."Row ID"=$1`,[id])).rows[0];
 if(!row)return null;
 const paid=(await settlementDates(client,[row.settlementId])).get(row.settlementId);row.settlementDate=paid?.date??null;row.settlementAccountLabel=paid?.accountLabel??null;
 const reimbursements=(await client.query(`SELECT c."Row ID" id,c."Movement Date"::text AS "movementDate",c."Movement Type" AS "movementType",c."Amount"::numeric::text amount,c."Entry Origin" AS "entryOrigin",f."Account Label" AS "fromAccountLabel",t."Account Label" AS "toAccountLabel" FROM public."Cash Ledger" c LEFT JOIN public."Cash Accounts" f ON f."Row ID"=c."Ref From Cash Account" LEFT JOIN public."Cash Accounts" t ON t."Row ID"=c."Ref To Cash Account" WHERE c."Ref Business Expense"=$1 ORDER BY c."Movement Date",c."Row ID" COLLATE "C"`,[id])).rows;
 return {...project(row),reimbursements};
}
export async function readExpenseOptions(client){
 const accounts=(await client.query(`SELECT a."Row ID" id,a."Account Label" label,h."Row ID" AS "holderId",h."Holder Name" AS "holderLabel" FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE AND h."Row ID" IN('ch:dad','ch:lisa','ch:tommy') ORDER BY h."Sort Order",a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
 return {categories:expenseCategories,accounts,businessDate:(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day};
}
export async function readExpensePage(client,{limit=25,cursor=null}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_request');
 let after=null;if(cursor!==null){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(Object.keys(after).sort().join(',')!=='date,id,version'||after.version!==1||!validBorrowerId(after.id)||!/^\d{4}-\d{2}-\d{2}$/.test(after.date))throw Error()}catch{throw Error('invalid_request')}}
 const rows=(await client.query(`SELECT ${columns} ${joins} WHERE ($1::date IS NULL OR (e."Expense Date",e."Row ID" COLLATE "C")<($1::date,$2::text COLLATE "C")) ORDER BY e."Expense Date" DESC,e."Row ID" COLLATE "C" DESC LIMIT $3`,[after?.date??null,after?.id??null,limit+1])).rows;
 const dates=await settlementDates(client,rows.map(r=>r.settlementId));for(const r of rows){const paid=dates.get(r.settlementId);r.settlementDate=paid?.date??null;r.settlementAccountLabel=paid?.accountLabel??null;}
 const more=rows.length>limit,items=rows.slice(0,limit).map(project),last=items.at(-1);
 return {items,nextCursor:more?Buffer.from(JSON.stringify({version:1,date:last.expenseDate,id:last.id})).toString('base64url'):null};
}
