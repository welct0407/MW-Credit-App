param([string]$TestNamePattern)
$ErrorActionPreference='Stop'
if($env:CI -ne 'true'){. "$PSScriptRoot/../../scripts/Enter-Dev.ps1"}
. "$PSScriptRoot/../../scripts/database/Common.ps1"
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
 # R114: Common.ps1's cross-platform tools (initdb/pg_ctl with or without .exe; hidden start on Windows, the socket
 # inside the owned fixture root on Linux).
 & (Get-PgTool initdb) -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 Start-PgServer $data (Join-Path $fixtureRoot 'postgres.log') $fixturePort $fixtureRoot;$started=$true
 $env:PHASE8_TEST_DISPOSABLE='1';$env:PHASE8_TEST_HOST='127.0.0.1';$env:PHASE8_TEST_PORT=[string]$fixturePort;$env:PHASE8_TEST_DATABASE=$database;$env:PHASE8_TEST_USER='postgres';$env:PHASE8_TEST_DATA_DIRECTORY=$data
 $env:PHASE8_TEST_FLYWAY_PATH=Get-FlywayPath;$env:PHASE8_TEST_REPOSITORY=$DbRepoRoot
 $arguments=@('--test','--test-concurrency=1');if($TestNamePattern){$arguments+=('--test-name-pattern='+$TestNamePattern)}
 & node @arguments "$PSScriptRoot/production-agent-receipts-independent.test.mjs"
 if($LASTEXITCODE){throw 'Phase8 identity tests failed'}
} finally {
 foreach($name in (@($names)+@('FLYWAY_URL','FLYWAY_USER','FLYWAY_CONFIG_FILES')|Select-Object -Unique)){[Environment]::SetEnvironmentVariable($name,$saved[$name])}
 if($started){Stop-PgServer $data;if($LASTEXITCODE){throw "Owned database stop failed; retained $fixtureRoot"}}
 $resolved=[IO.Path]::GetFullPath($fixtureRoot);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
 # R114: compare without a trailing separator of either kind (Windows \, Linux /), so /tmp/ and /tmp match as C:\Temp\ did.
 $separators=[char[]]@([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
 if([IO.Path]::GetDirectoryName($resolved).TrimEnd($separators) -ne $temp.TrimEnd($separators) -or [IO.Path]::GetFileName($resolved) -ne ('mw-phase8-'+$token)){throw 'Cleanup containment failed'}
 if((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup root link refused'}
 $ancestor=Split-Path $resolved -Parent
 while($ancestor){if((Get-Item -LiteralPath $ancestor).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Cleanup ancestor link refused'};$next=Split-Path $ancestor -Parent;if($next -eq $ancestor){break};$ancestor=$next}
 if(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Cleanup child link refused'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
 Write-Host "Owned Phase8 loopback fixture stopped and removed: $resolved"
}



