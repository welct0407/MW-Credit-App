[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$private = 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r002-production-20260916'
$bin = Get-PgBin
$root = Join-Path $DbToolRoot ('r002-production-restore-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$data = Join-Path $root 'data'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$started = $false
$priorPassword = $env:PGPASSWORD
$priorSsl = $env:PGSSLMODE
$env:PGPASSWORD = $null
$env:PGSSLMODE = 'disable'
try {
    & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE) { throw 'initdb failed' }
    $p = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $root 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'start.out') -RedirectStandardError (Join-Path $root 'start.err')
    $p.WaitForExit(); if ($p.ExitCode) { throw 'Local server start failed' }; $started = $true
    & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -c 'CREATE SCHEMA assessment_lab'
    if ($LASTEXITCODE) { throw 'Local assessment schema setup failed' }
    & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab (Join-Path $private 'production-before.dump') 2> (Join-Path $root 'restore.err')
    if ($LASTEXITCODE) { throw "Restore failed; private diagnostic $root" }
    $sql = @'
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),''''))) FROM %I.%I t;',tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
'@
    $actual = $sql | & (Join-Path $bin 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
    if ($LASTEXITCODE) { throw 'Restore verification query failed' }
    $before = @(Get-Content (Join-Path $private 'database-before.jsonl') | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.PSObject.Properties.Name -contains 'table' })
    $after = @($actual | ForEach-Object { $_ | ConvertFrom-Json })
    if (($before | ConvertTo-Json -Compress) -ne ($after | ConvertTo-Json -Compress)) { throw 'Restored production fingerprints differ' }
    $dump = Join-Path $root 'restored.sql'
    & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
    if ($LASTEXITCODE) { throw 'Restored schema export failed' }
    & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
    if ((Get-FileHash "$dump.normalized").Hash -ne (Get-FileHash (Join-Path $private 'schema-before.normalized.sql')).Hash) { throw 'Restored production schema differs' }
    [pscustomobject]@{
        businessTablesRestored = $after.Count
        allFingerprintsMatch = $true
        normalizedSchemaMatches = $true
        backupSha256 = (Get-FileHash (Join-Path $private 'production-before.dump')).Hash.ToLowerInvariant()
        scope = 'public and assessment_lab; Cloud SQL cron extension/settings excluded'
    } | ConvertTo-Json
} finally {
    if ($started) { & (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null }
    $env:PGPASSWORD = $priorPassword
    $env:PGSSLMODE = $priorSsl
}
