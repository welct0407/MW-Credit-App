import {BUSINESS_TODAY_QUERY} from '../lib/business-date.mjs';
import {validBorrowerId} from './borrowers.mjs';
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
/** Governed SQL providers own all totals and running balances; this adapter only projects them. */
export async function readCashOverview(client){
 const dashboard=(await client.query(`SELECT "Operating Income MTD"::text AS "operatingIncomeMtd","Expenses MTD"::text AS "expensesMtd","Net Profit MTD"::text AS "netProfitMtd","Tommy Withdrawn MTD"::text AS "tommyWithdrawnMtd","Lisa Withdrawn MTD"::text AS "lisaWithdrawnMtd","Unsettled Profit MTD"::text AS "unsettledProfitMtd","Cash Pool Remaining"::text AS "cashPoolRemaining","Business Cash Held"::text AS "businessCashHeld",to_jsonb(d)->>'Principal Write-offs MTD' AS "principalWriteOffsMtd",to_jsonb(d) ? 'Principal Write-offs MTD' AS "principalWriteOffsMtdPresent" FROM public."Cash Dashboard" d`)).rows[0];
 // R116: "Principal Write-offs MTD" (V128, the df10: principal write-offs of the month, a positive amount) is read by name:
 // a database before V128 has no such column, so the field is omitted (the PWA hides the row) instead of failing the
 // overview; a present column carries its value, null as null (shown Unavailable; V128 coalesces it, so never null there),
 // and a present non-null value must be numeric.
 if(dashboard){
  const present=dashboard.principalWriteOffsMtdPresent===true,writeOffs=dashboard.principalWriteOffsMtd;delete dashboard.principalWriteOffsMtdPresent;
  if(!present)delete dashboard.principalWriteOffsMtd;
  else if(writeOffs!==null&&(typeof writeOffs!=='string'||!/^-?[0-9]+(?:\.[0-9]+)?$/.test(writeOffs)))throw Error('Cash provider unavailable');
 }
 const accounts=(await client.query(`SELECT "Ref Cash Account" id,"Ref Cash Holder" AS "holderId","Holder Name" AS "holderLabel","Account Label" label,"Opening Balance"::text AS "openingBalance","Cash In"::text AS "cashIn","Cash Out"::text AS "cashOut","Current Balance"::text AS "currentBalance","Initialized" initialized,"Business Cash Held"::text AS "businessCashHeld","Reimbursement / Advance Due"::text AS "reimbursementDue" FROM public."Cash Account Balances" ORDER BY "Holder Name" COLLATE "C","Account Label" COLLATE "C","Ref Cash Account" COLLATE "C"`)).rows;
 return {dashboard,accounts,businessDate:(await client.query(BUSINESS_TODAY_QUERY)).rows[0].day};
}
/** R122: a statement row carries the borrower's Thai name (borrowerLabel) and English name (borrowerDescription); the PWA
 * picks one by the viewer's language, as the Cash Ledger does. */
