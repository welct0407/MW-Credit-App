param()
# Fresh loopback-only full V80 database; never reads live credentials or accepts a DSN.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"
. "$PSScriptRoot/../../scripts/database/Common.ps1"
$pgBin=Split-Path (Get-Command psql.exe).Source
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
  try { & (Get-FlywayPath) '-outputType=json' '-target=80' migrate | Out-File (Join-Path $fixtureRoot 'migration.json');if($LASTEXITCODE){throw 'V80 migration failed'} }
  finally {Pop-Location}
 } finally {
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
  foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
 }
 $env:PAYMENT_REHEARSAL_DISPOSABLE='1';$env:PAYMENT_REHEARSAL_PORT=[string]$fixturePort;$env:PAYMENT_REHEARSAL_DIRECTORY=$data
 & node --test --test-concurrency=1 "$PSScriptRoot/payment-phase4.test.mjs" "$PSScriptRoot/payment-phase4-independent.test.mjs"
 if($LASTEXITCODE){throw 'Payment command API rehearsal failed'}
} finally {
 Remove-Item Env:PAYMENT_REHEARSAL_DISPOSABLE,Env:PAYMENT_REHEARSAL_PORT,Env:PAYMENT_REHEARSAL_DIRECTORY -ErrorAction SilentlyContinue
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
