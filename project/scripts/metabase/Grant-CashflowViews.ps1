param([Parameter(Mandatory)][string]$ApprovalReference)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment production -Admin;$out="$DbRepoRoot/outputs/r016-20260922/cashflow-grants.json"
if(Test-Path $out){throw 'Grant already recorded; inspect rather than replay'}
$old=$env:PGPASSWORD;$ssl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne 'loan_manager_prod'){throw 'PROD identity mismatch'}
 & "$(Get-PgBin)/psql.exe" @args -c 'GRANT SELECT ON public.reporting_cashflow_transactions,public.reporting_cashflow_daily TO metabase_borrower_reader'
 if($LASTEXITCODE){throw 'Grant failed'}
 foreach($v in @('reporting_cashflow_transactions','reporting_cashflow_daily')){
  $ok=& "$(Get-PgBin)/psql.exe" @args -c "SELECT has_table_privilege('metabase_borrower_reader','public.$v','SELECT') AND NOT has_table_privilege('metabase_borrower_reader','public.$v','INSERT,UPDATE,DELETE,TRUNCATE')"
  if($LASTEXITCODE -or $ok -ne 't'){throw 'Read-only verification failed'}
 }
 @{database=$identity;applied_at=[DateTimeOffset]::UtcNow.ToString('o');views=@('reporting_cashflow_transactions','reporting_cashflow_daily');select_only=$true;approval=$ApprovalReference}|ConvertTo-Json|Set-Content $out
}finally{$env:PGPASSWORD=$old;$env:PGSSLMODE=$ssl}
