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
} finally {
 Remove-Item Env:PAYMENT_REHEARSAL_DISPOSABLE,Env:PAYMENT_REHEARSAL_PORT,Env:PAYMENT_REHEARSAL_DIRECTORY -ErrorAction SilentlyContinue
 if($started){& (Get-PgTool pg_ctl) -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
