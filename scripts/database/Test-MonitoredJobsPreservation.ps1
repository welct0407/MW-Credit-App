[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try {
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
 $env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format($q$
WITH rows AS (SELECT CASE WHEN %L='Statistics' THEN to_jsonb(t)-'Analytics Refresh Request' ELSE to_jsonb(t) END j FROM public.%I t), kept AS (
SELECT j FROM rows WHERE NOT (
coalesce(j->>'Row ID','') LIKE 'MJ11GUI-%%' OR
coalesce(j->>'Ref Borrowers','') LIKE 'MJ11GUI-%%' OR
coalesce(j->>'Ref Borrower','') LIKE 'MJ11GUI-%%' OR
coalesce(j->>'Ref Loans','') IN (SELECT "Row ID" FROM "Loans" WHERE "Ref Borrowers" LIKE 'MJ11GUI-%%') OR
coalesce(j->>'Ref Payment','') IN (SELECT "Row ID" FROM "Payments" WHERE "Ref Borrower" LIKE 'MJ11GUI-%%') OR
coalesce(j->>'Ref Charges','') IN (SELECT c."Row ID" FROM "Charges" c JOIN "Loans" l ON l."Row ID"=c."Ref Loans" WHERE l."Ref Borrowers" LIKE 'MJ11GUI-%%')))
SELECT json_build_object('table',%L,'rows',count(*),'fingerprint',md5(coalesce(string_agg(md5(j::text),'' ORDER BY md5(j::text)),''))) FROM kept;
$q$,tablename,tablename,tablename)
FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('flyway_schema_history','Daily Analytics') ORDER BY tablename
\gexec
COMMIT;
'@
 $result=$sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Preservation query failed'}
 $baseline=Get-Content 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-20260915/database-before.jsonl' | ForEach-Object {$_|ConvertFrom-Json} | Where-Object {$_.PSObject.Properties.Name -contains 'table'}
 $after=$result | ForEach-Object {$_|ConvertFrom-Json}
 $checks=foreach($b in ($baseline | Where-Object table -ne 'Daily Analytics')){$a=$after|Where-Object table -eq $b.table;[pscustomobject]@{table=$b.table;rows=$a.rows;unchanged=($a.rows -eq $b.rows -and $a.fingerprint -eq $b.fingerprint)}}
 $checks | ConvertTo-Json | Set-Content 'outputs/monitored-jobs-20260915/original-record-preservation.json' -Encoding utf8
 $checks | Format-Table
 if($checks.unchanged -contains $false){throw 'Original record fingerprint mismatch'}
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
