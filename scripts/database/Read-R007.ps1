[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment development
if($target.host -ne '34.158.38.171'){throw 'Unexpected DEV host'}
$dest='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918/sql-dev'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$saved=@{};foreach($name in @('PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
try{
 $env:PGPASSWORD=(Get-Content -LiteralPath $target.passwordFile -Raw).Trim();$env:PGSSLMODE='require';$env:PGCONNECT_TIMEOUT='10'
 $views=@{Charges='olap_charges_analytics';Repayments='olap_repayments_analytics';Loans='olap_loans_analytics';Borrowers='olap_borrowers_analytics';Statistics='olap_portfolio_summary'}
 foreach($table in $views.Keys){
  ('BEGIN READ ONLY; SELECT coalesce(json_agg(x),''[]''::json) FROM public.'+$views[$table]+' x; COMMIT;') | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database -o (Join-Path $dest "$table.json")
  if($LASTEXITCODE){throw "DEV read failed: $table"}
  ('BEGIN READ ONLY; EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.'+$views[$table]+'; COMMIT;') | & (Join-Path (Get-PgBin) 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h $target.host -p $target.port -U $target.user -d $target.database -o (Join-Path $dest "$table-plan.json")
  if($LASTEXITCODE){throw "DEV plan failed: $table"}
 }
 Write-Output 'DEV view results and plans saved privately.'
}finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
