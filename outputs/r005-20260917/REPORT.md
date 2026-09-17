# R005 local implementation checkpoint

17 September 2026. **Not ready. No live DEV app edits or Cloud SQL migration applied.**

## Authorized scope

The owner authorized R005 development, moved Cash Ledger entry/Record Cash Transfer/Cash Position to OLAP, and explicitly approved one SQL-only cutover identity table. OLTP retains payment receiver and expense payer source entry. No production writes or actual opening balances are authorized.

## Implemented locally

- [V20](../../database/migrations/V20__cash_custody_ledger.sql): Cash Holders, Cash Ledger, Cash Holder Balances, receiver/payer foreign keys, immutable cutover metadata, atomic deterministic source synchronization, manual transfer validation and source/ledger identity protection.
- Old source identities are excluded regardless of later corrections or backdated effective dates. Old Pending settlements can post on completion. No history is reconstructed.
- Existing payment allocation and expense allocation functions are preserved. Receiver-only updates do not invoke the financial receipt trigger. New automatic first-day receipts and referral rebates use Lisa.
- A source that ceases to represent cash has no derived cash row; source records remain authoritative. This covers negative expenses with blank payer and noncompleted settlements. Manual deletion of ledger rows is rejected.
- Normal manual entry supports Dad/Lisa handover and Lisa/Tommy reimbursement. Opening/Manual Correction are deliberate SQL administration using transaction-local `r005.allow_cash_adjustment=on` and mandatory notes. No app-facing cutover table or new financial AppSheet bot is proposed.

## Checks

Run reproducibly in isolated local PostgreSQL, never against a live environment:

```powershell
./scripts/database/Test-Migrations.ps1 -PreMigrationTarget 19 -PreMigrationSqlFile scripts/database/Test-R005-Before.sql -TestSqlFile scripts/database/Test-R005.sql -R005Concurrency
./scripts/database/Test-R005Backup.ps1 -RehearseMigration
```

The synthetic fixture is created at V19 before V20, so cutover is exercised rather than simulated by changing the metadata after installation. Tests cover historical NULLs/no backfill, old Pending completion, backdated new loans, ordinary Dad default, Dad-to-Lisa receipt correction, exact preservation of allocations/repayments, first-day gross/net cash and retry, invalid first-day rollback, three expense payers and unchanged A/B allocation, negative accounting-only/refund transitions, payer correction, transfer/reimbursement rules, protected system rows, positive/whole/finite amounts, controlled opening guard, immutable source/master/cutover identities, both settlement partners, correction, source rollback and independent holder reconciliation.

Concurrent receiver updates serialize and retain one movement. Expense and settlement concurrency checks exercise the existing fail-fast allocation lock followed by repeated retries, checking final source/ledger agreement and no duplicate completed settlement outflow. Executed output is retained in [sql-regression-final.txt](sql-regression-final.txt). These are SQL tests, not GUI acceptance or notification-delivery tests.

The DEV backup was restored into an isolated local server; public/assessment_lab schema matches the source backup. The migration rehearsal checks unchanged fingerprints of all four source tables, blank historical custody fields, zero initial ledger rows and complete cutover identity coverage. [Restore rehearsal output](restore-rehearsal.txt). Cloud SQL cron/settings are outside this restore test.

## Live baseline and limitation

- DEV OLTP **1.000110**, DEV OLAP **1.000096**, both on DEV database-3. No app Save performed.
- Both current editors initially showed **No issues found**. The deployed app's Deployment Check panel displays deployed status; no separate rerun control was exposed. This is not final R005 warning-clearance evidence.
- DEV/PROD V19 normalized schema SHA-256 `4A4BE3E9B4469F53CFB3F90074CD382B5D439047DF3119CCF88B3B94F0777D20`.
- DEV backup SHA-256 `25AE0426F1F984AFACF2D662FD9706529EFC0C165A49DE26FFB21CFFEFA0C85C`. Private raw backup/captures: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917`.
- Both generated appdoc exports are retained with DOM object identities: **550 OLTP / 714 OLAP property tables**. Settings, security, seven OLTP/two OLAP bots and associated event/task/process captures supplement them privately. [Manifest](evidence-manifest.json) records hashes. Not all unset/inherited states or omitted configuration are proven by these artifacts.
- The owner was asked for a limited **R005** baseline-coverage exception under AGENTS.md §6.1. Approved by owner on 17 September 2026: “Approve the limited R005 coverage exception”. R004's exception is not reused. No unknown property is marked unchanged or verified.
- DEV's four notification bots remain disabled; released PROD's observed notifications are enabled. DEV push recipients inspected so far are exclusively `LIST("welct0407@mw-credit.com")`. Parity correction, complete PROD definition comparison, schedule inventory, saved-state checks and execution/delivery verification remain unfinished. Superseded financial bots must remain disabled.

## Remaining work

| ID | Requirement | Status |
| --- | --- | --- |
| COVER-01 | Complete saved-definition coverage or explicit limited R005 exception | Owner-approved limited exception; omitted coverage remains explicitly unverified |
| PREP-01 | DEV automation parity, isolated routes/schedules, companion links, saved-state evidence | Pending |
| SQL-01 | Apply exact reviewed V20 to DEV through runner; read back schema/cutover and source preservation | Pending; local tests only |
| APP-OLTP-01 | Cash Holders Ref master, receiver/payer metadata, field visibility and receiver Quick Edit with existing financial locks retained | Pending |
| APP-OLAP-01 | Cash Holders/Ledger/Balances, manual transfer form/action, cash position and source navigation | Pending |
| APP-DIFF-01 | Per-save full exported-property diffs, omitted-property checks, exact per-property checklist and final baseline reconciliation | Pending |
| GUI-01 | Current-GUI normal/invalid/source-correction workflows and both-app sync/readback | Pending |
| WARN-01 | Final zero errors/warnings and deployment diagnostics for both saved DEV apps | Pending |
| DOC-01 | Overview/dictionary draft inventory | Updated as pending; live configuration reconciliation still required |
| FREEZE-01 | Tested live candidate, pinned commit/Flyway manifest, readiness recommendation and owner acceptance | Pending |

## Recovery

No live rollback is needed at this checkpoint. App rollback references remain OLTP 1.000110 / OLAP 1.000096; recapture if shared DEV changes. Backup has a verified local restore for business schemas/Flyway history. Future SQL rollback must retain financial source/ledger evidence and use a reviewed higher migration or an explicitly authorized coordinated restore. Do not restore over newer writes or edit an applied migration.

The model overview and workbook Dev Differences describe the local draft only; production inventories are unchanged. No Looker report or external export destination was changed. AppSheet consumers must be reconciled before readiness.
