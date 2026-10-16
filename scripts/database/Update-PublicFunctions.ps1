[CmdletBinding()]
param(
    # Loopback port of an already migrated disposable server (database loan_manager_dev,
    # trust auth as postgres), as Test-MigrationsCloud.py passes. Without it the script
    # rebuilds the complete migration chain in its own disposable cluster.
    [int]$Port,
    # Write database/current/public-functions.sql instead of failing on drift.
    # MW_WRITE_PUBLIC_FUNCTIONS=1 does the same from Test-CI.ps1 / Test-MigrationsCloud.py.
    [switch]$Write
)
# DB-SCHEMA-01: database/current/public-functions.sql is the readable current body of
# every public-schema function, generated from a disposable rebuild (pg_dump
# --schema-only, normalized by Normalize-Schema.ps1 -FunctionsOnly). Database CI runs
# this in check mode on both routes and fails when the committed copy is stale.
# PostgreSQL refuses to run as root: on Linux run as an unprivileged user.
. "$PSScriptRoot/Common.ps1"
$committed = Join-Path $DbRepoRoot 'database/current/public-functions.sql'
$relative = 'database/current/public-functions.sql'
# pg_dump output is stable within a PostgreSQL major; both CI routes use the toolchain
# major (Windows: pinned binaries, Linux: PGDG/cloud-session). Refuse other majors
# rather than report formatting differences as drift.
$expectedMajor = [int]($DbToolchain.postgresqlVersion -split '\.')[0]
$dumpVersion = (& (Get-PgTool pg_dump) --version) -join ' '
if ($LASTEXITCODE -or $dumpVersion -notmatch '\(PostgreSQL\) (\d+)') { throw 'pg_dump is unavailable' }
if ([int]$Matches[1] -ne $expectedMajor) { throw "pg_dump major $($Matches[1]) differs from toolchain PostgreSQL $expectedMajor; regenerate $relative only with PostgreSQL $expectedMajor" }
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
$root = Join-Path $tempRoot ('public-functions-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$started = $false
$data = Join-Path $root 'data'
$saved = @{}
try {
    if (-not $Port) {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
        $listener.Start(); $Port = $listener.LocalEndpoint.Port; $listener.Stop()
        & (Get-PgTool initdb) -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
        if ($LASTEXITCODE) { throw 'Local initdb failed' }
        Start-PgServer $data (Join-Path $root 'postgres.log') $Port $root
        $started = $true
        & (Get-PgTool createdb) -h 127.0.0.1 -p $Port -U postgres loan_manager_dev
        if ($LASTEXITCODE) { throw 'Disposable database creation failed' }
        foreach ($prerequisite in @('Test-AgentAuditPrerequisites.sql','Test-AppRolePrerequisites.sql','Test-IamRolePrerequisites.sql')) {
            & (Get-PgTool psql) -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d loan_manager_dev -f (Join-Path $DbRepoRoot "scripts/database/$prerequisite") | Out-Null
            if ($LASTEXITCODE) { throw "Disposable prerequisite failed: $prerequisite" }
        }
        Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { $saved[$_.Name]=$_.Value; Remove-Item "Env:$($_.Name)" }
        Push-Location $DbRepoRoot
        try {
            $migrated = & (Get-FlywayPath) "-url=jdbc:postgresql://127.0.0.1:$Port/loan_manager_dev" '-user=postgres' "-configFiles=$(Join-Path $DbRepoRoot 'database/flyway.conf')" "-locations=filesystem:$((Join-Path $DbRepoRoot 'database/migrations').Replace('\','/'))" '-outputType=json' migrate
            if ($LASTEXITCODE -or -not (($migrated -join "`n") | ConvertFrom-Json).success) { throw 'Disposable migration failed' }
        } finally { Pop-Location }
    }
    $dump = Join-Path $root 'schema.sql'
    & (Get-PgTool pg_dump) -h 127.0.0.1 -p $Port -U postgres -d loan_manager_dev --schema-only --no-owner --no-privileges --schema=public --exclude-table=public.flyway_schema_history "--file=$dump"
    if ($LASTEXITCODE) { throw 'Rebuilt schema export failed' }
    $generated = Join-Path $root 'public-functions.sql'
    & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile $generated -FunctionsOnly
    $actual = [IO.File]::ReadAllText($generated)
    $current = if (Test-Path -LiteralPath $committed) { [IO.File]::ReadAllText($committed).Replace("`r`n","`n") } else { $null }
    if ($actual -ceq $current) { "$relative matches the rebuilt schema."; return }
    if ($Write -or $env:MW_WRITE_PUBLIC_FUNCTIONS -eq '1') {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $committed) | Out-Null
        [IO.File]::WriteAllText($committed,$actual,[Text.UTF8Encoding]::new($false))
        "Wrote $relative from the rebuilt schema; review and commit it."
        return
    }
    $where = 'the committed file is missing'
    if ($null -ne $current) {
        $a = $actual.Split("`n"); $c = $current.Split("`n"); $line = 0
        while ($line -lt [Math]::Min($a.Count,$c.Count) -and $a[$line] -ceq $c[$line]) { $line++ }
        $where = "first difference at line $($line+1): committed '" + $(if ($line -lt $c.Count) { $c[$line].Trim() } else { '<end of file>' }) + "', rebuilt '" + $(if ($line -lt $a.Count) { $a[$line].Trim() } else { '<end of file>' }) + "'"
    }
    throw "$relative is stale ($where). Regenerate it from the migrations with: pwsh -NoProfile -File scripts/database/Update-PublicFunctions.ps1 -Write (or MW_WRITE_PUBLIC_FUNCTIONS=1 with Test-CI.ps1), then review and commit the result."
} finally {
    if ($started) { Stop-PgServer $data }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    $resolved = [IO.Path]::GetFullPath($root)
    if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\','/') -eq $tempRoot -and [IO.Path]::GetFileName($resolved) -match '^public-functions-[a-f0-9]{32}$' -and -not ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
