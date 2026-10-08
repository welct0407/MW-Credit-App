const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
import {createHash} from 'node:crypto';
export async function readCommandResult(client,actor,requestId,{lock=false}={}){
 const journal=(await client.query('SELECT canonical_json,outcome,payment_id,rejection_code,recorded_at FROM public.pwa_payment_commands WHERE request_id=$1 AND actor_issuer=$2 AND actor_subject=$3 AND actor_partner_id=$4',[requestId,actor.issuer,actor.subject,actor.partnerId])).rows[0];
 if(!journal)return {resultError:'not_found',status:404};
 const original=JSON.parse(journal.canonical_json).command;
 const originalOutcome={status:journal.outcome,paymentId:journal.payment_id,code:journal.rejection_code,recordedAt:new Date(journal.recorded_at).toISOString()};
 const payment=journal.payment_id?(await client.query(`SELECT p."Row ID" AS id,p."Ref Borrower" AS "borrowerId",p."Status" AS status,
 p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::text AS "postedAmount",p."Payment Date"::text AS "paymentDate",
 p."Ref Received By Cash Account" AS "cashAccountId",p."Payment Method" AS "paymentMethod",p."Allocation Method" AS "allocationMethod",p."Selected Charge IDs" AS "selectedChargeIds",p."Ref Target Charge" AS "targetChargeId",
 p."Notes" AS notes,p."Uploaded Receipt" AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",p."Created At"::text AS "createdAt",p."Processed At"::text AS "processedAt"
 FROM public."Payments" p WHERE p."Row ID"=$1 ${lock?'FOR UPDATE':''}`,[journal.payment_id])).rows[0]:null;
 if(!payment)return {originalCommand:original,originalOutcome,currentSource:'missing',payment:null,allocations:[],repayments:[],cashMovements:[],history:{recordedAt:originalOutcome.recordedAt}};
 const account=(await client.query('SELECT "Account Label" AS label FROM public."Cash Accounts" WHERE "Row ID"=$1',[payment.cashAccountId])).rows[0];
 let financialMatch=payment.status==='Posted'&&payment.borrowerId===original.borrowerId&&payment.amountReceived?.replace(/\.0+$/,'')===original.amountReceived
 &&payment.postedAmount?.replace(/\.0+$/,'')===original.amountReceived&&payment.paymentDate===original.paymentDate&&payment.cashAccountId===original.cashAccountId
 &&payment.paymentMethod===original.paymentMethod&&payment.allocationMethod===(original.schemaVersion===6?'Selected Charges':original.allocationMethod)
 &&(original.allocationMethod==='Single Full'?payment.targetChargeId===original.selectedChargeIds[0]:original.allocationMethod==='Receive All'?payment.selectedChargeIds===null&&payment.targetChargeId===null:JSON.stringify((payment.selectedChargeIds??'').split(',').map(x=>x.trim()).filter(Boolean).sort())===JSON.stringify([...(original.schemaVersion===6?original.allocations.map(row=>row.chargeId):original.selectedChargeIds)].sort()));
 const version=createHash('sha256').update(JSON.stringify(payment)).digest('hex');
 const allocations=(await client.query(`SELECT "Row ID" AS id,"Ref Charge" AS "chargeId","Charge Date Snapshot"::text AS "chargeDate","Allocation Order" AS "allocationOrder", "Allocated Principal"::numeric::text AS principal,"Allocated Interest"::numeric::text AS interest,"Allocated Amount"::numeric::text AS amount FROM public."Payment Allocations" WHERE "Ref Payment"=$1 ORDER BY "Allocation Order","Row ID" COLLATE "C"`,[payment.id])).rows;
 if(original.schemaVersion===6)financialMatch=financialMatch&&allocations.length===original.allocations.length&&original.allocations.every(line=>allocations.some(row=>row.chargeId===line.chargeId&&row.principal.replace(/\.0+$/,'')===line.principal&&row.interest.replace(/\.0+$/,'')===line.interest));
 if(original.allocationMethod==='Receive All')financialMatch=financialMatch&&JSON.stringify(allocations.map(row=>row.chargeId).sort())===JSON.stringify([...(original.schemaVersion===6?original.allocations.map(row=>row.chargeId):original.selectedChargeIds)].sort());
 const repayments=(await client.query(`SELECT "Row ID" AS id,"Ref Charges" AS "chargeId","Ref Payment Allocation" AS "allocationId","Payment Date"::text AS "paymentDate","Principal Paid"::numeric::text AS principal,"Interest Paid"::numeric::text AS interest FROM public."Repayments" WHERE "Ref Payment"=$1 ORDER BY "Payment Date","Row ID" COLLATE "C"`,[payment.id])).rows;
 const cashMovements=(await client.query(`SELECT c."Row ID" AS id,c."Movement Date"::text AS "movementDate",c."Movement Type" AS "movementType",c."Amount"::text AS amount,f."Account Label" AS "fromAccount",t."Account Label" AS "toAccount",c."Source Type" AS "sourceType",c."Source Key" AS "sourceKey" FROM public."Cash Ledger" c LEFT JOIN public."Cash Accounts" f ON f."Row ID"=c."Ref From Cash Account" LEFT JOIN public."Cash Accounts" t ON t."Row ID"=c."Ref To Cash Account" WHERE c."Ref Payment"=$1 ORDER BY c."Movement Date",c."Row ID" COLLATE "C"`,[payment.id])).rows;
 return {originalCommand:original,originalOutcome,currentSource:financialMatch?'present':'changed',payment:{...payment,accountLabel:account?.label??null,version},allocations,repayments,cashMovements,history:{recordedAt:originalOutcome.recordedAt,createdAt:payment.createdAt,processedAt:payment.processedAt}};
}

