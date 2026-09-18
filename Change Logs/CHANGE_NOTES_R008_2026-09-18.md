# R008 — Cash account tracking and payment account selection

## Continue here

Status: In development; not ready for review. Owner requested implementation in DEV from the supplied R008 design on 18 September 2026. No production authorization.

Starting Git commit: `a12bc904516117100bbb1f78f93b36a0cea3d4cb`; working tree was clean. Live DEV Flyway info confirms V22. App rollback versions and database recovery are pending verification before mutation. R007 production promotion is independently active; preserve its DEV implementation, frozen package and concurrent documentation.

## Scope and source

Design: `G:\My Drive\Loan Manager\Design Documents\R008_Cash_Account_Tracking_and_Payment_Selection_Design.md`, dated 18 September 2026. The owner's request authorizes its DEV feature/schema scope; statements in the document do not independently authorize production writes or owner acceptance.

Cash Accounts/defaults, borrower preference, receiving/disbursement/payer account references, request commands for the three quick payment actions, account ledger dimensions, balance view, and controlled opening allocation. Preserve the canonical SQL payment engine and R005 holder semantics. Preserve R007 SQL reporting views and reconcile their new account fields. Synthetic DEV accounts only; no real account numbers in published evidence.

## Checks and remaining work

- Read design, release development procedure, environment inventory, solution design and database change procedure.
- Live DEV Flyway info: V22, success, 18 September 2026.
- App inspection, backup, implementation, migration tests, six-method GUI tests, reconciliation, current-editor diagnostics, exact delta and model documentation remain pending.
- No live mutation yet. Rollback for reservation is Git; no product rollback required at this checkpoint.
- Owner desktop/mobile acceptance and production approval remain separate.
