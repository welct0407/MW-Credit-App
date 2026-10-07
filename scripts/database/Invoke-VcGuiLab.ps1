[CmdletBinding()]
param([ValidateSet('seed','verify','close')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT "Row ID","Loan Status","Total Principal Received","Total Interest Received","Outstanding Principal","Expected Daily Interest Amount" FROM "Loans" WHERE "Row ID" LIKE 'VCGUI14-%' ORDER BY "Row ID";
SELECT "Row ID","Principal Paid","Interest Paid","Amount Remaining","Payment Count","Payment Status","Payment Date" FROM "Charges" WHERE "Ref Loans" LIKE 'VCGUI14-%' ORDER BY "Row ID";
SELECT "Status","Amount Received"::numeric,"Planned Allocation Amount","Posted Amount" FROM "Payments" WHERE "Ref Borrower"='VCGUI14-B' ORDER BY "Created At";
SELECT "Total Number of Loans","Total Interest Earned","Total Amount Loaned","Total Outstanding Principal","Active Loan Interest Earned","Active Daily Interest","Has Closed Loan","Has Active Loan" FROM "Borrowers" WHERE "Row ID"='VCGUI14-B';
'@
if($Mode -eq 'seed'){$sql=@'
BEGIN;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
VALUES('VCGUI14-B','DEV VC Rollup Test','Synthetic materialized rollup verification','DEV VC Rollup Test',current_date,false,false);
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Transfer Fee","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Defaulted","Created By")
SELECT 'VCGUI14-'||n,'VCGUI14-B',current_date-5,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,0::money,0::money,0::money,1,false,'welct0407@mw-credit.com'
FROM unnest(ARRAY['Paid','Default']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
SELECT 'VCGUI14-'||n||'-C','VCGUI14-'||n,current_date,100::money,20::money,'Synthetic VC materialization test'
FROM unnest(ARRAY['Paid','Default']) n;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Ref Borrowers"='VCGUI14-B';
COMMIT;
'@}
if($Mode -eq 'close'){$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers"='VCGUI14-B';
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID"='VCGUI14-B';
COMMIT;
'@}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'verify'){'-c timezone=Asia/Bangkok -c default_transaction_read_only=on'}else{'-c timezone=Asia/Bangkok'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'VC GUI lab failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
