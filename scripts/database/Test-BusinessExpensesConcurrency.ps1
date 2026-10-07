param([string]$PgBin,[int]$Port,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$setup=@'
SET TIME ZONE 'Asia/Bangkok';
INSERT INTO "Partners"("Row ID","Partner Role") VALUES('EX15CON-A','A'),('EX15CON-B','B');
INSERT INTO "Cash Pool Contributions"("Row ID","Ref Partner","Contribution Date","Transaction Type","Amount") VALUES
 ('EX15CON-CA','EX15CON-A',current_date-1,'Contribution',600::money),('EX15CON-CB','EX15CON-B',current_date-1,'Contribution',400::money);
INSERT INTO "Business Expenses"("Row ID","Expense Date","Expense Category","Amount","Notes")
 VALUES('EX15CON-CREDIT',current_date,'Other',(-1000)::money,'Synthetic adjustment provides settlement entitlement');
'@
$setup | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Expense concurrency setup failed'}
$first=@'
BEGIN;
INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES('EX15CON-S1','EX15CON-A',600::money,'Pending');
\echo EXPENSE_LOCK_READY
SELECT pg_sleep(3);
COMMIT;
'@
$file=Join-Path $OutputDirectory 'expense-first.sql'
[IO.File]::WriteAllText($file,$first,[Text.UTF8Encoding]::new($false))
$out=Join-Path $OutputDirectory 'expense-first.out';$err=Join-Path $OutputDirectory 'expense-first.err'
$proc=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$deadline=[DateTime]::UtcNow.AddSeconds(10)
while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'EXPENSE_LOCK_READY')) {
 if($proc.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Expense lock barrier failed'}
 Start-Sleep -Milliseconds 50
}
$competing='INSERT INTO "Settlements"("Row ID","Ref Partner","Amount","Status") VALUES(''EX15CON-S2'',''EX15CON-A'',600::money,''Pending'');'
$watch=[Diagnostics.Stopwatch]::StartNew()
$result=$competing | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'Partner allocation is busy'){throw 'Concurrent settlement did not fail safely'}
$watch.Stop()
if($watch.Elapsed.TotalSeconds -ge 2){throw 'Settlement waited on allocation lock'}
$proc.WaitForExit();if($proc.ExitCode){throw 'First settlement failed'}
$result=$competing | & $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'exceeds net'){throw 'Retry over-reserved entitlement'}
[pscustomobject]@{expenseLockFailsPromptly=$true;concurrentSettlementCannotDoubleReserve=$true;busyMilliseconds=$watch.Elapsed.TotalMilliseconds}
