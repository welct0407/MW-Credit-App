# OLTP performance lab — 12 September 2026

## Scope and status

User authorized cloning the OLTP app and AppSheet database and testing performance proposals in isolation, with measured results for review before any production implementation. Work is in progress. Production changes, live notifications and production financial writes are excluded.

## Rollback and environment record

- Source app: Loan Manager ผู้จัดการสินเชื่อ, `93844270-6aa5-420b-a960-bcdf08abd357`.
- Source version verified in Manage > Versions > Version History before copying: **3.000045**. Save and Undo disabled; deployed source remains unchanged.
- Repository starting point: completed analysis report commit `4dca1e7dceeef104ba32b4b12c8220e7c1c7722a`; clean working tree.
- Clone app: **LoanMgr Perf TEST 20260912**, app ID `8a96763c-d453-450b-ac00-a8dfb7dbb8a4`, internal name `LoanMgrPerfTEST20260912-578763613`. Native app/data copy completed; file attachments excluded. Pre-edit version **1.000002** observed in the loaded clone preview URL; Not Deployed. Database source isolation verification completed as recorded below before fixture writes.
- Test database: **Money Perf TEST 20260912**, `aWCGib003O4AyK85Q4_KZc`. Renamed from copied Money database. Native database has 14 copied tables; ten are loaded by OLTP. All ten individually marked Connected under this test database in the app data picker: Borrowers, Charges, Collection Bank Accounts, Collection Settings, Loans, Partners, Payment Allocations, Payments, Repayments, Statistics. The original Money database was separately listed without a Connected marker. No additional tables were added.
- Isolation checkpoint **v1.000003**: disabled Notification - New Loan Created, Notification - Loan Closed, Notification - Charge Received, and Generate Daily Charges. Saved and confirmed through generated app documentation. Receipt processing and both opening-charge processing bots retained. Clone remains Not Deployed.
- App definition restoration does not restore database rows. Keep an isolated baseline and disposable synthetic fixtures; do not reset production data.

## Method

Copy native AppSheet data into a separate database. Verify all ten app table sources, disable external notifications and uncontrolled scheduling in the test app, then create synthetic test transactions. Use the same fixture shapes and repeat counts for baseline and each variant. Capture raw sanitized durations, app version, correctness results and absolute/percentage changes; distinguish end-to-end Posted latency from API acceptance and sync latency. Unverified or blocked proposals must not be presented as measured improvements.

## Checks, documentation and rollback

Synthetic UI receipts have run. Record every experiment and restore its preceding baseline before unrelated experiments. Reflect clone-only column/expression changes in dedicated data-model documentation sections without overwriting production definitions. Capture failed or slower experiments as well as improvements. User review and manual acceptance remain pending. No production deployment is authorized by the experiment results alone.

## Experiment checkpoint (continues 13 September Bangkok)

Isolation verification completed before fixture writes. Created synthetic borrower PERF-UI-SINGLE-001, one daily-interest loan with auto charges off, and one synthetic charge with 100,000 interest and 100,000 principal due. Repeated 100-unit Single Partial receipts preserve the eligible population at one charge. No external contacts or notification actions used. Native charge insertion deliberately bypassed app events; fixture row was confirmed in the client before receipt tests.

Clone settings at baseline 1.000003: server caching OFF, delta OFF, quick sync ON, sync on start ON, delayed sync ON, automatic updates ON. Copy reset server caching relative to the reviewed production setting. API disabled; user confirmation to enable test-only API requested and remains pending. All executed tests so far use the UI.

P01a: changed Payments[Eligible Charges] to return LIST() when Status is Posted, retaining the exact original SELECT otherwise. Version before edit 1.000003; saved variant 1.000004; restored exact original formula at 1.000005. Generated documentation verified both version numbers. No physical schema, Ref, validation or action edits. Posted historical Eligible Outstanding becomes zero in the variant; this is hidden operational eligibility, not a historical payment amount. All Processing/Error eligibility and financial checks remain intact.

Baseline Add Payments server durations: 16.166, 21.237, 16.568 seconds. Variant: 14.165, 13.834, 13.012 seconds. Median initial reduction 2.734 seconds / 16.50%. Small non-randomized sample; reversal controls in progress. All six UI receipts produced successive expected charge balances 199,900 through 199,400, total interest received 600 and principal received zero. These checks do not establish all allocation modes or concurrency correctness.

Exact experimental definitions and rollback are recorded in outputs/oltp-performance-lab-20260912/lab-config.json. Dictionary and overview track clone-only scope separately. No production implementation or acceptance.

User selected UI-only testing on 13 September; API remains disabled. Reversal control at 1.000005: 14.425, 15.181, 16.574 seconds. P01a median is 8.87% below that control (1.347 seconds). Initial-versus-reversal baseline variation is material; do not describe the 16.50% initial comparison as a guaranteed gain.

P03a at 1.000006 set Statistics security filter FALSE to test exclusion of reporting rows. Three receipts took 16.064, 15.108, 17.278 seconds, median 16.064, 5.82% slower than the preceding restored control. All three Posted; expected cumulative interest 1,200 and charge remaining 198,800. Original blank filter restored at 1.000007 and verified through generated documentation. This row-filter diagnostic does not establish the effect of fully removing reporting definitions or the broader analytics dependency graph.

P01b at 1.000008 wrapped all four Payment Allocations Calculated helpers with IF(Allocation Order > 0, stored counterpart, original expression). Pre-edit version 1.000007. First receipt PERF-P01B-UI-01 failed correctness: app status Error, planned/posted amounts zero, no repayments. Analyzer Add reported Success in 12.306 seconds, demonstrating why a transport success is not a successful receipt. The single allocation WzHirZjneA4cMDNTAHkUP5 had order 1 but all allocated components zero, despite interest remaining 98,800 and amount remaining 198,800. Hypothesis: evaluation sees the order assignment before populated stored amounts. Rejected optimization, no valid improvement figure.

Restored exact four originals at 1.000009 (verified). Recovered only this synthetic allocation: reset its order from 1 to 0 in copied native database, retaining snapshot amounts and row identity, then invoked existing Payment - Retry for synthetic receipt gVqmCjiDDcBgrxH4T1WIAw. Verified Posted, one repayment tjkPnBmJoQ43258w9ykXV1, allocated/posted amounts 100, both differences zero, Processed At 13 September 00:18:35 Bangkok. No row deletion or production data changes. This controlled repair of experiment-created test data is not a proposed production recovery policy.

P01c, pre-edit 1.000009, saved/verified 1.000010: the four allocation helpers reuse stored counterparts only when parent receipt Status is Posted. Processing/Error rows keep original formulas. Three samples 15.224, 13.461, 14.516 seconds, median 14.516 (4.38% below earlier restored control, insufficient to establish a dependable small gain). Search PERF-P01C confirmed exactly three Posted receipts totaling 300. Exact original helper formulas restored and version 1.000011 verified.

P02a, pre-edit 1.000011, saved/verified 1.000012: Payments Posted Amount changed from SUM(SELECT(Repayments[Amount Received], [Ref Payment] = [_THISROW].[Row ID])) to SUM([Related Repayments][Amount Received]). Existing Ref list and financial action guards retained. Posting Difference depends on this column. Testing in progress.

Repository changes will be checked, committed and pushed at coherent checkpoints under the owner's standing rule. Revert report/script commits normally if required; preserve live test evidence before retiring the isolated app/database. Do not delete or restore any production object.
