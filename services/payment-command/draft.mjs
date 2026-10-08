import {projectCollectionCharge} from '../api/collection-read-contract.mjs';
import {borrowerDisplayName} from '../api/loan-read-contract.mjs';
export async function readPaymentDraft(client,fixture) {
 const clock=(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day, CURRENT_TIMESTAMP AS instant")).rows[0];
 const borrower=(await client.query('SELECT "Borrower Name" AS name,"Description" AS description FROM public."Borrowers" WHERE "Row ID"=$1',[fixture.borrowerId])).rows[0];
 if(!borrower)throw Error('Draft unavailable');
 const rows=(await client.query(`SELECT c."Row ID" AS id,l."Row ID" AS loan_id,c."Charge Date"::text AS charge_date,
 c."Payment Status" AS payment_status,c."Payment Date"::text AS payment_date,c."Amount Remaining"::text AS amount_remaining,
 c."Total Paid"::text AS total_paid,NULL::text AS received_today,
 (c."Principal Due"::numeric-paid.p)::text AS principal_remaining,(c."Interest Due"::numeric-paid.i)::text AS interest_remaining,paid.invalid AS invalid_components,b."Borrower Name" AS borrower_name,b."Description" AS borrower_description,
 l."Principal Amount"::numeric::text AS principal_amount,l."Loan Date"::text AS loan_date,l."Original Daily Interest Rate"::text AS original_rate
 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" JOIN public."Borrowers" b ON b."Row ID"=l."Ref Borrowers"
 CROSS JOIN LATERAL (SELECT coalesce(sum("Principal Paid"::numeric),0) p,coalesce(sum("Interest Paid"::numeric),0) i,count(*) FILTER(WHERE "Principal Paid" IS NULL OR "Interest Paid" IS NULL) invalid FROM public."Repayments" WHERE "Ref Charges"=c."Row ID") paid
 WHERE b."Row ID"=$1 AND c."Row ID"=ANY($2::text[]) ORDER BY c."Charge Date",c."Row ID" COLLATE "C"`,[fixture.borrowerId,fixture.chargeIds])).rows;
 if(rows.length!==fixture.chargeIds.length)throw Error('Draft unavailable');
 const charges=[];
 for(const row of rows){
  const projected=projectCollectionCharge(row);
  if(Number(row.invalid_components)>0||![row.principal_remaining,row.interest_remaining].every(value=>typeof value==='string'&&/^[0-9]+(?:\.0+)?$/.test(value)))throw Error('Draft unavailable');
  if(!/^-?\d+(?:\.0+)?$/.test(row.amount_remaining??''))throw Error('Draft unavailable');
  const amount=BigInt(row.amount_remaining.split('.')[0]);
  if(projected.chargeDate<=clock.day && projected.paymentStatus!=='ชำระแล้ว' && amount>0n)charges.push({id:row.id,chargeDate:projected.chargeDate,loanDisplayKey:projected.loanDisplayKey,amountRemaining:amount.toString(),principalRemaining:BigInt(row.principal_remaining.split('.')[0]).toString(),interestRemaining:BigInt(row.interest_remaining.split('.')[0]).toString()});
 }
 const accounts=(await client.query(`SELECT a."Row ID" AS id,a."Account Label" AS label FROM public."Cash Accounts" a
 JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=ANY($1::text[]) AND a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`,[fixture.cashAccountIds])).rows;
 if(accounts.some(row=>typeof row.label!=='string'||!row.label))throw Error('Draft unavailable');
 return {mode:'synthetic-only',businessDate:clock.day,asOf:new Date(clock.instant).toISOString(),borrower:{id:fixture.borrowerId,displayName:borrowerDisplayName(borrower.name,borrower.description)},charges,accounts};
}

const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='0001-01-01'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function decodeDraftCursor(value,borrowerId,scope='due'){
 if(!value)return null;
 try{const row=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));
  if(Object.keys(row).join(',')!=='v,borrowerId,scope,businessDate,chargeDate,id'||row.v!==2||row.scope!==scope||row.borrowerId!==borrowerId||!validDay(row.businessDate)||!validDay(row.chargeDate)||typeof row.id!=='string'||!row.id||Buffer.byteLength(row.id)>256||Buffer.from(JSON.stringify(row)).toString('base64url')!==value)throw Error();return row;
 }catch{throw Error('invalid_request')}
}
export async function readOwnerPaymentDraft(client,borrowerId,{limit=25,cursor=null,selectedChargeIds=null,scope='due',all=false}={}){
 const after=decodeDraftCursor(cursor,borrowerId,scope);
 if(!['due','future','all'].includes(scope)||all&&scope!=='due')throw Error('invalid_request');
 if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('invalid_request');
 const clock=(await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS day,CURRENT_TIMESTAMP AS instant")).rows[0];
 if(after&&after.businessDate!==clock.day)return {draftError:'business_date_changed',status:409};
 const borrower=(await client.query('SELECT "Borrower Name" AS name,"Description" AS description FROM public."Borrowers" WHERE "Row ID"=$1',[borrowerId])).rows[0];
 if(!borrower)return {draftError:'not_found',status:404};
 const blocked=(await client.query(`SELECT EXISTS(SELECT 1 FROM public."Payments" WHERE "Ref Borrower"=$1 AND "Status" IN ('Processing','Error')) AS blocked`,[borrowerId])).rows[0].blocked;
 if(blocked)return {draftError:'payment_requires_reconciliation',status:409};
 const invalid=(await client.query(`SELECT EXISTS(SELECT 1 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
 WHERE l."Ref Borrowers"=$1 AND (c."Charge Date" IS NULL OR NOT isfinite(c."Charge Date") OR (c."Amount Remaining" IS NULL OR c."Amount Remaining"<0 OR c."Amount Remaining"::text IN ('NaN','Infinity','-Infinity') OR c."Amount Remaining"<>trunc(c."Amount Remaining")))) AS invalid`,[borrowerId])).rows[0].invalid;
 if(invalid)throw Error('Draft unavailable');
 const rows=(await client.query(`SELECT c."Row ID" AS id,c."Charge Date"::text AS "chargeDate",c."Amount Remaining"::text AS amount,
 (c."Principal Due"::numeric-paid.principal)::text AS "principalRemaining",(c."Interest Due"::numeric-paid.interest)::text AS "interestRemaining",paid.invalid AS "invalidComponents",
 l."Principal Amount"::numeric::text AS principal,l."Loan Date"::text AS "loanDate",l."Original Daily Interest Rate"::text AS rate
 FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
 CROSS JOIN LATERAL (SELECT coalesce(sum(r."Principal Paid"::numeric),0) AS principal,coalesce(sum(r."Interest Paid"::numeric),0) AS interest,
 count(*) FILTER (WHERE r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL) AS invalid FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID") paid
 WHERE l."Ref Borrowers"=$1 AND (CASE WHEN $7::text='future' THEN c."Charge Date">$2::date WHEN $7::text='all' THEN TRUE ELSE c."Charge Date"<=$2::date END) AND c."Amount Remaining">0
 AND ($3::date IS NULL OR c."Charge Date">$3::date OR (c."Charge Date"=$3::date AND c."Row ID" COLLATE "C">$4::text COLLATE "C"))
 AND ($5::text[] IS NULL OR c."Row ID"=ANY($5::text[]))
 ORDER BY c."Charge Date",c."Row ID" COLLATE "C" LIMIT $6`,[borrowerId,clock.day,after?.chargeDate??null,after?.id??null,selectedChargeIds,selectedChargeIds||all?10001:limit+1,scope])).rows;
 if((all||selectedChargeIds)&&rows.length>10000)return {draftError:'selection_limit_exceeded',status:422};
 const name=borrowerDisplayName(borrower.name,borrower.description),more=!selectedChargeIds&&!all&&rows.length>limit,page=more?rows.slice(0,limit):rows;
 const charges=page.map(row=>{if(Number(row.invalidComponents)>0||![row.principalRemaining,row.interestRemaining].every(value=>typeof value==='string'&&/^[0-9]+(?:\.0+)?$/.test(value)))throw Error('Draft unavailable');if(!validDay(row.chargeDate)||!/^[0-9]+(?:\.0+)?$/.test(row.amount))throw Error('Draft unavailable');
 const principal=row.principal===null?'':new Intl.NumberFormat('en-US',{style:'currency',currency:'THB',currencyDisplay:'narrowSymbol',maximumFractionDigits:0}).format(Number(row.principal));
 const date=row.loanDate===null?'':validDay(row.loanDate)?row.loanDate.slice(8,10)+'/'+row.loanDate.slice(5,7):(()=>{throw Error('Draft unavailable')})();
 return {id:row.id,chargeDate:row.chargeDate,loanDisplayKey:name+'-'+principal+'-'+date+'-'+(row.rate===null?'Unavailable':row.rate+'%'),amountRemaining:BigInt(row.amount.split('.')[0]).toString(),principalRemaining:BigInt(row.principalRemaining.split('.')[0]).toString(),interestRemaining:BigInt(row.interestRemaining.split('.')[0]).toString()};});
 const accounts=(await client.query(`SELECT a."Row ID" AS id,a."Account Label" AS label FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Active" IS TRUE AND h."Active" IS TRUE ORDER BY a."Sort Order",a."Row ID" COLLATE "C"`)).rows;
 if(accounts.some(row=>typeof row.label!=='string'||!row.label))throw Error('Draft unavailable');
 const last=page.at(-1),nextCursor=more?Buffer.from(JSON.stringify({v:2,borrowerId,scope,businessDate:clock.day,chargeDate:last.chargeDate,id:last.id})).toString('base64url'):null;
 return {mode:'dev-owner-testing',scope,businessDate:clock.day,asOf:new Date(clock.instant).toISOString(),borrower:{id:borrowerId,displayName:name},charges,accounts,nextCursor};
}
