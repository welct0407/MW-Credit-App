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
- SQL checkpoint `896f551` published. V23 applied successfully to verified DEV host `34.158.38.171` at **19:20:56 Bangkok, 18 September 2026**, then Flyway validate passed. Exactly one migration ran; no PROD writes. Applied SHA-256 `72553729411d9ae6944eea85a05df079b603fe00ce8086eb7a2a44b6280994a2`; V23 is now immutable.
- `Invoke-R008Lab.ps1 -Mode seed` added four explicitly synthetic DEV accounts (no account numbers), three synthetic borrowers, three loans and four charges. Account openings deliberately remain uninitialized; no historical split inferred. Existing seeded loans have auto-charge disabled.
- Current GUI tests, saved AppSheet delta, model/dictionary reconciliation and final diagnostics remain pending. App configuration is being implemented; no readiness claim. Restore only through coordinated recovery against recorded app versions and the verified private V22 snapshot; preserve any subsequent writes. Ordinary correction uses a higher forward migration.
- Owner desktop/mobile acceptance and production approval remain separate.

## App configuration and notification refinement

The running [AppSheet edit record](../outputs/r008-20260918/appsheet-edit-record.md) captures the implemented account fields/forms, superseded action-input experiment, final single-update command pattern and unfinished consumers. Native Action Inputs did not reliably preselect; the design section 9.3 one-field-form fallback is being implemented. Synthetic Receive All selected Lisa and posted one Lisa receipt after correction of an intermediate reset-on-edit defect. The failed intermediate synthetic receipt is retained for audit. Model documentation, complete structured delta and final saved-state verification remain pending.

The existing receipt bot listens to AppSheet Payments Adds/Updates. SQL-created quick receipts therefore need an originating-command event linked to the exact receipt. Draft V24 changes only future quick receipt identity to an AppSheet-reproducible, length-delimited key; preserves existing V23 keys and recognizes their retries. No new columns or financial logic. Local full-chain/migration-integrity/six-method/concurrency checks passed (competing default rejected; duplicate receipt once). A separate V23→V24 fixture verified unchanged old keys and idempotent old/new-token replay. Its first fixture attempt failed correctly for missing contributed capital; adding explicit synthetic capital fixed setup. V24 is not yet applied as of this entry. Notification process reuse, owner-only routing checks and functional validation remain pending.
