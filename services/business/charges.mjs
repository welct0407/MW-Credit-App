import {validBorrowerId} from './borrowers.mjs';
export const chargeFields=Object.freeze({loanId:'Ref Loans',chargeDate:'Charge Date',principalDue:'Principal Due',interestDue:'Interest Due',notes:'Notes'});
export function canonicalChargeFields(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==Object.keys(chargeFields).sort().join(','))throw Error('invalid_request');
 if(!validBorrowerId(input.loanId)||typeof input.chargeDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.chargeDate)||new Date(input.chargeDate+'T00:00:00Z').toISOString().slice(0,10)!==input.chargeDate)throw Error('invalid_request');
 for(const key of ['principalDue','interestDue'])if(typeof input[key]!=='string'||! /^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(input[key])||input[key].length>21)throw Error('invalid_request');
 if(input.notes!==null&&(typeof input.notes!=='string'||!input.notes.isWellFormed()||input.notes.includes('\0')||Buffer.byteLength(input.notes)>65536))throw Error('invalid_request');
 return Object.fromEntries(Object.keys(chargeFields).map(key=>[key,input[key]]));
}
export async function readChargeRecord(client,id){
 const item=(await client.query(`SELECT c."Row ID" AS id,c."Ref Loans" AS "loanId",c."Charge Date"::text AS "chargeDate",c."Principal Due"::numeric::text AS "principalDue",c."Interest Due"::numeric::text AS "interestDue",c."Notes" AS notes,c."Total Paid"::numeric::text AS "totalPaid",c."Amount Remaining"::numeric::text AS "amountRemaining",l."Ref Borrowers" AS "borrowerId",b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",public.pwa_charge_version_v2(c."Row ID") AS version FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE c."Row ID"=$1`,[id] )).rows[0]??null;
 if(!item)return null;
 item.borrowerLabel=[item.borrowerName,item.borrowerDescription].filter(Boolean).join(' - ');
 item.repayments=(await client.query(`SELECT "Row ID" id,"Ref Payment" AS "paymentId","Payment Date"::text AS "paymentDate","Principal Paid"::numeric::text principal,"Interest Paid"::numeric::text interest FROM public."Repayments" WHERE "Ref Charges"=$1 ORDER BY "Payment Date" DESC,"Row ID" COLLATE "C" LIMIT 10001`,[id])).rows;
 item.allocations=(await client.query(`SELECT "Row ID" id,"Ref Payment" AS "paymentId","Charge Date Snapshot"::text AS "chargeDate","Allocation Order" AS "allocationOrder","Allocated Principal"::numeric::text principal,"Allocated Interest"::numeric::text interest,"Allocated Amount"::numeric::text amount FROM public."Payment Allocations" WHERE "Ref Charge"=$1 ORDER BY "Row ID" COLLATE "C" LIMIT 10001`,[id])).rows;
 if(item.repayments.length>10000||item.allocations.length>10000)throw Error('Charge related records exceed technical limit');
 return item;
}
