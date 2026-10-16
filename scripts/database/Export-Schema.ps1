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
    # VM-01 (Windows) keeps sslmode=require; PGSSLROOTCERT from Get-DbEnvironment makes
    # libpq verify the pinned CA. Linux reaches the instance through the IAP tunnel,
    # whose local hop is plain (target sslmode=disable; the Auth Proxy encrypts onward).
    $env:PGSSLMODE = if (-not $DbIsWindows -and $target.PSObject.Properties.Name -contains 'sslmode') { $target.sslmode } else { 'require' }
    $env:PGCONNECT_TIMEOUT = '10'
    & (Get-PgTool pg_dump) --host=$($target.host) --port=$($target.port) --username=$($target.user) --dbname=$($target.database) --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$output
    if ($LASTEXITCODE -ne 0) { throw 'Schema export failed; no baseline should be adopted' }
    if (-not $DbIsWindows) { & chmod 600 $output }
    Write-Output $output
} finally {
    $env:PGPASSWORD = $oldPassword; $env:PGSSLMODE = $oldSsl; $env:PGCONNECT_TIMEOUT = $oldTimeout
}