export async function readBorrowerPaymentHistory(client,borrowerId,{limit=25,cursor=null}={},actor){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_request');
 let after=null;if(cursor){try{after=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(Object.keys(after).join(',')!=='v,borrowerId,paymentDate,id'||after.v!==1||after.borrowerId!==borrowerId||typeof after.id!=='string'||!after.id||(after.paymentDate!==null&&!validDay(after.paymentDate))||Buffer.from(JSON.stringify(after)).toString('base64url')!==cursor)throw Error()}catch{throw Error('invalid_request')}}
 const rows=(await client.query(`SELECT (SELECT j.request_id::text FROM public.pwa_payment_commands j WHERE j.payment_id=p."Row ID" AND j.actor_issuer=$6 AND j.actor_subject=$7 AND j.actor_partner_id=$8 LIMIT 1) AS "requestId",p."Row ID" AS id,p."Status" AS status,p."Payment Date"::text AS "paymentDate",p."Amount Received"::numeric::text AS "amountReceived",p."Posted Amount"::text AS "postedAmount",p."Notes" AS notes,p."Uploaded Receipt" AS "receiptReference",p."Uploaded Receipt At"::text AS "receiptAt",a."Account Label" AS "accountLabel"
 FROM public."Payments" p LEFT JOIN public."Cash Accounts" a ON a."Row ID"=p."Ref Received By Cash Account"
 WHERE p."Ref Borrower"=$1 AND ($2::boolean IS FALSE OR ($3::date IS NULL AND p."Payment Date" IS NULL AND p."Row ID" COLLATE "C">$4 COLLATE "C") OR ($3::date IS NOT NULL AND (p."Payment Date"<$3::date OR p."Payment Date" IS NULL OR (p."Payment Date"=$3::date AND p."Row ID" COLLATE "C">$4 COLLATE "C"))))
 ORDER BY p."Payment Date" DESC NULLS LAST,p."Row ID" COLLATE "C" LIMIT $5`,[borrowerId,!!after,after?.paymentDate??null,after?.id??null,limit+1,actor?.issuer??null,actor?.subject??null,actor?.partnerId??null])).rows;
 const more=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1);
 return {items,nextCursor:more?Buffer.from(JSON.stringify({v:1,borrowerId,paymentDate:last.paymentDate,id:last.id})).toString('base64url'):null};
}
