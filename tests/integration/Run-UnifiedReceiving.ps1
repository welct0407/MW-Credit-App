param([switch]$Smoke)
# Fresh loopback-only full V82 database; never reads live credentials or accepts a DSN.
$ErrorActionPreference='Stop'
if($env:CI -ne 'true'){. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"}
. "$PSScriptRoot/../../scripts/database/Common.ps1"
$pgBin=Get-PgBin
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-payment-rehearsal-'+[guid]::NewGuid().ToString('N'))
$data=Join-Path $fixtureRoot 'data'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$fixturePort=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 & (Get-PgTool initdb) -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 Start-PgServer $data (Join-Path $fixtureRoot 'postgres.log') $fixturePort $fixtureRoot;$started=$true
 & (Get-PgTool createdb) -h 127.0.0.1 -p $fixturePort -U postgres payment_rehearsal
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/../../scripts/database/Test-AgentAuditPrerequisites.sql"
 if($LASTEXITCODE){throw 'Disposable role setup failed'}
 & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/../../scripts/database/Test-AppRolePrerequisites.sql"
 if($LASTEXITCODE){throw 'Application role setup failed'}
 $savedFlyway=@{}
 Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { $savedFlyway[$_.Name]=$_.Value; Remove-Item "Env:$($_.Name)" }
 try {
  $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/payment_rehearsal"
  $env:FLYWAY_USER='postgres';$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
  Push-Location $DbRepoRoot
  try { & (Get-FlywayPath) '-outputType=json' '-target=82' migrate | Out-File (Join-Path $fixtureRoot 'migration.json');if($LASTEXITCODE){throw 'V82 migration failed'} }
  finally {Pop-Location}
 } finally {
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
  foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
 }
 $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
 $testFiles=@("$PSScriptRoot/unified-receiving.test.mjs")
 if(-not $Smoke){$testFiles+="$PSScriptRoot/unified-receiving-independent.test.mjs"}
 & node --test --test-concurrency=1 @testFiles
 if($LASTEXITCODE){throw 'Payment command API rehearsal failed'}
 if(-not $Smoke){
  # R101: paying the next charge early needs the newest migration (V112); the same cluster continues to the head.
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { $savedFlyway[$_.Name]=$_.Value; Remove-Item "Env:$($_.Name)" }
  try {
   $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/payment_rehearsal"
   $env:FLYWAY_USER='postgres';$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
   Push-Location $DbRepoRoot
   try { & (Get-FlywayPath) '-outputType=json' migrate | Out-File (Join-Path $fixtureRoot 'migration-head.json');if($LASTEXITCODE){throw 'Head migration failed'} }
   finally {Pop-Location}
  } finally {
   Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
   foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
  }
  & node --test --test-concurrency=1 "$PSScriptRoot/projected-charge-payment-independent.test.mjs"
  if($LASTEXITCODE){throw 'Projected charge payment integration checks failed'}
  # R111: the referral rebate offset (V122), on the same head cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/rebate-offset-independent.test.mjs"
  if($LASTEXITCODE){throw 'Rebate offset integration checks failed'}
  # R129: referral rebate settlement (V137): pending rebates, the Referrers reads, settle and delete, and two concurrency races, same cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/rebate-settlement-independent.test.mjs"
  if($LASTEXITCODE){throw 'Rebate settlement integration checks failed'}
  # R136: loan rollover (V138): the preview read, the apply with both receipts, replay, source_conflict and rollover_ineligible, same cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/loan-rollover-independent.test.mjs"
  if($LASTEXITCODE){throw 'Loan rollover integration checks failed'}
  # R140: a manual expense pending payment (V142): create pending, replay, the reads, pay with expense.update, same cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/pending-expense-independent.test.mjs"
  if($LASTEXITCODE){throw 'Pending expense integration checks failed'}
  # R140: a created and a paid expense reach the saved Expenses list and record (real store, dataset endpoint and PWA merge).
  & node --test --test-concurrency=1 "$PSScriptRoot/expense-offline-dataset-independent.test.mjs"
  if($LASTEXITCODE){throw 'Expense offline dataset integration checks failed'}
  # R112: the agent receipt command v9 (pay forward through the plan) through the real receipt API handler, on the same head cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/agent-receipt-pay-forward-independent.test.mjs"
  if($LASTEXITCODE){throw 'Agent receipt pay forward integration checks failed'}
  # R112: the chat service's payment planner and v10 command builder against the real command service (card.purposeOptions numbers, purposes, refusals), same cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/chat-payment-plan-independent.test.mjs"
  if($LASTEXITCODE){throw 'Chat payment plan integration checks failed'}
  # R114 COL-2: the Collection read's prepaid source with and without the reader's Payments and Repayments."Ref Payment" column grants (R109 guard), same cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/collection-prepaid-source-independent.test.mjs"
  if($LASTEXITCODE){throw 'Collection prepaid source integration checks failed'}
  # R109: Default Loan with a loss amount and kept charges (V120), on the same head cluster.
  & node --test --test-concurrency=1 "$PSScriptRoot/default-loss-independent.test.mjs"
  if($LASTEXITCODE){throw 'Default loss integration checks failed'}
 }
} finally {
 Remove-Item Env:PAYMENT_REHEARSAL_DISPOSABLE,Env:PAYMENT_REHEARSAL_PORT,Env:PAYMENT_REHEARSAL_DIRECTORY -ErrorAction SilentlyContinue
 if($started){& (Get-PgTool pg_ctl) -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
