# PostgreSQL OLTP validation

14 September 2026. Core OLTP migration tests passed. Production apps still use Money. Final live-data refresh and owner acceptance are required before cutover; this is not a production deployment approval.

## Configuration

Copied app: **LoanMgr PG Test 20260914**, ID `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`, final version **1.000006**. All eight business tables use `database-2` / `loan_manager_prod`. Original OLTP rollback version **3.000064**. Copied OLAP **LoanInsights PG Trial 20260914** remains **1.000007**.

All 196 OLTP business column definitions and all 72 actions match the copied baseline. The temporary charge-action positions were restored. Daily scheduled charging and three notification bots are disabled in the copy; the three transactional bots remained enabled. Tests used the new desktop GUI and SQL Studio readback. No original app bindings changed.

## Results

|Scenario|Verified result|
|---|---|
|Borrower create and immediate edit|Text Row ID unchanged; optional fields persisted|
|Daily interest|1000 principal and 110 interest/fees received; partial payment then closure|
|Installment, 3 days, interval 2|First-day 410; catch-up 800 split 666 principal/134 interest; total principal 1000 and interest/fees 210; closed|
|Fixed-date maturity|1100 due; 500 partial split 400 principal/100 interest; 600 remaining; closed|
|Default|1000 loss recorded; unpaid charge deleted; adjustment repayment 1000 principal/-1000 interest; closed|
|Lump sum across two same-date charges|150 allocated across two 110 charges; correct allocation and closure of fully settled loan|
|Receive all|Final 70 posted; remaining loan closed|
|Amount validation|0, 1101 against 1100 outstanding, and 100.5 rejected before posting|
|Pause/resume|Flag persisted false/true; no duplicate daily charge|
|Lookup and sync|One borrower rename updated related SQL loan names; original OLTP save refresh and copied OLAP explicit sync displayed results|

All six allocation methods were exercised: First-day Auto, Single Partial, Single Full, Loan Close, Lump Sum, Receive All. Final evidence has 10 Posted receipts, 11 allocations, 11 corresponding repayment rows, plus one default adjustment. Cash receipts total **3690**. Repayment principal **4200** plus net interest **-510** equals the same **3690**, including the prototype's default treatment. This describes the existing app logic, not an external accounting standard.

Independent checker: `scripts/postgresql-lifecycle-check.mjs`; machine-readable results: `lifecycle-reconciliation.json`. An early daily-loan test mistakenly toggled the preselected Auto Charge flag off; corrected via the app and recovered using the existing first-day action. Subsequent automatic first-day tests passed without that correction.

## Required migration change

Native `Loans.Borrower Name` is a database Lookup on `Borrowers.Borrower Name`. Copying data produced a plain PostgreSQL text column and new loans had blank names. Restored the behavior with two SQL triggers: resolve on loan insert/update and propagate borrower renames. No app columns or expressions were added. Existing migrated names matched before repair; only synthetic rows were backfilled.

Insert, rename and four rollback-only edge probes passed. Final readback had zero name mismatches and all 13 foreign keys validated. Apply/rollback/test scripts are `loan-name-lookup.sql`, `loan-name-lookup-rollback.sql`, and `loan-name-lookup-test.sql`. The apply script is already installed and must not be replayed blindly. Parent/child concurrent rename contention has not been tested.

## Row ID guidance

Google warns that native PostgreSQL UUID storage lowercases UUID values and recommends `LOWER(UNIQUEID("UUID"))` to avoid immediate-update failures. Our Row ID columns are **text**, and the app uses `UNIQUEID("PackedUUID")`. Existing keys and references retain their exact case. No lowercase conversion or re-keying was applied. Creation, immediate editing, child insertion and bot updates passed with these keys. See [Google's PostgreSQL guidance](https://support.google.com/appsheet/answer/10106598?hl=en).

## Observed speed

Created At to Processed At ranged **5–44 seconds** for 10 receipts (median **8.5 seconds**). The two-charge lump sum took 44 seconds. These timestamps include app/automation processing and are not isolated database timings. No matched native-database baseline was run, so no percentage speedup is claimed. PostgreSQL migration alone has not removed automation latency.

## Cleanup and integrity

Owner-approved cleanup removed exactly 1 synthetic borrower, 6 loans, 9 charges, 10 payments, 11 allocations and 12 repayments in one transaction, with count guards. Final evidence was preserved before deletion. Eight original financial tables have identical row counts and normalized whole-row hashes to the pre-test baseline. No live financial records were changed. Evidence: `cleanup-verification.json` and `oltp-original-row-integrity.json`.

## Remaining cutover conditions

1. Owner acceptance in the copied app, including the friend's actual device/session and offline/retry behavior. Concurrent double-submission and offline conflict scenarios were not exercised.
2. Pause production entry and scheduled writers for the final refresh window. Refresh PostgreSQL from the then-current Money data and compare keys, references, counts and financial totals. The tested migrated snapshot is not a live replica.
3. Record current production OLTP/OLAP versions again, then switch source bindings using the verified mapping. Keep original source data available for rollback. Preserve production app IDs and cross-app links; copied-app cross-links still refer to original apps and were not used for testing.
4. Reconcile required file/image paths and connector access for both users. No new borrower documents or external notifications were sent during tests. Partner contribution/settlement writes and downstream Looker were not newly certified in this OLTP run.
5. Verify the scheduled daily bot and notifications under the approved production cutover procedure. Manual daily-charge action tests validate its charge logic, not scheduler delivery.
6. Perform immediate post-switch sync and one owner-approved smoke workflow, then resume writers. If rolling back after new SQL writes, reconcile those writes before returning to Money; changing the app version alone cannot migrate them back.

The database passed the exercised core workflows and is cleared of test data. These remaining conditions must be closed before declaring production cutover ready.
