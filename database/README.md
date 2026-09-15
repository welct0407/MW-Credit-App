# PostgreSQL development with Flyway

After an app/database copy or refresh, also complete [Development Environment Preparation](../Documents/Development_Environment_Preparation.md) before test writes. Flyway does not manage AppSheet bot enablement. Nonessential/confusing bots must remain disabled; essential processing requires development-only effects and saved-state verification.

Flyway Open Source 13.6.0 manages the database schema in this repository. PostgreSQL 18.6 is the tested engine. Both Cloud SQL instances use database name `loan_manager_prod`; the **host/instance**, not that database name, identifies the environment. See `environments.json`.

## Setup and initial adoption

Run `scripts/database/Install-Tools.ps1` in PowerShell. Binaries live outside Git under `%LOCALAPPDATA%/AppSheetLoanTools`. Flyway downloads are SHA-256 pinned in `toolchain.json`; PostgreSQL utilities come from the official EDB HTTPS distribution. Passwords are read from the existing external file and passed through temporary process environment variables, never command-line password arguments.

The V1 migration is a schema-only export of the verified development/production objects: 14 tables, 2 views, 6 functions and 10 triggers, with their indexes and constraints. It contains no borrower records or financial data. It excludes ownership, grants, roles, instance settings and Flyway history. Those deployment prerequisites remain separately managed. An empty database rebuild needs suitable permissions and subsequently needs separately authorized reference/application data and AppSheet configuration before it is usable.

`Normalize-Schema.ps1` removes pg_dump transport tokens and version headers and permits the existing public schema. It preserves object SQL. Initial `baseline` checks a fresh normalized export against V1 before recording version 1; it does **not** execute V1 against populated tables. `baselineOnMigrate` is disabled. Do not edit V1 after adoption even though a baseline marker itself does not store V1's checksum.

```powershell
./scripts/database/Invoke-Flyway.ps1 -Environment development -Command info
./scripts/database/Invoke-Flyway.ps1 -Environment development -Command validate
```

## Each change

1. Create a new monotonically increasing `V2__description.sql`, then V3 and so on. Include functions/triggers in versioned migrations too. Preserve text Row IDs and their case. Review transaction behavior, locks, dependencies and reversal/forward-fix SQL. Do not include `BEGIN`/`COMMIT` unnecessarily; Flyway normally wraps PostgreSQL migrations in a transaction. Nontransactional operations require separate documented handling.
2. Run `scripts/database/Test-Migrations.ps1`. It starts a temporary, empty PostgreSQL server bound only to loopback, rebuilds migrations, validates, checks repeat execution is a no-op and verifies checksum mutation is rejected. It stops the server and leaves diagnostic files outside Git. No production data is used.
3. Apply in development with `Invoke-Flyway.ps1 -Environment development -Command migrate`, then `validate`. Test affected OLTP/OLAP flows in their test apps. Cover changed calculations, refs, permissions, trigger-generated results after sync and financial reconciliation; record results and obtain user acceptance.
4. Update the Markdown change log and model documents when applicable; commit and push the exact intended files. CI rebuilds against disposable PostgreSQL, never Cloud SQL.
5. From the clean tested commit, run `New-Release.ps1 -ValidationReference 'path or link to accepted test evidence'`. This requires development validation and no pending/invalid migrations, and writes a release manifest outside Git. A reference must describe actual completed validation, not a placeholder.
6. Before promotion, compare current production schema with the expected pre-release schema (export via `Export-Schema.ps1`; inspect drift). Verify a restorable backup, review migration files and application dependencies, and obtain explicit owner approval. Flyway `validate` checks migration history/checksums, **not** arbitrary live-schema drift or business correctness.
7. Promote the same clean commit:

```powershell
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command migrate `
  -ReleaseFile 'C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/release-COMMIT.json' `
  -ApprovalReference 'actual owner approval for this release' `
  -BackupReference 'verified Cloud SQL backup or restore point'
