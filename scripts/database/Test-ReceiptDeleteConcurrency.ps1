param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$actual=& $psql -XAt -h 127.0.0.1 -p $Port -U postgres -d postgres -c 'SHOW data_directory'
if($LASTEXITCODE -or [IO.Path]::GetFullPath($actual.Trim()) -ne [IO.Path]::GetFullPath((Join-Path $OutputDirectory 'data'))){throw 'Disposable server identity mismatch'}
function Run-Sql([string]$Query) {
 $result=$Query | & $psql -XqAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
 if($LASTEXITCODE){throw ($result -join "`n")}; return ($result -join "`n")
}
$fixture=[IO.File]::ReadAllText("$PSScriptRoot/Test-AppSheetReceiptDelete.sql").Split('-- AFTER trigger')[0]
$fixture=$fixture.Replace('\ir Test-CashAccountFixtures.sql',[IO.File]::ReadAllText("$PSScriptRoot/Test-CashAccountFixtures.sql"))+"`nCOMMIT;"
Run-Sql $fixture | Out-Null
# Same-row/other-receipt contention, cancellation and connection loss all keep
# direct child guards intact. Every backend selected below belongs to this test.
foreach($kind in @('same','different','cancel','disconnect')) {
 $app='del65-'+$kind+'-'+[Guid]::NewGuid().ToString('N')
 $file=Join-Path $OutputDirectory ($app+'.sql');$out=Join-Path $OutputDirectory ($app+'.out');$err=Join-Path $OutputDirectory ($app+'.err')
 $pause=if($kind -in @('cancel','disconnect')){15}else{3}
 $body="SET application_name='$app';`nBEGIN;`nUPDATE ""Payments"" SET ""Delete Requested""=true WHERE ""Row ID""='DEL65-P';`n\echo DELETE_READY`nSELECT pg_sleep($pause);`nROLLBACK;"
 [IO.File]::WriteAllText($file,$body,[Text.UTF8Encoding]::new($false))
 $process=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 try {
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not((Get-Content $out -Raw -ErrorAction SilentlyContinue)-match 'DELETE_READY')) {
   if($process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Delete barrier failed'}
   Start-Sleep -Milliseconds 50
  }
  if($kind -in @('same','different')) {
   $id=if($kind -eq 'same'){'DEL65-P'}else{'DEL65-LATER'}
   $q="SET lock_timeout='500ms'; UPDATE ""Payments"" SET ""Delete Requested""=true WHERE ""Row ID""='$id';"
   $r=$q | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
   if($LASTEXITCODE -eq 0 -or ($r -join "`n") -notmatch 'busy|lock timeout|could not obtain lock'){throw 'Concurrent source request should reject contention'}
  } else {
   $pidText=Run-Sql "SELECT pid FROM pg_stat_activity WHERE application_name='$app' AND datname='postgres' AND backend_type='client backend';"
   if($pidText -notmatch '^\d+$'){throw 'Owned delete backend not uniquely resolved'}
   $fn=if($kind -eq 'cancel'){'pg_cancel_backend'}else{'pg_terminate_backend'}
   if((Run-Sql "SELECT $fn($pidText);").Trim() -ne 't'){throw 'Owned backend interruption failed'}
  }
  if(-not $process.WaitForExit(10000)){throw 'Interrupted delete process did not exit'}
  if($kind -in @('same','different') -and $process.ExitCode){throw 'Delete rollback blocker failed'}
 } finally {if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}}
 Run-Sql @'
DO $$ BEGIN
 ASSERT (SELECT NOT "Delete Requested" AND "Posted Amount"=20 FROM "Payments" WHERE "Row ID"='DEL65-P'),'interruption restores source';
 ASSERT (SELECT count(*)=1 AND sum("Amount")=20 FROM "Cash Ledger" WHERE "Ref Payment"='DEL65-P'),'interruption restores cash';
 ASSERT (SELECT count(*)=1 FROM "Payment Allocations" WHERE "Ref Payment"='DEL65-P'),'interruption restores allocation';
 ASSERT (SELECT count(*)=1 FROM "Repayments" WHERE "Ref Payment"='DEL65-P'),'interruption restores repayment';
END $$;
'@ | Out-Null
}
Run-Sql 'CREATE ROLE del65_updater; GRANT USAGE ON SCHEMA public TO del65_updater; GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA public TO del65_updater;' | Out-Null
$denied='SET SESSION AUTHORIZATION del65_updater; UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=''DEL65-P'';' | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($denied -join "`n") -notmatch 'permission denied for table Payments'){throw 'Invoker DELETE permission not enforced'}
Run-Sql 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM del65_updater; REVOKE USAGE ON SCHEMA public FROM del65_updater; DROP ROLE del65_updater; UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=''DEL65-P'';' | Out-Null
# Models retry after the first committed acknowledgement was lost: no INSERT,
# duplicate side effect or recreation; missing source UPDATE returns zero rows.
$retry=Run-Sql 'WITH r AS (UPDATE "Payments" SET "Delete Requested"=true WHERE "Row ID"=''DEL65-P'' RETURNING 1) SELECT count(*) FROM r;'
if($retry.Trim() -ne '0'){throw 'Committed delete retry recreated source'}
Run-Sql 'DELETE FROM "Payments" WHERE "Row ID" IN (''DEL65-LATER'',''DEL65-CLOSING'');' | Out-Null
[pscustomobject]@{contentionCases=2;statementCancel=$true;connectionLossRollback=$true;updateOnlyDenied=$true;committedRetryZero=$true}
