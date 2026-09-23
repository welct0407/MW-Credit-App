[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# One entry point for local pre-push verification and GitHub Actions.
# Test-Migrations creates and stops its own loopback-only disposable PostgreSQL.
& "$PSScriptRoot/Test-Migrations.ps1" -TestSqlFile scripts/database/Test-DailyCashSnapshots.sql -CorePaymentConcurrency -AtomicLoanCloseConcurrency -ChargeGenerationConcurrency -DefaultLoanConcurrency
