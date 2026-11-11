import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {validBorrowerId} from './borrowers.mjs';
import {expenseCategories} from '../contracts/expense-command.mjs';
import {expensePendingSql,rebatePendingSql,rebateStateSql} from './rebate-state.mjs';
import {settlementDates} from './referrers.mjs';
// R140 (Echo EXP-REC-15): relatedBorrowerName/Description, offsetLoanBorrowerName/Description (with offsetLoanTerms, the label
// without its borrower) and relatedLoanBorrowerName/Description likewise.
// R140 (V144): payeeBorrowerName and payeeBorrowerDescription are the payee borrower's Thai and English names (the PWA picks
// one by the viewer's language, as the ledger does; R122).
// R140 (Echo EXP-PEND-29): a borrower label is "name - description", without the separator when the description is blank.
// R140 (V142): a manual expense's payment state, 'pending' while it has no payer (expensePendingSql) and null otherwise;
// its pendingAmount is then the amount. rebateState stays null on manual rows.
// R129 (V137): a referral rebate's state ('offset' | 'pending' | 'paid' | 'paid-at-close'; null for a manual expense), its
// pending amount (pwa_rebate_pending_v1) and the settlement that paid it (its date read only when a row links one, which
// exists only from V137 on; the link is read through to_jsonb(e), so a database before V137 reads the legacy states).
const columns=`e."Row ID" id,e."Expense Date"::text AS "expenseDate",e."Expense Category" category,e."Amount"::numeric::text amount,e."Payee Name" AS "payeeName",e."Ref Payee Borrower" AS "payeeBorrowerId",payee."Borrower Name" AS "payeeBorrowerName",payee."Description" AS "payeeBorrowerDescription",to_jsonb(e)->>'Paid Date' AS "storedPaidDate",CASE WHEN payee."Row ID" IS NULL THEN NULL ELSE coalesce(payee."Borrower Name",'')||CASE WHEN nullif(btrim(payee."Description"),'') IS NULL THEN '' ELSE ' - '||payee."Description" END END AS "payeeBorrowerLabel",e."Ref Related Borrower" AS "relatedBorrowerId",b."Borrower Name" AS "relatedBorrowerName",b."Description" AS "relatedBorrowerDescription",lb."Borrower Name" AS "relatedLoanBorrowerName",lb."Description" AS "relatedLoanBorrowerDescription",CASE WHEN b."Row ID" IS NULL THEN NULL ELSE coalesce(b."Borrower Name",'')||CASE WHEN nullif(btrim(b."Description"),'') IS NULL THEN '' ELSE ' - '||b."Description" END END AS "relatedBorrowerLabel",e."Ref Related Loan" AS "relatedLoanId",l."Loan Date"::text AS "relatedLoanDate",l."Principal Amount"::numeric::text AS "relatedLoanPrincipal",l."Original Daily Interest Rate"::text AS "relatedLoanOriginalRate",coalesce(lb."Borrower Name",'')||CASE WHEN nullif(btrim(lb."Description"),'') IS NULL THEN '' ELSE ' - '||lb."Description" END AS "relatedLoanBorrowerLabel",e."Notes" notes,e."Ref Paid By Cash Account" AS "paidByAccountId",ca."Account Label" AS "paidByAccountLabel",e."Ref Paid By Cash Holder" AS "paidByHolderId",h."Holder Name" AS "paidByHolderLabel",e."Source Type" AS "sourceType",e."Source Key" AS "sourceKey",e."Gross Profit Basis"::numeric::text AS "grossProfitBasis",e."Allocation Basis" AS "allocationBasis",e."Partner A Share"::text AS "partnerAShare",e."Partner B Share"::text AS "partnerBShare",e."Partner A Expense"::numeric::text AS "partnerAExpense",e."Partner B Expense"::numeric::text AS "partnerBExpense",e."Rule Version" AS "ruleVersion",offset_link.rebate_rate AS "rebateRate",offset_link.rebate_cap AS "rebateCap",
 ${rebateStateSql('e','op')} AS "rebateState",CASE WHEN ${expensePendingSql('e')} THEN 'pending' END AS "paymentState",coalesce(${rebatePendingSql('e','op')},CASE WHEN ${expensePendingSql('e')} THEN e."Amount"::numeric END)::numeric(20,2)::text AS "pendingAmount",to_jsonb(e)->>'Ref Rebate Settlement' AS "settlementId",e."Created At"::text AS "createdAt",e."Created By" AS "createdBy",
 offset_link.id AS "offsetPaymentId",op."Amount Received"::numeric::text AS "offsetAmount",ol."Row ID" AS "offsetLoanId",olb."Borrower Name" AS "offsetLoanBorrowerName",olb."Description" AS "offsetLoanBorrowerDescription",ol."Loan Date"::text AS "offsetLoanDate",ol."Principal Amount"::numeric::text AS "offsetLoanPrincipal",ol."Original Daily Interest Rate"::text AS "offsetLoanOriginalRate",coalesce(olb."Borrower Name",'')||CASE WHEN nullif(btrim(olb."Description"),'') IS NULL THEN '' ELSE ' - '||olb."Description" END AS "offsetLoanBorrowerLabel"`;
