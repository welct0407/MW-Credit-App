[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.instance -ne 'appsheet-pg-prod-20260914' -or $target.host -ne '34.21.174.215' -or $target.database -ne 'loan_manager_dev'){
 throw 'DEV instance/host/database mismatch'
}
$saved=@{}
foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 @'
BEGIN;
LOCK TABLE "Partners" IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 ASSERT (SELECT count(*)=2 AND count(DISTINCT lower(btrim("Login Email")))=2 FROM "Partners"), 'Expected two mapped partners';
 ASSERT (SELECT count(*)=1 FROM "Partners" WHERE lower(btrim("Login Email"))='welct0407@mw-credit.com'), 'Owner login missing';
END $$;
UPDATE "Partners" SET "Email"='welct0407@mw-credit.com'
WHERE "Email" IS DISTINCT FROM 'welct0407@mw-credit.com';
SELECT json_build_object('partners',count(*),'distinctLogins',count(DISTINCT lower(btrim("Login Email")))),
 bool_and("Email"='welct0407@mw-credit.com') owner_only FROM "Partners";
COMMIT;
'@ | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'DEV recipient update failed'}
} finally {foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
