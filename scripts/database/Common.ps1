Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$DbRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$DbPrivateRoot = 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway'
$DbToolRoot = Join-Path $env:LOCALAPPDATA 'AppSheetLoanTools'
$DbToolchain = Get-Content (Join-Path $DbRepoRoot 'database/toolchain.json') -Raw | ConvertFrom-Json
function Get-DbEnvironment([string]$Name) {
    if ($Name -notin @('development','production')) { throw 'Unknown database environment' }
    $config = Get-Content (Join-Path $DbRepoRoot 'database/environments.json') -Raw | ConvertFrom-Json
    $target = $config.$Name
    if ($config.development.host -eq $config.production.host) { throw 'Development and production hosts must differ' }
    $passwordPath = [IO.Path]::GetFullPath($target.passwordFile)
    if (-not $passwordPath.StartsWith('C:\Users\MWCredit\Documents\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)) {
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
    $path = Join-Path $DbToolRoot "flyway-$($DbToolchain.flywayVersion)/flyway.cmd"
    if (-not (Test-Path -LiteralPath $path)) { throw 'Run scripts/database/Install-Tools.ps1 first' }
    return $path
}
function Get-PgBin {
    return (Join-Path $DbToolRoot 'postgresql-18.6-3/pgsql/bin')
}
