import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {validBorrowerId} from './borrowers.mjs';
import {expenseCategories} from '../contracts/expense-command.mjs';
const columns=`e."Row ID" id,e."Expense Date"::text AS "expenseDate",e."Expense Category" category,e."Amount"::numeric::text amount,e."Payee Name" AS "payeeName",e."Ref Payee Borrower" AS "payeeBorrowerId",CASE WHEN payee."Row ID" IS NULL THEN NULL ELSE coalesce(payee."Borrower Name",'')||' - '||coalesce(payee."Description",'') END AS "payeeBorrowerLabel",e."Ref Related Borrower" AS "relatedBorrowerId",CASE WHEN b."Row ID" IS NULL THEN NULL ELSE coalesce(b."Borrower Name",'')||' - '||coalesce(b."Description",'') END AS "relatedBorrowerLabel",e."Ref Related Loan" AS "relatedLoanId",l."Loan Date"::text AS "relatedLoanDate",l."Principal Amount"::numeric::text AS "relatedLoanPrincipal",l."Original Daily Interest Rate"::text AS "relatedLoanOriginalRate",coalesce(lb."Borrower Name",'')||' - '||coalesce(lb."Description",'') AS "relatedLoanBorrowerLabel",e."Notes" notes,e."Ref Paid By Cash Account" AS "paidByAccountId",ca."Account Label" AS "paidByAccountLabel",e."Ref Paid By Cash Holder" AS "paidByHolderId",h."Holder Name" AS "paidByHolderLabel",e."Source Type" AS "sourceType",e."Source Key" AS "sourceKey",e."Gross Profit Basis"::numeric::text AS "grossProfitBasis",e."Allocation Basis" AS "allocationBasis",e."Partner A Share"::text AS "partnerAShare",e."Partner B Share"::text AS "partnerBShare",e."Partner A Expense"::numeric::text AS "partnerAExpense",e."Partner B Expense"::numeric::text AS "partnerBExpense",e."Rule Version" AS "ruleVersion",e."Created At"::text AS "createdAt",e."Created By" AS "createdBy",
 e."Ref Offset Payment" AS "offsetPaymentId",op."Amount Received"::numeric::text AS "offsetAmount",ol."Row ID" AS "offsetLoanId",ol."Loan Date"::text AS "offsetLoanDate",ol."Principal Amount"::numeric::text AS "offsetLoanPrincipal",ol."Original Daily Interest Rate"::text AS "offsetLoanOriginalRate",coalesce(olb."Borrower Name",'')||' - '||coalesce(olb."Description",'') AS "offsetLoanBorrowerLabel"`;
// R111: a referral rebate settled by offset names its Referral Rebate Offset payment and the referrer's loan it paid
// (the first by key when it paid several).
const joins=`FROM public."Business Expenses" e LEFT JOIN public."Borrowers" payee ON payee."Row ID"=e."Ref Payee Borrower" LEFT JOIN public."Borrowers" b ON b."Row ID"=e."Ref Related Borrower" LEFT JOIN public."Loans" l ON l."Row ID"=e."Ref Related Loan" LEFT JOIN public."Borrowers" lb ON lb."Row ID"=l."Ref Borrowers" LEFT JOIN public."Cash Accounts" ca ON ca."Row ID"=e."Ref Paid By Cash Account" LEFT JOIN public."Cash Holders" h ON h."Row ID"=e."Ref Paid By Cash Holder"
 LEFT JOIN public."Payments" op ON op."Row ID"=e."Ref Offset Payment" LEFT JOIN LATERAL (SELECT r."Ref Loans" AS loan FROM public."Repayments" r WHERE r."Ref Payment"=e."Ref Offset Payment" ORDER BY r."Ref Loans" COLLATE "C" LIMIT 1) orl ON true
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
 const more=rows.length>limit,items=rows.slice(0,limit).map(project),last=items.at(-1);
 return {items,nextCursor:more?Buffer.from(JSON.stringify({version:1,date:last.expenseDate,id:last.id})).toString('base64url'):null};
}
