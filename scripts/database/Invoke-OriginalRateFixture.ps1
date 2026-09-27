[CmdletBinding()]
param([ValidateSet('seed','prepare-charge','state','retire')][string]$Mode='state')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$bin=Get-PgBin
$query=switch($Mode) {
 'seed' { @'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'DEV only'; END IF;
 IF EXISTS(SELECT 1 FROM public."Borrowers" WHERE "Row ID"='R048-DI-B') THEN RAISE EXCEPTION 'Fixture already exists; inspect state'; END IF;
END $$;
INSERT INTO public."Cash Accounts"("Row ID","Ref Cash Holder","Account Label","Bank Name")
 VALUES('R048-DI-ACCOUNT','ch:lisa','R048 synthetic interest test','Synthetic');
INSERT INTO public."Borrowers"("Row ID","Borrower Name","Description","Creation Date","Hidden Flag")
 VALUES('R048-DI-B','R048 SYNTHETIC INTEREST TEST','R048 synthetic fixture; no real borrower',current_date,false);
COMMIT;
'@ }
 'prepare-charge' { @'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'DEV only'; END IF;
 IF (SELECT count(*) FROM public."Loans" WHERE "Ref Borrowers"='R048-DI-B')<>1 OR
 NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Ref Borrowers"='R048-DI-B' AND "Principal Amount"::numeric=1000
 AND "Current Daily Interest"::numeric=5 AND "Original Daily Interest Rate"=1 AND "Outstanding Principal"=1000)
 THEN RAISE EXCEPTION 'Expected one GUI-created synthetic loan with rounded 1 percent rate'; END IF;
END $$;
INSERT INTO public."Charges"("Row ID","Ref Loans","Charge Date","Principal Due","Interest Due","Notes")
 SELECT 'R048-DI-C',"Row ID",current_date,1000::money,5::money,'R048 SYNTHETIC GUI TEST'
 FROM public."Loans" WHERE "Ref Borrowers"='R048-DI-B';
COMMIT;
'@ }
 'retire' { @'
BEGIN;
DO $$ BEGIN
 IF current_database()<>'loan_manager_dev' THEN RAISE EXCEPTION 'DEV only'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public."Loans" WHERE "Ref Borrowers"='R048-DI-B'
   AND "Original Daily Interest Rate"=1 AND "Outstanding Principal"=0)
 THEN RAISE EXCEPTION 'Fixture must be fully repaid before retirement'; END IF;
END $$;
UPDATE public."Loans" SET "Auto Charge Enabled"=false WHERE "Ref Borrowers"='R048-DI-B';
UPDATE public."Borrowers" SET "Hidden Flag"=true WHERE "Row ID"='R048-DI-B';
UPDATE public."Cash Accounts" SET "Active"=false WHERE "Row ID"='R048-DI-ACCOUNT';
COMMIT;
'@ }
 'state' { @'
SELECT json_build_object('fixture','R048 synthetic only','loan_id',"Row ID",'principal',"Principal Amount"::numeric,
 'outstanding',"Outstanding Principal",'daily',"Current Daily Interest"::numeric,
 'original_rate',"Original Daily Interest Rate",'status',"Loan Status",'auto_charge',"Auto Charge Enabled")
 FROM public."Loans" WHERE "Ref Borrowers"='R048-DI-B';
SELECT json_build_object('payments',count(*),'posted',count(*) FILTER(WHERE "Status"='Posted'),
 'amount',sum("Amount Received"::numeric)) FROM public."Payments" WHERE "Ref Borrower"='R048-DI-B';
'@ }
}
$savedPassword=$env:PGPASSWORD
$savedSsl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require'
 $query | & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R048 DEV fixture command failed'}
} finally {$env:PGPASSWORD=$savedPassword;$env:PGSSLMODE=$savedSsl}
