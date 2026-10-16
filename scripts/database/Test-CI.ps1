[CmdletBinding()]
param(
    # One entry point for local pre-push verification and GitHub Actions.
    # Without -Group every stage runs in sequence, as before. GitHub Actions
    # runs the four groups as parallel jobs; each group owns its own disposable
    # clusters, so the groups share no state. Every group runs on Windows and
    # Linux; only the migrations group uses a different (Python) driver on Linux.
    # PostgreSQL refuses to run as root: on Linux run as an unprivileged user.
    [ValidateSet('all','migrations','receiving','phase5','phase8')]
    [string]$Group = 'all'
)
$ErrorActionPreference = 'Stop'
function Test-Selected([string]$Name) { $Group -eq 'all' -or $Group -eq $Name }

if (-not $IsWindows -and (Test-Selected 'migrations')) {
    # Linux migration route: Test-MigrationsCloud.py adapts the same concurrency
    # suites and also owns the schema-rebuild and checksum-tamper proofs.
    & python3 "$PSScriptRoot/Test-MigrationsCloud.py"
    if ($LASTEXITCODE) { throw 'Cloud disposable migration checks failed' }
    & python3 "$PSScriptRoot/Test-MigrationsCloud.py" --pre-target 19 --pre-sql scripts/database/Test-R005-Before.sql --sql scripts/database/Test-OpeningIncludedCrud.sql --sql-only
    if ($LASTEXITCODE) { throw 'Historical opening CRUD checks failed' }
    & python3 "$PSScriptRoot/Test-MigrationsCloud.py" --pre-target 22 --pre-sql scripts/database/Test-AccountOpeningBeforeV23.sql --sql scripts/database/Test-AccountOpeningCrud.sql --sql-only
    if ($LASTEXITCODE) { throw 'Account opening attribution checks failed' }
    & python3 "$PSScriptRoot/Test-MigrationsCloud.py" --pre-target 68 --pre-sql scripts/database/Test-DefaultChargeBeforeV69.sql --sql scripts/database/Test-DefaultChargeUpgrade.sql --sql-only
    if ($LASTEXITCODE) { throw 'Legacy default charge upgrade checks failed' }
    & python3 "$PSScriptRoot/Test-MigrationsCloud.py" --pre-target 69 --pre-sql scripts/database/Test-DefaultRepaymentBeforeV70.sql --sql scripts/database/Test-DefaultRepaymentUpgrade.sql --sql-only
    if ($LASTEXITCODE) { throw 'Legacy default repayment upgrade checks failed' }
}

if ($IsWindows -and (Test-Selected 'migrations')) {
# Test-Migrations creates and stops its own loopback-only disposable PostgreSQL.
& "$PSScriptRoot/Test-Migrations.ps1" -TestSqlFile scripts/database/Test-StatementBatch.sql -BusinessExpensesConcurrency -ExpenseReimbursementConcurrency -PaymentCrudConcurrency -ReceiptDeleteConcurrency -InterestReallocationConcurrency -CorePaymentConcurrency -AtomicLoanCloseConcurrency -ChargeGenerationConcurrency -DefaultLoanConcurrency

# DB-SCHEMA-01: committed database/current/public-functions.sql must match a fresh
# rebuild (own disposable cluster; MW_WRITE_PUBLIC_FUNCTIONS=1 rewrites it instead).
& "$PSScriptRoot/Update-PublicFunctions.ps1"

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 19 -PreMigrationSqlFile scripts/database/Test-R005-Before.sql -TestSqlFile scripts/database/Test-OpeningIncludedCrud.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 22 -PreMigrationSqlFile scripts/database/Test-AccountOpeningBeforeV23.sql -TestSqlFile scripts/database/Test-AccountOpeningCrud.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 68 -PreMigrationSqlFile scripts/database/Test-DefaultChargeBeforeV69.sql -TestSqlFile scripts/database/Test-DefaultChargeUpgrade.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 69 -PreMigrationSqlFile scripts/database/Test-DefaultRepaymentBeforeV70.sql -TestSqlFile scripts/database/Test-DefaultRepaymentUpgrade.sql
}

if (Test-Selected 'receiving') {
# Phase 4 receiving and true nonsuperuser maintenance proof use separate owned clusters.
& "$PSScriptRoot/../../tests/integration/Run-PaymentPhase4.ps1"
if($LASTEXITCODE){throw 'Phase 4 receiving integration checks failed'}
& "$PSScriptRoot/../rehearsal/Run-ApplicationRoleOperatorProof.ps1" -MaintenanceProof -MaintenanceTarget 83
if($LASTEXITCODE){throw 'Existing-package V83 operator maintenance proof failed'}
& "$PSScriptRoot/../rehearsal/Run-ApplicationRoleOperatorProof.ps1" -MaintenanceFailureProof -MaintenanceTarget 83
if($LASTEXITCODE){throw 'Existing-package operator failure cleanup proof failed'}

# Unified amount-first PWA and preserved legacy routes use an owned disposable cluster.
& "$PSScriptRoot/../../tests/integration/Run-UnifiedReceiving.ps1"
if($LASTEXITCODE){throw 'Unified receiving integration checks failed'}
}

if (Test-Selected 'phase5') {
# Phase 5 reuses the maintained borrower and populated-journal upgrade fixtures.
& "$PSScriptRoot/../../tests/integration/Run-Phase5.ps1"
if($LASTEXITCODE){throw 'Phase 5 borrower integration checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-Phase5.ps1" -JournalOnly
if($LASTEXITCODE){throw 'Phase 5 populated journal and operation integration checks failed'}

# Historical anchor compatibility stays populated83-to84; management runs its own isolated upgrade family.
& "$PSScriptRoot/../../tests/integration/Run-Phase5.ps1" -AnchorOnly
if($LASTEXITCODE){throw 'Phase 5 populated anchor compatibility checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-Phase5.ps1" -ManagementOnly
if($LASTEXITCODE){throw 'Phase 6 management integration checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-Phase5.ps1" -SettingsOnly
if($LASTEXITCODE){throw 'V92 editable settings integration checks failed'}
}

if (Test-Selected 'phase8') {
# R053 covers request-driven push, V89 agent RPCs and true three-owner restoration.
& "$PSScriptRoot/../../tests/integration/Run-Phase8.ps1" -R053
if($LASTEXITCODE){throw 'R053 notification/jobs and agent receipt RPC checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-Phase8.ps1" -AgentNativeOnly
if($LASTEXITCODE){throw 'R053 native source-operation compatibility and race checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-Phase8.ps1" -AgentReadsOnly
if($LASTEXITCODE){throw 'R053 native read column/type/ACL checks failed'}
& "$PSScriptRoot/../../tests/integration/Run-R053OperatorIndependent.ps1" -AgentReceipts
if ($LASTEXITCODE) { throw "R053 DEV operator proof failed" }
& "$PSScriptRoot/../../tests/integration/Run-R053OperatorIndependent.ps1" -Production -AgentReceipts
if($LASTEXITCODE){throw 'R053 nonsuperuser operator/restoration checks failed'}
}
