[CmdletBinding()]
param([ValidatePattern('^[a-z0-9-]+$')][string]$BackupLabel='cash-statement-before',
 [string]$CandidateSqlFile='database/migrations/V27__recent_cash_account_statement.sql')
. "$PSScriptRoot/Common.ps1"
$private='C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r010-20260919'
$bin=Get-PgBin
$root=Join-Path $DbToolRoot ('r010-restore-'+[guid]::NewGuid().ToString('N'))
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
 & (Join-Path $bin 'pg_restore.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --no-owner --no-privileges --exit-on-error --schema=public --schema=assessment_lab (Join-Path $private "$BackupLabel.dump") 2> (Join-Path $root 'restore.err')
 if($LASTEXITCODE){throw "Restore failed; private diagnostic $root"}
 $dump=Join-Path $root 'restored.sql'
 & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
 if($LASTEXITCODE){throw 'Restored schema export failed'}
 & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
 $expected=[IO.File]::ReadAllText((Join-Path $private "$BackupLabel.normalized.sql"))
 $actual=[IO.File]::ReadAllText("$dump.normalized")
 $expected=$expected.Replace('(((r."Payment Date" >= (ctx.d - 29)) AND (r."Payment Date" <= ctx.d)) AND ((r."Interest Paid")::numeric > (0)::numeric))','((r."Payment Date" >= (ctx.d - 29)) AND (r."Payment Date" <= ctx.d) AND ((r."Interest Paid")::numeric > (0)::numeric))')
 if($expected -cne $actual){throw 'Restored backup schema differs'}
 & (Join-Path $bin 'psql.exe') -X -q -1 -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f (Join-Path $DbRepoRoot $CandidateSqlFile)
 if($LASTEXITCODE){throw 'Candidate rehearsal failed'}
 [pscustomobject]@{restoreSucceeded=$true;normalizedSchemaMatches=$true;candidateRehearsed=$true;backupSha256=(Get-FileHash (Join-Path $private "$BackupLabel.dump")).Hash;scope='public and assessment_lab including Flyway history; Cloud SQL cron/settings excluded'} | ConvertTo-Json
}finally{if($started){& (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null}}
