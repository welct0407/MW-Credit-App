param([string]$BackupDirectory='', [string]$Environments='C:/GitHub/AppSheet-Loan-Project/database/environments.json',
 [string]$PgBin="$env:LOCALAPPDATA/AppSheetLoanTools/postgresql-18.6-3/pgsql/bin")
$ErrorActionPreference='Stop'
$target=(Get-Content -LiteralPath $Environments -Raw | ConvertFrom-Json).production
if($target.instance -ne 'appsheet-pg-prod-20260914' -or $target.host -ne '34.21.174.215' -or $target.database -ne 'loan_manager_prod'){throw 'Unexpected target'}
$private=Join-Path 'C:/Users/MWCredit/Documents/ChatGPT/MW-Integration-Agent' ('reviewer-dml-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if($BackupDirectory){$private=(Resolve-Path -LiteralPath $BackupDirectory).Path}else{New-Item -ItemType Directory -Path $private | Out-Null}
$savedPassword=$env:PGPASSWORD;$savedSsl=$env:PGSSLMODE
$started=$false
try {
 if(-not $BackupDirectory){
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 & "$PgBin/pg_dump.exe" -h $target.host -p $target.port -U $target.user -d $target.database --format=custom --no-owner --no-privileges --file="$private/production.dump" 2> "$private/dump.err"
 if($LASTEXITCODE){throw 'Private backup failed'}
 Remove-Item Env:PGPASSWORD;Remove-Item Env:PGSSLMODE
 }
 $data=Join-Path $private ('restore-data-'+[guid]::NewGuid().ToString('N'))
 & "$PgBin/initdb.exe" -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'Restore cluster creation failed'}
 $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
 $p=Start-Process -FilePath "$PgBin/pg_ctl.exe" -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $private 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput "$private/start.out" -RedirectStandardError "$private/start.err"
 $p.WaitForExit();if($p.ExitCode){throw 'Restore server start failed'};$started=$true
 & "$PgBin/createdb.exe" -h 127.0.0.1 -p $port -U postgres mw_dml_restore
 if($LASTEXITCODE){throw 'Restore database creation failed'}
 & "$PgBin/psql.exe" -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d mw_dml_restore -c 'CREATE SCHEMA assessment_lab'
 & "$PgBin/pg_restore.exe" -h 127.0.0.1 -p $port -U postgres -d mw_dml_restore --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab "$private/production.dump" 2> "$private/restore.err"
 if($LASTEXITCODE){throw "Restore failed; private diagnostics: $private"}
 $env:MW_DML_TEST_DSN="host=127.0.0.1 port=$port user=postgres dbname=mw_dml_restore"
 & "$PSScriptRoot/../.venv/Scripts/python.exe" -X utf8 "$PSScriptRoot/verify-dml-restored.py"
 if($LASTEXITCODE){throw "Role rehearsal failed; private diagnostics: $private"}
 $result=@{backup=$private;sha256=(Get-FileHash "$private/production.dump" -Algorithm SHA256).Hash;restored=$true;scope='public and assessment_lab; no Cloud SQL instance/cron changes'}
 $result | ConvertTo-Json | Set-Content "$private/verification.json"
 $result | ConvertTo-Json
} finally {
 $env:PGPASSWORD=$savedPassword;$env:PGSSLMODE=$savedSsl
 Remove-Item Env:MW_DML_TEST_DSN -ErrorAction SilentlyContinue
 if($started){& "$PgBin/pg_ctl.exe" -D $data -m fast -w stop | Out-Null}
}
