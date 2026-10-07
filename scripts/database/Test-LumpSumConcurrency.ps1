param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$setup=@'
INSERT INTO "Borrowers" ("Row ID","Borrower Name") VALUES ('LS-CON','SYNTHETIC CONCURRENCY'),('LS-CON2','SYNTHETIC INDEPENDENT');
INSERT INTO "Loans" ("Row ID","Ref Borrowers") VALUES ('LS-CON-L','LS-CON'),('LS-CON-L2','LS-CON2');
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due") VALUES ('LS-CON-C','LS-CON-L',current_date,100::money,0::money),('LS-CON-C2','LS-CON-L2',current_date,100::money,0::money);
'@
$setup | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency fixture failed'}
$first=@'
BEGIN;
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('LS-CON-P1','LS-CON',70::money,current_date,'Processing','Lump Sum');
-- V4 preserves this transition for AppSheet; emulate it within the lock test.
UPDATE "Payments" SET "Status"='Posted' WHERE "Row ID"='LS-CON-P1' AND "Status"='Processing';
\echo LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'concurrent-first.sql'
[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'concurrent-first.out';$err=Join-Path $OutputDirectory 'concurrent-first.err'
$process=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not ((Get-Content $out -Raw -ErrorAction SilentlyContinue) -match 'LOCK_READY')) {
  if($process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'First session failed to reach lock barrier'}
  Start-Sleep -Milliseconds 50
}
$independent=@'
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('LS-CON-OTHER','LS-CON2',70::money,current_date,'Processing','Lump Sum');
UPDATE "Payments" SET "Status"='Posted' WHERE "Row ID"='LS-CON-OTHER' AND "Status"='Processing';
'@
$timer=[Diagnostics.Stopwatch]::StartNew()
$independent | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
$timer.Stop()
if($LASTEXITCODE -or $process.HasExited){throw 'Different borrower did not complete independently while first lock was held'}
$competing=@'
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('LS-CON-P2','LS-CON',70::money,current_date,'Processing','Lump Sum');
'@
$result=$competing | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'exceeds the current eligible outstanding'){throw 'Competing overpayment was not rejected after balance refresh'}
$process.WaitForExit()
if($process.ExitCode){throw 'First concurrent receipt failed'}
$check=@'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='LS-CON'),'one successful competing receipt';
 ASSERT (SELECT sum("Interest Paid"::numeric)=70 FROM "Repayments" WHERE "Ref Charges"='LS-CON-C'),'no over-allocation';
 ASSERT NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='LS-CON-P2'),'failed concurrent plan rolled back';
END $$;
'@
$check | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency assertions failed'}
[pscustomobject]@{competingOverpaymentRejected=$true;independentBorrowerCompletedBeforeLockRelease=$true;independentMilliseconds=$timer.Elapsed.TotalMilliseconds}
