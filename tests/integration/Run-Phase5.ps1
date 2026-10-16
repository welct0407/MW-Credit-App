param([switch]$JournalOnly,[switch]$AnchorOnly,[switch]$ManagementOnly,[switch]$SettingsOnly,[string]$TestNamePattern)
if($SettingsOnly){$ManagementOnly=$true}
if($AnchorOnly -and $ManagementOnly){throw "Choose one explicit upgrade family"}
if($ManagementOnly){$JournalOnly=$true}
if($AnchorOnly){$JournalOnly=$true}
# Fresh loopback-only database: borrower family at V94; populated V82 seed with V83 upgrade proof, then V94 for the journal family (anchor/management/settings keep their own upgrade heads). Never reads live credentials or accepts a DSN.
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
  try {
   if($JournalOnly){
    & (Get-FlywayPath) '-outputType=json' '-target=19' migrate | Out-File (Join-Path $fixtureRoot 'migration19.json')
    if($LASTEXITCODE){throw 'V19 migration failed'}
    & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/phase5-historical-expense-fixture.sql"
    if($LASTEXITCODE){throw 'Historical expense source seed failed'}
   }
   & (Get-FlywayPath) '-outputType=json' '-target=82' migrate | Out-File (Join-Path $fixtureRoot 'migration82.json')
   if($LASTEXITCODE){throw 'V82 migration failed'}
   $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
   # DB-LOCK-03: borrowers.mjs takes its advisory-lock keys from pwa_lock_key_v1 (V93) and V94 moves the SQL
   # bodies to it, so every family that drives the borrower record path runs its tests at V94 after its populated upgrade proof.
   if(-not $JournalOnly){
    & (Get-FlywayPath) '-outputType=json' '-target=94' migrate | Out-File (Join-Path $fixtureRoot 'migration94.json')
    if($LASTEXITCODE){throw 'V94 migration failed'}
   }
   if($JournalOnly){
    $env:PHASE5_POPULATED_JOURNAL_SNAPSHOT=Join-Path $fixtureRoot 'populated-journal.json'
    & node "$PSScriptRoot/phase5-populated-journal-fixture.mjs" seed
    if($LASTEXITCODE){throw 'Populated V82 seed failed'}
    & (Get-FlywayPath) '-outputType=json' '-target=83' migrate | Out-File (Join-Path $fixtureRoot 'migration83.json')
    if($LASTEXITCODE){throw 'Populated V83 upgrade failed'}
    & node "$PSScriptRoot/phase5-populated-journal-fixture.mjs" verify
    if($LASTEXITCODE){throw 'Populated V83 compatibility failed'}
    if(-not ($AnchorOnly -or $ManagementOnly)){
     & (Get-FlywayPath) '-outputType=json' '-target=94' migrate | Out-File (Join-Path $fixtureRoot 'migration94.json')
     if($LASTEXITCODE){throw 'V94 journal-family upgrade failed'}
    }
    if($AnchorOnly -or $ManagementOnly){
     $env:LOAN_ANCHOR_SNAPSHOT=Join-Path $fixtureRoot 'populated-anchor83.json'
     & node "$PSScriptRoot/loan-anchor-populated-fixture.mjs" seed
     if($LASTEXITCODE){throw 'Populated V83 anchor seed failed'}
     & (Get-FlywayPath) '-outputType=json' '-target=84' migrate | Out-File (Join-Path $fixtureRoot 'migration84.json')
     if($LASTEXITCODE){throw 'V84 anchor upgrade failed'}
     if($ManagementOnly){
      $env:PHASE6_POPULATED_SNAPSHOT=Join-Path $fixtureRoot 'populated-management84.json'
      & node "$PSScriptRoot/phase6-populated-fixture.mjs" seed
      if($LASTEXITCODE){throw 'Populated V84 management seed failed'}
      & (Get-FlywayPath) '-outputType=json' '-target=85' migrate | Out-File (Join-Path $fixtureRoot 'migration85.json')
      if($LASTEXITCODE){throw 'V85 management upgrade failed'}
      if($SettingsOnly){
       & (Get-FlywayPath) '-outputType=json' '-target=91' migrate | Out-File (Join-Path $fixtureRoot 'migration91.json')
       if($LASTEXITCODE){throw 'V91 settings baseline failed'}
       $env:SETTINGS_POPULATED_SNAPSHOT=Join-Path $fixtureRoot 'populated-settings91.json'
       & node "$PSScriptRoot/settings-populated-fixture.mjs" seed-settings
       if($LASTEXITCODE){throw 'Populated V91 settings seed failed'}
       & (Get-FlywayPath) '-outputType=json' '-target=92' migrate | Out-File (Join-Path $fixtureRoot 'migration92.json')
       if($LASTEXITCODE){throw 'V92 settings upgrade failed'}
      }
     }
    }
   }
  }
  finally {Pop-Location}
 } finally {
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
  foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
 }
 $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
 # Prove exact populated-upgrade preservation before any mutating test module.
 # Node file ordering is lexical, independent of the supplied file array order.
 if($ManagementOnly -and !$SettingsOnly){
  & node --test "$PSScriptRoot/phase6-upgrade-independent.test.mjs"
  if($LASTEXITCODE){throw 'Populated V84 to V85 compatibility failed'}
 }
 [string[]]$testFiles=if($SettingsOnly){@("$PSScriptRoot/settings-independent.test.mjs")}elseif($ManagementOnly){@("$PSScriptRoot/phase6-management-independent.test.mjs","$PSScriptRoot/phase6-financial-smoke.test.mjs","$PSScriptRoot/business-money-reads-independent.test.mjs")}elseif($AnchorOnly){@("$PSScriptRoot/loan-anchor-independent.test.mjs")}elseif($JournalOnly){@("$PSScriptRoot/phase5-operation.test.mjs","$PSScriptRoot/phase5-journal-independent.test.mjs","$PSScriptRoot/phase5-record-lists-independent.test.mjs")}else{@("$PSScriptRoot/borrower-domain.test.mjs","$PSScriptRoot/phase5-borrower-independent.test.mjs")}

 # A listed suite that is not present on this checkout yet (added by a parallel branch) is skipped, not failed.
 foreach($missing in @($testFiles | Where-Object {-not (Test-Path -LiteralPath $_)})){Write-Warning "Skipping absent suite $missing"}
 $testFiles=@($testFiles | Where-Object {Test-Path -LiteralPath $_})
 $testArguments=@('--test','--test-concurrency=1');if($TestNamePattern){$testArguments+=('--test-name-pattern='+$TestNamePattern)}
 & node @testArguments @testFiles
 if($LASTEXITCODE){throw 'Payment command API rehearsal failed'}
} finally {
 Remove-Item Env:PAYMENT_REHEARSAL_DISPOSABLE,Env:PAYMENT_REHEARSAL_PORT,Env:PAYMENT_REHEARSAL_DIRECTORY,Env:PHASE5_POPULATED_JOURNAL_SNAPSHOT,Env:LOAN_ANCHOR_SNAPSHOT,Env:PHASE6_POPULATED_SNAPSHOT,Env:SETTINGS_POPULATED_SNAPSHOT -ErrorAction SilentlyContinue
 if($started){& (Get-PgTool pg_ctl) -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
