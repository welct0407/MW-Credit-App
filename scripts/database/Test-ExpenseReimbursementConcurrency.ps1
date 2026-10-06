param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
$actual=& $psql -XAt -h 127.0.0.1 -p $Port -U postgres -d postgres -c 'SHOW data_directory'
if($LASTEXITCODE -or [IO.Path]::GetFullPath($actual.Trim()) -ne [IO.Path]::GetFullPath((Join-Path $OutputDirectory 'data'))){throw 'Disposable server identity mismatch'}
function Run-Sql([string]$Query) {
 $result=$Query | & $psql -XqAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
 if($LASTEXITCODE){throw ($result -join "`n")}; return ($result -join "`n")
}
function Start-Sql([string]$Name,[string]$Query) {
 $file=Join-Path $OutputDirectory ($Name+'.sql');$out=Join-Path $OutputDirectory ($Name+'.out');$err=Join-Path $OutputDirectory ($Name+'.err')
 [IO.File]::WriteAllText($file,$Query,[Text.UTF8Encoding]::new($false))
 $process=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 return @{Process=$process;Out=$out;Err=$err}
}
$fixture=[IO.File]::ReadAllText("$PSScriptRoot/Test-ExpenseReimbursement.sql").Split('-- CONCURRENCY FIXTURE END')[0]
$fixture=$fixture.Replace('\ir Test-CashAccountFixtures.sql',[IO.File]::ReadAllText("$PSScriptRoot/Test-CashAccountFixtures.sql"))+"`nCOMMIT;"
Run-Sql $fixture | Out-Null
$reimburse=@'
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref From Cash Holder","Ref To Cash Holder","Ref From Cash Account","Ref To Cash Account","Ref Business Expense")
VALUES('REIM66-R',current_date,'Expense Reimbursement',5,'ch:lisa','ch:tommy','CI-LISA','REIM66-T1','REIM66-E');
'@
$move='UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=''CI-LISA'',"Ref Paid By Cash Holder"=''ch:lisa'' WHERE "Row ID"=''REIM66-E'';'
$sameHolder='UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=''REIM66-T2'' WHERE "Row ID"=''REIM66-E'';'
foreach($kind in @('expense_commit','reimbursement_commit','expense_rollback','reimbursement_rollback','same_holder')) {
 Run-Sql 'DELETE FROM "Cash Ledger" WHERE "Row ID"=''REIM66-R''; UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=''REIM66-T1'',"Ref Paid By Cash Holder"=''ch:tommy'' WHERE "Row ID"=''REIM66-E'';' | Out-Null
 $expenseFirst=$kind.StartsWith('expense_')
 $first=if($expenseFirst){$move}else{$reimburse}
 $second=if($expenseFirst){$reimburse}elseif($kind -eq 'same_holder'){$sameHolder}else{$move}
 $ending=if($kind.EndsWith('rollback')){'ROLLBACK;'}else{'COMMIT;'}
 $app='reim66-'+$kind+'-'+[Guid]::NewGuid().ToString('N')
 $one=Start-Sql ($app+'-first') "SET application_name='$app-first'; SET statement_timeout='10s'; BEGIN; $first`n\echo FIRST_READY`nSELECT pg_sleep(3); $ending"
 $two=$null
 try {
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not((Get-Content $one.Out -Raw -ErrorAction SilentlyContinue)-match 'FIRST_READY')) {
   if($one.Process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Reimbursement first-writer barrier failed'}
   Start-Sleep -Milliseconds 30
  }
  $competing="SET statement_timeout='8s'; SET lock_timeout='1s'; $second" | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
  if($LASTEXITCODE -eq 0 -or ($competing -join "`n") -notmatch 'Partner allocation is busy'){throw "Expected existing shared allocation lock for $kind"}
  if(-not $one.Process.WaitForExit(10000) -or $one.Process.ExitCode){throw 'First writer failed'}
  $retried=$second | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
  $reject=$kind -in @('expense_commit','reimbursement_commit')
  if($reject) {
   $expected=if($expenseFirst){'must have been paid by Tommy'}else{'Correct linked reimbursement'}
   if($LASTEXITCODE -eq 0 -or ($retried -join "`n") -notmatch $expected){throw "Expected committed invariant rejection for $kind"}
  } elseif($LASTEXITCODE){throw ($retried -join "`n")}

 } finally {
  foreach($job in @($one,$two)){if($null -ne $job -and -not $job.Process.HasExited){$job.Process.Kill();$job.Process.WaitForExit()}}
 }
 $expectedReimbursement=if($kind -in @('reimbursement_commit','expense_rollback','same_holder')){1}else{0}
 $expectedAccount=if($kind -eq 'same_holder'){'REIM66-T2'}elseif($expectedReimbursement -eq 1){'REIM66-T1'}else{'CI-LISA'}
 Run-Sql @"
DO `$`$ BEGIN
 ASSERT (SELECT count(*)=$expectedReimbursement FROM "Cash Ledger" WHERE "Row ID"='REIM66-R'),'concurrent reimbursement count';
 ASSERT (SELECT "Ref Paid By Cash Account"='$expectedAccount' FROM "Business Expenses" WHERE "Row ID"='REIM66-E'),'concurrent expense final account';
 ASSERT (SELECT count(*)=1 AND min("Ref From Cash Account")='$expectedAccount' FROM "Cash Ledger" WHERE "Ref Business Expense"='REIM66-E' AND "Entry Origin"='System'),'single owned cash projection';
END `$`$;
"@ | Out-Null
}
# Stale transaction snapshots must not permit write skew in either direction.
foreach($kind in @('source','reimbursement')) {
 Run-Sql 'DELETE FROM "Cash Ledger" WHERE "Row ID"=''REIM66-R''; UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=''REIM66-T1'',"Ref Paid By Cash Holder"=''ch:tommy'' WHERE "Row ID"=''REIM66-E'';' | Out-Null
 $app='reim66-rr-'+$kind+'-'+[Guid]::NewGuid().ToString('N')
 $stale=if($kind -eq 'source'){$move}else{$reimburse}
 $winner=if($kind -eq 'source'){$reimburse}else{$move}
 $job=Start-Sql $app "SET statement_timeout='10s'; BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM ""Business Expenses"";`n\echo SNAPSHOT_READY`nSELECT pg_sleep(3); $stale COMMIT;"
 try {
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not((Get-Content $job.Out -Raw -ErrorAction SilentlyContinue)-match 'SNAPSHOT_READY')) {
   if($job.Process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Repeatable-read snapshot barrier failed'}
   Start-Sleep -Milliseconds 30
  }
  Run-Sql $winner | Out-Null
  if(-not $job.Process.WaitForExit(10000) -or $job.Process.ExitCode -eq 0 -or (Get-Content $job.Err -Raw) -notmatch 'could not serialize access due to concurrent update'){throw 'Stale repeatable-read writer must serialize-fail'}
 } finally {if(-not $job.Process.HasExited){$job.Process.Kill();$job.Process.WaitForExit()}}
}
# Invoker permissions remain intact: no privilege is granted by the migration.
Run-Sql 'DELETE FROM "Cash Ledger" WHERE "Row ID"=''REIM66-R''; UPDATE "Business Expenses" SET "Ref Paid By Cash Account"=''REIM66-T1'',"Ref Paid By Cash Holder"=''ch:tommy'' WHERE "Row ID"=''REIM66-E''; CREATE ROLE reim66_writer; GRANT USAGE ON SCHEMA public TO reim66_writer; GRANT SELECT ON ALL TABLES IN SCHEMA public TO reim66_writer; GRANT INSERT ON "Cash Ledger" TO reim66_writer;' | Out-Null
$denied="SET SESSION AUTHORIZATION reim66_writer; $reimburse" | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($denied -join "`n") -notmatch 'permission denied for table Cash Accounts'){throw 'Existing account-lock privilege prerequisite changed'}
Run-Sql 'GRANT UPDATE ("Row ID") ON "Cash Accounts","Cash Holders" TO reim66_writer;' | Out-Null
$denied="SET SESSION AUTHORIZATION reim66_writer; $reimburse" | & $psql -Xq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($denied -join "`n") -notmatch 'permission denied for table Business Expenses'){throw 'Missing underlying expense UPDATE must remain denied'}
Run-Sql 'REVOKE UPDATE ("Row ID") ON "Cash Accounts","Cash Holders" FROM reim66_writer; REVOKE ALL ON ALL TABLES IN SCHEMA public FROM reim66_writer; REVOKE USAGE ON SCHEMA public FROM reim66_writer; DROP ROLE reim66_writer; DELETE FROM "Business Expenses" WHERE "Row ID" IN (''REIM66-E'',''REIM66-E2'');' | Out-Null
[pscustomobject]@{concurrentOrderings=2;bothRollbackOrderings=$true;sameHolderAllowed=$true;sharedAllocationContentionObserved=$true;repeatableReadOrderings=2;existingAccountLockPrivilegeDenied=$true;missingExpenseUpdateDenied=$true;invariantPreserved=$true}
