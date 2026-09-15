[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$oldPassword=$env:PGPASSWORD; $oldSsl=$env:PGSSLMODE; $oldTimeout=$env:PGCONNECT_TIMEOUT
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
 'verified_at',now(),'database',current_database(),'version',current_setting('server_version'),
 'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'max_connections',current_setting('max_connections'),
 'tables',(SELECT json_agg(x ORDER BY table_name) FROM (SELECT table_name,table_type FROM information_schema.tables WHERE table_schema='public') x),
 'columns',(SELECT json_agg(x ORDER BY table_name,ordinal_position) FROM (SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name<>'flyway_schema_history') x),
 'constraints',(SELECT json_agg(x ORDER BY table_name,name) FROM (SELECT c.relname AS table_name,con.conname AS name,con.contype AS type,con.convalidated AS validated,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'flyway_schema_history') x),
 'triggers',(SELECT json_agg(x ORDER BY table_name,name) FROM (SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public') x),
 'functions',(SELECT json_agg(x ORDER BY schema,name) FROM (SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,md5(pg_get_functiondef(p.oid)) AS definition_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','assessment_lab') AND p.prokind='f') x),
 'indexes',(SELECT json_agg(x ORDER BY table_name,name) FROM (SELECT c.relname AS table_name,i.relname AS name,ix.indisvalid AS valid,pg_get_indexdef(i.oid) AS definition FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'flyway_schema_history') x),
 'flyway',(SELECT json_agg(x ORDER BY installed_rank) FROM (SELECT installed_rank,version,description,type,success FROM public.flyway_schema_history) x)
);
COMMIT;
'@
 $result=$sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database)
 if($LASTEXITCODE){throw 'Read-only documentation inventory failed'}
 $result
} finally { $env:PGPASSWORD=$oldPassword; $env:PGSSLMODE=$oldSsl; $env:PGCONNECT_TIMEOUT=$oldTimeout }
