[CmdletBinding()]
param([ValidateSet('seed','verify','close')][string]$Mode='verify',[switch]$Final)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT p."Row ID",p."Allocation Method",p."Ref Target Loan",p."Amount Received"::numeric,p."Status",
 (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID") AS ledger
FROM "Payments" p WHERE p."Ref Borrower" LIKE 'AC7GUI-%' ORDER BY p."Created At";
SELECT l."Row ID",l."Loan Status",l."Ref Closing Payment",l."Auto Charge Enabled",
 (SELECT count(*) FROM "Charges" c WHERE c."Ref Loans"=l."Row ID") AS charges,
 (SELECT sum(r."Principal Paid"::numeric) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID") AS principal_paid,
 (SELECT sum(r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID") AS interest_paid
FROM "Loans" l WHERE l."Ref Borrowers" LIKE 'AC7GUI-%' ORDER BY l."Row ID";
'@
if($Mode -eq 'seed'){$sql=@'
BEGIN;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'AC7GUI-'||n,'DEV Atomic Close '||n,'Synthetic V7 final-charge regression','DEV Atomic Close '||n,current_date,false,false
FROM unnest(ARRAY['Old','None','Same','Part']) n;
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Transfer Fee","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Defaulted","Created By")
SELECT 'AC7GUI-'||n||'-L','AC7GUI-'||n,CASE WHEN n='Same' THEN current_date ELSE current_date-5 END,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,0::money,0::money,0::money,1,false,'welct0407@mw-credit.com'
FROM unnest(ARRAY['Old','None','Same','Part']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
('AC7GUI-Old-C','AC7GUI-Old-L',current_date-1,0::money,20::money,'Synthetic V7 original charge'),
('AC7GUI-Part-C','AC7GUI-Part-L',current_date,100::money,20::money,'Synthetic V7 partial-payment charge');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Ref Borrowers" LIKE 'AC7GUI-%';
COMMIT;
'@}
if($Mode -eq 'close'){$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers" LIKE 'AC7GUI-%';
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" LIKE 'AC7GUI-%';
COMMIT;
'@}
if($Final){$sql+=@'
DO $$ BEGIN
ASSERT (SELECT count(*)=4 FROM "Payments" WHERE "Ref Borrower" LIKE 'AC7GUI-%' AND "Allocation Method"='Loan Close' AND "Status"='Posted'),'four posted GUI close commands';
ASSERT (SELECT sum("Amount Received"::numeric)=450 FROM "Payments" WHERE "Ref Borrower" LIKE 'AC7GUI-%' AND "Allocation Method"='Loan Close'),'close receipt sum 450';
ASSERT (SELECT count(*)=4 FROM "Loans" WHERE "Ref Borrowers" LIKE 'AC7GUI-%' AND "Loan Status"='ปิดยอดแล้ว' AND "Ref Closing Payment" IS NOT NULL),'four causal closures';
ASSERT (SELECT sum("Principal Paid"::numeric)=400 AND sum("Interest Paid"::numeric)=100 FROM "Repayments" WHERE "Ref Loans" LIKE 'AC7GUI-%'),'total principal 400 and interest 100 including partial receipt';
ASSERT NOT EXISTS(SELECT 1 FROM "Payments" p WHERE p."Ref Borrower" LIKE 'AC7GUI-%' AND p."Amount Received"::numeric IS DISTINCT FROM (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID")),'all GUI receipts reconcile';
END $$;
'@}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'verify'){'-c timezone=Asia/Bangkok -c default_transaction_read_only=on'}else{'-c timezone=Asia/Bangkok'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Atomic close lab SQL failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
