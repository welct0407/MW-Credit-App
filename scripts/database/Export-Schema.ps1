[CmdletBinding()]
param([Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment)
. "$PSScriptRoot/Common.ps1"
$target = Get-DbEnvironment $Environment
New-Item -ItemType Directory -Force -Path $DbPrivateRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $DbPrivateRoot "$Environment-schema-$stamp.sql"
$oldPassword = $env:PGPASSWORD
$oldSsl = $env:PGSSLMODE
$oldTimeout = $env:PGCONNECT_TIMEOUT
try {
    $env:PGPASSWORD = (Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '10'
    & (Join-Path (Get-PgBin) 'pg_dump.exe') --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database) --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$output
    if ($LASTEXITCODE -ne 0) { throw 'Schema export failed; no baseline should be adopted' }
    Write-Output $output
} finally {
    $env:PGPASSWORD = $oldPassword; $env:PGSSLMODE = $oldSsl; $env:PGCONNECT_TIMEOUT = $oldTimeout
}
