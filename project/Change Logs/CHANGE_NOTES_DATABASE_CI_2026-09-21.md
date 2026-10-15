# Database CI fixture compatibility — 21 September 2026

## Scope and diagnosis

Owner requested a permanent fix for recurring Database migrations emails to the personal Gmail account. Latest observed failed run: [35596017552](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/35596017552), commit `b025b2084f50fd88c80f35926c122962c365c00c`. Git tree was clean at this starting/rollback commit.

The earlier R002 capital fixture was already present. The current failure was `A cash account is required for this new cash movement` in Test-CorePayment.sql after V23 introduced required source accounts. Reproduced with the exact CI command on a fresh local disposable PostgreSQL. Further execution exposed missing Loan Date in the core concurrency fixture, required by cash-ledger posting. These are synthetic test setup failures; the workflow has no Cloud SQL target or production credentials.

## Changes

- Shared synthetic Dad/Lisa cash-account fixture; explicit source account fields in all five SQL suites and four concurrency runners invoked by CI. Core concurrency loans now include their effective date. No account balance top-up or live data change.
- Added missing-account rejection assertions to retain guard coverage. No migration, database function, trigger, financial expectation or production guard changed.
- One `scripts/database/Test-CI.ps1` entry point for GitHub Actions and local pre-push checks; documented its use for migration/test changes in database/README.md.
- Branch/PR/manual builds retained. Push events explicitly target branches so release tags no longer duplicate branch builds. Email preferences remain unchanged.

## Verification and publication

`pwsh -NoProfile -File scripts/database/Test-CI.ps1` passed locally (exit 0): empty rebuild through V31, Flyway validation, second migrate no-op, checksum-tampering rejection, core payment/atomic close/charge generation/default/analytics SQL suites and all four concurrency suites. Original failure was reproduced before editing; missing-account negative cases pass with guards active. Git diff whitespace check passed.

Published implementation `12a469660d327b54cf8625dd7344bff59fde8bf4` to origin/master. GitHub Actions [run #61](https://github.com/welct0407/AppSheet-Loan-Project/actions/runs/35597015225), job 106324075563, independently succeeded on the hosted Windows runner. The pre-existing checkout Node 20 deprecation warning is unrelated to these failures; no warning was hidden. This is test/tooling maintenance, not a product release; no app GUI change, model-workbook update or R-number is needed. Rollback is a normal revert of this maintenance commit; no database recovery required.
