[CmdletBinding()]
param()
. "$PSScriptRoot/Common.ps1"
New-Item -ItemType Directory -Force -Path $DbToolRoot | Out-Null
$zip = Join-Path $DbToolRoot "flyway-$($DbToolchain.flywayVersion).zip"
$exe = Join-Path $DbToolRoot "flyway-$($DbToolchain.flywayVersion)/flyway.cmd"
if (-not (Test-Path -LiteralPath $exe)) {
    Invoke-WebRequest -Uri $DbToolchain.windows.url -OutFile $zip
    if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $DbToolchain.windows.sha256) { throw 'Flyway archive checksum mismatch' }
    Expand-Archive -LiteralPath $zip -DestinationPath $DbToolRoot -Force
}
if (-not (Test-Path (Join-Path (Get-PgBin) 'pg_dump.exe'))) {
    $pgzip = Join-Path $DbToolRoot 'postgresql-18.6-3-windows-x64-binaries.zip'
    Invoke-WebRequest -Uri $DbToolchain.postgresqlWindowsUrl -OutFile $pgzip
    Expand-Archive -LiteralPath $pgzip -DestinationPath (Join-Path $DbToolRoot 'postgresql-18.6-3') -Force
}
# DB-ACCESS-07: VM-01 reaches Cloud SQL only through this pinned Auth Proxy (Common.ps1 Start-DbProxy).
$proxy = Join-Path $DbToolRoot "cloud-sql-proxy-$($DbToolchain.cloudSqlProxyVersion)/cloud-sql-proxy.exe"
if (-not (Test-Path -LiteralPath $proxy)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $proxy) | Out-Null
    $download = "$proxy.download"
    Invoke-WebRequest -Uri $DbToolchain.cloudSqlProxyWindows.url -OutFile $download
    if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $DbToolchain.cloudSqlProxyWindows.sha256) { Remove-Item -LiteralPath $download; throw 'Cloud SQL Auth Proxy checksum mismatch' }
    Move-Item -LiteralPath $download -Destination $proxy
}
& (Get-CloudSqlProxyPath) --version
if ($LASTEXITCODE -ne 0) { throw 'Cloud SQL Auth Proxy installation check failed' }
& $exe -v
if ($LASTEXITCODE -ne 0) { throw 'Flyway installation check failed' }
& (Join-Path (Get-PgBin) 'pg_dump.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL tools installation check failed' }
