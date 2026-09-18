[CmdletBinding()]
param([switch]$SchemaMetadata)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'production'
if($target.host -ne '34.21.174.215'){throw 'Reviewed production host required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on -c timezone=Asia/Bangkok'
 if($SchemaMetadata){
 @'
SELECT json_build_object('columns',(SELECT json_agg(q) FROM (SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND (table_name IN ('Cash Holders','Cash Ledger','Cash Holder Balances','r005_cash_cutover_sources') OR column_name IN ('Ref Received By Cash Holder','Ref Paid By Cash Holder')) ORDER BY table_name,ordinal_position) q),'constraints',(SELECT json_agg(q) FROM (SELECT c.relname AS table_name,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (c.relname IN ('Cash Holders','Cash Ledger','r005_cash_cutover_sources') OR k.conname ILIKE '%cash_holder%') ORDER BY 1,2) q));
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 }else{
 @'
SELECT json_build_object('environment','production','as_of',statement_timestamp(),'version',(SELECT max(version::integer) FROM flyway_schema_history WHERE success),'ledger_rows',(SELECT count(*) FROM "Cash Ledger"),'holders',(SELECT count(*) FROM "Cash Holders"));
SELECT json_build_object('legacy_nonnull_receivers',(SELECT count(*) FROM "Payments" p JOIN r005_cash_cutover_sources c ON c.source_type='Payment' AND c.source_row_id=p."Row ID" WHERE p."Ref Received By Cash Holder" IS NOT NULL),'legacy_nonnull_payers',(SELECT count(*) FROM "Business Expenses" e JOIN r005_cash_cutover_sources c ON c.source_type='Business Expense' AND c.source_row_id=e."Row ID" WHERE e."Ref Paid By Cash Holder" IS NOT NULL),'historical_cash_rows',(SELECT count(*) FROM "Cash Ledger" l JOIN r005_cash_cutover_sources c ON c.source_type=l."Source Type" AND c.source_row_id=coalesce(l."Ref Payment",l."Ref Loan",l."Ref Business Expense",l."Ref Settlement")));
SELECT json_build_object('dev_opening_fixtures',count(*)) FROM "Cash Ledger" WHERE "Row ID" IN ('r005-test-opening-dad','r005-test-opening-lisa');
SELECT json_build_object('bad_system_source_duplicates',count(*)) FROM (SELECT "Source Type","Source Key" FROM "Cash Ledger" WHERE "Entry Origin"='System' GROUP BY 1,2 HAVING count(*)>1) q;
SELECT json_build_object('holder_count',count(*),'balance_mismatch_count',count(*) FILTER(WHERE b."Current Balance" IS DISTINCT FROM coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref To Cash Holder"=b."Ref Cash Holder"),0)-coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref From Cash Holder"=b."Ref Cash Holder"),0))) FROM "Cash Holder Balances" b;
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 }
 if($LASTEXITCODE){throw 'R005 production readback failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
