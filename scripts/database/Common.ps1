Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$DbRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$DbIsWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
$DbPrivateRoot = if ($DbIsWindows) { 'C:/Users/ideaadmin/Documents/ChatGPT/AppSheet-Loan-Project/flyway' } else { Join-Path $(if ($env:MW_PRIVATE_ROOT) { $env:MW_PRIVATE_ROOT } else { Join-Path $HOME '.mw-private' }) 'AppSheet-Loan-Project/flyway' }
$DbToolRoot = if ($env:MW_DB_TOOL_ROOT) { [IO.Path]::GetFullPath($env:MW_DB_TOOL_ROOT) } elseif ($DbIsWindows) { Join-Path $env:LOCALAPPDATA 'AppSheetLoanTools' } else { '/workspace/.setup' }
$DbToolchain = Get-Content (Join-Path $DbRepoRoot 'database/toolchain.json') -Raw | ConvertFrom-Json
function Assert-DbEnvironmentIdentity([string]$Name, $Target) {
    $expected = @{
        development = @{ instance='mw-credit-pg-20261017'; host='136.85.127.134'; database='loan_manager_dev' }
        production  = @{ instance='mw-credit-pg-20261017'; host='136.85.127.134'; database='loan_manager_prod' }
    }[$Name]
    foreach ($property in @('instance','host','database')) {
        if ($Target.$property -ne $expected.$property) {
            throw "Unexpected $Name database identity: $property=$($Target.$property)"
        }
    }
}
# Routine Linux reads sign in as this IAM database user (pg_read_all_data only);
# the postgres admin credential is used only when a caller passes -Admin (the
# guarded migration runner and authorized maintenance).
$DbReadServiceAccount = 'codex-cloud-read@clever-oasis-508610-n7.iam.gserviceaccount.com'
$DbReadUser = 'codex-cloud-read@clever-oasis-508610-n7.iam'
function Get-PemSha256([string]$Path) {
    $pem = Get-Content -LiteralPath $Path -Raw
    if ($pem -notmatch '-----BEGIN CERTIFICATE-----\s*([A-Za-z0-9+/=\s]+?)\s*-----END CERTIFICATE-----') { throw 'Not a PEM certificate' }
    $der = [Convert]::FromBase64String(($Matches[1] -replace '\s',''))
    return (([Security.Cryptography.SHA256]::Create().ComputeHash($der) | ForEach-Object { $_.ToString('x2') }) -join '')
}
# DB-ACCESS-07: the instance's public server CA, fetched at runtime into the
# private root and accepted only when it matches the pinned SHA-256 in
# database/environments.json (serverCaSha256). verify-full is not possible while
# the instance uses GOOGLE_MANAGED_INTERNAL_CA (no host name in the server certificate).
function Get-DbServerCa($Target) {
    if ($Target.serverCaSha256 -notmatch '^[0-9a-f]{64}$') { throw 'Pinned server CA fingerprint missing' }
    $path = Join-Path (Split-Path $DbPrivateRoot) 'cloudsql-server-ca.pem'
    if ((Test-Path -LiteralPath $path) -and (Get-PemSha256 $path) -eq $Target.serverCaSha256) { return $path }
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
    $pem = (& gcloud sql instances describe $Target.instance --project=clever-oasis-508610-n7 --format='value(serverCaCert.cert)') -join "`n"
    if ($LASTEXITCODE -ne 0 -or -not $pem) { throw 'Cloud SQL server CA unavailable' }
    $candidate = "$path.new"
    [IO.File]::WriteAllText($candidate, $pem + "`n")
    if ((Get-PemSha256 $candidate) -ne $Target.serverCaSha256) { Remove-Item -LiteralPath $candidate; throw 'Cloud SQL server CA differs from the pinned fingerprint; review a CA rotation before updating database/environments.json' }
    Move-Item -LiteralPath $candidate -Destination $path -Force
    return $path
}
function Get-DbEnvironment([string]$Name, [switch]$Admin) {
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
        # Linux cloud session: same instance/database, reached through the IAP
        # tunnel (scripts/database/cloud-db-tunnel.sh). The Debian host's Cloud SQL
        # Auth Proxy encrypts to the instance, so the local hop uses sslmode=disable.
        # Default: the read identity with a one-hour IAM token (impersonation).
        # -Admin: the postgres password from Secret Manager into a private file.
        & bash (Join-Path $PSScriptRoot 'cloud-db-tunnel.sh') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Cloud SQL tunnel unavailable' }
        $port = if ($env:MW_DB_TUNNEL_PORT) { [int]$env:MW_DB_TUNNEL_PORT } else { 15432 }
        $secretDir = Join-Path (Split-Path $DbPrivateRoot) 'credentials'
        if (-not $Admin) {
            New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
            & chmod 700 $secretDir
            $tokenPath = Join-Path $secretDir 'read-token.txt'
            $token = (& gcloud sql generate-login-token "--impersonate-service-account=$DbReadServiceAccount") -join ''
            if ($LASTEXITCODE -ne 0 -or -not $token) { throw 'Read identity token unavailable' }
            [IO.File]::WriteAllText($tokenPath, $token); & chmod 600 $tokenPath; $token = $null
            return [pscustomobject]@{ instance=$target.instance; host='127.0.0.1'; port=$port; database=$target.database; user=$DbReadUser; passwordFile=$tokenPath; sslmode='disable' }
        }
        $passwordPath = Join-Path $secretDir 'postgres-password.txt'
        if (-not (Test-Path -LiteralPath $passwordPath)) {
            New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
            & chmod 700 $secretDir
            $secret = (& gcloud secrets versions access latest --secret=mw-credit-ops-cloudsql-postgres-admin --project=clever-oasis-508610-n7) -join ''
            if ($LASTEXITCODE -ne 0 -or -not $secret) { throw 'Cloud SQL admin credential unavailable' }
            [IO.File]::WriteAllText($passwordPath, $secret); & chmod 600 $passwordPath; $secret = $null
        }
        return [pscustomobject]@{ instance=$target.instance; host='127.0.0.1'; port=$port; database=$target.database; user=$target.user; passwordFile=$passwordPath; sslmode='disable' }
    }
    $passwordPath = [IO.Path]::GetFullPath($target.passwordFile)
    if (-not $passwordPath.StartsWith('C:\Users\ideaadmin\Documents\ChatGPT\',[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Credential path must remain outside Git in Documents/ChatGPT'
    }
    # Direct TLS from VM-01: verify the server certificate against the pinned CA.
    # PGSSLROOTCERT also upgrades libpq callers that still say sslmode=require to
    # CA verification (libpq verifies whenever a root certificate file is given).
    $ca = Get-DbServerCa $target
    $env:PGSSLROOTCERT = $ca
    $target | Add-Member -NotePropertyName sslrootcert -NotePropertyValue $ca -Force
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
    if ($DbIsWindows) { return (Join-Path $DbToolRoot 'postgresql-18.6-3/pgsql/bin') }
    # Linux: explicit override, then the cloud-session toolchain, then the
    # PGDG package layout used by GitHub ubuntu-latest runners.
    if ($env:MW_PG_BIN) { return $env:MW_PG_BIN }
    $setup = Join-Path $DbToolRoot 'postgresql-18.6/bin'
    if (Test-Path -LiteralPath (Join-Path $setup 'pg_ctl')) { return $setup }
    return '/usr/lib/postgresql/18/bin'
}
function Get-PgTool([string]$Name) {
    Join-Path (Get-PgBin) ($Name + $(if ($DbIsWindows) { '.exe' } else { '' }))
}
# Start a disposable loopback-only cluster. Windows starts pg_ctl hidden because a
# direct call hangs while the server inherits the console pipe; Linux keeps the
# Unix socket inside the owned fixture root instead of /var/run/postgresql.
function Start-PgServer([string]$Data, [string]$Log, [int]$Port, [string]$Root) {
    if ($DbIsWindows) {
        $process = Start-Process -FilePath (Get-PgTool pg_ctl) -ArgumentList @('-D',('"'+$Data+'"'),'-l',('"'+$Log+'"'),'-o',('"-h 127.0.0.1 -p '+$Port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Root 'start.out') -RedirectStandardError (Join-Path $Root 'start.err')
        $process.WaitForExit()
        if ($process.ExitCode) { throw 'Disposable PostgreSQL start failed' }
        return
    }
    & (Get-PgTool pg_ctl) -D $Data -l $Log -o "-h 127.0.0.1 -p $Port -k $Root" -w start | Out-Null
    if ($LASTEXITCODE) { throw 'Disposable PostgreSQL start failed' }
}
function Stop-PgServer([string]$Data) {
    & (Get-PgTool pg_ctl) -D $Data -m fast -w stop | Out-Null
}
