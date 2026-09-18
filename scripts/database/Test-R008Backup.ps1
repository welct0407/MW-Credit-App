[CmdletBinding()]
param([ValidatePattern('^[a-z0-9-]+$')][string]$Label='development-before',[switch]$Candidate)
. "$PSScriptRoot/Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r008-20260918'
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('r008-restore-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$data=Join-Path $root 'data'
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
 if($LASTEXITCODE){throw 'initdb failed'}
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $root 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'start.out') -RedirectStandardError (Join-Path $root 'start.err')
 $p.WaitForExit();if($p.ExitCode){throw 'Local server start failed'};$started=$true
 & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -c 'CREATE SCHEMA assessment_lab'
 & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab (Join-Path $private "$Label.dump") 2> (Join-Path $root 'restore.err')
 if($LASTEXITCODE){throw "Restore failed; private diagnostic $root"}
 $dump=Join-Path $root 'restored.sql'
 & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
 if($LASTEXITCODE){throw 'Restored schema export failed'}
 & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
 $expected=[IO.File]::ReadAllText((Join-Path $private "$Label.normalized.sql"))
 $actual=[IO.File]::ReadAllText("$dump.normalized")
 # PostgreSQL deparser flattens this one V22 associative AND on restore.
 # Normalize only this independently inspected expression; reject any other drift.
 $expected=$expected.Replace('(((r."Payment Date" >= (ctx.d - 29)) AND (r."Payment Date" <= ctx.d)) AND ((r."Interest Paid")::numeric > (0)::numeric))','((r."Payment Date" >= (ctx.d - 29)) AND (r."Payment Date" <= ctx.d) AND ((r."Interest Paid")::numeric > (0)::numeric))')
 if($expected -cne $actual){throw 'Restored backup schema differs'}
 if($Candidate){
  $beforeSql=@'
CREATE TABLE public.r008_test_fingerprints AS
SELECT t,md5(string_agg(j::text,'' ORDER BY j->>'Row ID')) h FROM (
 SELECT 'Borrowers' t,to_jsonb(x) j FROM "Borrowers" x UNION ALL
 SELECT 'Loans',to_jsonb(x) FROM "Loans" x UNION ALL SELECT 'Charges',to_jsonb(x) FROM "Charges" x UNION ALL
 SELECT 'Payments',to_jsonb(x) FROM "Payments" x UNION ALL SELECT 'Business Expenses',to_jsonb(x) FROM "Business Expenses" x UNION ALL
 SELECT 'Settlements',to_jsonb(x) FROM "Settlements" x UNION ALL SELECT 'Cash Ledger',to_jsonb(x) FROM "Cash Ledger" x
) q GROUP BY t;
CREATE TABLE public.r008_test_views AS
SELECT t,md5(string_agg(j::text,'' ORDER BY j->>'Row ID')) h FROM (
 SELECT 'Borrowers' t,to_jsonb(x) j FROM olap_borrowers_analytics x UNION ALL
 SELECT 'Loans',to_jsonb(x) FROM olap_loans_analytics x UNION ALL SELECT 'Charges',to_jsonb(x) FROM olap_charges_analytics x
) q GROUP BY t;
'@
  $beforeSql | & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
  if($LASTEXITCODE){throw 'Pre-candidate fingerprints failed'}
  & (Join-Path $bin 'psql.exe') -X -q -1 -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f (Join-Path $DbRepoRoot 'database/migrations/V23__cash_accounts_and_payment_requests.sql')
  if($LASTEXITCODE){throw 'R008 candidate rehearsal failed'}
  $afterSql=@'
DO $$ DECLARE mismatches integer; BEGIN
WITH current_values AS (
 SELECT 'Borrowers' t,to_jsonb(x) j FROM "Borrowers" x UNION ALL
 SELECT 'Loans',to_jsonb(x) FROM "Loans" x UNION ALL SELECT 'Charges',to_jsonb(x) FROM "Charges" x UNION ALL
 SELECT 'Payments',to_jsonb(x) FROM "Payments" x UNION ALL SELECT 'Business Expenses',to_jsonb(x) FROM "Business Expenses" x UNION ALL
 SELECT 'Settlements',to_jsonb(x) FROM "Settlements" x UNION ALL SELECT 'Cash Ledger',to_jsonb(x) FROM "Cash Ledger" x
), hashes AS (SELECT t,md5(string_agg((j-ARRAY['Ref Preferred Receiving Cash Account','Payment Request Cash Account','Payment Request Token','Ref Disbursed From Cash Account','Ref Received By Cash Account','Ref Paid By Cash Account','Ref Paid From Cash Account','Ref From Cash Account','Ref To Cash Account'])::text,'' ORDER BY j->>'Row ID')) h FROM current_values GROUP BY t)
SELECT count(*) INTO mismatches FROM hashes FULL JOIN r008_test_fingerprints USING(t) WHERE hashes.h IS DISTINCT FROM r008_test_fingerprints.h;
ASSERT mismatches=0,'R008 must not alter existing business data';
WITH current_values AS (
 SELECT 'Borrowers' t,to_jsonb(x) j FROM olap_borrowers_analytics x UNION ALL
 SELECT 'Loans',to_jsonb(x) FROM olap_loans_analytics x UNION ALL SELECT 'Charges',to_jsonb(x) FROM olap_charges_analytics x
), hashes AS (SELECT t,md5(string_agg((j-ARRAY['Ref Preferred Receiving Cash Account','Payment Request Cash Account','Payment Request Token','Ref Disbursed From Cash Account'])::text,'' ORDER BY j->>'Row ID')) h FROM current_values GROUP BY t)
SELECT count(*) INTO mismatches FROM hashes FULL JOIN r008_test_views USING(t) WHERE hashes.h IS DISTINCT FROM r008_test_views.h;
ASSERT mismatches=0,'R007 analytics must remain unchanged';
END $$;
'@
  $afterSql | & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres
  if($LASTEXITCODE){throw 'R008 preservation assertions failed'}
 }
 [pscustomobject]@{restoreSucceeded=$true;normalizedSchemaMatches=$true;backupSha256=(Get-FileHash (Join-Path $private "$Label.dump")).Hash;candidateRehearsed=[bool]$Candidate;existingDataAndR007MetricsPreserved=[bool]$Candidate;scope='public and assessment_lab including Flyway history; Cloud SQL cron extension/settings excluded'} | ConvertTo-Json
}finally{if($started){& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}}
