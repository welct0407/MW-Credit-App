param([string]$PgBin,[int]$Port,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$setup=@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('R002CON-A','A'),('R002CON-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('R002CON-CA','R002CON-A',current_date-1,'Contribution',600::money),('R002CON-CB','R002CON-B',current_date-1,'Contribution',400::money);
INSERT INTO "Borrowers"("Row ID","Borrower Name")
 VALUES('R002CON-BORROWER','SYNTHETIC CONCURRENCY');
'@
$setup | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Cashpool concurrency setup failed'}
$first=@'
BEGIN;
INSERT INTO "Loans"("Row ID","Ref Borrowers","Principal Amount","Auto Charge Enabled") VALUES('R002CON-S1','R002CON-BORROWER',600::money,false);
\echo CASHPOOL_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'r002-first.sql'
[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'r002-first.out';$err=Join-Path $OutputDirectory 'r002-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'CASHPOOL_LOCK_READY')) {
 if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Cashpool lock barrier failed'}
 Start-Sleep -Milliseconds 50
}
$competing='INSERT INTO "Loans"("Row ID","Ref Borrowers","Principal Amount","Auto Charge Enabled") VALUES(''R002CON-S2'',''R002CON-BORROWER'',600::money,false);'
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=$competing | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'Cashpool is busy'){throw 'Concurrent loan did not fail safely'}
$watch.Stop()
if($watch.Elapsed.TotalSeconds -ge 2){throw 'Loan waited on cashpool lock'}
$proc.WaitForExit();if($proc.ExitCode){throw 'First loan failed'}
$result=$competing | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'exceeds available cashpool'){throw 'Retry exceeded available cashpool'}
[pscustomobject]@{cashpoolLockFailsPromptly=$true;concurrentLoanCannotOverspend=$true;busyMilliseconds=$watch.Elapsed.TotalMilliseconds}