// R111: a referral rebate settled by offset names its Referral Rebate Offset payment and the referrer's loan it paid
// (the first by key when it paid several). The column is read through to_jsonb(e) so a database before V122 (an image
// ahead of its migration, or a rehearsal pinned to an older family head) reads no offset instead of failing. R120: the applied
// referral rebate terms (V135 "Rebate Rate", "Rebate Cap") are read the same way; null before V135 and on earlier rows.
const joins=`FROM public."Business Expenses" e LEFT JOIN public."Borrowers" payee ON payee."Row ID"=e."Ref Payee Borrower" LEFT JOIN public."Borrowers" b ON b."Row ID"=e."Ref Related Borrower" LEFT JOIN public."Loans" l ON l."Row ID"=e."Ref Related Loan" LEFT JOIN public."Borrowers" lb ON lb."Row ID"=l."Ref Borrowers" LEFT JOIN public."Cash Accounts" ca ON ca."Row ID"=e."Ref Paid By Cash Account" LEFT JOIN public."Cash Holders" h ON h."Row ID"=e."Ref Paid By Cash Holder"
 CROSS JOIN LATERAL (SELECT x->>'Ref Offset Payment' AS id,(x->>'Rebate Rate')::float8 AS rebate_rate,(x->>'Rebate Cap')::float8 AS rebate_cap FROM to_jsonb(e) x) offset_link
 LEFT JOIN public."Payments" op ON op."Row ID"=offset_link.id LEFT JOIN LATERAL (SELECT r."Ref Loans" AS loan FROM public."Repayments" r WHERE r."Ref Payment"=offset_link.id ORDER BY r."Ref Loans" COLLATE "C" LIMIT 1) orl ON true
 LEFT JOIN public."Loans" ol ON ol."Row ID"=orl.loan LEFT JOIN public."Borrowers" olb ON olb."Row ID"=ol."Ref Borrowers"`;
