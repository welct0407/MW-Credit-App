[CmdletBinding()]
param([switch]$PrepareDefault)
# Test-fixture DML only: request the existing daily-charge processor for one
# explicitly labeled R005 DEV loan. No schema change or ordinary record writes.
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment 'development'
if($target.host -ne '34.158.38.171'){throw 'Reviewed DEV host required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c timezone=Asia/Bangkok'
 $fixtureSql=@'
BEGIN;
DO $test$
DECLARE changed integer;
BEGIN
 UPDATE "Loans" SET "Charge Generation Request"=to_char(current_date,'YYYY-MM-DD')||'|R005-GUI-fixture'
 WHERE "Loan Arrangement"='R005 GUI synthetic direct receipt and default test; no real lending'
 AND "Loan Status"='ยังไม่ปิดยอด' AND "Loan Date"='2026-09-17' AND "Principal Amount"::numeric=1000;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Exactly one synthetic R005 loan required, found %',changed; END IF;
END $test$;
COMMIT;
SELECT json_build_object('fixture','R005 direct receipt/default','charges',count(*),'total_charge',sum(coalesce(c."Interest Due"::numeric,0)+coalesce(c."Principal Due"::numeric,0))) FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Loan Arrangement"='R005 GUI synthetic direct receipt and default test; no real lending';
'@
 if($PrepareDefault){$fixtureSql=$fixtureSql.Replace('UPDATE "Loans" SET "Charge Generation Request"=to_char(current_date,''YYYY-MM-DD'')||''|R005-GUI-fixture''','UPDATE "Charges" SET "Interest Due"=40::numeric::money WHERE "Ref Loans" IN (SELECT "Row ID" FROM "Loans"').Replace('AND "Loan Status"=''ยังไม่ปิดยอด'' AND "Loan Date"=''2026-09-17'' AND "Principal Amount"::numeric=1000;','AND "Loan Status"=''ยังไม่ปิดยอด'' AND "Loan Date"=''2026-09-17'' AND "Principal Amount"::numeric=1000) AND "Charge Date"=current_date;')}
 $fixtureSql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'R005 fixture charge request failed'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}


