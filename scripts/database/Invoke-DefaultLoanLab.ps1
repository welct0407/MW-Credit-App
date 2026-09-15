[CmdletBinding()]
param([ValidateSet('seed','verify','close')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$sql=@'
SELECT l."Row ID",l."Defaulted",l."Default Loss Amount"::numeric,l."Loan Status",l."Close Date",
 (SELECT count(*) FROM "Charges" c WHERE c."Ref Loans"=l."Row ID") charges,
 (SELECT sum(r."Principal Paid"::numeric) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID") principal_posted,
 (SELECT sum(r."Principal Paid"::numeric+r."Interest Paid"::numeric) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID") cash,
 (SELECT count(*) FROM "Repayments" r WHERE r."Ref Loans"=l."Row ID" AND r."Row ID" LIKE 'df10:%') loss_entries
FROM "Loans" l WHERE l."Row ID" LIKE 'DF10GUI-%' ORDER BY l."Row ID";
SELECT "Row ID","Principal Due"::numeric,"Interest Due"::numeric,"Notes" LIKE '%original_principal%' audit_note
FROM "Charges" WHERE "Ref Loans" LIKE 'DF10GUI-%' ORDER BY "Row ID";
'@
if($Mode -eq 'seed'){$sql=@'
BEGIN;
INSERT INTO "Borrowers"("Row ID","Borrower Name","Description","Communication Name","Creation Date","Hidden Flag","AI Collection Enabled")
SELECT 'DF10GUI-'||n,'DEV Default '||n,'Synthetic phase 6 default test','DEV Default '||n,current_date,false,false
FROM unnest(ARRAY['Unpaid','Partial','Fixed','Installment']) n;
INSERT INTO "Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Type","Loan Status","Current Daily Interest","Auto Charge Enabled","Transfer Fee","Fixed Interest","Daily Payment Amount","Interest Payment Interval","Due Date","Defaulted","Created By")
SELECT 'DF10GUI-'||n||'-L','DF10GUI-'||n,current_date-5,
 (CASE n WHEN 'Fixed' THEN 110 WHEN 'Installment' THEN 103 ELSE 100 END)::money,
 CASE n WHEN 'Fixed' THEN 'กำหนดวันชำระ' WHEN 'Installment' THEN 'ผ่อนชำระรายวัน' ELSE 'ดอกเบี้ยรายวัน' END,
 'ยังไม่ปิดยอด',10::money,false,0::money,30::money,15::money,1,current_date+5,false,'welct0407@mw-credit.com'
FROM unnest(ARRAY['Unpaid','Partial','Fixed','Installment']) n;
INSERT INTO "Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes") VALUES
('DF10GUI-Unpaid-C','DF10GUI-Unpaid-L',current_date-2,20::money,10::money,'Preserve synthetic note'),
('DF10GUI-Partial-C','DF10GUI-Partial-L',current_date-2,50::money,20::money,NULL),
('DF10GUI-Installment-C','DF10GUI-Installment-L',current_date-2,11::money,4::money,NULL);
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Created By")
VALUES('DF10GUI-Partial-P','DF10GUI-Partial','DF10GUI-Partial-C',30::money,current_date-1,'Single Partial','Processing','welct0407@mw-credit.com');
INSERT INTO "Payments"("Row ID","Ref Borrower","Ref Target Charge","Amount Received","Payment Date","Allocation Method","Status","Created By")
VALUES('DF10GUI-Installment-P','DF10GUI-Installment','DF10GUI-Installment-C',15::money,current_date-1,'Single Full','Processing','welct0407@mw-credit.com');
UPDATE "Loans" SET "Auto Charge Enabled"=true WHERE "Row ID" LIKE 'DF10GUI-%';
COMMIT;
'@}
if($Mode -eq 'close'){$sql=@'
BEGIN;
UPDATE "Loans" SET "Auto Charge Enabled"=false WHERE "Row ID" LIKE 'DF10GUI-%';
UPDATE "Borrowers" SET "Hidden Flag"=true WHERE "Row ID" LIKE 'DF10GUI-%';
COMMIT;
'@}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $env:PGOPTIONS=if($Mode -eq 'verify'){'-c timezone=Asia/Bangkok -c default_transaction_read_only=on'}else{'-c timezone=Asia/Bangkok'}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Default lab SQL failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
