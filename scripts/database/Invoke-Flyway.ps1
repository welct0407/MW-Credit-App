[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment,
    [Parameter(Mandatory)][ValidateSet('info','validate','baseline','migrate')][string]$Command,
    [string]$ReleaseFile,
    [string]$ApprovalReference,
    [string]$BackupReference
)
. "$PSScriptRoot/Common.ps1"
$target = Get-DbEnvironment $Environment
$manifest = @(Get-MigrationManifest)
if ($Environment -eq 'production' -and $Command -in @('baseline','migrate')) {
    Assert-CleanGit
    if (-not $ApprovalReference -or -not $BackupReference) { throw 'Production writes require actual owner approval and a verified backup reference' }
}
if ($Command -eq 'baseline') {
    # Adoption is deliberately limited to V1. Compare a fresh live dump, never blindly mark it applied.
    if ($manifest.Count -ne 1 -or $manifest[0].name -ne 'V1__existing_schema.sql') { throw 'Initial adoption requires exactly the reviewed V1 baseline' }
    $dump = & "$PSScriptRoot/Export-Schema.ps1" -Environment $Environment
    $normalized = "$dump.normalized.sql"
    & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile $normalized
    if ((Get-FileHash $normalized).Hash -ne (Get-FileHash (Join-Path $DbRepoRoot 'database/migrations/V1__existing_schema.sql')).Hash) {
        throw 'Live schema differs from the reviewed baseline; reconcile before adoption'
    }
}
if ($Environment -eq 'production' -and $Command -eq 'migrate') {
    if (-not $ReleaseFile) { throw 'Production migration requires a tested development release manifest' }
    $release = Get-Content -LiteralPath $ReleaseFile -Raw | ConvertFrom-Json
    $head = (& git -C $DbRepoRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $release.commit -ne $head) { throw 'Checkout differs from tested release commit' }
    if ($release.environment -ne 'development' -or -not $release.validationReference) { throw 'Development verification is missing' }
    if (($release.migrations | ConvertTo-Json -Compress) -ne ($manifest | ConvertTo-Json -Compress)) { throw 'Migration hashes differ from tested release' }
}
$names = @('FLYWAY_URL','FLYWAY_USER','FLYWAY_PASSWORD','FLYWAY_CONFIG_FILES')
$saved = @{}
# Ambient Flyway overrides could bypass repository settings. Reject instead of silently inheriting them.
$unexpected = @(Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | Where-Object Name -notin $names)
if ($unexpected.Count) { throw 'Remove ambient FLYWAY_* overrides before using the repository runner' }
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
    $env:FLYWAY_URL = "jdbc:postgresql://$($target.host):$($target.port)/$($target.database)?sslmode=require&connectTimeout=10&ApplicationName=loan-project-flyway"
    $env:FLYWAY_USER = $target.user
    $env:FLYWAY_PASSWORD = (Get-Content -LiteralPath $target.passwordFile -Raw).Trim()
    $env:FLYWAY_CONFIG_FILES = Join-Path $DbRepoRoot 'database/flyway.conf'
    Push-Location $DbRepoRoot
    try {
        $result = & (Get-FlywayPath) '-outputType=json' $Command
        if ($LASTEXITCODE -ne 0) { throw "Flyway $Command failed: $($result -join [Environment]::NewLine)" }
        $parsed = ($result -join [Environment]::NewLine) | ConvertFrom-Json
        if (($parsed.PSObject.Properties.Name -contains 'error' -and $parsed.error) -or
            ($parsed.PSObject.Properties.Name -contains 'errorDetails' -and $parsed.errorDetails) -or
            ($parsed.PSObject.Properties.Name -contains 'exception' -and $parsed.exception) -or
            ($Command -eq 'validate' -and -not $parsed.validationSuccessful) -or
            ($Command -eq 'baseline' -and -not $parsed.successfullyBaselined) -or
            ($Command -eq 'migrate' -and -not $parsed.success)) {
            throw "Flyway reported an unsuccessful $Command result: $($result -join [Environment]::NewLine)"
        }
        $result -join [Environment]::NewLine
    } finally { Pop-Location }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
