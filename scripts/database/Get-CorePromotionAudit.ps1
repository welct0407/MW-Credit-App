[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment production
if($target.host -ne '34.21.174.215' -or $target.database -ne 'loan_manager_prod'){throw 'Reviewed production target required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on'
 @'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('as_of_bangkok',statement_timestamp() AT TIME ZONE 'Asia/Bangkok','database',current_database());
-- Compare the original V5 columns with the pre-release audit. New nullable
-- command/reference fields are checked separately and cannot mask old-row edits.
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5((to_jsonb(t) - %L::text[])::text),'''' ORDER BY md5((to_jsonb(t) - %L::text[])::text)),''''))) FROM public.%I t;',
 tablename,CASE tablename WHEN 'Loans' THEN '{Ref Closing Payment,Charge Generation Request}' WHEN 'Payments' THEN '{Ref Target Loan}' ELSE '{}' END,
 CASE tablename WHEN 'Loans' THEN '{Ref Closing Payment,Charge Generation Request}' WHEN 'Payments' THEN '{Ref Target Loan}' ELSE '{}' END,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
SELECT json_build_object('processing',(SELECT count(*) FROM "Payments" WHERE "Status"='Processing'),'errors',(SELECT count(*) FROM "Payments" WHERE "Status"='Error'),
 'new_loan_references',(SELECT count(*) FROM "Loans" WHERE "Ref Closing Payment" IS NOT NULL OR "Charge Generation Request" IS NOT NULL),
 'new_payment_targets',(SELECT count(*) FROM "Payments" WHERE "Ref Target Loan" IS NOT NULL));
SELECT json_build_object('analytics_excluding_generated_at',md5(coalesce(string_agg(md5((to_jsonb(t)-'Generated At')::text),'' ORDER BY md5((to_jsonb(t)-'Generated At')::text)),''))) FROM "Daily Analytics" t;
SELECT json_build_object('column',column_name,'table',table_name,'position',ordinal_position,'type',data_type,'nullable',is_nullable,'default',column_default)
FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Loans' AND column_name IN ('Ref Closing Payment','Charge Generation Request')) OR (table_name='Payments' AND column_name='Ref Target Loan')) ORDER BY table_name,ordinal_position;
SELECT json_build_object('constraint',c.conname,'table',c.conrelid::regclass::text,'type',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid)) FROM pg_constraint c
WHERE c.connamespace='public'::regnamespace AND (pg_get_constraintdef(c.oid) LIKE '%Ref Closing Payment%' OR pg_get_constraintdef(c.oid) LIKE '%Ref Target Loan%') ORDER BY c.conname;
SELECT json_build_object('kind','function','schema',n.nspname,'name',p.proname,'hash',md5(pg_get_functiondef(p.oid)),'arguments',pg_get_function_identity_arguments(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','assessment_lab') AND p.prokind='f' ORDER BY n.nspname,p.proname;
SELECT json_build_object('kind','trigger','table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT json_build_object('kind','index','table',tablename,'name',indexname,'definition',indexdef) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('loans_closing_payment_idx','payments_target_loan_idx') ORDER BY indexname;
COMMIT;
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Core promotion audit failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
