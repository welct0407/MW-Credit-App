$ErrorActionPreference='Stop'
. "$PSScriptRoot/Common.ps1"
$target=Get-DbEnvironment production
$bin=Get-PgBin
$private=Join-Path $DbPrivateRoot ('receipt-backfill-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $private | Out-Null
$data=Join-Path $private lab
$env:PGPASSWORD=[IO.File]::ReadAllText($target.passwordFile).Trim()
$env:PGSSLMODE='require'
$evidence=@{}
foreach($database in @('loan_manager_prod','mw_agent')) {
 $dump=Join-Path $private "$database.dump"
 & "$bin/pg_dump.exe" -h $target.host -U postgres -d $database -Fc -f $dump
 if($LASTEXITCODE){throw 'Backup failed'}
 $evidence[$database]=@{path=$dump;sha256=(Get-FileHash $dump -Algorithm SHA256).Hash;restore='pending'}
}
Remove-Item Env:PGPASSWORD
$env:PGSSLMODE='disable'
& "$bin/initdb.exe" -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
if($LASTEXITCODE){throw 'initdb failed'}
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$started=$false
try {
 $proc=Start-Process -FilePath "$bin/pg_ctl.exe" -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+(Join-Path $private 'postgres.log')+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $private start.out) -RedirectStandardError (Join-Path $private start.err)
 $proc.WaitForExit();if($proc.ExitCode){throw 'Local restore server failed'}
 $started=$true
 foreach($database in @('loan_manager_prod','mw_agent')) {
  & "$bin/createdb.exe" -h 127.0.0.1 -p $port -U postgres $database
  & "$bin/pg_restore.exe" -h 127.0.0.1 -p $port -U postgres -d $database --no-owner --no-privileges --exit-on-error $evidence[$database].path 2> (Join-Path $private "$database-restore.err")
  if($LASTEXITCODE){throw 'Private restore failed'}
  $evidence[$database].restore='passed'
 }
 New-Item -ItemType Directory -Force "$DbRepoRoot/outputs/receipt-backfill-20260927" | Out-Null
 $evidence | ConvertTo-Json -Depth 5 | Set-Content "$DbRepoRoot/outputs/receipt-backfill-20260927/backups.json"
 Write-Output 'Both fresh private dumps restored successfully.'
} finally {
 if($started){& "$bin/pg_ctl.exe" -D $data -m fast -w stop | Out-Null}
 Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
}
