param([string]$PgBin="$env:LOCALAPPDATA/AppSheetLoanTools/postgresql-18.6-3/pgsql/bin")
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA ('AppSheetLoanTools/reviewer-dml-test-'+[guid]::NewGuid().ToString('N'))
$data=Join-Path $root 'data'
New-Item -ItemType Directory -Path $root | Out-Null
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 & "$PgBin/initdb.exe" -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Disposable initdb failed'}
 $p=Start-Process -FilePath "$PgBin/pg_ctl.exe" -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $root 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput "$root/start.out" -RedirectStandardError "$root/start.err"
 $p.WaitForExit();if($p.ExitCode){throw 'Disposable server start failed'};$started=$true
 & "$PgBin/createdb.exe" -h 127.0.0.1 -p $port -U postgres mw_dml_test
 if($LASTEXITCODE){throw 'Disposable database creation failed'}
 $env:MW_DML_TEST_DSN="host=127.0.0.1 port=$port user=postgres dbname=mw_dml_test"
 & "$PSScriptRoot/../.venv/Scripts/python.exe" -X utf8 -m unittest discover -s "$PSScriptRoot/../tests" -p test_conversation_dml.py -v
 if($LASTEXITCODE){throw 'Reviewer DML tests failed'}
} finally {
 Remove-Item Env:MW_DML_TEST_DSN -ErrorAction SilentlyContinue
 if($started){ & "$PgBin/pg_ctl.exe" -D $data -m fast -w stop | Out-Null }
}
