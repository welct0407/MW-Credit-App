param([switch]$FiltersOnly,[string]$PrivateDirectory='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/metabase-poc')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../database/Common.ps1')
$target=Get-DbEnvironment production
$headers=@{'X-API-Key'=[IO.File]::ReadAllText("$PrivateDirectory/migration-api-key.txt").Trim()}
$evidence=Get-Content "$DbRepoRoot/outputs/r016-20260922/dashboard-verification.json" -Raw|ConvertFrom-Json -AsHashtable
$questions=Get-Content "$DbRepoRoot/outputs/r016-20260922/questions.json" -Raw|ConvertFrom-Json -AsHashtable
$dashboard=Invoke-RestMethod 'https://reports.mw-credit.com/api/dashboard/3' -Headers $headers
$env:PGPASSWORD=[IO.File]::ReadAllText("$PrivateDirectory/reporting-db-password.txt").Trim()
$env:PGSSLMODE='require'
$checks=[Collections.Generic.List[object]]::new()
if($FiltersOnly){foreach($previous in (Get-Content "$DbRepoRoot/outputs/r016-20260922/query-reconciliation.json" -Raw|ConvertFrom-Json)){if($previous.mode -eq 'all-dates'){$checks.Add($previous)}}}
function Normalize($v){if($v -is [DateTime]){return $v.ToString('yyyy-MM-dd')}; if($v -is [double] -or $v -is [decimal]){return ([decimal]$v).ToString('0.########',[Globalization.CultureInfo]::InvariantCulture)};return [string]$v}
try {
 foreach($mode in $(if($FiltersOnly){@('date-filter')}else{@('all-dates','date-filter')})){
  foreach($q in $questions){
   if($mode -eq 'date-filter' -and $q.key -notin @('cash-pool','principal','available','account-balance','utilization-gauge','composition','loan-type','daily-principal','principal-flows')){continue}
   $parameters=@();$where=''
   if($mode -eq 'date-filter'){
    $field=switch($q.date_field){104{'"Peak Cash Pool Date 30D"'}95{'"Loan Date"'}82{'"Snapshot Date"'}default{throw 'Unknown date field'}}
    $where="AND $field BETWEEN DATE '2026-09-01' AND DATE '2026-09-15'"
    $parameters=@(@{id='cash-date';type='date/range';value='2026-09-01~2026-09-15'})
   }
   $sql=$q.sql.Replace('[[AND {{report_date}}]]',$where)
   if($q.key -eq 'growth'){
    # The source-report SQL is retained as dated migration evidence. Owner correction uses two completed, contiguous seven-day windows.
    $sql=@'
WITH context AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date AS today), totals AS (
 SELECT coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date" BETWEEN c.today-7 AND c.today-1),0) recent,
        coalesce(sum(r."Interest Paid"::numeric) FILTER(WHERE r."Payment Date" BETWEEN c.today-14 AND c.today-8),0) prior
 FROM public.olap_repayments_analytics r CROSS JOIN context c
) SELECT (recent-prior)/NULLIF(prior,0) AS "7-Day Profit Growth %" FROM totals
'@
   }
   $raw=('SELECT coalesce(json_agg(t),''[]''::json) FROM ('+$sql+') t')|& "$(Get-PgBin)/psql.exe" -X -At -v ON_ERROR_STOP=1 -h $target.host -U metabase_borrower_reader -d $target.database
   if($LASTEXITCODE -ne 0){throw "Restricted SQL failed: $($q.key)"}
   $expected=@(($raw -join "`n")|ConvertFrom-Json)
   # The short English label is centralized in Loan Book; amounts/populations are identical.
   if($q.key -eq 'loan-type'){foreach($row in $expected){$row.'Loan Type'=($row.'Loan Type' -split ' / ')[-1]}}
   $id=$evidence.cards[$q.key].id
   $route="card/$id/query"
   if($mode -eq 'date-filter'){
    $placement=@($dashboard.dashcards|Where-Object{$_.card_id -eq $id -and $_.dashboard_tab_id -eq 5})[0]
    $route="dashboard/3/dashcard/$($placement.id)/card/$id/query"
   }
   try {$actual=Invoke-RestMethod "https://reports.mw-credit.com/api/$route" -Method Post -Headers $headers -ContentType application/json -Body (@{parameters=$parameters}|ConvertTo-Json -Depth 15) -TimeoutSec 60} catch {throw "Metabase query failed: $($q.key) / $mode; payload withheld"}
   $matched=$actual.status -eq 'completed' -and $expected.Count -eq $actual.row_count
   if($matched){for($r=0;$r -lt $expected.Count;$r++){$props=@($expected[$r].PSObject.Properties);for($c=0;$c -lt $props.Count;$c++){if((Normalize $props[$c].Value) -cne (Normalize $actual.data.rows[$r][$c])){$matched=$false}}}}
   $checks.Add(@{key=$q.key;card_id=$id;mode=$mode;rows=$actual.row_count;all_values_match=$matched})
   $checks|ConvertTo-Json -Depth 6|Set-Content "$DbRepoRoot/outputs/r016-20260922/query-reconciliation.json"
   if(-not $matched){throw "Result mismatch: $($q.key) / $mode"}
   Write-Output "Matched $($q.key) / $mode"
  }
 }
} finally {Remove-Item Env:PGPASSWORD;Remove-Item Env:PGSSLMODE}
Write-Output "All $($questions.Count) question results and nine Cash date-filter results match restricted direct PROD SQL."
