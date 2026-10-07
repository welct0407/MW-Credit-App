[CmdletBinding()]
param([ValidateSet('dryrun','seed','verify','close')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT l."Row ID",l."Charge Generation Request",l."Auto Charge Enabled",c."Row ID" AS charge,c."Charge Date",c."Principal Due"::numeric,c."Interest Due"::numeric
FROM "Loans" l LEFT JOIN "Charges" c ON c."Ref Loans"=l."Row ID"
WHERE l."Ref Borrowers" LIKE 'CG8GUI-%' ORDER BY l."Row ID",c."Charge Date";
'@
if($Mode -eq 'dryrun'){$sql=@'
BEGIN;
SELECT public.generate_due_charges((statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) AS would_generate;
ROLLBACK;
'@}
if($Mode -eq 'seed'){$sql=@'
BEGIN;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'CG8GUI-'||n,'DEV Charge Generation '||n,'Synthetic phases 4-5 generation test','DEV Charge Generation '||n,current_date,false,false
FROM unnest(ARRAY['Daily','Installment','Fixed','OffDay','Cron']) n;
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Transfer Fee","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Interest Schedule Anchor Date","Defaulted","Created By")
VALUES
('CG8GUI-Daily-L','CG8GUI-Daily',current_date-6,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,0::money,0::money,0::money,3,NULL,current_date-3,false,'welct0407@mw-credit.com'),
('CG8GUI-Installment-L','CG8GUI-Installment',current_date-2,103::money,'ผ่อนชำระรายวัน','ยังไม่ปิดยอด',0::money,false,0::money,0::money,15::money,2,current_date+7,NULL,false,'welct0407@mw-credit.com'),
('CG8GUI-Fixed-L','CG8GUI-Fixed',current_date-4,100::money,'กำหนดวันชำระ','ยังไม่ปิดยอด',0::money,false,0::money,30::money,0::money,1,current_date,NULL,false,'welct0407@mw-credit.com'),
('CG8GUI-OffDay-L','CG8GUI-OffDay',current_date-6,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,0::money,0::money,0::money,3,NULL,current_date-2,false,'welct0407@mw-credit.com'),
('CG8GUI-Cron-L','CG8GUI-Cron',current_date-2,100::money,'ดอกเบี้ยรายวัน','ยังไม่ปิดยอด',10::money,false,0::money,0::money,0::money,1,NULL,NULL,false,'welct0407@mw-credit.com');
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES
('CG8GUI-Daily-C','CG8GUI-Daily-L',current_date-5,0::money,10::money),
('CG8GUI-Installment-C','CG8GUI-Installment-L',current_date-2,11::money,4::money);
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Ref Borrowers" LIKE 'CG8GUI-%' AND "Row ID"<>'CG8GUI-Cron-L';
COMMIT;
'@}
if($Mode -eq 'close'){$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers" LIKE 'CG8GUI-%';
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" LIKE 'CG8GUI-%';
COMMIT;
'@}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'verify'){'-c timezone=Asia/Bangkok -c default_transaction_read_only=on'}else{'-c timezone=Asia/Bangkok'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Charge generation lab SQL failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
