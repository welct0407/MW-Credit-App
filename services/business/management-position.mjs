import {readCashOverview} from './cash.mjs';
/** Read-only composition of the existing native cash providers. */
export async function readManagementPosition(client){
 const overview=await readCashOverview(client);
 const holders=(await client.query(`SELECT "Ref Cash Holder" id,"Holder Name" label,"Cash In"::numeric::text AS "cashIn","Cash Out"::numeric::text AS "cashOut","Current Balance"::numeric::text AS "currentBalance","Business Cash Held"::numeric::text AS "businessCashHeld","Reimbursement / Advance Due"::numeric::text AS "reimbursementDue" FROM public."Cash Holder Balances" ORDER BY "Holder Name" COLLATE "C","Ref Cash Holder" COLLATE "C"`)).rows;
 return {...overview,holders};
}
