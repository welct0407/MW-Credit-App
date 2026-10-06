[CmdletBinding()]
param([string]$TestSqlFile,[string]$PreMigrationSqlFile,[int]$PreMigrationTarget,[switch]$LumpSumConcurrency,[switch]$InterestReallocationConcurrency,[switch]$PaymentCrudConcurrency,[switch]$ReceiptDeleteConcurrency,[switch]$CorePaymentConcurrency,[switch]$AtomicLoanCloseConcurrency,[switch]$ChargeGenerationConcurrency,[switch]$DefaultLoanConcurrency,[switch]$BusinessExpensesConcurrency,[switch]$ExpenseReimbursementConcurrency,[switch]$R002Concurrency,[switch]$R005Concurrency,[switch]$R008Concurrency)
. "$PSScriptRoot/Common.ps1"
$null = @(Get-MigrationManifest)
$bin = Get-PgBin
$testRoot = Join-Path $DbToolRoot ('migration-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$data = Join-Path $testRoot 'data'
$log = Join-Path $testRoot 'postgres.log'
# Reserve a currently free loopback port; pg_ctl still fails safely if it is taken meanwhile.
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$started = $false
$saved = @{}
Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { $saved[$_.Name]=$_.Value; Remove-Item "Env:$($_.Name)" }
try {
    & (Join-Path $bin 'initdb.exe') -D $data -U postgres --auth=trust --encoding=UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE) { throw 'Local initdb failed' }
    $start = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$data+'"'),'-l',('"'+$log+'"'),'-o',('"-h 127.0.0.1 -p '+$port+'"'),'-w','start') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testRoot 'start.out') -RedirectStandardError (Join-Path $testRoot 'start.err')
    $start.WaitForExit()
    if ($start.ExitCode) { throw 'Local PostgreSQL failed to start' }
    $started=$true
    # V33's NOLOGIN owner is operator-managed in Cloud SQL. Provision it only
    # in this verified disposable server before rebuilding the migration chain.
    & (Join-Path $bin 'psql.exe') -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f (Join-Path $DbRepoRoot 'scripts/database/Test-AgentAuditPrerequisites.sql')
    if ($LASTEXITCODE) { throw 'Disposable audit owner prerequisite failed' }
    $env:FLYWAY_URL="jdbc:postgresql://127.0.0.1:$port/postgres"
    $env:FLYWAY_USER='postgres'
    $env:FLYWAY_CONFIG_FILES=Join-Path $DbRepoRoot 'database/flyway.conf'
    Push-Location $DbRepoRoot
    try {
        if ($PreMigrationSqlFile -or $PreMigrationTarget) {
            if (-not $PreMigrationSqlFile -or $PreMigrationTarget -lt 1) { throw 'Pre-migration fixture requires both SQL file and target version' }
            $pre = & (Get-FlywayPath) "-target=$PreMigrationTarget" '-outputType=json' migrate
            if ($LASTEXITCODE) { throw 'Pre-fixture migration failed' }
            & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f $PreMigrationSqlFile
            if ($LASTEXITCODE) { throw 'Pre-migration fixture failed' }
        }
        $first = & (Get-FlywayPath) '-outputType=json' migrate
        if ($LASTEXITCODE) { throw 'Empty database migration failed' }
        $first = ($first -join "`n") | ConvertFrom-Json
        if (-not $first.success) { throw 'Empty database migration reported failure' }
        $valid = & (Get-FlywayPath) '-outputType=json' validate
        if ($LASTEXITCODE -or -not (($valid -join "`n" | ConvertFrom-Json).validationSuccessful)) { throw 'Validation failed' }
        $second = & (Get-FlywayPath) '-outputType=json' migrate
        if ($LASTEXITCODE) { throw 'Second migration failed' }
        $second = ($second -join "`n") | ConvertFrom-Json
        if (-not $second.success -or $second.migrationsExecuted -ne 0) { throw 'Second run was not a successful no-op' }
        if ($TestSqlFile) {
            & (Join-Path $bin 'psql.exe') -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f $TestSqlFile
            if ($LASTEXITCODE) { throw 'Supplemental SQL regression failed' }
        }
        if ($BusinessExpensesConcurrency) {
            & "$PSScriptRoot/Test-BusinessExpensesConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($ExpenseReimbursementConcurrency) {
            & "$PSScriptRoot/Test-ExpenseReimbursementConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($PaymentCrudConcurrency) {
            & "$PSScriptRoot/Test-PaymentCrudConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($ReceiptDeleteConcurrency) {
            & "$PSScriptRoot/Test-ReceiptDeleteConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($InterestReallocationConcurrency) {
            & "$PSScriptRoot/Test-InterestReallocationConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($LumpSumConcurrency) {
            & "$PSScriptRoot/Test-LumpSumConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($CorePaymentConcurrency) {
            & "$PSScriptRoot/Test-CorePaymentConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($AtomicLoanCloseConcurrency) {
            & "$PSScriptRoot/Test-AtomicLoanCloseConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($ChargeGenerationConcurrency) {
            & "$PSScriptRoot/Test-ChargeGenerationConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($DefaultLoanConcurrency) {
            & "$PSScriptRoot/Test-DefaultLoanConcurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($R002Concurrency) {
            & "$PSScriptRoot/Test-R002Concurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($R005Concurrency) {
            & "$PSScriptRoot/Test-R005Concurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        if ($R008Concurrency) {
            & "$PSScriptRoot/Test-R008Concurrency.ps1" -PgBin $bin -Port $port -OutputDirectory $testRoot
        }
        $dump = Join-Path $testRoot 'rebuilt.sql'
        & (Join-Path $bin 'pg_dump.exe') -h 127.0.0.1 -p $port -U postgres -d postgres --schema-only --no-owner --no-privileges --schema=public --schema=assessment_lab --exclude-table=public.flyway_schema_history --file=$dump
        if ($LASTEXITCODE) { throw 'Rebuilt schema export failed' }
        & "$PSScriptRoot/Normalize-Schema.ps1" -InputFile $dump -OutputFile "$dump.normalized"
        # Initial V1 must be exactly reconstructible, not just syntactically valid.
        $baselineMatch = (Get-FileHash "$dump.normalized").Hash -eq (Get-FileHash 'database/migrations/V1__existing_schema.sql').Hash
        if (@(Get-MigrationManifest).Count -eq 1 -and -not $baselineMatch) { throw 'Rebuilt schema differs from V1 export' }
        # Prove checksum tampering is detected without modifying maintained migration files.
        $copies = Join-Path $testRoot 'migrations'
        Copy-Item 'database/migrations' $copies -Recurse
        $changed = Join-Path $copies 'V1__existing_schema.sql'
        [IO.File]::WriteAllText($changed,([IO.File]::ReadAllText($changed).Replace("'standard public schema'","'synthetic checksum mutation'")),[Text.UTF8Encoding]::new($false))
        $mutationResult = & (Get-FlywayPath) "-locations=filesystem:$($copies.Replace('\','/'))" '-outputType=json' validate 2>&1
        $mutation = ($mutationResult -join "`n") | ConvertFrom-Json
        if ($mutation.validationSuccessful -or @($mutation.invalidMigrations | Where-Object { $_.errorDetails.errorCode -eq 'CHECKSUM_MISMATCH' }).Count -ne 1) { throw 'Checksum mutation was not rejected' }
        [pscustomobject]@{ firstMigrations=$first.migrationsExecuted; secondMigrations=$second.migrationsExecuted; baselineRebuildMatch=$baselineMatch; checksumTamperingRejected=$true; localPostgres='18.6'; flyway=$DbToolchain.flywayVersion }
    } finally { Pop-Location }
} finally {
    if ($started) { & (Join-Path $bin 'pg_ctl.exe') -D $data -m fast -w stop | Out-Null }
    Get-ChildItem Env:FLYWAY_* -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item "Env:$($_.Name)" }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    # Retained locally for failure diagnosis. No financial data or persistent service is created.
}
