[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) {
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
    return
}
# One entry point for local pre-push verification and GitHub Actions.
# Test-Migrations creates and stops its own loopback-only disposable PostgreSQL.
& "$PSScriptRoot/Test-Migrations.ps1" -TestSqlFile scripts/database/Test-StatementBatch.sql -BusinessExpensesConcurrency -ExpenseReimbursementConcurrency -PaymentCrudConcurrency -ReceiptDeleteConcurrency -InterestReallocationConcurrency -CorePaymentConcurrency -AtomicLoanCloseConcurrency -ChargeGenerationConcurrency -DefaultLoanConcurrency

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 19 -PreMigrationSqlFile scripts/database/Test-R005-Before.sql -TestSqlFile scripts/database/Test-OpeningIncludedCrud.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 22 -PreMigrationSqlFile scripts/database/Test-AccountOpeningBeforeV23.sql -TestSqlFile scripts/database/Test-AccountOpeningCrud.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 68 -PreMigrationSqlFile scripts/database/Test-DefaultChargeBeforeV69.sql -TestSqlFile scripts/database/Test-DefaultChargeUpgrade.sql

& "$PSScriptRoot/Test-Migrations.ps1" -PreMigrationTarget 69 -PreMigrationSqlFile scripts/database/Test-DefaultRepaymentBeforeV70.sql -TestSqlFile scripts/database/Test-DefaultRepaymentUpgrade.sql
