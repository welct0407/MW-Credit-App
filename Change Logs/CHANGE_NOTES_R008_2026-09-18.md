# R008 — Cash account tracking and payment account selection

## Continue here

Status: In development; not ready for review. Owner requested implementation in DEV from the supplied R008 design on 18 September 2026. No production authorization.

Starting Git commit: `a12bc904516117100bbb1f78f93b36a0cea3d4cb`; working tree was clean. Reservation published as `3d19e10`. Live DEV Flyway info confirms V22. Current-editor rollback versions: OLTP **1.000134**, OLAP **1.000142**, both Prototype. R007 production promotion is independently active; preserve its DEV implementation, frozen package and concurrent documentation.

## Scope and source

Design: `G:\My Drive\Loan Manager\Design Documents\R008_Cash_Account_Tracking_and_Payment_Selection_Design.md`, dated 18 September 2026. The owner's request authorizes its DEV feature/schema scope; statements in the document do not independently authorize production writes or owner acceptance.

Cash Accounts/defaults, borrower preference, receiving/disbursement/payer account references, request commands for the three quick payment actions, account ledger dimensions, balance view, and controlled opening allocation. Preserve the canonical SQL payment engine and R005 holder semantics. Preserve R007 SQL reporting views and reconcile their new account fields. Synthetic DEV accounts only; no real account numbers in published evidence.

## Checks and remaining work

- Read design, release development procedure, environment inventory, solution design and database change procedure.
- Live DEV Flyway info: V22, success, 18 September 2026.
- DEV database backup: private `r008-20260918/development-before.dump`, SHA-256 `dd00d6783a564578fac5af0651327de33f39797f99e4af995d091fa1d7f47319`. Restored successfully to isolated PostgreSQL; schema matched after the one explicitly reviewed V22 associative-AND deparser normalization. Candidate V23 rehearsal preserves all seven affected source-table fingerprints and all existing R007 Borrower/Loan/Charge view values.
- V23 draft: account master/guards, nullable source/request fields, source/ledger propagation, canonical quick-payment routing, SQL cutover and balance view, and appended R007 provider dimensions. No historical assignments. Restored-copy candidate and local migration-chain validation, no-op rerun and checksum tampering checks passed.
- Existing core-payment and atomic-close regressions passed with explicit synthetic account fixture defaults. R008 tests then remove these test-only defaults and verify required-account rejection, default replacement, stale preference fallback, six methods, custody correction without reposting, intra-holder/cross-holder transfers, expense/reimbursement, inactive-account settlement reversal and exact holder/account reconciliation. Concurrency: competing default insertion rejected; concurrent Receive All attempts produce only one receipt, repayment total and cash movement.
- Existing OLAP diagnostic is only `Scheduled event 'Every Hour' is only triggered when app is in deployed state`; preserve Prototype and schedule. It is the recorded R007 owner-excluded execution limitation, not a reason to deploy DEV.
- No live app/schema mutation yet at this checkpoint. Current GUI tests, saved AppSheet delta, model/dictionary reconciliation and final diagnostics remain pending. No readiness claim.
- Owner desktop/mobile acceptance and production approval remain separate.
