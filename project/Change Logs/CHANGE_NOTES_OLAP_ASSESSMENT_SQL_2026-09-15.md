# OLAP assessment SQL prototype — 15 September 2026

## Scope and status

Owner requested a database-side rebuild of OLAP loan assessment, with quantified performance and correctness verification. Implemented and tested only in LoanInsights PG Trial 20260914 (`494cd013-0d9b-482f-9559-c9d83059de91`). Final version **1.000022**; rollback **1.000013**. Production OLAP **1.100046**, production OLTP **3.000069**, the OLTP test copy, production financial records and Looker were not edited. Owner acceptance and production rollout remain pending, consistent with the requested review-before-production workflow.

## Changes and dependencies

- Created isolated `assessment_lab` functions: `forecast`, `inputs`, `calculate_row`, `fingerprint`, `stamp_inputs`.
- Created `public."Loan Assessment SQL Lab"`: five original fields plus 18 stored result/metadata fields. Two BEFORE INSERT/UPDATE triggers calculate and stamp results. Existing production Loan Assessment remains intact.
- Created updatable `public."Loan Assessment SQL Lab View"`, adding `SQL Source Current` to detect changed source data/date on sync. No financial-table triggers added.
- Bound only the copied OLAP Loan Assessment to this view. Nine display VCs read stored results with guards. Recommendation/status hide stale results and show the timestamp. Refresh Assessment changes a hidden token. All computed fields are read-only; original key and input formatting preserved.
- Removed sixteen assessment Calendar VCs, the obsolete Borrowers reverse Calendar reference and Calendar Ref action; reconciled affected slice membership and Calendar inline view.
- Created generated `public."OLAP Calendar SQL Lab"` and bound the copied Calendar to it, preserving all 153 date keys and ten date-description VCs. Daily Analytics actions/bots remain unchanged; copied schedules remain disabled.
- Exact definitions and differences: `outputs/assessment-sql-20260915/01-calculation.sql` through `04-calendar-view.sql` and `app-definition-diff.json`.

## Verification and results

- Original AppSheet forecast: 918 comparisons, no differences above 0.005.
- SQL source input parity: 45 active loans and 676 charge rows, 2,523 comparisons to AppSheet data/calculated fields, zero mismatches.
- Independent SQL/oracle verification: 95 cases, 14,535 dates, 87,210 numeric comparisons, no differences above 0.000001.
- Final API Find verification: 1,683 Calendar comparisons and 12 restored assessment result comparisons passed. Only authorized copied-app read API used.
- New desktop GUI: input updates returned trigger results in the same sync; no eligible date and invalid amount messages; unsynced edits hide old results; simulated stale fingerprint hides results; explicit refresh restores them. Previous-day detection, independent rows and idempotence checked in SQL. Temporary row tests rolled back. Lab inputs restored.
- Eight analytics summary metrics match the unchanged control. Existing thirteen foreign keys and enabled lab triggers verified.
- Combined optimization, five paired runs: median **6.734 → 5.613 s**, **16.6% faster**; mean **6.848 → 5.562 s**, **18.8% faster**. All five paired test runs faster. Trigger-only/freshness version was **11.6% slower** by median in its separate paired batch. Full SQL refresh median **15.072 ms**, ten runs. No pre-change repeated write benchmark, so no save-to-result gain claimed.
- AppSheet rejected a small decimal literal during development; changed it to `1.0 / 10000000`. Final editor validates without issues. Intermediate test versions are not rollback targets.

## Documentation and recovery

Updated `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` together. Added the dictionary's `OLAP Assessment SQL` sheet (59 definition/scope rows) while verifying all pre-existing sheet values remained unchanged. Rendered and re-imported export verified. Report, SQL, scripts and redacted evidence are tracked in Git; raw borrower data, full definitions, UI captures and the dictionary rollback copy are private under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\assessment-sql-20260915`. No credentials are in the repository; private-folder backup coverage is not established.

## Review checklist and limitations

Review normal, large and invalid proposed amounts in the test app; sync and check the timestamp/results; exercise Refresh Assessment; confirm the preferred forecast horizon and whether simultaneous users need separate assessment rows. The current lab retains 1 August–31 December 2026 for like-for-like math. Existing UI still presents shared MAIN; SQL computation is row-specific. Source changes require client sync before detection. Scheduled Daily Analytics writes were not run against shared production snapshots; they require cutover validation. Looker is unaffected by this isolated copy.

Production implementation requires fresh rollback versions/backups, reviewed horizon/user workflow, preservation of the borrower FK/blank-Ref behavior, consumer regeneration and regression checks, and the owner's acceptance. Do not replay lab DDL as a production migration.

## Rollback

Restore copied OLAP version **1.000013**. This returns Loan Assessment to the original production input table and Calendar to Calendar Help Table / Sheet1 with the old VCs. Lab SQL objects can remain unused; no deletion is required. Restore the private dictionary backup only if reverting documentation, preserving any subsequent unrelated work. Production does not need rollback for this task.
