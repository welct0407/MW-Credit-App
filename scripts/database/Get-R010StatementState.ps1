[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if($target.instance -ne 'appsheet-pg-prod-20260914' -or $target.host -ne '34.21.174.215' -or $target.database -ne 'loan_manager_dev'){
 throw 'Unexpected DEV instance/host/database'
}
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
 'server',inet_server_addr(),'database',current_database(),
 'accounts',(SELECT count(*) FROM "Cash Accounts"),
 'contextRows',(SELECT count(*) FROM "Cash Statement Context"),
 'partners',(SELECT count(*) FROM "Partners"),
 'missingLoginMappings',(SELECT count(*) FROM "Partners" WHERE nullif(btrim("Login Email"),'') IS NULL),
 'statementRows',(SELECT count(*) FROM "Cash Account Statement Recent"),
 'summaryRows',(SELECT count(*) FROM "Cash Account Daily Summary Recent"),
 'unknownTypes',(SELECT count(*) FROM "Cash Account Statement Recent" WHERE "Transaction Type Code"='OTHER'),
 'duplicateKeys',(SELECT count(*)-count(DISTINCT "Row ID") FROM "Cash Account Statement Recent"),
 'outsideWindow',(SELECT count(*) FROM "Cash Account Statement Recent" WHERE "Statement Date" NOT BETWEEN (now() AT TIME ZONE 'Asia/Bangkok')::date-14 AND (now() AT TIME ZONE 'Asia/Bangkok')::date),
 'dailyMismatch',(SELECT count(*) FROM "Cash Account Daily Summary Recent" s LEFT JOIN (SELECT "Ref Cash Account","Statement Date",sum("Signed Amount") n FROM "Cash Account Statement Recent" GROUP BY 1,2) l USING("Ref Cash Account","Statement Date") WHERE s."Net Movement"<>coalesce(l.n,0) OR s."Opening Balance"+s."Net Movement"<>s."Closing Balance"),
 'currentMismatch',(SELECT count(*) FROM "Cash Account Daily Summary Recent" s JOIN "Cash Account Balances" b USING("Ref Cash Account") WHERE s."Statement Date"=(now() AT TIME ZONE 'Asia/Bangkok')::date AND s."Closing Balance" IS DISTINCT FROM b."Current Balance"),
 'incorrectUnknownBalance',(SELECT count(*) FROM "Cash Account Daily Summary Recent" WHERE NOT "Is Initialized" AND ("Opening Balance" IS NOT NULL OR "Closing Balance" IS NOT NULL)),
 'lastLineMismatch',(SELECT count(*) FROM "Cash Account Daily Summary Recent" s JOIN LATERAL (SELECT "Balance After" FROM "Cash Account Statement Recent" l WHERE l."Ref Cash Account"=s."Ref Cash Account" AND l."Statement Date"=s."Statement Date" ORDER BY l."Sort Timestamp" DESC,l."Row ID" COLLATE "C" DESC LIMIT 1) l ON true WHERE l."Balance After" IS DISTINCT FROM s."Closing Balance")
);
COMMIT;
'@
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'DEV statement read failed'}
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
