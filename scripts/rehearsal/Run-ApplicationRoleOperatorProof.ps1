param([switch]$FailureProof,[switch]$MaintenanceProof,[switch]$MaintenanceFailureProof)
# Fresh loopback-only full V79 database; never reads live credentials or accepts a DSN.
$ErrorActionPreference='Stop'
if($env:CI -ne 'true'){. "$PSScriptRoot/../Enter-Dev.ps1"}
. "$PSScriptRoot/../database/Common.ps1"
$pgBin=Get-PgBin
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-payment-rehearsal-'+[guid]::NewGuid().ToString('N'))
$data=Join-Path $fixtureRoot 'data'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$fixturePort=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 & (Join-Path $pgBin 'initdb.exe') -D $data -U mw_fixture_bootstrap --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 $process=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $fixtureRoot 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$fixturePort+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'start.out') -RedirectStandardError (Join-Path $fixtureRoot 'start.err')
 $process.WaitForExit();if($process.ExitCode){throw 'Disposable PostgreSQL start failed'};$started=$true
 & (Join-Path $pgBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U mw_fixture_bootstrap -d postgres -c 'CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB NOREPLICATION NOBYPASSRLS; CREATE ROLE cloudsqlsuperuser NOLOGIN; GRANT cloudsqlsuperuser TO postgres WITH ADMIN FALSE;'
 if($LASTEXITCODE){throw 'Bootstrap operator setup failed'}
 & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p $fixturePort -U postgres -O postgres payment_rehearsal
 if($LASTEXITCODE){throw 'Operator database creation failed'}
 & (Join-Path $pgBin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $fixturePort -U postgres -d payment_rehearsal -f "$PSScriptRoot/../database/Test-AgentAuditPrerequisites.sql"
 if($LASTEXITCODE){throw 'Operator audit role setup failed'}
 $savedFlyway=@{}
 Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { $savedFlyway[$_.Name]=$_.Value; Remove-Item "Env:$($_.Name)" }
 try {
  $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$fixturePort/payment_rehearsal"
  $env:FLYWAY_USER='postgres';$env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
  Push-Location $DbRepoRoot
  try { & (Get-FlywayPath) '-outputType=json' '-target=78' migrate | Out-File (Join-Path $fixtureRoot 'migration.json');if($LASTEXITCODE){throw 'V79 migration failed'} }
  finally {Pop-Location}

  $env:OPERATOR_PROOF_DISPOSABLE='1';$env:OPERATOR_PROOF_PORT=[string]$fixturePort;$env:OPERATOR_PROOF_PHASE=if($FailureProof){'failure'}else{'prepare'}
  & node --test "$PSScriptRoot/../../tests/integration/application-role-operator-independent.test.mjs"
  if($LASTEXITCODE){throw 'Operator preparation proof failed'}
  if($FailureProof){return}
  Push-Location $DbRepoRoot
  try { & (Get-FlywayPath) '-outputType=json' '-target=79' migrate | Out-File (Join-Path $fixtureRoot 'migration79.json');if($LASTEXITCODE){throw 'Actual operator V79 migration failed'} }
  finally {Pop-Location}
  $env:OPERATOR_PROOF_PHASE='finalize'
  & node --test "$PSScriptRoot/../../tests/integration/application-role-operator-independent.test.mjs"
  if($LASTEXITCODE){throw 'Operator finalization proof failed'}
  if($MaintenanceProof -or $MaintenanceFailureProof){
   $env:OPERATOR_MAINTENANCE_STATE=Join-Path $fixtureRoot 'maintenance-state.json'
   $env:OPERATOR_MAINTENANCE_PHASE=if($MaintenanceFailureProof){'failure'}else{'prepare'}
   & node --test "$PSScriptRoot/../../tests/integration/application-role-maintenance-independent.test.mjs"
   if($LASTEXITCODE){throw 'Maintenance preparation/failure proof failed'}
   if($MaintenanceProof){
    try {
     Push-Location $DbRepoRoot
     try { & (Get-FlywayPath) '-outputType=json' '-target=80' migrate | Out-File (Join-Path $fixtureRoot 'migration80.json');if($LASTEXITCODE){throw 'True operator V80 maintenance migration failed'} }
     finally {Pop-Location}
    } finally {
     $env:OPERATOR_MAINTENANCE_PHASE='restore'
     & node --test "$PSScriptRoot/../../tests/integration/application-role-maintenance-independent.test.mjs"
     if($LASTEXITCODE){throw 'Maintenance restoration proof failed'}
    }
   }
  }
 } finally {
  Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {Remove-Item "Env:$($_.Name)"}
  foreach($entry in $savedFlyway.GetEnumerator()){Set-Item "Env:$($entry.Key)" $entry.Value}
 }
} finally {
 Remove-Item Env:OPERATOR_PROOF_DISPOSABLE,Env:OPERATOR_PROOF_PORT,Env:OPERATOR_PROOF_PHASE,Env:OPERATOR_MAINTENANCE_STATE,Env:OPERATOR_MAINTENANCE_PHASE -ErrorAction SilentlyContinue
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
