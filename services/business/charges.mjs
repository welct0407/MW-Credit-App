import {validBorrowerId} from './borrowers.mjs';
import {lateChargeSchema,lateSql} from '../lib/late-charge-schema.mjs';
export const chargeFields=Object.freeze({loanId:'Ref Loans',chargeDate:'Charge Date',principalDue:'Principal Due',interestDue:'Interest Due',lateChargeDue:'Late Charge Due',notes:'Notes'});
/**
 * charge.create / charge.update inputs in the SQL canonical order (pwa_submit_operation_v2). R118: lateChargeDue (a whole
 * baht amount of 0 or more) sits between interestDue and notes. A request without it (an earlier client or a queued
 * offline edit) keeps the 5-key text, and SQL keeps the stored late charge (0 on create).
 */
export function canonicalChargeFields(input){
 const keys=Object.keys(chargeFields).filter(key=>key!=='lateChargeDue'||Object.hasOwn(input??{},'lateChargeDue'));
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');
 if(Object.hasOwn(input,'lateChargeDue')&&(typeof input.lateChargeDue!=='string'||!/^(0|[1-9][0-9]{0,16})$/.test(input.lateChargeDue)||BigInt(input.lateChargeDue)>92233720368547758n))throw Error('invalid_request');
 if(!validBorrowerId(input.loanId)||typeof input.chargeDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.chargeDate)||new Date(input.chargeDate+'T00:00:00Z').toISOString().slice(0,10)!==input.chargeDate)throw Error('invalid_request');
 for(const key of ['principalDue','interestDue'])if(typeof input[key]!=='string'||! /^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(input[key])||input[key].length>21)throw Error('invalid_request');
 if(input.notes!==null&&(typeof input.notes!=='string'||!input.notes.isWellFormed()||input.notes.includes('\0')||Buffer.byteLength(input.notes)>65536))throw Error('invalid_request');
 return Object.fromEntries(keys.map(key=>[key,input[key]]));
}
export async function readChargeRecord(client,id){
 const L=await lateChargeSchema(client);
 const item=(await client.query(`SELECT c."Row ID" AS id,c."Ref Loans" AS "loanId",c."Charge Date"::text AS "chargeDate",c."Principal Due"::numeric::text AS "principalDue",c."Interest Due"::numeric::text AS "interestDue",${lateSql(L,'c."Late Charge Due"::numeric')}::text AS "lateChargeDue",${lateSql(L,'c."Late Charge Paid"::numeric')}::text AS "lateChargePaid",${lateSql(L,'c."Late Charge Remaining"::numeric')}::text AS "lateChargeRemaining",c."Notes" AS notes,c."Total Paid"::numeric::text AS "totalPaid",c."Amount Remaining"::numeric::text AS "amountRemaining",l."Ref Borrowers" AS "borrowerId",b."Borrower Name" AS "borrowerName",b."Description" AS "borrowerDescription",public.pwa_charge_version_v2(c."Row ID") AS version FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers" WHERE c."Row ID"=$1`,[id] )).rows[0]??null;
 if(!item)return null;
 item.borrowerLabel=[item.borrowerName,item.borrowerDescription].filter(Boolean).join(' - ');
 item.repayments=(await client.query(`SELECT "Row ID" id,"Ref Payment" AS "paymentId","Payment Date"::text AS "paymentDate","Principal Paid"::numeric::text principal,"Interest Paid"::numeric::text interest,${lateSql(L,'"Late Charge Paid"::numeric')}::text AS "lateCharge" FROM public."Repayments" WHERE "Ref Charges"=$1 ORDER BY "Payment Date" DESC,"Row ID" COLLATE "C" LIMIT 10001`,[id])).rows;
 item.allocations=(await client.query(`SELECT "Row ID" id,"Ref Payment" AS "paymentId","Charge Date Snapshot"::text AS "chargeDate","Allocation Order" AS "allocationOrder","Allocated Principal"::numeric::text principal,"Allocated Interest"::numeric::text interest,${lateSql(L,'"Allocated Late Charge"::numeric')}::text AS "lateCharge","Allocated Amount"::numeric::text amount FROM public."Payment Allocations" WHERE "Ref Charge"=$1 ORDER BY "Row ID" COLLATE "C" LIMIT 10001`,[id])).rows;
 if(item.repayments.length>10000||item.allocations.length>10000)throw Error('Charge related records exceed technical limit');
 return item;
}
