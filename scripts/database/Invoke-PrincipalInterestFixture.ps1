[CmdletBinding()]
param([ValidateSet('seed','state','retire')][string]$Mode='state')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$bin=Get-PgBin
$query=switch($Mode) {
 'seed' { @'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'DEV only'; END IF;
 IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"='R036-DI-B') THEN RAISE EXCEPTION 'Fixture already exists; inspect state'; END IF;
END $$;
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name")
 VALUES('R036-DI-ACCOUNT','ch:lisa','R036 synthetic interest test','Synthetic');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Creation Date","Hidden Flag")
 VALUES('R036-DI-B','R036 SYNTHETIC INTEREST TEST','R036 synthetic fixture; no real borrower',current_date,false);
INSERT INTO public."Loans"("Row ID","Ref Borrowers","Loan Date","Principal Amount","Loan Status","Loan Type",
 "Current Daily Interest","Transfer Fee","Interest Payment Interval","Auto Charge Enabled","Loan Arrangement","Created By","Ref Disbursed From Cash Account")
 VALUES('R036-DI-L','R036-DI-B',current_date-1,1000::money,'ยังไม่ปิดยอด','ดอกเบี้ยรายวัน',10::money,0::money,1,false,
 'R036 SYNTHETIC GUI TEST; no real lending','welct0407@mw-credit.com','R036-DI-ACCOUNT');
UPDATE public."Loans" SET "Auto Charge Enabled"=true WHERE "Row ID"='R036-DI-L';
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
 VALUES('R036-DI-C','R036-DI-L',current_date,1000::money,10::money,'R036 SYNTHETIC GUI TEST');
COMMIT;
'@ }
 'retire' { @'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'DEV only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Row ID"='R036-DI-L' AND "Ref Borrowers"='R036-DI-B'
   AND "Loan Arrangement" LIKE 'R036 SYNTHETIC GUI TEST%' AND "Outstanding Principal"=0)
 THEN RAISE EXCEPTION 'Fixture must be fully repaid before retirement'; END IF;
END $$;
UPDATE public."Loans" SET "Auto Charge Enabled"=false WHERE "Row ID"='R036-DI-L';
UPDATE public."Borrowers" SET "Hidden Flag"=true WHERE "Row ID"='R036-DI-B';
UPDATE public."Cash Accounts" SET "Active"=false WHERE "Row ID"='R036-DI-ACCOUNT';
COMMIT;
'@ }
 'state' { @'
SELECT json_build_object('fixture','R036 synthetic only','principal',"Principal Amount"::numeric,
 'outstanding',"Outstanding Principal",'daily',"Current Daily Interest"::numeric,
 'expected_daily',"Expected Daily Interest Amount",'basis',public.daily_interest_basis("Loan Arrangement"),
 'status',"Loan Status",'auto_charge',"Auto Charge Enabled")
 FROM public."Loans" WHERE "Row ID"='R036-DI-L' AND "Ref Borrowers"='R036-DI-B';
SELECT json_build_object('payments',count(*),'posted',count(*) FILTER(WHERE "Status"='Posted'),
 'amount',sum("Amount Received"::numeric)) FROM public."Payments" WHERE "Ref Borrower"='R036-DI-B';
'@ }
}
$savedPassword=$env:PGPASSWORD
$savedSsl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require'
 $query | & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R036 DEV fixture command failed'}
} finally {$env:PGPASSWORD=$savedPassword;$env:PGSSLMODE=$savedSsl}
