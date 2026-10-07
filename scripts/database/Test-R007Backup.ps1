[CmdletBinding()]
param([ValidatePattern('^[a-z0-9-]+$')][string]$Label='development-before',[switch]$Candidate)
. "$PSScriptRoot/Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918'
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('r007-restore-'+[guid]::NewGuid().ToString('N'))
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
 if((Get-FileHash "$dump.normalized").Hash -ne (Get-FileHash (Join-Path $private "$Label.normalized.sql")).Hash){throw 'Restored backup schema differs'}
 if($Candidate){
  & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f (Join-Path $DbRepoRoot 'database/migrations/V22__olap_analytics_views.sql')
  if($LASTEXITCODE){throw 'Candidate SQL failed on restored copy'}
  $candidateDir=Join-Path $private 'candidate'
  New-Item -ItemType Directory -Force -Path $candidateDir | Out-Null
  $views=@{Charges='olap_charges_analytics';Repayments='olap_repayments_analytics';Loans='olap_loans_analytics';Borrowers='olap_borrowers_analytics';Statistics='olap_portfolio_summary'}
  foreach($table in $views.Keys){
   $query='SELECT coalesce(json_agg(x),''[]''::json) FROM public.'+$views[$table]+' x;'
   $query | & (Join-Path $bin 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -o (Join-Path $candidateDir "$table.json")
   if($LASTEXITCODE){throw "Candidate query failed: $table"}
   ('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM public.'+$views[$table]+';') | & (Join-Path $bin 'psql.exe') -X -q -t -A -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -o (Join-Path $candidateDir "$table-plan.json")
   if($LASTEXITCODE){throw "Candidate plan failed: $table"}
  }
 }
 [pscustomobject]@{restoreSucceeded=$true;normalizedSchemaMatches=$true;backupSha256=(Get-FileHash (Join-Path $private "$Label.dump")).Hash;candidateExecuted=[bool]$Candidate;scope='public and assessment_lab including Flyway history; Cloud SQL cron extension/settings excluded'} | ConvertTo-Json
}finally{if($started){& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}}
