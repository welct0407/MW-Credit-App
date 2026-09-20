# R012 — OLAP Cash Ledger Recent detail

## Scope and authority — 21 September 2026

Owner requested more useful information in the OLAP `Cash Position` dashboard's `Cash Ledger Recent` sub-view, specifically who made a loan payment plus movement date and time in `hh:mm`. Implemented in DEV only. Production promotion, production writes and notifications were not authorized or performed.

R012 depends on the unreleased R011 integrated DEV definition. The change is presentation and AppSheet-model configuration only: no PostgreSQL migration, stored financial data change, OLTP definition, Looker report, automation, recipient route or schedule changed.

## Rollback and starting state

- Starting Git commit: `ef3687552568347076181c40c801324e88c9a51f`; working tree clean.
- Target identity verified as DEV OLAP `MW-OLAP-DEV-20260919`, app ID `9f3422be-bc87-4a5a-a42a-67528ee80393`, internal name `MW-OLAP-DEV-20260919-578763613`, database-3 / `loan_manager_dev`.
- AppSheet rollback point recorded immediately before editing: DEV OLAP version `1.000018`, Deployed.
- Rollback restores DEV OLAP `1.000018`. No database restore is required because the implementation made no data or schema write.

## Implementation

- Added OLAP-only virtual column `Cash Ledger[Movement Time]`, type Text, app formula `TEXT([Created At], "HH:MM")`. It presents the existing creation timestamp as 24-hour `hh:mm` without changing stored timestamps.
- Added OLAP-only virtual column `Cash Ledger[Ref Borrower]`, type Ref to Borrowers, display name `ผู้กู้ / Borrower`. Formula: `IFS(ISNOTBLANK([Ref Payment]), [Ref Payment].[Ref Borrower], ISNOTBLANK([Ref Loan]), [Ref Loan].[Ref Borrowers], ISNOTBLANK([Ref Business Expense].[Ref Related Borrower]), [Ref Business Expense].[Ref Related Borrower], TRUE, "")`.
- Updated `Cash Ledger Recent` manual column order to: Movement Date; Movement Time; Ref Borrower; Movement Type; Amount; Ref From Cash Holder; Ref To Cash Holder; Entry Origin; Ref Payment; Ref Loan; Source Type; Notes; Created By; Ref From Cash Account; Ref To Cash Account.
- Retained source `Cash Ledger`, Ref position, quick edit off and sorting by `Movement Date` descending then `Created At` descending. Changed width from Wide to Narrow so the expanded context remains usable in the dashboard.
- Preserved the `Cash Position` dashboard membership and layout: Cash Holder Summary (Wide), Cash Ledger Recent (Large), Cash Account Summary (Large), tabs off and interactive mode off.
- Saved DEV OLAP as `1.000019`.

## Verification and documentation

[Test results](../outputs/r012-20260921/test-results.md) record the current GUI preview and editor checks. Representative payment movements displayed borrower names and 24-hour times such as `19:45` and `18:28`, with movement, amount, custody and account context. The final saved editor reported `No issues found`; the app remains Deployed.

The data dictionary records the two DEV-only virtual columns and complete view configuration while retaining the production reference sheets. Its recalculation and formula-error scan completed with no matches, and the changed range was rendered and inspected. Updated the release tracker, development differences and environment inventory. `AppSheet_Data_Model_Overview.md` remains correct because no architecture, ownership, relationship or business-rule explanation changed. No release checklist or RC was created because this task did not authorize promotion.

Status: DEV complete; ready for owner review. Owner acceptance, RC preparation and production authorization/deployment remain pending.
