# R011 — Borrower collection notes and required English Name

## Scope and authority — 20 September 2026

Owner requested one borrower-linked quick-edit note in the Collection daily borrower detail, plus making Borrowers.Description (English Name) required in AppSheet edit forms. Implement in DEV; production promotion is not authorized.

The note is a persistent, optional borrower-level operational text field, editable from the daily collection detail. It does not reset daily or alter payment dates, balances or collection status. OLTP owns editing; OLAP remains a read-only analytical consumer. No automatic notifications or AI Collection integration are included.

## Rollback and starting state

- Starting Git commit: `fcd24c5e50d807a1799f71621e39598cff24d945`; working tree clean.
- DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad`: current editor/preview version `1.000054`, Deployed, database-3.
- DEV OLAP live unchanged `1.000017`, Deployed, database-3 / `olap_borrowers_analytics`, read-only. No OLAP mutation.
- Private pre-change DEV database dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r011-20260920/before-r011.dump`; SHA256 `29FDC6FE5B701F5A6AD5E23E7A624EA6CABE151C4BA927C69927C26B353E040C`. pg_dump completed and pg_restore catalogue read passed; a full restore rehearsal was not performed. Ordinary rollback restores OLTP 1.000054 and retains the compatible nullable SQL column, preserving any entered notes. Database restore would require separate write-loss review.

## Implementation and dependency review

- Reserved and published R011; next number R012. DEV database identity verified as instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database `loan_manager_dev`.
- Immutable SQL V28 adds `Borrowers.Borrower Note`, nullable text without a default/backfill. Existing keys, constraints, permissions and triggers unchanged. Existing borrower triggers normalize blank referrers and recalculate rollups; quick payment posting is guarded by its Payment Request Token update path. Note-only SQL and GUI tests passed.
- OLTP Borrowers regenerated from 47 to 48 AppSheet columns. Borrower Note: LongText, shown, editable, optional, no formula/initial value; display name `"บันทึกผู้กู้ / Borrower Note"`.
- Borrowers.Description: Required TRUE, retaining Text and `"English Name"`. No database NOT NULL constraint or invented missing names. All 31 DEV borrowers had nonblank names before and after testing.
- Todays Collection Board: Updates only, Adds/Deletes off; unchanged source Borrowers and filter `ISNOTBLANK([Daily Collection Status])`. Regeneration includes Borrower Note in this slice, Visible Borrowers and R008 Borrower Commands. Regeneration's three slice-change warnings cleared after save.
- Todays Collection Board_Detail: quick-edit list contains only Borrower Note. Column order: Daily Collection Status - Order, Borrower Reference TE, Todays Amount Due, Todays Amount Collected, Todays Amount Remaining, Borrower Note, Todays Collection Charges. Enabling updates also exposes the existing borrower Edit entry point; required English Name is enforced there.
- Saved DEV OLTP 1.000055 after regeneration, 1.000056 after field/quick-edit configuration, final 1.000057 after note positioning. Rollback remains 1.000054.
- OLAP Borrowers stays read-only on `olap_borrowers_analytics` (87 AppSheet columns), unchanged definition/version. Its SQL view and `olap_portfolio_summary` retain their existing column contract. Existing reports/exports need no changed field binding; note export/reporting is outside this scope. No AI Collection code/integration, schedule, notification or financial rule changed.

## Verification and documentation

[Test results](../outputs/r011-20260920/test-results.md) record passing migration-chain, SQL isolation/compatibility and current-GUI tests. Both saved editors show green diagnostics and Deployed state. Physical mobile/offline and concurrent-user note editing were not tested; a single note is overwritten by later edits and supplies no separate note-history feature.

Dictionary Dev Differences rows 2857–2862 preserve production reference and all prior values/formulas. Before/after renders inspected. Updated tracker, environment inventory, development differences and model behavior; [single promotion checklist](../outputs/r011-20260920/promotion-checklist.md) retains future promotion activities. No diagram, routing/runbook, report, or unrelated model changes required.

Status: DEV complete; ready for owner review. Owner acceptance, RC preparation and production authorization/deployment remain pending. No production writes or notifications performed.
