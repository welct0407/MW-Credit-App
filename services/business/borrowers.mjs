import {expensePendingSql,rebatePendingSql} from './rebate-state.mjs';
import {UUID_V4} from '../lib/ids.mjs';
import {validIgGroupUrl,validIgGroupInviteLink} from '../api/collection-read-contract.mjs';
export const borrowerFields=Object.freeze({name:'Borrower Name',description:'Description',communicationName:'Communication Name',instagramUsername:'Instagram Username',city:'City',workingLocation:'Working Location',address:'Address',hidden:'Hidden Flag',referrerId:'Ref Referrer',preferredReceivingAccountId:'Ref Preferred Receiving Cash Account',note:'Borrower Note'});
// Optional inputs, in the canonical order after the fields (pwa_submit_operation_v2 appends each only when present).
// R120 (V135): the referral rebate terms of this borrower as a referrer, whole numbers or null (the default 10% and 1,000).
// R153 (V148): igGroupUrl, the borrower's Instagram group chat link, a string matching IG_GROUP_URL_PATTERN or null (no link).
// R154 (V149): igGroupInviteLink right after it, the group's invite link, matching IG_GROUP_INVITE_PATTERN or null.
const optionalFields={aiCollectionEnabled:'AI Collection Enabled',referralRebateRate:'Referral Rebate Rate',referralRebateCap:'Referral Rebate Cap',igGroupUrl:'IG Group URL',igGroupInviteLink:'IG Group Invite Link'};
// The SQL rule (V135): a JSON number of at most 12 digits, rate 0 to 100, cap 1 or more.
const termRange={referralRebateRate:[0,100],referralRebateCap:[1,999999999999]};
const keys=Object.keys(borrowerFields), uuid=UUID_V4;
export const validBorrowerId=value=>typeof value==='string'&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=256&&!/[\u0000-\u001f\u007f]/u.test(value);
export function canonicalBorrowerFields(input){
 if(!input||Array.isArray(input)||Object.keys(input).filter(key=>!Object.hasOwn(optionalFields,key)).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');
 const result={};for(const key of [...keys,...Object.keys(optionalFields).filter(key=>Object.hasOwn(input,key))]){const value=input[key];if(key==='hidden'||key==='aiCollectionEnabled'){if(value!==null&&typeof value!=='boolean')throw Error('invalid_request');}else if(Object.hasOwn(termRange,key)){if(value!==null&&(!Number.isInteger(value)||value<termRange[key][0]||value>termRange[key][1]))throw Error('invalid_request');}else if(key==='igGroupUrl'){if(value!==null&&!validIgGroupUrl(value))throw Error('invalid_request');}else if(key==='igGroupInviteLink'){if(value!==null&&!validIgGroupInviteLink(value))throw Error('invalid_request');}else if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
 if(['referrerId','preferredReceivingAccountId'].includes(key)&&value!==null&&!validBorrowerId(value))throw Error('invalid_request');result[key]=value;}return result;
}
// The Node mirror of pwa_borrower_version_v2: the same jsonb text, so the same hash. R120 (V135) adds the two terms after
// "note"; they are read through to_jsonb(b) and joined only when the columns exist, so the mirror equals the SQL function
// on a database before V135 too (jsonb text orders keys itself, so the concatenation is the same text as one object).
// R153 (V148) adds igGroupUrl after the terms the same way (absent before V148), R154 (V149) igGroupInviteLink after it.
const versionSql="encode(sha256(convert_to((jsonb_build_object('id',b.\"Row ID\",'createdDate',b.\"Creation Date\",'aiCollectionEnabled',b.\"AI Collection Enabled\","+Object.entries(borrowerFields).map(([key,column])=>`'${key}',b."${column}"`).join(',')+")||CASE WHEN to_jsonb(b)?'Referral Rebate Rate' THEN jsonb_build_object('referralRebateRate',to_jsonb(b)->'Referral Rebate Rate','referralRebateCap',to_jsonb(b)->'Referral Rebate Cap') ELSE '{}'::jsonb END||CASE WHEN to_jsonb(b)?'IG Group URL' THEN jsonb_build_object('igGroupUrl',to_jsonb(b)->'IG Group URL') ELSE '{}'::jsonb END||CASE WHEN to_jsonb(b)?'IG Group Invite Link' THEN jsonb_build_object('igGroupInviteLink',to_jsonb(b)->'IG Group Invite Link') ELSE '{}'::jsonb END)::text,'UTF8')),'hex')";
// R120: whether referral_rebate_terms (V135) exists; a true answer is kept per client (a migration only adds it).
const termsReady=new WeakMap();
async function hasTermsFunction(client){
 if(termsReady.get(client))return true;
 const ready=(await client.query(`SELECT to_regprocedure('public.referral_rebate_terms(text)') IS NOT NULL AS ready`)).rows[0]?.ready===true;
 if(ready&&client&&typeof client==='object')termsReady.set(client,true);return ready;
}
const columns=Object.entries(borrowerFields).map(([key,column])=>`b."${column}" AS "${key}"`).join(',');
const failure=(status,code,item)=>({ok:false,status,code,...(item?{item}:{})});
export async function readBorrowerRecord(client,id,lock=false){
 const row=(await client.query(`SELECT b."Row ID" AS id,${columns},b."Creation Date"::text AS "createdDate",b."AI Collection Enabled" AS "aiCollectionEnabled",to_jsonb(b)?'Referral Rebate Rate' AS "termsPresent",(to_jsonb(b)->>'Referral Rebate Rate')::float8 AS "referralRebateRate",(to_jsonb(b)->>'Referral Rebate Cap')::float8 AS "referralRebateCap",to_jsonb(b)?'IG Group URL' AS "igPresent",to_jsonb(b)?'IG Group Invite Link' AS "invitePresent",to_jsonb(b)->>'IG Group URL' AS "igGroupUrl",to_jsonb(b)->>'IG Group Invite Link' AS "igGroupInviteLink",${versionSql} AS version FROM public."Borrowers" b WHERE b."Row ID"=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
 if(!row)return null;
 // R120: before V135 the record has no terms (absent, not null), so a client never sends a term it could not show.
 // R153: the same for the group chat link before V148, so an edit never clears a link it could not show.
 const {termsPresent,igPresent,invitePresent,...record}=row;if(!termsPresent){delete record.referralRebateRate;delete record.referralRebateCap;}if(!igPresent)delete record.igGroupUrl;if(!invitePresent)delete record.igGroupInviteLink;
 const terms=termsPresent&&await hasTermsFunction(client);

 // R140 (V143): expensesOwedAmount and expensesOwedCount, the manual expenses pending payment whose payee is this borrower
 // (expensePendingSql; any borrower, apart from the referral rebates owed and from rebate settlement).
 // R129 (V137): isReferrer (this borrower referred someone), referrerUnpaidAmount (the pwa_rebate_pending_v1 rule over
 // their rebates) and referrerUnpaidSince (the oldest close date of an unpaid one). Before V137 nothing is pending.
 const details=(await client.query(`SELECT b."Total Amount Loaned"::text AS "totalAmountLoaned",b."Total Interest Earned"::text AS "totalInterestEarned",b."Total Number of Loans" AS "totalNumberOfLoans",b."Total Outstanding Principal"::text AS "outstandingPrincipal",b."Active Loan Interest Earned"::text AS "activeInterest",b."Has Active Loan" AS "hasActiveLoan",b."Has Closed Loan" AS "hasClosedLoan",
 CASE WHEN b."Total Outstanding Principal" IS NULL OR b."Active Loan Interest Earned" IS NULL THEN NULL WHEN b."Total Outstanding Principal">0 THEN b."Active Loan Interest Earned"/b."Total Outstanding Principal" ELSE 0 END::text AS "activeReturn",
 (b."Active Loan Interest Earned"-b."Total Outstanding Principal")::text AS "activeProfit",
 (b."Total Amount Loaned"-b."Total Outstanding Principal")::text AS "closedPrincipal",(b."Total Interest Earned"-b."Active Loan Interest Earned")::text AS "closedInterest",
 CASE WHEN b."Has Closed Loan" IS NULL OR b."Total Amount Loaned" IS NULL OR b."Total Outstanding Principal" IS NULL OR b."Total Interest Earned" IS NULL OR b."Active Loan Interest Earned" IS NULL THEN NULL WHEN b."Has Closed Loan" AND b."Total Amount Loaned"-b."Total Outstanding Principal">0 THEN (b."Total Interest Earned"-b."Active Loan Interest Earned")/(b."Total Amount Loaned"-b."Total Outstanding Principal") ELSE 0 END::text AS "closedReturn",
 CASE WHEN b."Total Outstanding Principal"<=0 THEN NULL WHEN b."Active Loan Interest Earned">=b."Total Outstanding Principal" THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date WHEN b."Active Daily Interest">0 THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+ceil((b."Total Outstanding Principal"-b."Active Loan Interest Earned")/b."Active Daily Interest")::integer ELSE NULL END::text AS "coverageDate",
 r."Borrower Name" AS "referrerName",a."Account Label" AS "preferredReceivingAccountLabel",
 EXISTS(SELECT 1 FROM public."Borrowers" x WHERE x."Ref Referrer"=b."Row ID" AND x."Row ID"<>b."Row ID") AS "isReferrer",
 (SELECT coalesce(sum(${rebatePendingSql('x','o')}),0)::numeric(20,2)::text FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=to_jsonb(x)->>'Ref Offset Payment' WHERE x."Ref Payee Borrower"=b."Row ID" AND x."Source Type"='Referral Rebate') AS "referrerUnpaidAmount",
 (SELECT min(coalesce(l."Close Date",x."Expense Date"))::text FROM public."Business Expenses" x LEFT JOIN public."Payments" o ON o."Row ID"=to_jsonb(x)->>'Ref Offset Payment' LEFT JOIN public."Loans" l ON l."Row ID"=x."Ref Related Loan"
  WHERE x."Ref Payee Borrower"=b."Row ID" AND x."Source Type"='Referral Rebate' AND ${rebatePendingSql('x','o')}>0) AS "referrerUnpaidSince",
 eo.amount AS "expensesOwedAmount",eo.count AS "expensesOwedCount",
 ${terms?`(t.terms->>'rate')::float8 AS "referralRebateRateEffective",(t.terms->>'cap')::float8 AS "referralRebateCapEffective"`:'NULL::float8 AS "referralRebateRateEffective",NULL::float8 AS "referralRebateCapEffective"'}
 FROM public."Borrowers" b LEFT JOIN public."Borrowers" r ON r."Row ID"=b."Ref Referrer" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=b."Ref Preferred Receiving Cash Account"
 CROSS JOIN LATERAL (SELECT coalesce(sum(x."Amount"::numeric),0)::numeric(20,2)::text AS amount,count(*)::int AS count FROM public."Business Expenses" x WHERE x."Ref Payee Borrower"=b."Row ID" AND ${expensePendingSql('x')}) eo${terms?' CROSS JOIN LATERAL (SELECT public.referral_rebate_terms(b."Row ID") AS terms) t':''} WHERE b."Row ID"=$1`,[id])).rows[0];
 // The effective terms (the referrer's own or the default) come from referral_rebate_terms, so the PWA holds no default.
 if(!terms){delete details.referralRebateRateEffective;delete details.referralRebateCapEffective;}
 return {...record,details};
}
/** Owner rule (W5): every borrower has a name (create/update input, checked before any write) and a loan is created
 * only for a borrower whose stored name is not blank (checked after the governed operation applied, while it still holds
 * the Borrowers row lock; the caller then rolls the whole transaction back, so nothing is recorded). */
export const borrowerNameMissing=command=>['borrower.create','borrower.update'].includes(command.operation)&&!String(command.inputs?.name??'').trim();
export async function loanBorrowerNameMissing(client,command){
 return command.operation==='loan.create'&&!String((await client.query('SELECT "Borrower Name" AS name FROM public."Borrowers" WHERE "Row ID"=$1',[command.inputs?.borrowerId])).rows[0]?.name??'').trim();
}
export async function mutateBorrowerRecord(client,operation,id,input,markAttempted){
 if(!validBorrowerId(id)||!input||Array.isArray(input))return failure(400,'invalid_request');
 const expected=operation==='create'?'fields':operation==='edit'?'expectedVersion,fields':'expectedVersion';
 if(Object.keys(input).sort().join(',')!==expected||operation==='create'&&!uuid.test(id)||operation!=='create'&&!/^[a-f0-9]{64}$/.test(input.expectedVersion??''))return failure(400,'invalid_request');
 let fields;try{if(operation!=='delete')fields=canonicalBorrowerFields(input.fields)}catch{return failure(400,'invalid_request')}
 // Serialize creation of a client-generated UUID; existing rows use their ordinary row lock.
 // DB-LOCK-03: advisory-lock keys come only from SQL (pwa_lock_key_v1, V93) so Node and the
 // pwa_submit_operation_v2 sites can never drift; requires V93 in the target database.
 if(operation==='create')await client.query('SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,$2))',['borrower',id]);
 const current=await readBorrowerRecord(client,id,true);
 if(operation==='create'&&current){const matches=Object.keys(fields).every(key=>current[key]===fields[key]);return matches?{ok:true,value:{item:current}}:failure(409,'record_conflict',current);}
 if(operation!=='create'&&!current)return failure(404,'not_found');
 if(current&&current.version!==input.expectedVersion)return failure(409,'record_conflict',current);
 if(operation!=='delete'){
  // The guard and key text are SQL (nullif/btrim/lower), character-for-character as in
  // pwa_submit_operation_v2, so JS trim()/toLowerCase() can never select a different key.
  await client.query("SELECT pg_advisory_xact_lock(public.pwa_lock_key_v1($1,lower(btrim($2)))) WHERE nullif(btrim($2),'') IS NOT NULL",['borrower-name',fields.name??'']);
  if(fields.name?.trim()&&(await client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"<>$1 AND lower(btrim(coalesce("Borrower Name",$3)))=lower(btrim($2)) LIMIT 1',[id,fields.name??'',''])).rowCount)return failure(409,'borrower_name_exists');
  if(!fields.name?.trim())return failure(422,'borrower_name_required');
  if(fields.referrerId===id)return failure(422,'invalid_reference');
  if(fields.referrerId&&!(await client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"=$1',[fields.referrerId])).rowCount)return failure(422,'invalid_reference');
  if(fields.preferredReceivingAccountId&&!(await client.query('SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=$1 AND a."Active" IS TRUE AND h."Active" IS TRUE',[fields.preferredReceivingAccountId])).rowCount)return failure(422,'invalid_reference');
 }
 await client.query('SAVEPOINT borrower_write');
 try{
  const writeKeys=fields?Object.keys(fields):[],writeColumns=writeKeys.map(key=>borrowerFields[key]??optionalFields[key]);
  markAttempted();
  if(operation==='delete')await client.query('DELETE FROM public."Borrowers" WHERE "Row ID"=$1',[id]);
  else if(operation==='create')await client.query(`INSERT INTO public."Borrowers" ("Row ID",${writeColumns.map(column=>`"${column}"`).join(',')},"Creation Date") VALUES ($1,${writeKeys.map((_,i)=>'$'+(i+2)).join(',')},(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date)`,[id,...writeKeys.map(key=>fields[key])]);
  else await client.query(`UPDATE public."Borrowers" SET ${writeColumns.map((column,i)=>`"${column}"=$${i+2}`).join(',')} WHERE "Row ID"=$1`,[id,...writeKeys.map(key=>fields[key])]);
  await client.query('RELEASE SAVEPOINT borrower_write');
 }catch(error){await client.query('ROLLBACK TO SAVEPOINT borrower_write');if(['23503','23514','23502'].includes(error.code))return failure(422,'record_requires_reconciliation');throw error;}
 return {ok:true,value:operation==='delete'?{deleted:true,id}:{item:await readBorrowerRecord(client,id)}};
}
