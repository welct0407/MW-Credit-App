# Loopback-only disposable PostgreSQL, synthetic fixtures only; no migrations/live credentials.
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"
$pgBin=Split-Path (Get-Command psql.exe).Source
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-collection-test-'+[guid]::NewGuid().ToString('N'))
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
 & (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p $fixturePort -U postgres collection_fixture
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 $env:COLLECTION_TEST_DISPOSABLE='1';$env:COLLECTION_TEST_PORT=[string]$fixturePort
 & node --test "$PSScriptRoot/collection-postgres.test.mjs"
 if($LASTEXITCODE){throw 'Collection fixture checks failed'}
} finally {
 Remove-Item Env:COLLECTION_TEST_DISPOSABLE,Env:COLLECTION_TEST_PORT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}
 Write-Host "Stopped disposable PostgreSQL; synthetic diagnostics retained at $fixtureRoot"
}
