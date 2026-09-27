param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
& (Join-Path $PgBin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash-account fixture failed'}
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$setup=@'
INSERT INTO "Borrowers" ("Row ID","Borrower Name") VALUES ('CP6-CON','SYNTHETIC CONCURRENCY'),('CP6-CON2','SYNTHETIC INDEPENDENT');
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('CP6-CON-PARTNER','A');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES('CP6-CON-CAPITAL','CP6-CON-PARTNER',current_date,'Contribution',1000::money);
INSERT INTO "Loans"("Loan Date","Ref Disbursed From Cash Account","Row ID","Ref Borrowers","Principal Amount") VALUES (current_date,'CI-LISA','CP6-CON-L','CP6-CON',100::money),(current_date,'CI-LISA','CP6-CON-L2','CP6-CON2',100::money);
INSERT INTO "Charges" ("Row ID","Ref Loans","Charge Date","Interest Due","Principal Due") VALUES ('CP6-CON-C','CP6-CON-L',current_date,100::money,0::money),('CP6-CON-C2','CP6-CON-L2',current_date,100::money,0::money);
'@
$setup | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency fixture failed'}
$first=@'
BEGIN;
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CI-DAD','CP6-CON-P1','CP6-CON',70::money,current_date,'Processing','Lump Sum');
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
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CI-DAD','CP6-CON-OTHER','CP6-CON2',70::money,current_date,'Processing','Lump Sum');
UPDATE "Payments" SET "Status"='Posted' WHERE "Row ID"='CP6-CON-OTHER' AND "Status"='Processing';
'@
$timer=[Diagnostics.Stopwatch]::StartNew()
$independentResult=$independent | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
$timer.Stop()
if($LASTEXITCODE -eq 0 -or ($independentResult -join "`n") -notmatch 'Cashpool is busy'){throw 'Concurrent repayment did not fail safely behind the R002 cashpool lock'}
if($timer.Elapsed.TotalSeconds -ge 2){throw 'Concurrent repayment waited instead of failing promptly behind the cashpool lock'}
$competing=@'
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method") VALUES ('CI-DAD','CP6-CON-P2','CP6-CON',70::money,current_date,'Processing','Lump Sum');
'@
$result=$competing | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'current eligible balance'){throw 'Competing overpayment was not rejected after balance refresh'}
$process.WaitForExit()
if($process.ExitCode){throw 'First concurrent receipt failed'}
$independent | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Different borrower retry failed after cashpool lock release'}
$check=@'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Ref Borrower"='CP6-CON'),'one successful competing receipt';
 ASSERT (SELECT sum("Interest Paid"::numeric)=70 FROM "Repayments" WHERE "Ref Charges"='CP6-CON-C'),'no over-allocation';
 ASSERT NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-CON-P2'),'failed concurrent plan rolled back';
END $$;
'@
$check | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Concurrency assertions failed'}
[pscustomobject]@{competingOverpaymentRejected=$true;cashpoolLockFailsPromptly=$true;differentBorrowerRetrySucceeded=$true;busyMilliseconds=$timer.Elapsed.TotalMilliseconds}

# R047: two collectors submit the same explicit remaining-charge set.
$selectedFirst=@'
BEGIN;
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Selected Charge IDs")
VALUES ('CI-DAD','CP6-SELECT-P1','CP6-CON',30::money,current_date,'Processing','Selected Charges','CP6-CON-C');
\echo SELECT_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$selectedFile=Join-Path $OutputDirectory 'selected-concurrent-first.sql'
[IO.File]::WriteAllText($selectedFile,$selectedFirst,[Text.UTF8Encoding]::new($false))
$selectedOut=Join-Path $OutputDirectory 'selected-concurrent-first.out'
$selectedErr=Join-Path $OutputDirectory 'selected-concurrent-first.err'
$selectedProcess=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$selectedFile+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $selectedOut -RedirectStandardError $selectedErr
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not ((Get-Content $selectedOut -Raw -ErrorAction SilentlyContinue) -match 'SELECT_LOCK_READY')) {
 if($selectedProcess.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Selected receipt did not reach lock barrier'}
 Start-Sleep -Milliseconds 50
}
$selectedCompeting=@'
INSERT INTO "Payments"("Ref Received By Cash Account","Row ID","Ref Borrower","Amount Received","Payment Date","Status","Allocation Method","Selected Charge IDs")
VALUES ('CI-DAD','CP6-SELECT-P2','CP6-CON',30::money,current_date,'Processing','Selected Charges','CP6-CON-C');
'@
$selectedResult=$selectedCompeting | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($selectedResult -join "`n") -notmatch 'not eligible'){throw 'Competing selected receipt was not rejected after refresh'}
$selectedProcess.WaitForExit()
if($selectedProcess.ExitCode){throw 'First selected receipt failed'}
$selectedCheck=@'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM "Payments" WHERE "Row ID" LIKE 'CP6-SELECT-%'),'one selected receipt';
 ASSERT (SELECT sum("Interest Paid"::numeric)=100 FROM "Repayments" WHERE "Ref Charges"='CP6-CON-C'),'selected residual conserved';
 ASSERT NOT EXISTS(SELECT 1 FROM "Payment Allocations" WHERE "Ref Payment"='CP6-SELECT-P2'),'competing plan rolled back';
 ASSERT (SELECT count(*)=1 FROM "Cash Ledger" WHERE "Ref Payment"='CP6-SELECT-P1'),'one selected receipt cash effect';
END $$;
'@
$selectedCheck | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Selected receipt concurrency assertions failed'}
[pscustomobject]@{selectedChargeConcurrentReplayRejected=$true;selectedResidualConserved=$true}
