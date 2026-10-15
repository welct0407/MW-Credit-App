# Atomic final-charge preparation and loan closure

15 September 2026. Implemented and verified in development; owner confirmed all new receipt/closure push amounts. Owner requested moving Close Loan final-charge preparation into SQL and explicitly approved nullable Payments.Ref Target Loan, read-only Ref to Loans in both apps. Production promotion is not authorized.

Rollback before changes: Git c0d509b, Flyway V6; fresh Chrome OLTP 1.000032 and OLAP 1.000034. OLAP differs from the prior 1.000033 capture only in generated View Ref (Ref Closing Payment) visibility metadata (ADVANCED to ALWAYS); preserve the current setting. Both current definitions captured read-only in Chrome. No production changes authorized.

OLTP owns the Close Loan command; OLAP consumes shared Payments/Loans/Charges/Repayments/Payment Allocations read-only. The new Payments.Ref Target Loan permits a command before a final charge exists, preserves proper Ref semantics, and leaves other methods blank. Regenerate and reconcile Payments and the generated Loans reverse relationship in both apps; review slice membership, forms/details and formulas. Existing financial grains, export measures and Looker definitions do not change; no report edits planned.

Before-change wrapper: Create Final Charge -> Add Principal to Today's Charge -> Receive All Remaining Charges. Daily-interest accrual is Current Daily Interest times elapsed days since the latest charge (Loan Date when absent); outstanding principal is Principal Amount less repayment principal. The old wrapper could leave a charge behind if receipt posting failed and had gaps when there was no charge today or principal already appeared on another charge. V7 locks the borrower/loan, prepares one final charge as needed, adds only outstanding principal not already due, calculates the total from current component balances, and invokes the unchanged unified posting engine in the same transaction. Stale/duplicate requests or inconsistent components roll back together.

AppSheet retains the confirmation and notification flow, submitting one Loan Close payment command with Ref Target Loan. Superseded charge-preparation actions are hidden/disabled after dependency review. Other receipt methods and default workflows remain unchanged. SQL uses V7, now applied and immutable; no V6 edit. Daily accrual, existing/absent/paid-today charges, partial principal, future charges, same-day loan, retries/concurrency and forced failure rollback were tested; current OLTP/OLAP GUI and owner-confirmed notification amounts reconcile.

Before rollback pause entry and reconcile commands; coordinate a V8-or-higher SQL forward-fix with the recorded app versions, retaining financial history and additive fields. Restore the matching wrapper/first-day trigger behavior together; app restore alone does not undo SQL processing. Offline multi-device AppSheet recovery remains untested. Production requires a separate reviewed release, restorable backup and explicit approval.

## Pre-apply verification

Private snapshot: Documents/ChatGPT/AppSheet-Loan-Project/atomic-close-20260915/development-before.dump, SHA256 57fd2939ddc2da2a57b640d992015beb6d8c17d382863b41deb0896add6a612f. Archive listing passes; full restore not tested. Fresh normalized V6 schema b9e8eadc239537cc1651ce2605a2c78fec255d16109c6a473dc744bbbb42b24f matches the last verified schema. Aggregate fingerprints saved privately before changes.

Disposable seven-migration rebuild and all V6 payment regressions pass. V7 tests pass for no existing charge, accrued interest since last charge, partially paid principal, paid-today interest, same-day principal-only closure, future scheduled principal without double charging, stale dates, invalid target, duplicate-today rejection, fractional failure rollback, immutable target and repeated requests. Injected error after ordinary posting rolls back final charge, receipt, allocations, repayments and loan closure. Concurrent requests produce one final charge/receipt and reject the loser after lock release. Existing independent-borrower and competing-overpayment tests also pass. The first test fixture attempt used multiple Payments rows for one borrower in one INSERT and hit the existing V6 pending-receipt guard; corrected the fixture to individual commands, matching AppSheet row submissions. No live data was involved in that test correction.

## Applied change and verification

V7 applied at 19:40:49 Bangkok, 294 ms. SHA256 `f99e5a258ba138a55a61820524468f05b1202c92e78a9ee046c1d3d5a31e2bf2`. Final Flyway validation passes eight entries without warnings. Fresh live schema matches disposable rebuild SHA256 `0a1972cc1e8eb5a072da584d394cfc85b3b1b96fc991e11b6fba9c39a4480c98`.

Both apps saved and reconciled at **1.000036**. New field Ref Loans.Row ID; no default/app formula/IsPartOf/key/label. OLTP **Editable_If FALSE**, static Read-Only No, allows action assignment while blocking user edits; OLAP Read-Only Yes. Generated Loans.Related Payments, inline navigation and OLAP Reporting Loans slice membership reconciled. Regeneration altered Payments.Row ID Fixed definition/Editable Initial Value metadata, preserving Key Yes, Read-Only Yes and UNIQUEID(). Existing manual forms/details and other formulas retained.

Close wrapper now contains only Receive All Remaining Charges. That action sets Ref Target Loan instead of Ref Target Charge, estimates principal plus remaining/accrued interest, and no longer requires an existing charge. SQL supplies the authoritative amount and target charge. Two OLTP validations adjusted. Three old preparation actions hidden/FALSE; Default - Create Final Charge unchanged. Exact expressions, affected objects and bot comparisons: [configuration](../outputs/atomic-close-20260915/appsheet-configuration.md).

Current OLTP GUI: Old 130, None 150, Same 100, Part partial 50 then close 70. All five receipts Posted and ledger-equal; four loans closed with matching causal references; aggregate principal 400 and interest 100. Current OLAP shows the same four closed loans and read-only reconciled detail. Owner confirmed all five test receipt/closure amounts. Four fixture borrowers hidden, four auto-charge flags off, financial rows retained. Original fingerprints unchanged across all 14 tables after cleanup.

Four owner-only OLTP notification bots remain unchanged; superseded financial bots, daily generation and three OLAP scheduled/export bots remain disabled. Sources/cross-app links remain development-only. No Looker/export run or app performance benchmark; unchanged financial grain means no direct report configuration change was required.

## Files and documentation

- New V7 migration, disposable functional/concurrency tests, development-only snapshot/lab/preservation runners.
- Test-Migrations runner and database CI workflow include full V6/V7 tests.
- AppSheet Data Model Overview and Data Dictionary updated together; 88 dictionary rows changed/appended, all 12 sheets round-tripped with only intended value changes, no formula errors, changed ranges rendered.
- Development Changes, Environment Inventory, Development Environment Preparation and database README updated.
- Sanitized configuration, reconciliation, preservation, dictionary checks and test evidence under outputs/atomic-close-20260915. Private snapshots and credentials remain outside Git.

Final regression rerun passed after making fixture sessions explicitly use Asia/Bangkok, including on CI hosts in other zones. Seven migrations rebuild successfully, repeat migration is a no-op and checksum mutation is rejected. The runner's `baselineRebuildMatch=false` compares V7 against the original V1 baseline and is expected; the independent **V7-to-live** schema comparison passes. Native workbook feature and sheet-order preservation checks pass; no formulas, panes, validation, drawing, hyperlink or merge changes outside the intended inventory content.

See [report](../outputs/atomic-close-20260915/REPORT.md) for checks, remaining manual acceptance checklist and coordinated rollback. Repository commit/push is the final recovery checkpoint; it does not deploy production.
