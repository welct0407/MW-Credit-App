[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$oldPassword=$env:PGPASSWORD
$oldSsl=$env:PGSSLMODE
$oldTimeout=$env:PGCONNECT_TIMEOUT
try {
    $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
    $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
    # Aggregate fingerprints only: no record contents are returned or persisted.
    $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('database',current_database(),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'version',current_setting('server_version'),'max_connections',current_setting('max_connections'));
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' ORDER BY md5(to_jsonb(t)::text)),''''))) FROM %I.%I t;',tablename,schemaname,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
COMMIT;
'@
    $result=$sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database)
    if ($LASTEXITCODE) { throw 'Read-only database audit failed' }
    $result
} finally { $env:PGPASSWORD=$oldPassword; $env:PGSSLMODE=$oldSsl; $env:PGCONNECT_TIMEOUT=$oldTimeout }
