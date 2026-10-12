param([string]$TestNamePattern)
$ErrorActionPreference='Stop'
if($env:CI -ne 'true'){. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"}
. "$PSScriptRoot/../../scripts/database/Common.ps1"
$pgBin=Get-PgBin
$token=[guid]::NewGuid().ToString('N')
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('mw-phase8-'+$token)
$data=Join-Path $fixtureRoot 'data';$database='loan_manager_dev'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
Write-Host "Owned Phase8 disposable fixture: $fixtureRoot"
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$fixturePort=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false;$saved=@{}
$names=@('PHASE8_TEST_DISPOSABLE','PHASE8_TEST_HOST','PHASE8_TEST_PORT','PHASE8_TEST_DATABASE','PHASE8_TEST_USER','PHASE8_TEST_PASSWORD','PHASE8_TEST_DATA_DIRECTORY','PHASE8_TEST_FLYWAY_PATH','PHASE8_TEST_REPOSITORY')
Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object {$names+=$_.Name}
foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name);[Environment]::SetEnvironmentVariable($name,$null)}
try {
 & (Join-Path $pgBin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 $process=Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $fixtureRoot 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$fixturePort+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'start.out') -RedirectStandardError (Join-Path $fixtureRoot 'start.err')
 $process.WaitForExit();if($process.ExitCode){throw 'Disposable PostgreSQL start failed'};$started=$true
 $env:PHASE8_TEST_DISPOSABLE='1';$env:PHASE8_TEST_HOST='127.0.0.1';$env:PHASE8_TEST_PORT=[string]$fixturePort;$env:PHASE8_TEST_DATABASE=$database;$env:PHASE8_TEST_USER='postgres';$env:PHASE8_TEST_DATA_DIRECTORY=$data
 $env:PHASE8_TEST_FLYWAY_PATH=Get-FlywayPath;$env:PHASE8_TEST_REPOSITORY=$DbRepoRoot
 $arguments=@('--test','--test-concurrency=1');if($TestNamePattern){$arguments+=('--test-name-pattern='+$TestNamePattern)}
 & node @arguments "$PSScriptRoot/grouped-owner-maintenance-independent.test.mjs"
 if($LASTEXITCODE){throw 'Phase8 identity tests failed'}
} finally {
 foreach($name in (@($names)+@('FLYWAY_URL','FLYWAY_USER','FLYWAY_CONFIG_FILES')|Select-Object -Unique)){[Environment]::SetEnvironmentVariable($name,$saved[$name])}
 if($started){& (Join-Path $pgBin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null;if($LASTEXITCODE){throw "Owned database stop failed; retained $fixtureRoot"}}
 $resolved=[IO.Path]::GetFullPath($fixtureRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 if((Split-Path $resolved -Parent).TrimEnd('\') -ne $temp.TrimEnd('\') -or (Split-Path $resolved -Leaf) -ne ('mw-phase8-'+$token)){throw 'Cleanup containment failed'}
 if((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup root link refused'}
 $ancestor=Split-Path $resolved -Parent
 while($ancestor){if((Get-Item -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup ancestor link refused'};$next=Split-Path $ancestor -Parent;if($next -eq $ancestor){break};$ancestor=$next}
 if(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Cleanup child link refused'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
 Write-Host "Owned Phase8 loopback fixture stopped and removed: $resolved"
}


