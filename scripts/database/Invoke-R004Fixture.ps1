[CmdletBinding()]
param([ValidateSet('seed','verify')][string]$Mode='verify')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'DEV-only fixture'}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=if($Mode -eq 'seed'){@'
BEGIN;
SET LOCAL TIME ZONE 'Asia/Bangkok';
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Hidden Flag","AI Collection Enabled") VALUES('R004-REF','R004 SYNTHETIC REFERRER',true,false);
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Hidden Flag","AI Collection Enabled","Ref Referrer") VALUES('R004-B','R004 SYNTHETIC BORROWER',true,false,'R004-REF');
INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type","Auto Charge Enabled","Loan Arrangement") VALUES('R004-L','R004-B',current_date-1,100::money,'ยังไม่ปิดยอด','กำหนดวันชำระ',false,'R004 translation fixture');
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due") VALUES('R004-C','R004-L',current_date,100::money,100::money);
INSERT INTO public."Payments"("Row ID","Ref Borrower","Ref Target Charge","Payment Date","Amount Received","Allocation Method","Status") VALUES('R004-P','R004-B','R004-C',current_date,200::money,'Single Full','Processing');
SET CONSTRAINTS ALL IMMEDIATE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public."Business Expenses" WHERE "Row ID"='rr1:R004-L' AND "Expense Category"='Referral Rebate / เงินคืนค่าแนะนำลูกค้า' AND "Amount"::numeric=10 AND "Source Type"='Referral Rebate') THEN RAISE EXCEPTION 'R004 automatic category failed'; END IF;
END $$;
COMMIT;
'@}else{@'
BEGIN READ ONLY;
SELECT json_build_object('kind','automatic','category',"Expense Category",'source',"Source Type",'amount',"Amount"::numeric,'allocation_balances',"Partner A Expense"+"Partner B Expense"="Amount") FROM public."Business Expenses" WHERE "Row ID"='rr1:R004-L';
SELECT json_build_object('kind','manual','category',"Expense Category",'source',"Source Type",'amount',"Amount"::numeric,'allocation_balances',"Partner A Expense"+"Partner B Expense"="Amount") FROM public."Business Expenses" WHERE "Notes"='R004 manual dropdown test';
COMMIT;
'@}
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R004 fixture failed'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
