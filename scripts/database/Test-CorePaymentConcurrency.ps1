param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$setup=@'
INSERT INTO "Borrowers" ("Row ID","Borrower Name") VALUES ('CP6-CON','SYNTHETIC CONCURRENCY'),('CP6-CON2','SYNTHETIC INDEPENDENT');
INSERT INTO "Loans" ("Row ID","Ref Borrowers") VALUES ('CP6-CON-L','CP6-CON'),('CP6-CON-L2','CP6-CON2');
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due") VALUES ('CP6-CON-C','CP6-CON-L',current_date,100::money,0::money),('CP6-CON-C2','CP6-CON-L2',current_date,100::money,0::money);
'@
$setup | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency fixture failed'}
$first=@'
BEGIN;
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CP6-CON-P1','CP6-CON',70::money,current_date,'Processing','Lump Sum');
-- V6 posts before INSERT returns; this conditional update must affect zero rows.
UPDATE "Payments" SET "Status"='Posted' WHERE "Row ID"='CP6-CON-P1' AND "Status"='Processing';
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
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CP6-CON-OTHER','CP6-CON2',70::money,current_date,'Processing','Lump Sum');
UPDATE "Payments" SET "Status"='Posted' WHERE "Row ID"='CP6-CON-OTHER' AND "Status"='Processing';
'@
$timer=[Diagnostics.Stopwatch]::StartNew()
$independent | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
$timer.Stop()
if($LASTEXITCODE -or $process.HasExited){throw 'Different borrower did not complete independently while first lock was held'}
$competing=@'
INSERT INTO "Payments" ("Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CP6-CON-P2','CP6-CON',70::money,current_date,'Processing','Lump Sum');
'@
$result=$competing | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'current eligible balance'){throw 'Competing overpayment was not rejected after balance refresh'}
$process.WaitForExit()
if($process.ExitCode){throw 'First concurrent receipt failed'}
$check=@'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='CP6-CON'),'one successful competing receipt';
 ASSERT (SELECT sum("Interest Paid"::numeric)=70 FROM "Repayments" WHERE "Ref Charges"='CP6-CON-C'),'no over-allocation';
 ASSERT NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-CON-P2'),'failed concurrent plan rolled back';
END $$;
'@
$check | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency assertions failed'}
[pscustomobject]@{competingOverpaymentRejected=$true;independentBorrowerCompletedBeforeLockRelease=$true;independentMilliseconds=$timer.Elapsed.TotalMilliseconds}