// R140: the loan's terms part of the label ("฿10,000-03/10-3%"); the label is "<borrower>-<terms>".
const loanTerms=(principal,date,rate)=>`${principal==null?'':new Intl.NumberFormat('en-US',{style:'currency',currency:'THB',currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(Number(principal))}-${date?date.slice(8,10)+'/'+date.slice(5,7):''}-${rate==null?'Unavailable':rate+'%'}`;
const loanLabel=(id,borrower,principal,date,rate)=>id?`${borrower??''}-${loanTerms(principal,date,rate)}`:null;
function project(row){
 const {offsetLoanDate,offsetLoanPrincipal,offsetLoanOriginalRate,offsetLoanBorrowerLabel,...rest}=row;
 // R111: offsetAmount is what the offset settled; payableAmount the rest that stays payable (null when not offset).
 const settled=row.offsetPaymentId?{offsetLoanLabel:loanLabel(row.offsetLoanId,offsetLoanBorrowerLabel,offsetLoanPrincipal,offsetLoanDate,offsetLoanOriginalRate),offsetLoanTerms:row.offsetLoanId?loanTerms(offsetLoanPrincipal,offsetLoanDate,offsetLoanOriginalRate):null,payableAmount:row.offsetAmount==null?null:(Number(row.amount)-Number(row.offsetAmount)).toString()}:{offsetLoanLabel:null,offsetLoanTerms:null,payableAmount:null};
 // R140 (V144): paidDate is the day the cash moved: the stored "Paid Date", else a rebate's settlement date, else the Expense
 // Date; null while the expense or rebate is pending. storedPaidDate is the column itself (null before V144).
 const paidDate=row.paymentState==='pending'||row.rebateState==='pending'?null:row.storedPaidDate??row.settlementDate??row.expenseDate??null;
 return {...rest,...settled,paidDate,relatedLoanLabel:loanLabel(row.relatedLoanId,row.relatedLoanBorrowerLabel,row.relatedLoanPrincipal,row.relatedLoanDate,row.relatedLoanOriginalRate),canEdit:row.sourceType==='Manual',canDelete:row.sourceType==='Manual'};
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
// R140 (owner, 11 November 2026): newest first: "Expense Date" DESC, then "Created At" DESC (the newest entry of a day on top),
// then "Row ID" DESC (C collation) as the tie-break. The keyset cursor (version 2) carries all three; a version 1 cursor
// (date and id only) cannot place a row within its day any more and is refused (invalid_request), so the list restarts.
// R141 (owner, 11 November 2026): the list can be narrowed to expenses pending payment (payment=pending, the
// expensePendingSql rule of the Cash Position and borrower totals) and to one payee borrower (payeeBorrowerId). A filtered
// page carries its filter in the cursor ("filter"), and a cursor is accepted only by the same filter, so it cannot page
// another list; an unfiltered cursor keeps the version 2 shape. A filtered first page also answers the filter's total
// (count and amount over every matching row), the figure the tapped Cash Position or borrower line shows.
const filterKey=({payment,payeeBorrowerId})=>[payment?'payment='+payment:'',payeeBorrowerId?'payee='+payeeBorrowerId:''].filter(Boolean).join('&');
const expenseCursor=(cursor,filter)=>{let after;try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'))}catch{throw Error('invalid_request')}
 if(!after||typeof after!=='object'||Object.keys(after).sort().join(',')!==(filter?'createdAt,date,filter,id,version':'createdAt,date,id,version')||after.version!==2||!validBorrowerId(after.id)||!/^\d{4}-\d{2}-\d{2}$/.test(after.date)
  ||typeof after.createdAt!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(after.createdAt)||filter&&after.filter!==filter)throw Error('invalid_request');
 return after;};
/** The list filter from request options: payment ('pending' or none) and payeeBorrowerId (a borrower id or none). */
export function expenseListFilter({payment=null,payeeBorrowerId=null}={}){
 if(payment!==null&&payment!=='pending'||payeeBorrowerId!==null&&!validBorrowerId(payeeBorrowerId))throw Error('invalid_request');
 return {payment,payeeBorrowerId};
}
const filterSql=(pending,payee)=>`($${pending}::boolean IS NOT TRUE OR ${expensePendingSql('e')}) AND ($${payee}::text IS NULL OR e."Ref Payee Borrower"=$${payee}::text)`;
export async function readExpensePage(client,{limit=25,cursor=null,payment=null,payeeBorrowerId=null}={}){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_request');
 const filter=expenseListFilter({payment,payeeBorrowerId}),key=filterKey(filter),pending=filter.payment==='pending';
 const after=cursor===null?null:expenseCursor(cursor,key);
 const rows=(await client.query(`SELECT ${columns} ${joins} WHERE ($1::date IS NULL OR (e."Expense Date",e."Created At",e."Row ID" COLLATE "C")<($1::date,$2::timestamp,$3::text COLLATE "C")) AND ${filterSql(5,6)} ORDER BY e."Expense Date" DESC,e."Created At" DESC,e."Row ID" COLLATE "C" DESC LIMIT $4`,[after?.date??null,after?.createdAt??null,after?.id??null,limit+1,pending,filter.payeeBorrowerId])).rows;
 const dates=await settlementDates(client,rows.map(r=>r.settlementId));for(const r of rows){const paid=dates.get(r.settlementId);r.settlementDate=paid?.date??null;r.settlementAccountLabel=paid?.accountLabel??null;}
 const more=rows.length>limit,items=rows.slice(0,limit).map(project),last=items.at(-1);
 const total=key&&cursor===null?(await client.query(`SELECT count(*)::int AS count,coalesce(sum(e."Amount"::numeric),0)::numeric(20,2)::text AS amount FROM public."Business Expenses" e WHERE ${filterSql(1,2)}`,[pending,filter.payeeBorrowerId])).rows[0]:null;
 return {items,nextCursor:more?Buffer.from(JSON.stringify({version:2,date:last.expenseDate,createdAt:last.createdAt,id:last.id,...(key?{filter:key}:{})})).toString('base64url'):null,...(key?{filter:{payment:filter.payment,payeeBorrowerId:filter.payeeBorrowerId,...(total?{total}:{})}}:{})};
}
