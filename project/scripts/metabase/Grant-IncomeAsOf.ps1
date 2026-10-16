param([Parameter(Mandatory)][string]$ApprovalReference)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment production -Admin;$out="$DbRepoRoot/outputs/r016-20260922/income-asof-grants.json"
if(Test-Path $out){throw 'Grant already recorded; inspect rather than replay'}
$oldPassword=$env:PGPASSWORD;$oldSsl=$env:PGSSLMODE
try{
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne 'loan_manager_prod'){throw 'PROD identity mismatch'}
 & "$(Get-PgBin)/psql.exe" @args -c 'GRANT SELECT ON public.reporting_cash_account_daily,public.reporting_cash_daily TO metabase_borrower_reader'
 if($LASTEXITCODE){throw 'SELECT grant failed'}
 foreach($view in @('reporting_cash_account_daily','reporting_cash_daily')){
  $ok=& "$(Get-PgBin)/psql.exe" @args -c "SELECT has_table_privilege('metabase_borrower_reader','public.$view','SELECT') AND NOT has_table_privilege('metabase_borrower_reader','public.$view','INSERT,UPDATE,DELETE,TRUNCATE')"
  if($LASTEXITCODE -or $ok -ne 't'){throw 'Read-only check failed'}
 }
 @{database=$identity;applied_at=[DateTimeOffset]::UtcNow.ToString('o');views=@('reporting_cash_account_daily','reporting_cash_daily');select_only=$true;approval=$ApprovalReference}|ConvertTo-Json|Set-Content $out
}finally{$env:PGPASSWORD=$oldPassword;$env:PGSSLMODE=$oldSsl}
