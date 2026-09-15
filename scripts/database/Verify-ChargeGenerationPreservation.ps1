[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Reviewed development host required'}
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/charge-generation-20260915'
$before=@(Get-Content (Join-Path $private 'database-before.jsonl') | ForEach-Object {$_ | ConvertFrom-Json} | Where-Object {$_.PSObject.Properties.Name -contains 'table'})
$prior=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGOPTIONS','PGCONNECT_TIMEOUT')){$prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10';$env:PGOPTIONS='-c default_transaction_read_only=on'
 $sql=@'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format('SELECT json_build_object(''table'',%L,''rows'',count(*),''fingerprint'',md5(coalesce(string_agg(md5((to_jsonb(t)%s)::text),'''' ORDER BY md5((to_jsonb(t)%s)::text)),''''))) FROM %I.%I t %s;',
 tablename,CASE WHEN tablename='Loans' THEN ' - ''Charge Generation Request''' ELSE '' END,
 CASE WHEN tablename='Loans' THEN ' - ''Charge Generation Request''' ELSE '' END,schemaname,tablename,
 CASE WHEN tablename IN ('Loans','Borrowers') THEN 'WHERE "Row ID" NOT LIKE ''CG8GUI-%'''
 WHEN tablename='Charges' THEN 'WHERE "Ref Loans" NOT LIKE ''CG8GUI-%''' ELSE '' END)
FROM pg_tables WHERE schemaname='public' AND tablename<>'flyway_schema_history' ORDER BY tablename
\gexec
COMMIT;
'@
 $raw=$sql | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -U $target.user -d $target.database
 if($LASTEXITCODE){throw 'Preservation audit failed'}
 $after=@($raw | Where-Object {$_} | ForEach-Object {$_ | ConvertFrom-Json})
 if($before.Count -ne $after.Count){throw 'Business table inventory changed'}
 foreach($b in $before){$a=@($after | Where-Object table -eq $b.table);if($a.Count -ne 1 -or $a[0].rows -ne $b.rows -or $a[0].fingerprint -ne $b.fingerprint){throw "Original records changed: $($b.table)"}}
 [pscustomobject]@{originalTables=$before.Count;allOriginalRowsPreserved=$true;excludedFixture='CG8GUI';excludedNewColumn='Loans.Charge Generation Request';verifiedAt=(Get-Date).ToString('o')} | ConvertTo-Json
}finally{foreach($name in $prior.Keys){[Environment]::SetEnvironmentVariable($name,$prior[$name],'Process')}}
