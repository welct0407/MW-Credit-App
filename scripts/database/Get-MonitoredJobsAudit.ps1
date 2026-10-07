[CmdletBinding()]
param(
 [ValidateSet('development','production')][string]$Environment='development'
)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment $Environment
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on -c timezone=Asia/Bangkok'
 $cronSql = if ($Environment -eq 'production') {
  'SELECT row_to_json(j) FROM (SELECT jobid,jobname,schedule,active FROM cron.job) j;'
 } else {
  "SELECT json_build_object('cron','not installed in DEV; AppSheet owns scheduling');"
 }
 @"
SELECT json_build_object('as_of',statement_timestamp(),'statistics_rows',(SELECT count(*) FROM "Statistics"),
 'analytics_rows',(SELECT count(*) FROM "Daily Analytics"),'duplicate_dates',(SELECT count(*) FROM (SELECT "Snapshot Date" FROM "Daily Analytics" GROUP BY 1 HAVING count(*)>1) d),
 'null_snapshot_dates',(SELECT count(*) FROM "Daily Analytics" WHERE "Snapshot Date" IS NULL),
 'first_loan_date',(SELECT min("Loan Date") FROM "Loans"));
$cronSql
SELECT json_build_object('analytics_keys',md5(string_agg("Row ID"||'|'||"Snapshot Date"::text,',' ORDER BY "Snapshot Date"))) FROM "Daily Analytics";
SELECT json_build_object('original_42_keys',md5(string_agg("Row ID"||'|'||"Snapshot Date"::text,',' ORDER BY "Snapshot Date"))) FROM "Daily Analytics" WHERE "Snapshot Date" <= DATE '2026-09-15';
SELECT json_build_object('today_generated_charges',count(*),'today',(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date) FROM "Charges" WHERE "Row ID" LIKE 'cg8:%' AND "Charge Date"=(statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date;
SELECT json_build_object('duplicate_generated_loan_dates',count(*)) FROM (SELECT "Ref Loans","Charge Date" FROM "Charges" WHERE "Row ID" LIKE 'cg8:%' GROUP BY 1,2 HAVING count(*)>1) d;
SELECT json_build_object('request',"Analytics Refresh Request") FROM "Statistics";
SELECT row_to_json(d) FROM (SELECT "Snapshot Date","Generated At","Model Version","Principal Issued"::numeric,"Principal Returned"::numeric,"Interest Received"::numeric,"Outstanding Principal EOD"::numeric,"Pending Charges EOD"::numeric,"Unsettled Profit EOD"::numeric FROM "Daily Analytics" ORDER BY "Snapshot Date" DESC LIMIT 2) d;
SELECT json_build_object('table',table_name,'column',column_name,'type',data_type) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('Statistics','Daily Analytics') ORDER BY table_name,ordinal_position;
"@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Monitored jobs audit failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
