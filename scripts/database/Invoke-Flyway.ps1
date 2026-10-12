[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('development','production')][string]$Environment,
    [Parameter(Mandatory)][ValidateSet('info','validate','baseline','migrate')][string]$Command,
    [string]$ReleaseFile,
    [string]$ApprovalReference,
    [string]$BackupReference,
    [switch]$GroupedProduction,
    [string]$ConnectPreflightFile
)
. "$PSScriptRoot/Common.ps1"
. "$PSScriptRoot/Production-Transaction.ps1"
$target = Get-DbEnvironment $Environment
$manifest = @(Get-MigrationManifest)
if(($GroupedProduction -or $ConnectPreflightFile) -and ($Environment -ne 'production' -or $Command -ne 'migrate')) {throw 'Grouped production controls apply only to an authorized production migrate'}
$transactionArguments=@()
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
    if(@($manifest | Where-Object {$_.name -match '^V(7[89]|8[0-9]|[9][0-9]|[1-9][0-9]{2,})__'}).Count) {
        if(-not $GroupedProduction -or -not $ConnectPreflightFile){throw 'R052 production migration requires explicit grouped transaction and fresh contained CONNECT preflight'}
        if($release.productionTransaction.group -ne $true -or $release.productionTransaction.mixed -ne $false -or $release.productionTransaction.executeInTransaction -ne $true -or @($release.productionTransaction.callbacks).Count -ne 0){throw 'Tested release must pin grouped transactional production settings without callbacks'}
        $preflight=Get-Content -LiteralPath $ConnectPreflightFile -Raw | ConvertFrom-Json
        if((Get-FileHash -LiteralPath $ConnectPreflightFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $release.productionTransaction.connectPreflightSha256){throw 'CONNECT preflight differs from pinned production package'}
        $transactionArguments=@(Assert-ProductionTransactionPackage -MigrationRoot (Join-Path $DbRepoRoot 'database/migrations') -Manifest $manifest -BaselineVersion $release.productionTransaction.baselineVersion -TargetVersion $release.productionTransaction.targetVersion -Preflight $preflight)
    }
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
    if($transactionArguments.Count){
        $settings=Get-Content -LiteralPath $env:FLYWAY_CONFIG_FILES -Raw
        if($settings -match '(?im)^\s*flyway\.(callbacks|skipDefaultCallbacks|target|group|mixed|executeInTransaction)\s*='){throw 'Repository configuration must not override the pinned grouped production contract'}
        # Re-read actual history immediately before the later authorized write; an old
        # CONNECT snapshot cannot substitute for the current database baseline.
        $liveInfo=(& (Get-FlywayPath) '-outputType=json' 'info') -join [Environment]::NewLine
        if($LASTEXITCODE -ne 0){throw 'Production pre-migration history read failed'}
        $live=$liveInfo | ConvertFrom-Json
        if($live.database -ne 'loan_manager_prod' -or [int]$live.schemaVersion -ne $release.productionTransaction.baselineVersion){throw 'Production baseline changed; re-review the complete candidate'}
        $actualPending=@($live.migrations | Where-Object state -eq 'Pending' | ForEach-Object {[IO.Path]::GetFileName($_.filepath)} | Sort-Object)
        $expectedPending=@($manifest | Where-Object {$_.name -match '^V([0-9]+)__' -and [int]$Matches[1] -gt $release.productionTransaction.baselineVersion} | ForEach-Object name | Sort-Object)
        if(($actualPending -join '|') -ne ($expectedPending -join '|')){throw 'Actual pending migrations differ from pinned complete scope'}
    }
    Push-Location $DbRepoRoot
    try {
        $result = & (Get-FlywayPath) '-outputType=json' @transactionArguments $Command
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
        # Stable DEV capability: reconcile every successful migration, including a
        # no-op migrate, only when the operator-provisioned package exists.
        # CLI pins the full DEV tuple, explicit creators and private ACL recovery.
        if ($Environment -eq 'development' -and $Command -eq 'migrate') {
            $node = (Get-Command node -ErrorAction Stop).Source
            & $node (Join-Path $DbRepoRoot 'scripts/database/application-role-cli.mjs') --action post-migrate --if-present --apply
            if ($LASTEXITCODE -ne 0) { throw 'DEV migration applied; application capability reconciliation failed. Preserve migration history and private recovery evidence; do not repair/replay blindly.' }
        }
        $result -join [Environment]::NewLine
    } finally { Pop-Location }
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
}
