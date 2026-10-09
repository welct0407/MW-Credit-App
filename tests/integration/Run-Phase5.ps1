param([switch]$JournalOnly,[switch]$AnchorOnly,[string]$TestNamePattern)
if($AnchorOnly){$JournalOnly=$true}
# Fresh loopback-only full V82 database with optional populated V83 upgrade; never reads live credentials or accepts a DSN.
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
 & (Join-Path $pgBin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 $process=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $fixtureRoot 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$fixturePort+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'start.out') -RedirectStandardError (Join-Path $fixtureRoot 'start.err')
 $process.WaitForExit();if($process.ExitCode){throw 'Disposable PostgreSQL start failed'};$started=$true
 & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p $fixturePort -U postgres payment_rehearsal
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 & (Join-Path $pgBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/../../scripts/database/Test-AgentAuditPrerequisites.sql"
 if($LASTEXITCODE){throw 'Disposable role setup failed'}
 & (Join-Path $pgBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/../../scripts/database/Test-AppRolePrerequisites.sql"
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
    & (Join-Path $pgBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/phase5-historical-expense-fixture.sql"
    if($LASTEXITCODE){throw 'Historical expense source seed failed'}
   }
   & (Get-FlywayPath) '-outputType=json' '-target=82' migrate | Out-File (Join-Path $fixtureRoot 'migration82.json')
   if($LASTEXITCODE){throw 'V82 migration failed'}
   $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
   if($JournalOnly){
    $env:PHASE5_POPULATED_JOURNAL_SNAPSHOT=Join-Path $fixtureRoot 'populated-journal.json'
    & node "$PSScriptRoot/phase5-populated-journal-fixture.mjs" seed
    if($LASTEXITCODE){throw 'Populated V82 seed failed'}
    & (Get-FlywayPath) '-outputType=json' '-target=83' migrate | Out-File (Join-Path $fixtureRoot 'migration83.json')
    if($LASTEXITCODE){throw 'Populated V83 upgrade failed'}
    & node "$PSScriptRoot/phase5-populated-journal-fixture.mjs" verify
    if($LASTEXITCODE){throw 'Populated V83 compatibility failed'}
    if($AnchorOnly){
     $env:LOAN_ANCHOR_SNAPSHOT=Join-Path $fixtureRoot 'populated-anchor83.json'
     & node "$PSScriptRoot/loan-anchor-populated-fixture.mjs" seed
     if($LASTEXITCODE){throw 'Populated V83 anchor seed failed'}
     & (Get-FlywayPath) '-outputType=json' '-target=84' migrate | Out-File (Join-Path $fixtureRoot 'migration84.json')
     if($LASTEXITCODE){throw 'V84 anchor upgrade failed'}
    }
   }
  }
  finally {Pop-Location}
 } finally {
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
  foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
 }
 $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
 [string[]]$testFiles=if($AnchorOnly){@("$PSScriptRoot/loan-anchor-independent.test.mjs")}elseif($JournalOnly){@("$PSScriptRoot/phase5-operation.test.mjs","$PSScriptRoot/phase5-journal-independent.test.mjs","$PSScriptRoot/phase5-record-lists-independent.test.mjs")}else{@("$PSScriptRoot/borrower-domain.test.mjs","$PSScriptRoot/phase5-borrower-independent.test.mjs")}

 $testArguments=@('--test','--test-concurrency=1');if($TestNamePattern){$testArguments+=('--test-name-pattern='+$TestNamePattern)}
 & node @testArguments @testFiles
 if($LASTEXITCODE){throw 'Payment command API rehearsal failed'}
} finally {
 Remove-Item Env:PAYMENT_REHEARSAL_DISPOSABLE,Env:PAYMENT_REHEARSAL_PORT,Env:PAYMENT_REHEARSAL_DIRECTORY,Env:PHASE5_POPULATED_JOURNAL_SNAPSHOT,Env:LOAN_ANCHOR_SNAPSHOT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
