export const borrowerFields=Object.freeze({name:'Borrower Name',description:'Description',communicationName:'Communication Name',instagramUsername:'Instagram Username',city:'City',workingLocation:'Working Location',address:'Address',hidden:'Hidden Flag',referrerId:'Ref Referrer',preferredReceivingAccountId:'Ref Preferred Receiving Cash Account',note:'Borrower Note'});
const keys=Object.keys(borrowerFields), uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const validBorrowerId=value=>typeof value==='string'&&Buffer.byteLength(value)>0&&Buffer.byteLength(value)<=256&&!/[\u0000-\u001f\u007f]/u.test(value);
export function canonicalBorrowerFields(input){
 if(!input||Array.isArray(input)||Object.keys(input).sort().join(',')!==[...keys].sort().join(','))throw Error('invalid_request');
 const result={};for(const key of keys){const value=input[key];if(key==='hidden'){if(value!==null&&typeof value!=='boolean')throw Error('invalid_request');}else if(value!==null&&(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||Buffer.byteLength(value)>65536))throw Error('invalid_request');
 if(['referrerId','preferredReceivingAccountId'].includes(key)&&value!==null&&!validBorrowerId(value))throw Error('invalid_request');result[key]=value;}return result;
}
const versionSql="encode(sha256(convert_to(jsonb_build_object('id',b.\"Row ID\",'createdDate',b.\"Creation Date\",'aiCollectionEnabled',b.\"AI Collection Enabled\","+Object.entries(borrowerFields).map(([key,column])=>`'${key}',b."${column}"`).join(',')+")::text,'UTF8')),'hex')";
const columns=Object.entries(borrowerFields).map(([key,column])=>`b."${column}" AS "${key}"`).join(',');
const failure=(status,code,item)=>({ok:false,status,code,...(item?{item}:{})});
export async function readBorrowerRecord(client,id,lock=false){
 const row=(await client.query(`SELECT b."Row ID" AS id,${columns},b."Creation Date"::text AS "createdDate",b."AI Collection Enabled" AS "aiCollectionEnabled",${versionSql} AS version FROM public."Borrowers" b WHERE b."Row ID"=$1${lock?' FOR UPDATE':''}`,[id])).rows[0];
 if(!row)return null;

 const details=(await client.query(`SELECT b."Total Amount Loaned"::text AS "totalAmountLoaned",b."Total Interest Earned"::text AS "totalInterestEarned",b."Total Number of Loans" AS "totalNumberOfLoans",b."Total Outstanding Principal"::text AS "outstandingPrincipal",b."Active Loan Interest Earned"::text AS "activeInterest",b."Has Active Loan" AS "hasActiveLoan",b."Has Closed Loan" AS "hasClosedLoan",
 CASE WHEN b."Total Outstanding Principal" IS NULL OR b."Active Loan Interest Earned" IS NULL THEN NULL WHEN b."Total Outstanding Principal">0 THEN b."Active Loan Interest Earned"/b."Total Outstanding Principal" ELSE 0 END::text AS "activeReturn",
 (b."Active Loan Interest Earned"-b."Total Outstanding Principal")::text AS "activeProfit",
 (b."Total Amount Loaned"-b."Total Outstanding Principal")::text AS "closedPrincipal",(b."Total Interest Earned"-b."Active Loan Interest Earned")::text AS "closedInterest",
 CASE WHEN b."Has Closed Loan" IS NULL OR b."Total Amount Loaned" IS NULL OR b."Total Outstanding Principal" IS NULL OR b."Total Interest Earned" IS NULL OR b."Active Loan Interest Earned" IS NULL THEN NULL WHEN b."Has Closed Loan" AND b."Total Amount Loaned"-b."Total Outstanding Principal">0 THEN (b."Total Interest Earned"-b."Active Loan Interest Earned")/(b."Total Amount Loaned"-b."Total Outstanding Principal") ELSE 0 END::text AS "closedReturn",
 CASE WHEN b."Total Outstanding Principal"<=0 THEN NULL WHEN b."Active Loan Interest Earned">=b."Total Outstanding Principal" THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date WHEN b."Active Daily Interest">0 THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date+ceil((b."Total Outstanding Principal"-b."Active Loan Interest Earned")/b."Active Daily Interest")::integer ELSE NULL END::text AS "coverageDate",
 r."Borrower Name" AS "referrerName",a."Account Label" AS "preferredReceivingAccountLabel"
 FROM public."Borrowers" b LEFT JOIN public."Borrowers" r ON r."Row ID"=b."Ref Referrer" LEFT JOIN public."Cash Accounts" a ON a."Row ID"=b."Ref Preferred Receiving Cash Account" WHERE b."Row ID"=$1`,[id])).rows[0];
 return {...row,details};
}
export async function mutateBorrowerRecord(client,operation,id,input,markAttempted){
 if(!validBorrowerId(id)||!input||Array.isArray(input))return failure(400,'invalid_request');
 const expected=operation==='create'?'fields':operation==='edit'?'expectedVersion,fields':'expectedVersion';
 if(Object.keys(input).sort().join(',')!==expected||operation==='create'&&!uuid.test(id)||operation!=='create'&&!/^[a-f0-9]{64}$/.test(input.expectedVersion??''))return failure(400,'invalid_request');
 let fields;try{if(operation!=='delete')fields=canonicalBorrowerFields(input.fields)}catch{return failure(400,'invalid_request')}
 // Serialize creation of a client-generated UUID; existing rows use their ordinary row lock.
 if(operation==='create')await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['borrower:'+id]);
 const current=await readBorrowerRecord(client,id,true);
 if(operation==='create'&&current){const matches=keys.every(key=>current[key]===fields[key]);return matches?{ok:true,value:{item:current}}:failure(409,'record_conflict',current);}
 if(operation!=='create'&&!current)return failure(404,'not_found');
 if(current&&current.version!==input.expectedVersion)return failure(409,'record_conflict',current);
 if(operation!=='delete'){
  if(fields.name?.trim())await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['borrower-name:'+(fields.name??'').trim().toLowerCase()]);
  if(fields.name?.trim()&&(await client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"<>$1 AND lower(btrim(coalesce("Borrower Name",$3)))=lower(btrim($2)) LIMIT 1',[id,fields.name??'',''])).rowCount)return failure(409,'borrower_name_exists');
  if(fields.referrerId===id)return failure(422,'invalid_reference');
  if(fields.referrerId&&!(await client.query('SELECT 1 FROM public."Borrowers" WHERE "Row ID"=$1',[fields.referrerId])).rowCount)return failure(422,'invalid_reference');
  if(fields.preferredReceivingAccountId&&!(await client.query('SELECT 1 FROM public."Cash Accounts" a JOIN public."Cash Holders" h ON h."Row ID"=a."Ref Cash Holder" WHERE a."Row ID"=$1 AND a."Active" IS TRUE AND h."Active" IS TRUE',[fields.preferredReceivingAccountId])).rowCount)return failure(422,'invalid_reference');
 }
 await client.query('SAVEPOINT borrower_write');
 try{
  markAttempted();
  if(operation==='delete')await client.query('DELETE FROM public."Borrowers" WHERE "Row ID"=$1',[id]);
  else if(operation==='create')await client.query(`INSERT INTO public."Borrowers" ("Row ID",${Object.values(borrowerFields).map(column=>`"${column}"`).join(',')},"Creation Date") VALUES ($1,${keys.map((_,i)=>'$'+(i+2)).join(',')},(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date)`,[id,...keys.map(key=>fields[key])]);
  else await client.query(`UPDATE public."Borrowers" SET ${Object.values(borrowerFields).map((column,i)=>`"${column}"=$${i+2}`).join(',')} WHERE "Row ID"=$1`,[id,...keys.map(key=>fields[key])]);
  await client.query('RELEASE SAVEPOINT borrower_write');
 }catch(error){await client.query('ROLLBACK TO SAVEPOINT borrower_write');if(['23503','23514','23502'].includes(error.code))return failure(422,'record_requires_reconciliation');throw error;}
 return {ok:true,value:operation==='delete'?{deleted:true,id}:{item:await readBorrowerRecord(client,id)}};
}
