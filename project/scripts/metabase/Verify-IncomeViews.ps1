param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/../database/Common.ps1"
$target=Get-DbEnvironment $Environment
$plan=Get-Content "$DbRepoRoot/outputs/r016-20260922/income-db-views-plan.json" -Raw|ConvertFrom-Json
$savedPassword=$env:PGPASSWORD;$savedSsl=$env:PGSSLMODE
try {
 $env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim();$env:PGSSLMODE='require'
 $args=@('-X','-q','-At','-v','ON_ERROR_STOP=1','-h',$target.host,'-U',$target.user,'-d',$target.database)
 $identity=& "$(Get-PgBin)/psql.exe" @args -c 'SELECT current_database()'
 if($LASTEXITCODE -or $identity -ne $target.database){throw 'Database identity mismatch'}
 $checks=@()
 foreach($view in $plan.views.PSObject.Properties){
  $old=[IO.File]::ReadAllText("$($plan.baseline)/$($view.Name).sql")
  $sql="SELECT NOT EXISTS((($old) EXCEPT ALL SELECT * FROM public.$($view.Value)) UNION ALL (SELECT * FROM public.$($view.Value) EXCEPT ALL ($old)));"
  $queryFile="$($plan.baseline)/verify-$Environment.sql"
  [IO.File]::WriteAllText($queryFile,$sql,[Text.UTF8Encoding]::new($false))
  $same=& "$(Get-PgBin)/psql.exe" @args -f $queryFile
  if($LASTEXITCODE -or $same -ne 't'){throw "View parity failed: $($view.Name)"}
  $timings=@{}
  foreach($variant in @('original','view')){
   $query=if($variant -eq 'original'){$old}else{"SELECT * FROM public.$($view.Value)"}
   [IO.File]::WriteAllText($queryFile,"EXPLAIN (ANALYZE,FORMAT JSON,TIMING OFF) $query",[Text.UTF8Encoding]::new($false))
   $explain=& "$(Get-PgBin)/psql.exe" @args -f $queryFile
   if($LASTEXITCODE){throw 'Explain failed'}
   $parsed=($explain -join "`n")|ConvertFrom-Json
   $timings[$variant]=$parsed[0].'Execution Time'
  }
  $checks+=@{view=$view.Value;exact_multiset_parity=$true;execution_ms=$timings}
 }
 @{environment=$Environment;database=$identity;instance=$target.instance;verified_at=[DateTimeOffset]::UtcNow.ToString('o');checks=$checks;note='Sequential single-run execution timings are diagnostic, not a controlled cost benchmark.'}|ConvertTo-Json -Depth 7|Set-Content "$DbRepoRoot/outputs/r016-20260922/income-db-views-$Environment.json"
 Write-Output "$Environment six-view parity and execution checks passed"
} finally {$env:PGPASSWORD=$savedPassword;$env:PGSSLMODE=$savedSsl}