export async function readCashStatement(client,{accountId,date,limit=25,cursor=null}){
 if(!validBorrowerId(accountId)||!day(date)||!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_request');
 let after=null;if(cursor!==null){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(Object.keys(after).sort().join(',')!=='accountId,date,direction,ledgerId,timestamp,version'||after.version!==1||after.accountId!==accountId||after.date!==date||!validBorrowerId(after.ledgerId)||!['IN','OUT'].includes(after.direction)||typeof after.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(after.timestamp))throw Error()}catch{throw Error('invalid_request')}}
 const summary=(await client.query(`SELECT "Statement Date"::text AS date,"Opening Balance"::text AS "openingBalance","Money In"::text AS "moneyIn","Money Out"::text AS "moneyOut","Net Movement"::text AS "netMovement","Closing Balance"::text AS "closingBalance","Transaction Count"::text AS "transactionCount","Is Initialized" initialized FROM public."Cash Account Daily Summary Recent" WHERE "Ref Cash Account"=$1 AND "Statement Date"=$2::date`,[accountId,date])).rows[0];
 if(!summary)throw Error('invalid_request');
 const rows=(await client.query(`SELECT s."Row ID" id,s."Statement Date"::text AS date,s."Sort Timestamp"::text AS timestamp,s."Transaction Type Code" AS "transactionType",s."Counterparty Kind" AS "counterpartyKind",s."Counterparty Text" AS "counterpartyText",s."Ref Borrower" AS "borrowerId",b."Borrower Name" AS "borrowerLabel",b."Description" AS "borrowerDescription",s."Ref Other Cash Account" AS "otherAccountId",a."Account Label" AS "otherAccountLabel",s."Ref Partner" AS "partnerId",p."Partner Name" AS "partnerLabel",s."Ref Payment" AS "paymentId",s."Ref Loan" AS "loanId",s."Ref Business Expense" AS "expenseId",s."Settlement Row ID" AS "settlementId",s."Signed Amount"::text AS amount,s."Balance After"::text AS "balanceAfter",s."Is Initialized" initialized,s."Notes" notes,s."Source Type" AS "sourceType",s."Source Key" AS "sourceKey",s."Row ID"::jsonb->>0 AS "ledgerId",s."Row ID"::jsonb->>1 AS direction FROM public."Cash Account Statement Recent" s LEFT JOIN public."Borrowers" b ON b."Row ID"=s."Ref Borrower" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=s."Ref Other Cash Account" LEFT JOIN public."Partners" p ON p."Row ID"=s."Ref Partner" WHERE s."Ref Cash Account"=$1 AND s."Statement Date"=$2::date AND ($3::timestamp IS NULL OR (s."Sort Timestamp",(s."Row ID"::jsonb->>0) COLLATE "C",(s."Row ID"::jsonb->>1) COLLATE "C")>($3::timestamp,$4::text COLLATE "C",$5::text COLLATE "C")) ORDER BY s."Statement Date",s."Sort Timestamp",(s."Row ID"::jsonb->>0) COLLATE "C",(s."Row ID"::jsonb->>1) COLLATE "C" LIMIT $6`,[accountId,date,after?.timestamp??null,after?.ledgerId??null,after?.direction??null,limit+1])).rows;
 const items=rows.slice(0,limit),last=items.at(-1);
 // R129 (V137): the statement views name a 'Rebate Settlement' movement OTHER with no counterparty; the read names it
 // REBATE_SETTLEMENT and the referrer it paid (a settlement row exists only from V137 on, so this read runs only then).
 const settlements=[...new Set(items.filter(r=>r.sourceType==='Rebate Settlement'&&typeof r.sourceKey==='string'&&r.sourceKey.startsWith('REBATESETTLEMENT:')).map(r=>r.sourceKey.slice(17)))];
 if(settlements.length){
  const payees=new Map((await client.query('SELECT s.id,s.payee_borrower_id AS "borrowerId",b."Borrower Name" AS "borrowerLabel",b."Description" AS "borrowerDescription" FROM public.pwa_rebate_settlements s LEFT JOIN public."Borrowers" b ON b."Row ID"=s.payee_borrower_id WHERE s.id IN (SELECT jsonb_array_elements_text($1::jsonb))',[JSON.stringify(settlements)])).rows.map(r=>[r.id,r]));
  for(const row of items)if(row.sourceType==='Rebate Settlement'){const payee=payees.get(row.sourceKey.slice(17));row.transactionType='REBATE_SETTLEMENT';if(payee){row.counterpartyKind='BORROWER';row.borrowerId=payee.borrowerId;row.borrowerLabel=payee.borrowerLabel;row.borrowerDescription=payee.borrowerDescription;}}
 }
 return {accountId,date,summary,items,nextCursor:rows.length>limit?Buffer.from(JSON.stringify({version:1,accountId,date,timestamp:last.timestamp,ledgerId:last.ledgerId,direction:last.direction})).toString('base64url'):null};
}
