[CmdletBinding()]
param([ValidateSet('development','production')][string]$Environment='development')
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$saved=@{}; foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content $target.passwordFile -Raw).Trim(); $env:PGSSLMODE='require'; $env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN READ ONLY;
SELECT json_build_object('kind','identity','database',current_database(),'ssl',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),'migration',(SELECT version FROM public.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1));
SELECT json_build_object('kind','categories','category',"Expense Category",'source',"Source Type",'count',count(*),'amount',sum("Amount"::numeric)) FROM public."Business Expenses" GROUP BY 1=1,"Expense Category","Source Type";
SELECT json_build_object('kind','function','definition',pg_get_functiondef('public.create_referral_rebate(text)'::regprocedure));
SELECT json_build_object('kind','requested_backlog','found',count(*)=1,'category',min("Expense Category"),'other_fields_expected',bool_and("Expense Date"='2026-09-16' AND "Amount"::numeric=660 AND "Source Type"='Manual' AND "Ref Related Loan" IS NOT NULL),'noncategory_fingerprint',md5(string_agg((to_jsonb(e)-'Expense Category')::text,'' ORDER BY "Row ID"))) FROM public."Business Expenses" e WHERE "Row ID"='eac43ef2';
COMMIT;
'@
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R004 read-only state failed'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
