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
# DB-ACCESS-07 (owner decision 17 October 2026): VM-01 no longer connects to the
# instance's public address. Its tools start the pinned Cloud SQL Auth Proxy
# (database/toolchain.json, installed by Install-Tools.ps1) on demand at
# 127.0.0.1:<proxyPort>, authenticated with the ambient gcloud login
# (--gcloud-auth): no Windows service, no new credential. The proxy encrypts to
# the instance, so the local hop uses sslmode=disable. The process stays up for
# later commands until it is stopped or VM-01 is deallocated.
function Get-CloudSqlProxyPath {
    $path = Join-Path $DbToolRoot "cloud-sql-proxy-$($DbToolchain.cloudSqlProxyVersion)/cloud-sql-proxy.exe"
    if (-not (Test-Path -LiteralPath $path)) { throw 'Run scripts/database/Install-Tools.ps1 first' }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $DbToolchain.cloudSqlProxyWindows.sha256) {
        throw 'Cloud SQL Auth Proxy binary differs from the pinned checksum; reinstall with Install-Tools.ps1'
    }
    return $path
}
# Path of the program listening on 127.0.0.1:<port>, or $null when nothing listens.
function Get-DbProxyListener([int]$Port) {
    $listener = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if (-not $listener.Count) { return $null }
    $process = Get-Process -Id $listener[0].OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.Path) { return $process.Path }
    return '(unknown)'
}
function Start-DbProxy($Target) {
    $port = [int]$Target.proxyPort
    if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid proxyPort in database/environments.json' }
    $proxy = Get-CloudSqlProxyPath
    $owner = Get-DbProxyListener $port
    if ($owner) {
        # Reuse an earlier on-demand proxy; never send credentials to another program.
        if ([IO.Path]::GetFullPath($owner) -ne [IO.Path]::GetFullPath($proxy)) { throw "127.0.0.1:$port is held by another program ($owner)" }
        return $port
    }
    $logRoot = Split-Path $DbPrivateRoot
    New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
    $connectionName = "clever-oasis-508610-n7:asia-southeast1:$($Target.instance)"
    $process = Start-Process -FilePath $proxy -ArgumentList @('--gcloud-auth','--address','127.0.0.1','--port',"$port",$connectionName) -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logRoot 'cloud-sql-proxy.out.log') -RedirectStandardError (Join-Path $logRoot 'cloud-sql-proxy.err.log')
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Get-DbProxyListener $port) { return $port }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    throw "Cloud SQL Auth Proxy did not start; check 'gcloud auth list' and $(Join-Path $logRoot 'cloud-sql-proxy.err.log')"
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
    # VM-01: the local Cloud SQL Auth Proxy (DB-ACCESS-07); the postgres password file stays as before.
    $port = Start-DbProxy $target
    return [pscustomobject]@{ instance=$target.instance; host='127.0.0.1'; port=$port; database=$target.database; user=$target.user; passwordFile=$passwordPath; sslmode='disable' }
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
