[CmdletBinding()]
param([switch]$Apply)
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if($target.host -ne '34.158.38.171'){throw 'Reviewed DEV host required'}
$previous=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$previous[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c timezone=Asia/Bangkok'
 $sql=@'
BEGIN;
SET LOCAL r005.allow_cash_adjustment='on';
SELECT json_build_object('view_exists',EXISTS(SELECT 1 FROM pg_class WHERE oid='public."Cash Holder Balances"'::regclass AND relkind='v'));
SELECT json_build_object('phase','before','holder',"Ref Cash Holder",'balance',"Current Balance") FROM "Cash Holder Balances" ORDER BY "Ref Cash Holder";
INSERT INTO "Cash Ledger"("Row ID","Movement Date","Movement Type","Amount","Ref To Cash Holder","Source Key","Notes","Created By")
VALUES('r005-test-opening-dad','2026-09-18','Opening Balance',18000,'ch:dad','MANUAL:r005-test-opening-dad','R005 DEV test opening cash: owner authorized 18000 for Dad on 18 September 2026','R005 DEV test fixture'),
('r005-test-opening-lisa','2026-09-18','Opening Balance',30000,'ch:lisa','MANUAL:r005-test-opening-lisa','R005 DEV test opening cash: owner authorized 30000 for Lisa on 18 September 2026','R005 DEV test fixture')
ON CONFLICT ("Row ID") DO NOTHING;
DO $$ BEGIN
 IF (SELECT count(*) FROM "Cash Ledger" WHERE ("Row ID","Ref To Cash Holder","Amount","Movement Type") IN
 (('r005-test-opening-dad','ch:dad',18000,'Opening Balance'),('r005-test-opening-lisa','ch:lisa',30000,'Opening Balance')))<>2
 THEN RAISE EXCEPTION 'Existing fixture differs from authorized opening amounts'; END IF;
END $$;
SELECT json_build_object('phase','after','holder',"Ref Cash Holder",'balance',"Current Balance",'business_cash_held',"Business Cash Held") FROM "Cash Holder Balances" ORDER BY "Ref Cash Holder";
SELECT json_build_object('fixture_count',count(*),'fixture_total',sum("Amount")) FROM "Cash Ledger" WHERE "Row ID" IN ('r005-test-opening-dad','r005-test-opening-lisa');
'@
 $sql += $(if($Apply){"`nCOMMIT;"}else{"`nROLLBACK;"})
 $sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'DEV opening cash fixture failed'}
}finally{foreach($name in $previous.Keys){[Environment]::SetEnvironmentVariable($name,$previous[$name],'Process')}}
