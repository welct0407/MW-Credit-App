[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if($target.host -ne '34.158.38.171'){throw 'Reviewed DEV host required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on -c timezone=Asia/Bangkok'
 @'
SELECT json_build_object('environment','development','as_of',statement_timestamp(),'version',(SELECT max(version::integer) FROM flyway_schema_history WHERE success),'ledger_rows',(SELECT count(*) FROM "Cash Ledger"),'holders',(SELECT count(*) FROM "Cash Holders"));
SELECT json_build_object('cutover_type',source_type,'rows',count(*)) FROM r005_cash_cutover_sources GROUP BY source_type ORDER BY source_type;
SELECT json_build_object('legacy_nonnull_receivers',(SELECT count(*) FROM "Payments" p JOIN r005_cash_cutover_sources c ON c.source_type='Payment' AND c.source_row_id=p."Row ID" WHERE p."Ref Received By Cash Holder" IS NOT NULL),'legacy_nonnull_payers',(SELECT count(*) FROM "Business Expenses" e JOIN r005_cash_cutover_sources c ON c.source_type='Business Expense' AND c.source_row_id=e."Row ID" WHERE e."Ref Paid By Cash Holder" IS NOT NULL),'historical_cash_rows',(SELECT count(*) FROM "Cash Ledger" l JOIN r005_cash_cutover_sources c ON c.source_type=l."Source Type" AND c.source_row_id=coalesce(l."Ref Payment",l."Ref Loan",l."Ref Business Expense",l."Ref Settlement")));
SELECT row_to_json(j) FROM (SELECT jobname,schedule,active,database,md5(command) command_hash FROM cron.job ORDER BY jobid) j;
SELECT json_build_object('bad_system_source_duplicates',count(*)) FROM (SELECT "Source Type","Source Key" FROM "Cash Ledger" WHERE "Entry Origin"='System' GROUP BY 1,2 HAVING count(*)>1) q;
SELECT json_build_object('holder_count',count(*),'balance_mismatch_count',count(*) FILTER(WHERE b."Current Balance" IS DISTINCT FROM coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref To Cash Holder"=b."Ref Cash Holder"),0)-coalesce((SELECT sum("Amount") FROM "Cash Ledger" WHERE "Ref From Cash Holder"=b."Ref Cash Holder"),0))) FROM "Cash Holder Balances" b;
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R005 DEV readback failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
