# DEV-only private recovery preparation. No live writes; restore uses owned loopback cluster.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
. "$PSScriptRoot/../Enter-Dev.ps1"
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
$bin=Get-PgBin
$private=Join-Path $DbPrivateRoot ('dev-activation-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $private | Out-Null
$dump=Join-Path $private 'loan_manager_dev.dump'
$restoreRoot=Join-Path $env:LOCALAPPDATA 'MWCredit/dev-activation-restores'
New-Item -ItemType Directory -Path $restoreRoot -Force | Out-Null
$data=Join-Path $restoreRoot ([guid]::NewGuid().ToString('N'))
$roleFile=Join-Path $private 'restore-roles.sql'
$started=$false
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim()
 $env:PGSSLMODE='require'
 & "$bin/pg_dump.exe" --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database) --format=custom --file=$dump 2> (Join-Path $private 'dump.err')
 if($LASTEXITCODE){throw 'DEV dump failed; see private diagnostic'}
 & "$bin/pg_restore.exe" --list $dump > (Join-Path $private 'archive.list')
 if($LASTEXITCODE){throw 'DEV archive listing failed'}
 # Referenced policy roles are restored as harmless local NOLOGIN names only.
 & "$bin/psql.exe" --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database) -X -A -t -v ON_ERROR_STOP=1 -c "SELECT format('CREATE ROLE %I NOLOGIN;',rolname) FROM pg_roles WHERE rolname <> 'postgres' AND rolname NOT LIKE 'pg_%' ORDER BY rolname" --output=$roleFile 2> (Join-Path $private 'roles.err')
 if($LASTEXITCODE){throw 'DEV role-name capture failed'}
 Remove-Item Env:PGPASSWORD
 $env:PGSSLMODE='disable'
 & "$bin/initdb.exe" -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C > (Join-Path $private 'init.out') 2> (Join-Path $private 'init.err')
 if($LASTEXITCODE){throw 'Private restore init failed'}
 $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
 $listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
 $process=Start-Process -FilePath "$bin/pg_ctl.exe" -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $data 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $private 'start.out') -RedirectStandardError (Join-Path $private 'start.err')
 $process.WaitForExit();if($process.ExitCode){throw 'Private restore start failed'}
 $started=$true
 & "$bin/psql.exe" -h 127.0.0.1 -p $port -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f $roleFile > (Join-Path $private 'role-create.out') 2> (Join-Path $private 'role-create.err')
 if($LASTEXITCODE){throw 'Local policy-role prerequisites failed'}
 & "$bin/createdb.exe" -h 127.0.0.1 -p $port -U postgres loan_manager_dev
 if($LASTEXITCODE){throw 'Private restore database creation failed'}
 & "$bin/pg_restore.exe" -h 127.0.0.1 -p $port -U postgres -d loan_manager_dev --no-owner --no-privileges --exit-on-error $dump > (Join-Path $private 'restore.out') 2> (Join-Path $private 'restore.err')
 if($LASTEXITCODE){throw 'DEV private restore failed; see private diagnostic'}
 $verification=& "$bin/psql.exe" -h 127.0.0.1 -p $port -U postgres -d loan_manager_dev -X -A -t -v ON_ERROR_STOP=1 -c "SELECT json_build_object('database',current_database(),'latestVersion',(SELECT version FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1),'historyRows',(SELECT count(*) FROM public.flyway_schema_history),'publicTables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'))"
 if($LASTEXITCODE){throw 'Restored history verification failed'}
 $evidence=[ordered]@{environment='development';instance=$target.instance;host=$target.host;database=$target.database;dumpSha256=(Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash.ToLowerInvariant();archiveListing='passed';restore='passed';restoreSemantics='schema/data restored with no ownership/ACL replay; policy role names local NOLOGIN only';restored=($verification | ConvertFrom-Json);completedAt=[DateTimeOffset]::UtcNow.ToString('o');privateRecoveryDirectory=$private}
 $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $private 'recovery.json') -Encoding utf8
 $evidence | ConvertTo-Json -Depth 5
} finally {
 if($started){& "$bin/pg_ctl.exe" -D $data -m fast -w stop > (Join-Path $private 'stop.out') 2> (Join-Path $private 'stop.err');if($LASTEXITCODE){Write-Warning 'Owned restore cluster stop failed; inspect private diagnostic'}}
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}


