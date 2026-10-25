/** Fixed read-only preparation for an exact-key observation, never bulk previews. */
export async function readNativeCommandMetadata(client,resource,id,actor){
 if(resource==='Borrowers'||resource==='Charges'){
  const source=(await client.query(resource==='Borrowers'
   ?'SELECT "Row ID" AS "borrowerId" FROM public."Borrowers" WHERE "Row ID"=$1'
   :'SELECT l."Ref Borrowers" AS "borrowerId" FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans" WHERE c."Row ID"=$1',[id])).rows[0];
  if(!source?.borrowerId)return {quickPayment:null};
  const targetChargeId=resource==='Charges'?id:null;
  // Matches V23 quick-payment amount and V51 ordinary mode membership. In
  // particular Single Full is not silently changed to schema6's due-only plan.
  const row=(await client.query(`WITH clock AS (
   SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS day
  ), balances AS (
   SELECT c."Principal Due"::numeric-paid.principal AS principal,
    c."Interest Due"::numeric-paid.interest AS interest,paid.invalid
   FROM public."Charges" c JOIN public."Loans" l ON l."Row ID"=c."Ref Loans"
   CROSS JOIN clock
   CROSS JOIN LATERAL (
    SELECT coalesce(sum(r."Principal Paid"::numeric),0) AS principal,
     coalesce(sum(r."Interest Paid"::numeric),0) AS interest,
     count(*) FILTER(WHERE r."Principal Paid" IS NULL OR r."Interest Paid" IS NULL) AS invalid
    FROM public."Repayments" r WHERE r."Ref Charges"=c."Row ID"
   ) paid
   WHERE l."Ref Borrowers"=$1 AND CASE WHEN $2::text IS NULL THEN c."Charge Date"<=clock.day ELSE c."Row ID"=$2 END
  )
  SELECT (SELECT day::text FROM clock) AS "paymentDate",sum(principal+interest)::text AS "amountReceived",
   coalesce(bool_or(principal IS NULL OR interest IS NULL OR principal<0 OR interest<0 OR invalid>0),false) AS invalid,
   EXISTS(SELECT 1 FROM public."Payments" p WHERE p."Ref Borrower"=$1 AND p."Status" IN('Processing','Error')) AS blocked
  FROM balances`,[source.borrowerId,targetChargeId])).rows[0];
  if(row?.invalid!==false||row.blocked!==false||typeof row.amountReceived!=='string'
   ||!/^\d+(?:\.0+)?$/.test(row.amountReceived))return {quickPayment:null};
  const amount=BigInt(row.amountReceived.split('.')[0]);
  if(amount<=0n||amount>92233720368547758n)return {quickPayment:null};
  return {quickPayment:{borrowerId:source.borrowerId,amountReceived:amount.toString(),paymentDate:row.paymentDate,
   allocationMethod:targetChargeId===null?'Receive All':'Single Full',targetChargeId,targetLoanId:null}};
 }
 if(resource==='Payment Allocations'){
  const parent=(await client.query(`SELECT p."Row ID" AS id,p."Status" AS status,
   public.pwa_payment_version_v2(p."Row ID") AS version,
   public.pwa_payment_head_v2(p."Row ID")::text AS "predecessorRequestId"
   FROM public."Payment Allocations" a JOIN public."Payments" p ON p."Row ID"=a."Ref Payment"
   WHERE a."Row ID"=$1`,[id])).rows[0];
  return {allocationParent:parent??null};
 }
 if(resource==='Payments'){
  const row=(await client.query(`SELECT public.pwa_payment_head_v2($1)::text AS "predecessorRequestId",public.pwa_effective_payment_plan_v2($1) AS provenance`,[id])).rows[0];
  return {kind:row.provenance?'pwa-plan':'legacy-source',predecessorRequestId:row.predecessorRequestId,plan:row.provenance?.plan??null};
 }
 if(resource==='Cash Statement Context'){
  return (await client.query(`SELECT p."Row ID" AS "partnerId",p."Language Preference" AS language,public.pwa_preference_version_v2(p."Row ID") AS version FROM public."Partners" p WHERE p."Row ID"=$1`,[actor.partnerId])).rows[0];
 }
 if(resource==='Loan Assessment'){
  return (await client.query(`SELECT "Assessment ID" AS "assessmentId","SQL Forecast Start"::text AS "forecastStart","SQL Forecast End"::text AS "forecastEnd" FROM public."Loan Assessment SQL Lab View" WHERE "Row ID"=$1`,[id])).rows[0];
 }
 if(resource==='Loans'){
  await client.query('SAVEPOINT native_close_preview');
  try{
   const row=(await client.query("SELECT public.loan_close_calculation_v83($1,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date) AS value",[id])).rows[0];
   await client.query('RELEASE SAVEPOINT native_close_preview');
   const {sourceVersion,businessDate,amount,planHash}=row.value;
   return {close:{sourceVersion,businessDate,amount,planHash}};
  }catch(error){
   await client.query('ROLLBACK TO SAVEPOINT native_close_preview');
   await client.query('RELEASE SAVEPOINT native_close_preview');
   if(error.code==='P0001')return {close:null};
   throw error;
  }
 }
 return null;
}
