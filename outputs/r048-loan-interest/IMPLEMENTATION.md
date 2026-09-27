# R048 — original daily interest and Loan Key

## DEV implemented and tested — 27 September 2026

This section records the DEV checkpoint. The owner subsequently approved the agreed manual production cutover, completed 28 September at PROD OLTP3.000257 / OLAP1.100208 / V53. [Ordered production execution and recovery](../r048-loan-interest-production/README.md) supersede pending-PROD statements below. R048 remains Open; prior R048 receipt/report changes are preserved.

Confirmed decisions: round the **stored** original rate to the nearest whole percentage; populate existing DEV loans from original evidence too. Existing daily amounts stay unchanged until a principal repayment. Values below 0.5% become 0%; exactly 0.5% becomes 1%. This can increase or decrease daily interest after repayment compared with the former exact ratio.

Starting Git commit: `78fd914557c37827daa8bbddb9f5b1b61e8dc272`. Unrelated risk/payment-health untracked files are preserved. Live DEV baseline: OLTP **1.000125** (newer than recorded 1.000124; read from current version history), OLAP **1.000042**, database **V52**, `appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev`.

## Ordered implementation record

1. Inspected current DEV identity, Loans schema/triggers, both app definitions and V45 repayment calculation. Verified work account `welct0407@mw-credit.com`. Recorded restorable app versions above.
2. Captured private DEV database dump and restored it to a loopback-only disposable PostgreSQL instance. All original table fingerprints matched. See `development-backup.json`; private data stays outside Git.
3. Drafted **V53**: `Loans.Original Daily Interest Rate` is a nullable integer, where `1` means **1%**. SQL calculates it at creation and prevents ordinary edits. App initial-value calculation will provide form preview; SQL remains authoritative.
4. Rate formula: round `100 × original average daily interest / Principal Amount`. Daily loans use original daily amount. Fixed-date loans divide Fixed Interest by inclusive loan days. Daily installments divide `(Daily Payment Amount × inclusive days − Principal Amount)` by inclusive days. Fixed/installment payment schedules remain unchanged.
5. Backfill original evidence: saved original basis first, then a single first-day zero-principal charge less transfer fee, then current amount only for an unrepaid daily loan. Incomplete terms stay NULL rather than inventing original interest. Final restored-data rehearsal and DEV backfill cover **75 of 78** pre-existing loans. The three exceptions are fixed-date loans missing Due Date and Fixed Interest (two earlier synthetic fixtures and one historical record); private exception details are outside Git. All pre-existing public values were unchanged in the restored-data rehearsal. No daily-interest loan lacked original basis.
6. Principal repayment recalculates daily-loan amount as `round(max(0, outstanding principal) × stored rate / 100)` in whole baht. Signed principal corrections and full payoff use the same frozen rate. Interest-only updates and stale saves preserve the current amount. Existing posted charges/receipts are not rewritten.
7. Append the field to OLAP's loan view; update the DEV SQL forecast provider to use the same rounded rate after simulated principal repayment. Live PROD Metabase remains unchanged. Its Loan Key consumers will need the corresponding later PROD update.

8. Ran the complete disposable-database CI, including rounding boundaries, all three loan types, immutable rate, stale/null saves, principal reversals/payoff, zero-rate loans and forecast consistency; all passed. Applied and validated V53 in DEV through the existing Flyway runner. The immutable migration SHA256 is `d76b2f62c3d8f18714f99d512334fe9427cdc61e5179554f19390c0bb4e6d774`.
9. Regenerated Loans in both current AppSheet editors, preserving source bindings and Row ID keys. OLTP has 51 columns; OLAP has 61. Added the Number field, read-only settings, bilingual label and OLTP initial-value expression. Updated each Loan Key expression and OLTP Current Daily Interest validation/editability. Exact saved expressions: [app evidence](app-evidence.json).
10. Placed the new field immediately after Current Daily Interest in OLTP Loans_Form and both Loans_Detail views. Main/related loan cards inherit the updated Loan Key. Regeneration appended the column to OLTP R008 Loan Commands and OLAP Reporting Loans slices; final membership was inspected and is recorded in app evidence. Existing filters and update permissions were preserved.
11. Current GUI created one synthetic daily loan: principal1000, daily5, stored1%. The same draft previewed fixed interest150 over10 inclusive days and daily installments115 over10 days, both showing2%. The latter are form-preview checks; saved fixed/installment creation is covered by SQL tests.
12. GUI partial receipt205 allocated interest5/principal200: outstanding800, daily8, stored1%; both apps displayed the result and unchanged1% Loan Key. The OLTP edit form disabled both daily amount and original rate. GUI full receipt800 then closed the loan: outstanding0, daily0, rate1%. Two Posted payments total1005. The fixture was hidden, auto-charge explicitly disabled and synthetic cash account deactivated; audit records remain.
13. Final saved-state diagnostics: **OLTP1.000128 / OLAP1.000045**, both **No issues found**, no unsaved definitions. Existing Deployed modes retained. Both DEV apps loaded/synced. Source/routing/recipient configuration was unchanged, so existing DEV isolation evidence is reused.
14. Updated scoped dictionary overlays and current model/environment references, recorded exact SQL catalog readback and prepared [manual PROD steps](MANUAL_PROD_STEPS.md). PROD remains at its previous definitions; no RC, App Upgrade, report publication, release freeze or release tag was performed.

## Checks and review limits

- [Restored backup and invariance](development-backup.json), [DEV migrate](dev-migrate.json), [DEV validate](dev-validate.json), [CI](ci-evidence.json), [exact SQL metadata](postgresql-affected-definitions.json), [GUI/configuration](app-evidence.json).
- [Review manifest](review-manifest.json) identifies the DEV package; [repository checks](repository-checks.json) record dictionary/syntax checks. The final full CI also verified stored fixed/installment inserts. Its added fixture initially lacked synthetic capital; that test setup was corrected without changing V53 or live configuration, then the complete suite passed.
- [Partial-repayment screenshot](partial-repayment.png) contains synthetic test data only.
- Original daily amount remains as entered until principal changes; after that the rounded percentage is authoritative. A0% stored rate produces0 daily interest on repayment. This is the owner's confirmed behavior.
- Three incomplete historical fixed-term records remain blank/Unavailable; correct original source terms only when evidence exists. No rate is inferred from effective current returns. Their schedules/posted amounts were not modified.
- Metabase is PROD-bound. Its SQL forecast provider remains V48 there until V53 is later applied. Known report Loan Key consumers are listed in the manual handover; they have not been published or relabeled in this DEV task.
- **Ready for owner review, subject to the disclosed missing-term exceptions and separate PROD execution/verification.** R048 remains Open. This is DEV completion, not a production deployment claim.

## Recovery

Use the verified private pre-V53 backup for full database recovery only after coordinating intervening DEV writes. Prefer a reviewed higher forward migration for targeted SQL rollback; never edit an applied migration. App restore alone does not undo SQL or transactions. No production release tag or scope freeze is requested.
