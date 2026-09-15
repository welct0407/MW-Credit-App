[CmdletBinding()]
param([ValidateSet('seed','verify','prepare-close','close')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT p."Row ID",p."Allocation Method",p."Amount Received"::numeric,p."Status",
 (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Payment"=p."Row ID") AS ledger,
 (SELECT count(*) FROM "Payment Allocations" a WHERE a."Ref Payment"=p."Row ID") AS allocations
FROM "Payments" p WHERE p."Ref Borrower" LIKE 'CP6GUI-%' ORDER BY p."Created At";
SELECT l."Row ID",l."Loan Status",l."Ref Closing Payment",l."Principal Amount"::numeric,l."Auto Charge Enabled",l."Loan Type",l."Daily Payment Amount"::numeric,
 (SELECT count(*) FROM "Charges" c WHERE c."Ref Loans"=l."Row ID") AS charges,
 (SELECT sum(r."Principal Paid"::numeric) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID") AS principal_paid
FROM "Loans" l WHERE l."Ref Borrowers" LIKE 'CP6GUI-%' ORDER BY l."Row ID";
'@
if($Mode -eq 'seed'){
$sql=@'
BEGIN;
INSERT INTO "Borrowers" ("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'CP6GUI-'||n,'DEV Core Payment '||n,'Synthetic phases 1-3 GUI regression','DEV Core Payment '||n,current_date,false,false
FROM unnest(ARRAY['Single','All','Lump','Close','FirstDay']) n;
INSERT INTO "Loans" ("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Current Daily Interest","Fixed Interest","Transfer Fee","Daily Payment Amount","Interest Payment Interval","Auto Charge Enabled","Defaulted","Created By")
SELECT 'CP6GUI-'||n||'-L'||i,'CP6GUI-'||n,current_date-5,100,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',10,0,0,0,1,false,false,'welct0407@mw-credit.com'
FROM unnest(ARRAY['Single','All','Lump','Close']) n CROSS JOIN generate_series(1,2) i;
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due","Notes")
SELECT 'CP6GUI-'||n||'-C'||i,'CP6GUI-'||n||'-L'||i,current_date-i,20,CASE WHEN n='Close' THEN 0 ELSE 100 END,'Synthetic phases 1-3 GUI regression'
FROM unnest(ARRAY['Single','All','Lump','Close']) n CROSS JOIN generate_series(1,2) i;
COMMIT;
'@
}
if($Mode -eq 'prepare-close'){
# Correct only unposted synthetic setup to the ordinary daily-loan pattern:
# historical interest charges; principal is introduced by the existing Close Loan action.
$sql=@'
BEGIN;
UPDATE "Charges" c SET "Principal Due"=0
WHERE c."Row ID" IN ('CP6GUI-Close-C1','CP6GUI-Close-C2')
AND NOT EXISTS(SELECT 1 FROM "Repayments" r WHERE r."Ref Charges"=c."Row ID");
UPDATE "Loans" l SET "Auto Charge Enabled"=true
WHERE l."Row ID" IN ('CP6GUI-Close-L1','CP6GUI-Close-L2')
AND NOT EXISTS(SELECT 1 FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID");
COMMIT;
'@
}
if($Mode -eq 'close'){
$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers" IN ('CP6GUI-Single','CP6GUI-All','CP6GUI-Lump','CP6GUI-Close','CP6GUI-FirstDay');
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" IN ('CP6GUI-Single','CP6GUI-All','CP6GUI-Lump','CP6GUI-Close','CP6GUI-FirstDay');
COMMIT;
'@
}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 if($Mode -eq 'verify'){$env:PGOPTIONS='-c default_transaction_read_only=on'}else{$env:PGOPTIONS=''}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -h $target.host -U $target.user -d $target.database -v ON_ERROR_STOP=1
 if($LASTEXITCODE){throw 'Development core payment lab SQL failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
