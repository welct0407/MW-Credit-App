param([Parameter(Mandatory)][string]$PgBin,[Parameter(Mandatory)][int]$Port,[Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$psql=Join-Path $PgBin 'psql.exe'
# The caller owns the disposable migration-rebuilt server. No Cloud target or
# credentials are accepted; verify its local data directory before any fixture.
$actual = & $psql -XAt -h 127.0.0.1 -p $Port -U postgres -d postgres -c 'SHOW data_directory'
if($LASTEXITCODE -or [IO.Path]::GetFullPath($actual.Trim()) -ne [IO.Path]::GetFullPath((Join-Path $OutputDirectory 'data'))){throw 'Disposable server identity mismatch'}
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres -f "$PSScriptRoot/Test-CashAccountFixtures.sql"
if($LASTEXITCODE){throw 'Cash fixtures failed'}
$fixture=[IO.File]::ReadAllText("$PSScriptRoot/Test-InterestReallocation.sql").Split('-- Snapshot staleness')[0]
$fixture=$fixture.Replace('\ir Test-CashAccountFixtures.sql','').Replace('CREATE TEMP TABLE ir57_request','CREATE TABLE public.ir57_con_request').Replace('CREATE TEMP TABLE ir57_preserved','CREATE TABLE public.ir57_con_preserved') + "`nCOMMIT;`n"
$fixture | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Reallocation concurrency fixture failed'}
$call=@'
SELECT public.reallocate_payment_interest_audited('00000000-0057-4000-8000-000000000099',jsonb_build_object(
 'kind','interest-reallocation-v2','operation_id','00000000-0057-4000-8000-000000000099','database','loan_manager_prod',
 'payment','IR57-P','receipt',receipt,'moves',moves,'reason','synthetic contention','code_version','synthetic-v58',
 'actor_id','synthetic-operator','actor_login','synthetic-operator','authorization_reference','synthetic-approval')::text) FROM public.ir57_con_request;
'@
$locks=@(
 @{sql='SELECT pg_advisory_xact_lock(9162026,2);';error='Cash pool is busy'},
 @{sql='SELECT 1 FROM public."Borrowers" WHERE "Row ID"=''IR57-B'' FOR UPDATE;';error='could not obtain lock'},
 @{sql='SELECT 1 FROM public."Charges" WHERE "Row ID"=''IR57-C1-1'' FOR UPDATE;';error='could not obtain lock'},
 @{sql='SELECT 1 FROM public."Repayments" WHERE "Ref Payment"=''IR57-P'' FOR UPDATE;';error='could not obtain lock'}
)
$i=0
foreach($lock in $locks){
 $i++
 $file=Join-Path $OutputDirectory "reallocation-lock-$i.sql"
 [IO.File]::WriteAllText($file,"BEGIN;`n"+$lock.sql+"`n\echo LOCK_READY`nSELECT pg_sleep(3);`nROLLBACK;",[Text.UTF8Encoding]::new($false))
 $out=Join-Path $OutputDirectory "reallocation-lock-$i.out";$err=Join-Path $OutputDirectory "reallocation-lock-$i.err"
 $process=Start-Process $psql -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-f',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
 try{
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while(-not ((Get-Content $out -Raw -ErrorAction SilentlyContinue) -match 'LOCK_READY')){
   if($process.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Blocker did not reach lock barrier'}
   Start-Sleep -Milliseconds 50
  }
  $timer=[Diagnostics.Stopwatch]::StartNew()
  $result=$call | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
  $timer.Stop()
  if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch $lock.error -or $timer.Elapsed.TotalSeconds -ge 2){throw 'Concurrent correction did not fail promptly'}
  $check=@'
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT 1 FROM agent_audit.commits WHERE operation_id='00000000-0057-4000-8000-000000000099'),'busy operation has no audit commit';
 ASSERT (SELECT sum("Total Paid")=0 FROM public."Charges" WHERE "Row ID" LIKE 'IR57-C%-1'),'busy operation made no changes';
END $$;
'@
  $check | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
  if($LASTEXITCODE){throw 'Busy-operation rollback failed'}
  $process.WaitForExit()
  if($process.ExitCode){throw 'Lock-holder failed'}
 }finally{if(-not $process.HasExited){$process.Kill();$process.WaitForExit()}}
}
# Separate psql sessions establish commit visibility and duplicate-safe retry.
$result=$call | & $psql -XAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE -or $result.Trim() -ne 'applied'){throw 'First correction failed'}
$result=$call | & $psql -XAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE -or $result.Trim() -ne 'already_applied'){throw 'Committed retry failed'}
$verify=@'
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM agent_audit.commits WHERE operation_id='00000000-0057-4000-8000-000000000099'),'one audit commit';
 ASSERT (SELECT count(*)=12 FROM agent_audit.row_changes WHERE operation_id='00000000-0057-4000-8000-000000000099'),'one before/after audit';
 ASSERT (SELECT count(*)=6 AND sum("Interest Paid"::numeric)=1200 FROM public."Repayments" WHERE "Ref Payment"='IR57-P'),'unchanged repayment count and total';
 ASSERT (SELECT to_jsonb(p)=q.receipt FROM public."Payments" p CROSS JOIN public.ir57_con_request q WHERE p."Row ID"='IR57-P'),'receipt unchanged';
 ASSERT NOT EXISTS(SELECT 1 FROM public.ir57_con_preserved WHERE state IS DISTINCT FROM CASE kind
  WHEN 'Borrowers' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM public."Borrowers" x)
  WHEN 'Loans' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM public."Loans" x)
  WHEN 'Payments' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM public."Payments" x)
  WHEN 'Cash Ledger' THEN (SELECT jsonb_agg(to_jsonb(x) ORDER BY "Row ID") FROM public."Cash Ledger" x) END),'preserved borrower/loan/receipt/cash tables';
END $$;
CREATE ROLE ir57_restricted;
SET SESSION AUTHORIZATION ir57_restricted;
'@
$verify | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Committed readback failed'}
$denied=@'
SET SESSION AUTHORIZATION ir57_restricted;
SELECT public.reallocate_payment_interest_audited('00000000-0057-4000-8000-000000000099','{}');
'@
$result=$denied | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres 2>&1
if($LASTEXITCODE -eq 0 -or ($result -join "`n") -notmatch 'permission denied for function'){throw 'Restricted role reached admin correction'}
'DROP ROLE ir57_restricted; DROP TABLE public.ir57_con_request,public.ir57_con_preserved;' | & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d postgres
if($LASTEXITCODE){throw 'Synthetic request cleanup failed'}
[pscustomobject]@{cashpoolBorrowerChargeRepaymentContentionRejected=$true;independentCommittedRetry=$true;restrictedRoleDenied=$true;receiptCashLoanBorrowerTablesPreserved=$true}