./scripts/database/Invoke-Flyway.ps1 -Environment production -Command validate
```

The runner rejects mismatched commits/hashes, dirty checkouts and missing approval/backup references. These are operator safeguards, not an authorization service: the agent must verify the referenced evidence. No push triggers production deployment. After promotion verify sync and affected workflows, capture results and update the change log. Failed migrations require investigation, not automatic `repair` or retries of financial backfills.

## Recovery and limits

### Common charge generation V8/V9 — development only

`generate_loan_charge(loan, business_date, manual_request)` owns ordinary daily-interest, fixed-date and installment generation. `generate_due_charges(business_date, optional_loan_ids)` calls it in a deterministic atomic batch. The approved nullable `Loans.Charge Generation Request` command invokes the same engine through `manual_charge_generation`; OLTP sends a dated nonce, with user editing blocked. Bangkok-stale/malformed requests fail; existing loan/date charges are skipped. First-day and final-close routines remain specialized SQL paths.

V9 installs pg_cron on Cloud SQL and creates an initially inactive 00:05 Asia/Bangkok job. Set the reviewed instance flags before migration; see the [configuration and recovery report](../outputs/charge-generation-20260915/REPORT.md). Cloud SQL uses background workers, not libpq. Windows disposable testing intentionally skips extension/job installation, so an actual development Cloud SQL scheduled run is required. The current test ran successfully at 20:52 Bangkok, producing one synthetic charge 20. Owner approved nightly development activation; the primary job is now active, and the temporary test job was removed. Session TimeZone remains UTC; business date is explicit.

Both development apps are 1.000039, rollback 1.000036. Generate Today's Charge now sets only the hidden Text request field; Generate All Today's Charges keeps its existing routing/visibility. OLAP Reporting Loans includes the hidden field and remains read-only. The AppSheet Generate Daily Charges bot stays disabled.

Run `scripts/database/Test-Migrations.ps1 -TestSqlFile scripts/database/Test-ChargeGeneration.sql -CorePaymentConcurrency -AtomicLoanCloseConcurrency -ChargeGenerationConcurrency` for the full functional and concurrency suite used by CI. Manual lock contention returns a sync/retry error promptly; the nightly batch rolls back on an invalid eligible loan. `Invoke-ChargeGenerationLab.ps1` is confined to the reviewed development fixtures; `Set-DevelopmentChargeSchedule.ps1` starts/status-checks/finishes the synthetic schedule and enables/pauses the primary development job. `Get-ChargeGenerationState.ps1` is read-only. Never replay fixture seeding or snapshots automatically. V8/V9 are applied and immutable; corrections require V10 or higher. Production remains V5 and requires separate release approval.

### Atomic Close Loan V7 — development only

V7 extends the V6 engine so one `Payments` write with Allocation Method `Loan Close`, Status `Processing`, today's Bangkok Payment Date, matching Ref Borrower and **Ref Target Loan** prepares the final charge and posts the receipt atomically. The amount submitted by AppSheet is an estimate; SQL derives the actual amount from locked component balances. Existing blank-target legacy commands retain V6 behavior. The reserved `lc7:` charge prefix prevents final charges becoming first-day net-off receipts.

Use the matching OLTP/OLAP **1.000036** definitions in [V7 configuration](../outputs/atomic-close-20260915/appsheet-configuration.md). The Close wrapper submits one command and its three old charge-preparation actions are disabled. The additive field is user-read-only in both apps, using Editable_If FALSE in OLTP to permit action assignment.

Run `scripts/database/Test-Migrations.ps1 -TestSqlFile scripts/database/Test-AtomicLoanClose.sql -CorePaymentConcurrency -AtomicLoanCloseConcurrency` for the full V6/V7 functional and concurrency suite, also used by CI. `Invoke-AtomicLoanCloseLab.ps1` is limited to the pinned development AC7GUI fixtures; seed only once, verify after current-GUI actions, then close hides borrowers/disables auto-charge without deleting history. Preservation checks compare the private pre-task baseline, excluding only that fixture family and Payments.Ref Target Loan.

V7 is applied and immutable; corrections require **V8 or higher**. Pause/reconcile outstanding commands before coordinated SQL/AppSheet fallback. Preserve references and financial history; an app restore alone cannot revert the database. [Verification, backup and rollback details](../outputs/atomic-close-20260915/REPORT.md). Production remains V5; no production release is authorized.

### Core payment V6 — development only

V6 moves all six payment methods, payment-caused closure and first-day charge/receipt creation into SQL. Production remains V5. Run `scripts/database/Test-Migrations.ps1 -TestSqlFile scripts/database/Test-CorePayment.sql -CorePaymentConcurrency` for the functional and concurrency regression suite. `Invoke-CorePaymentLab.ps1` manages only the pinned development CP6GUI synthetic fixture family; its seed/prepare-close modes are setup, not replayable financial correction tools. `Test-CorePaymentPreservation.ps1` compares original-record fingerprints against the private pre-task baseline and excludes only that fixture family and the new nullable field.

Apply the matching AppSheet configuration in the [core payment report](../outputs/core-payment-20260915/REPORT.md): read-only closing Ref in both apps, disabled superseded financial bots/actions, reviewed owner-only notification routes. Standalone function invocation is not the supported AppSheet command path; new/retried Payments writes invoke the routing trigger. At the V6 checkpoint, the daily Close Loan final-charge wrapper remained outside the receipt transaction; V7 above supersedes that boundary. Applied migrations are immutable. No production release is authorized by this documentation or repository push.

Use a new reviewed forward-fix migration for ordinary reversals. A destructive/data change may require restoring a verified backup with an agreed write-freeze/reconciliation plan. Flyway history is not a data backup and the free edition does not provide automatic business rollback. Never run `clean` on either Cloud SQL instance; the repository disables it and does not expose it in the runner.

The added workstation network is a single approved `/32`, alongside the AppSheet networks. If the workstation's public IP changes, verify it and obtain approval for the replacement access entry. SSL remains required. `sslmode=require` encrypts the existing connection but does not provide hostname verification; this task preserves that connection policy. Credentials, private exports and local test files are outside Git; their independent backup coverage is not established by a repository push.

Official references: [Flyway OSS installation](https://documentation.red-gate.com/flyway/reference/usage/flyway-open-source), [baseline command](https://documentation.red-gate.com/flyway/reference/commands/baseline), [configuration](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace), [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/).
