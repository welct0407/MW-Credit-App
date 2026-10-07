[CmdletBinding()]
param([ValidateSet('seed','verify','fix','close')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=switch($Mode){
 'seed' {@'
BEGIN;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'MJ11GUI-'||n,'DEV Monitored Charges '||n,'Synthetic scheduler monitoring test','DEV Monitored Charges '||n,current_date,false,false FROM unnest(ARRAY['Success','Error']) n;
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Transfer Fee","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Defaulted","Created By")
SELECT 'MJ11GUI-'||n||'-L','MJ11GUI-'||n,current_date-4,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',0::money,false,0::money,
 (CASE WHEN n='Success' THEN 25 ELSE -1 END)::money,0::money,1,current_date,false,'welct0407@mw-credit.com'
FROM unnest(ARRAY['Success','Error']) n;
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" IN ('MJ11GUI-Success-L','MJ11GUI-Error-L');
COMMIT;
'@}
 'fix' {'UPDATE "Loans" SET "Fixed Interest"=30::money WHERE "Row ID"=''MJ11GUI-Error-L'' AND "Fixed Interest"=(-1)::money;'}
 'close' {@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID" IN ('MJ11GUI-Success-L','MJ11GUI-Error-L');
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" IN ('MJ11GUI-Success','MJ11GUI-Error');
COMMIT;
'@}
 'verify' {''}
}
$sql+=@'

SELECT row_to_json(t) FROM (SELECT l."Row ID",l."Charge Generation Request",l."Auto Charge Enabled",c."Row ID" AS charge,c."Charge Date",c."Principal Due"::numeric,c."Interest Due"::numeric FROM "Loans" l LEFT JOIN "Charges" c ON c."Ref Loans"=l."Row ID" WHERE l."Row ID" IN ('MJ11GUI-Success-L','MJ11GUI-Error-L') ORDER BY l."Row ID",c."Charge Date") t;
'@
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'verify'){'-c timezone=Asia/Bangkok -c default_transaction_read_only=on'}else{'-c timezone=Asia/Bangkok'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Monitored charge lab failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
