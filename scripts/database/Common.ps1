Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$DbRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$DbIsWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$DbPrivateRoot = if ($DbIsWindows) { 'C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway' } else { Join-Path $(if ($env:MW_PRIVATE_ROOT) { $env:MW_PRIVATE_ROOT } else { Join-Path $HOME '.mw-private' }) 'AppSheet-Loan-Project/flyway' }
$DbToolRoot = if ($env:MW_DB_TOOL_ROOT) { [IO.Path]::GetFullPath($env:MW_DB_TOOL_ROOT) } elseif ($DbIsWindows) { Join-Path $env:LOCALAPPDATA 'AppSheetLoanTools' } else { '/workspace/.setup' }
$DbToolchain = Get-Content (Join-Path $DbRepoRoot 'database/toolchain.json') -Raw | ConvertFrom-Json
function Assert-DbEnvironmentIdentity([string]$Name, $Target) {
    $expected = @{
        development = @{ instance='appsheet-pg-prod-20260914'; host='34.21.174.215'; database='loan_manager_dev' }
        production  = @{ instance='appsheet-pg-prod-20260914'; host='34.21.174.215'; database='loan_manager_prod' }
    }[$Name]
    foreach ($property in @('instance','host','database')) {
        if ($Target.$property -ne $expected.$property) {
            throw "Unexpected $Name database identity: $property=$($Target.$property)"
        }
    }
}
function Get-DbEnvironment([string]$Name) {
    if ($Name -notin @('development','production')) { throw 'Unknown database environment' }
    $config = Get-Content (Join-Path $DbRepoRoot 'database/environments.json') -Raw | ConvertFrom-Json
    $target = $config.$Name
    $sameInstance = $config.development.instance -eq $config.production.instance
    $sameDatabase = $config.development.database -eq $config.production.database
    if ($sameInstance -and $sameDatabase) {
        throw 'Development and production database identities must differ'
    }
    Assert-DbEnvironmentIdentity $Name $target
    if (-not $DbIsWindows) {
        # Linux cloud session: same instance/database/user, reached through the IAP
        # tunnel (scripts/database/cloud-db-tunnel.sh). The Debian host's Cloud SQL
        # Auth Proxy encrypts to the instance, so the local hop uses sslmode=disable.
        # The postgres password comes from Secret Manager into a private file.
        & bash (Join-Path $PSScriptRoot 'cloud-db-tunnel.sh') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Cloud SQL tunnel unavailable' }
        $secretDir = Join-Path (Split-Path $DbPrivateRoot) 'credentials'
        $passwordPath = Join-Path $secretDir 'postgres-password.txt'
        if (-not (Test-Path -LiteralPath $passwordPath)) {
            New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
            & chmod 700 $secretDir
            $secret = (& gcloud secrets versions access 1 --secret=mw-credit-ops-cloudsql-postgres-admin --project=clever-oasis-508610-n7) -join ''
            if ($LASTEXITCODE -ne 0 -or -not $secret) { throw 'Cloud SQL admin credential unavailable' }
            [IO.File]::WriteAllText($passwordPath, $secret); & chmod 600 $passwordPath; $secret = $null
        }
        $port = if ($env:MW_DB_TUNNEL_PORT) { [int]$env:MW_DB_TUNNEL_PORT } else { 15432 }
        return [pscustomobject]@{ instance=$target.instance; host='127.0.0.1'; port=$port; database=$target.database; user=$target.user; passwordFile=$passwordPath; sslmode='disable' }
    }
    $passwordPath = [IO.Path]::GetFullPath($target.passwordFile)
    if (-not $passwordPath.StartsWith('C:\Users\ideaadmin\Documents\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Credential path must remain outside Git in Documents/ChatGPT'
    }
    return $target
}
function Get-MigrationManifest {
    $files = @(Get-ChildItem (Join-Path $DbRepoRoot 'database/migrations') -File -Filter '*.sql' | Sort-Object Name)
    if ($files.Count -eq 0) { throw 'No reviewed baseline or migrations present' }
    $versions = @{}
    foreach ($file in $files) {
        if ($file.Name -notmatch '^V([0-9]+(?:[._][0-9]+)*)__[A-Za-z0-9_]+\.sql$') { throw "Invalid migration name: $($file.Name)" }
        $parts = @($Matches[1].Replace('_','.').Split('.') | ForEach-Object { ([System.Numerics.BigInteger]::Parse($_)).ToString() })
        while ($parts.Count -gt 1 -and $parts[-1] -eq '0') { $parts = @($parts[0..($parts.Count-2)]) }
        $version = $parts -join '.'
        if ($versions.ContainsKey($version)) { throw "Duplicate migration version: $version" }
        $versions[$version] = $true
        [pscustomobject]@{ name=$file.Name; sha256=(Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
}
function Assert-CleanGit {
    $state = & git -C $DbRepoRoot status --porcelain
    if ($LASTEXITCODE -ne 0 -or $state) { throw 'A clean, committed checkout is required for production promotion' }
}
function Get-FlywayPath {
    $path = Join-Path $DbToolRoot "flyway-$($DbToolchain.flywayVersion)/$(if ($DbIsWindows) { 'flyway.cmd' } else { 'flyway' })"
    if (-not (Test-Path -LiteralPath $path)) { throw 'Run scripts/database/Install-Tools.ps1 first' }
    return $path
}
function Get-PgBin {
    if (-not $DbIsWindows) { return (Join-Path $DbToolRoot 'postgresql-18.6/bin') }
    return (Join-Path $DbToolRoot 'postgresql-18.6-3/pgsql/bin')
}
