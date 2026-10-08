import {projectCollectionCharge} from '../api/collection-read-contract.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
export async function readPaymentDraft(client,fixture) {
 const clock=(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day, CURRENT_TIMESTAMP AS instant")).rows[0];
 const borrower=(await client.query('SELECT "Borrower Name" AS name,"Description" AS description FROM public."Borrowers" WHERE "Row ID"=$1',[fixture.borrowerId])).rows[0];
 if(!borrower)throw Error('Draft unavailable');
 const rows=(await client.query(`SELECT c."Row ID" AS id,l."Row ID" AS loan_id,c."Charge Date"::text AS charge_date,
 c."Payment Status" AS payment_status,c."Payment Date"::text AS payment_date,c."Amount Remaining"::text AS amount_remaining,
 c."Total Paid"::text AS total_paid,NULL::text AS received_today,b."Borrower Name" AS borrower_name,b."Description" AS borrower_description,
 l."Principal Amount"::numeric::text AS principal_amount,l."Loan Date"::text AS loan_date,l."Original Daily Interest Rate"::text AS original_rate
 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
 WHERE b."Row ID"=$1 AND c."Row ID"=ANY($2::text[]) ORDER BY c."Charge Date",c."Row ID" COLLATE "C"`,[fixture.borrowerId,fixture.chargeIds])).rows;
 if(rows.length!==fixture.chargeIds.length)throw Error('Draft unavailable');
 const charges=[];
 for(const row of rows){
  const projected=projectCollectionCharge(row);
  if(!/^-?\d+(?:\.0+)?$/.test(row.amount_remaining??''))throw Error('Draft unavailable');
  const amount=BigInt(row.amount_remaining.split('.')[0]);
  if(projected.chargeDate<=clock.day && projected.paymentStatus!=='ชำระแล้ว' && amount>0n)charges.push({id:row.id,chargeDate:projected.chargeDate,loanDisplayKey:projected.loanDisplayKey,amountRemaining:amount.toString()});
 }
 const accounts=(await client.query(`SELECT a."Row ID" AS id,a."Account Label" AS label FROM public."Cash Accounts" a
 JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=ANY($1::text[]) AND a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`,[fixture.cashAccountIds])).rows;
 if(accounts.some(row=>typeof row.label!=='string'||!row.label))throw Error('Draft unavailable');
 return {mode:'synthetic-only',businessDate:clock.day,asOf:new Date(clock.instant).toISOString(),borrower:{id:fixture.borrowerId,displayName:borrowerDisplayName(borrower.name,borrower.description)},charges,accounts};
}
