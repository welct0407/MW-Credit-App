param([Parameter(Mandatory)][string]$ApprovalReference)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../database/Common.ps1')
$target=Get-DbEnvironment production
$out=Join-Path $DbRepoRoot 'outputs/r016-20260922'
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922'
if(Test-Path "$out/reporting-sources-grants-applied.json"){throw 'Object-level grant batch already applied.'}
$backup=Get-Content "$out/backup-verification.json" -Raw|ConvertFrom-Json
if(-not $backup.restored -or (Get-FileHash "$private/production-before-reporting-grants.dump").Hash -ne $backup.sha256){throw 'Verified restore backup unavailable'}
$env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
try {
 $args=@('-X','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -At -c 'SELECT current_database()'
 if($LASTEXITCODE -ne 0 -or $identity -ne 'loan_manager_prod'){throw 'PROD identity mismatch'}
 foreach($scope in @('table','column')){
  $before=& "$(Get-PgBin)/psql.exe" @args --csv -c "SELECT * FROM information_schema.${scope}_privileges WHERE grantee='metabase_borrower_reader'"
  if($LASTEXITCODE -ne 0){throw 'Privilege backup failed'}
  $before|Set-Content "$private/income-before/object-level-${scope}-grants.csv"
 }
 & "$(Get-PgBin)/psql.exe" @args --single-transaction -f "$PSScriptRoot/reporting-sources-grants.sql"
 if($LASTEXITCODE -ne 0){throw 'Object-level grant transaction failed'}
 $check=@'
SELECT json_agg(x) FROM (
SELECT c.relname source,c.relkind kind,
 has_table_privilege('metabase_borrower_reader',c.oid,'SELECT') can_select,
 has_table_privilege('metabase_borrower_reader',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') can_write
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('olap_borrowers_analytics','olap_loans_analytics','olap_repayments_analytics','olap_charges_analytics','olap_portfolio_summary','Daily Analytics','Partners','Loan Form Context','Cash Dashboard','Cash Account Balances','Business Expenses','Settlements') ORDER BY c.relname
) x;
'@
 $result=& "$(Get-PgBin)/psql.exe" @args -At -c $check
 if($LASTEXITCODE -ne 0){throw 'Privilege verification failed'}
 $sources=($result -join "`n")|ConvertFrom-Json
 if($sources.Count -ne 12 -or @($sources|Where-Object {-not $_.can_select -or $_.can_write}).Count){throw 'Unexpected source access'}
 @{applied_at=[DateTimeOffset]::UtcNow.ToString('o');approval=$ApprovalReference;database=$target.database;instance=$target.instance;role='metabase_borrower_reader';sources=$sources;sql_sha256=(Get-FileHash "$PSScriptRoot/reporting-sources-grants.sql").Hash;schema_changed=$false;data_changed=$false;future_tables_granted=$false;prior_column_grants_retained=$true;backup_reused='backup-verification.json'}|ConvertTo-Json -Depth 6|Set-Content "$out/reporting-sources-grants-applied.json"
} finally {Remove-Item Env:PGPASSWORD;Remove-Item Env:PGSSLMODE}
