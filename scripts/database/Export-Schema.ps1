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
    # Both routes reach a local Cloud SQL Auth Proxy (VM-01: on demand; Linux: the IAP
    # tunnel to the Debian host), whose local hop is plain; the proxy encrypts onward.
    $env:PGSSLMODE = $target.sslmode
    $env:PGCONNECT_TIMEOUT = '10'
    & (Get-PgTool pg_dump) --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database) --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$output
    if ($LASTEXITCODE -ne 0) { throw 'Schema export failed; no baseline should be adopted' }
    if (-not $DbIsWindows) { & chmod 600 $output }
    Write-Output $output
} finally {
    $env:PGPASSWORD = $oldPassword; $env:PGSSLMODE = $oldSsl; $env:PGCONNECT_TIMEOUT = $oldTimeout
}
