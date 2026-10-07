param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$actual=& $psql -XAt -h 127.0.0.1 -p $Port -U postgres -d postgres -c 'SHOW data_directory'
if($LASTEXITCODE -or [IO.Path]::GetFullPath($actual.Trim()) -ne [IO.Path]::GetFullPath((Join-Path $OutputDirectory 'data'))){throw 'Disposable server identity mismatch'}
$fixture=[IO.File]::ReadAllText("$PSScriptRoot/Test-PaymentCrud.sql").Split('-- Ordinary allocation UPDATE')[0]
$fixture=$fixture.Replace('\ir Test-CashAccountFixtures.sql',[IO.File]::ReadAllText("$PSScriptRoot/Test-CashAccountFixtures.sql"))+"`nCOMMIT;"
$fixture | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'CRUD concurrency fixture failed'}
$checks=@(
 'SELECT pg_advisory_xact_lock(9162026,2);',
 'SELECT 1 FROM "Borrowers" WHERE "Row ID"=''CRUD59-B'' FOR UPDATE;',
 'SELECT 1 FROM "Loans" WHERE "Row ID"=''CRUD59-L1'' FOR UPDATE;',
 'SELECT 1 FROM "Charges" WHERE "Row ID"=''CRUD59-C1'' FOR UPDATE;',
 'SELECT 1 FROM "Repayments" WHERE "Ref Payment"=''CRUD59-P'' FOR UPDATE;',
 'SELECT 1 FROM "Cash Ledger" WHERE "Ref Payment"=''CRUD59-P'' FOR UPDATE;'
)
$i=0
foreach($lock in $checks){
 $i++;$file=Join-Path $OutputDirectory "crud-lock-$i.sql";$out=Join-Path $OutputDirectory "crud-lock-$i.out";$err=Join-Path $OutputDirectory "crud-lock-$i.err"
 [IO.File]::WriteAllText($file,"BEGIN;`n$lock`n\echo LOCK_READY`nSELECT pg_sleep(3);`nROLLBACK;",[Text.UTF8Encoding]::new($false))
 $process=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 try{
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'LOCK_READY')){
   if($process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'CRUD lock barrier failed'}
   Start-Sleep -Milliseconds 50
  }
  $result='SET lock_timeout=''500ms''; UPDATE "Payments" SET "Amount Received"=150::money WHERE "Row ID"=''CRUD59-P'';' | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
  if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'busy|could not obtain lock|lock timeout'){throw 'Concurrent CRUD did not reject contention'}
  $process.WaitForExit();if($process.ExitCode){throw 'CRUD blocker failed'}
 }finally{if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}}
}
$verify=@'
DO $$ BEGIN ASSERT (SELECT "Posted Amount"=100 FROM "Payments" WHERE "Row ID"='CRUD59-P'),'busy calls leave no partial change'; END $$;
UPDATE "Payments" SET "Amount Received"=150::money WHERE "Row ID"='CRUD59-P';
UPDATE "Payments" SET "Amount Received"=150::money WHERE "Row ID"='CRUD59-P';
DO $$ BEGIN
 ASSERT (SELECT "Posted Amount"=150 FROM "Payments" WHERE "Row ID"='CRUD59-P'),'retry unchanged total';
 ASSERT (SELECT count(*)=1 AND sum("Amount")=150 FROM "Cash Ledger" WHERE "Ref Payment"='CRUD59-P'),'one cash effect';
END $$;
CREATE ROLE crud59_reader;
GRANT SELECT ON public."Payments" TO crud59_reader;
'@
$verify | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'CRUD commit/retry verification failed'}
$result='SET SESSION AUTHORIZATION crud59_reader; DELETE FROM "Payments" WHERE "Row ID"=''CRUD59-P'';' | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'permission denied'){throw 'Reader gained delete permission'}
'REVOKE SELECT ON public."Payments" FROM crud59_reader; DROP ROLE crud59_reader; DELETE FROM "Payments" WHERE "Row ID"=''CRUD59-P''; DELETE FROM "Payments" WHERE "Row ID"=''CRUD59-P'';' | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Committed/repeated delete failed'}
[pscustomobject]@{lockCases=$checks.Count;committedUpdateRetry=$true;committedDeleteRetry=$true;readerDenied=$true}
