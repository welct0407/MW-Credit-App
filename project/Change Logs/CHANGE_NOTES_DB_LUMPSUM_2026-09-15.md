# Database lump-sum workflow — development and production promotion

Date: 15 September 2026. Status: **promoted through Flyway V4; production OLTP 3.000074; documentation and deployment checks complete**. Exact release commit: `8417b9bf5e950287a969fd5750985b5c9375d80b`. Receipt entry restored; all 14 production table fingerprints unchanged across cutover. Both production apps load/sync. Existing production notification settings retained; Dev pushes route only to the owner. See the V4 release section at the end and [release report](../outputs/lumpsum-promotion-20260915/REPORT.md). Earlier sections below are dated historical stages, not current status.

## Historical promotion preflight — superseded by completed V4 release

Owner approved promotion on 15 September 2026, then explicitly required retaining all current production notification features. Production remains unchanged at OLTP **3.000071**, OLAP **1.100051**, database V1 while the Dev implementation is revised. Fresh production schema matches V1. A private custom-format database backup was successfully restored locally; all 14 business-table fingerprints/counts and normalized schema matched. Backup SHA256 `ea880e8558eb06e3d8236cc1b5797218b87a97e9edd591bcac41cc957b498b18`, 132,556 bytes, in `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-promotion-20260915/production-before.dump`. Restore server stopped. Preflight found no Processing/Error receipts; recheck before actual cutover.

Production inspection confirmed the existing receipt bot triggers other bots: Payment Posted listens for an AppSheet status update to Posted, and Loan Closed listens for an AppSheet loan-status transition. V2/V3's direct SQL finalization bypassed those events. Owner rejected an additional notification queue; that proposal was discarded and no queue was created in either shared environment. The correction keeps SQL allocation/ledger preparation and reuses existing AppSheet finalization/closure actions and notification bots. V4 is being prepared; it has not yet been applied or tested.

**Explicit owner direction superseding the earlier notification-disable default for this work:** use the same workflow/notification behavior in Dev and production; production keeps current recipient expressions; Dev push notifications go only to `welct0407@mw-credit.com`. Owner explicitly requested a Dev test push to that account. Review recipient routing before enabling or sending; unrelated scheduled exports/reminders remain outside this test. Fresh Dev rollback version **1.000014** recorded from the current appdoc before edits; Dev OLAP remains **1.000027**. No push has been sent yet.

## Scope and rollback

Owner requested an end-to-end database-backed replacement in Dev OLTP, complete testing, comparison with earlier performance assessment, and promotion-ready documentation. Owner confirmed newest eligible charge first; interest before principal remains the allocation rule.

Pre-edit definitions freshly captured: Dev OLTP `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b` **1.000013**; Dev OLAP `494cd013-0d9b-482f-9559-c9d83059de91` **1.000027**. Both use database-3. Private appdoc captures are under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/lumpsum-20260915/`. Development schema export: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/flyway/development-schema-20260915-134912.sql`. Flyway baseline 1 confirmed. Starting Git commit: `3f517ba7f226d913a153e65b9dcb7b6acda3c1c4`.

Concurrent assessment promotion was committed separately as `78ef23a`; its documentation was preserved. No production write, notification, or Looker edit was performed. App rollback alone cannot undo database triggers or posted development test receipts. The private before-workbook is in the same lump-sum folder. Private file/credential backup coverage is not established by Git publication.

## Design and consumers

OLTP owns payment entry. Existing Payments is the command and receipt record; Payment Allocations provides the frozen per-charge allocation; Repayments remains the reporting ledger. Replace the multi-step AppSheet lump-sum chain with one database transaction. Reuse all existing tables and columns; no additional physical business fields proposed. Store positive allocations only, removing zero-value fan-out. Newest charge date first, stable immutable charge key descending for equal dates; the provider's transient row ordinal is not a business ordering key. Preserve interest-before-principal within each charge, payment-date eligibility, whole-baht input, receipt/ledger reconciliation, and paid-loan closure.

Shared consumers: Dev OLTP and Dev OLAP both read Borrowers, Loans, Charges, Payments, Payment Allocations and Repayments. Current definitions for sources/defaults/Refs/permissions/slices/calculations are recorded in `outputs/lumpsum-db-20260915/consumer-definitions.json`. OLAP retains read-only financial access. Both new app interfaces verified the affected workflow and readback. Reporting retains the existing repayment grain and component/date fields. No schema regeneration, business columns, keys, Refs, slices or permissions changed. Scheduled/export/Looker execution was not run.

## Preparation and evidence

Current OLTP editor confirmed seven bots: Create First-Day Charge, Auto Receive First-Day Charge and Payments - Process Receipt enabled; Generate Daily Charges and all three notifications disabled. Essential reviewed steps use development data actions to create Charges, create first-day Payments and process receipts; no embedded outward task was enabled. OLAP Refresh Daily Analytics Daily, Daily 2 and Daily Loan Analysis Export all disabled. Saved states were checked after routing. No bot enablement changed. Synthetic borrower collection and loan auto-charge flags are false, without contact information.

Historical six-charge server Add baseline: 17.355/15.582/14.097 seconds (median 15.582); earlier AppSheet direct-order variant median 14.582 seconds, overlapping ranges. Historical Save-to-visible-Posted timings belong to different experiments and are not substituted for server duration.

## Implementation and exact versions

Dev OLTP saved **1.000014**, Dev OLAP unchanged **1.000027**. Both use database-3, separate development instance **appsheet-pg-dev-20260915 / 34.158.38.171**. The database name remains `loan_manager_prod`; do not identify environment by name alone. Direct SSL/PostgreSQL 18.6 retained. No capacity/network/credential change.

- `database/migrations/V2__atomic_lump_sum.sql`: seven indexes, three trigger functions and four triggers. Applied at 14:07 Bangkok.
- `database/migrations/V3__lump_sum_guard_compatibility.sql`: higher immutable revision preserving legacy child metadata behavior and rejecting forged initial Posted. Applied at 14:13; V2 was not modified after application.
- Receipt event **Payment queued or retried** and grouped action **Payment - Process Receipt** both now use `AND([Status] = "Processing", [Allocation Method] <> "Lump Sum")`. Their original expression was `[Status] = "Processing"`. The five existing actions remain for other methods.
- New SQL child keys: `ls2:<payment-key>:<charge-key>`. **Charge Row Number Snapshot stores negative Allocation Order** for these rows, preserving existing AppSheet order calculations. Historical rows keep their original meaning. SQL children are immutable; posted receipt monetary/date/borrower inputs are protected; metadata retries stay Posted with no duplicate results.
- Borrower locks serialize receipt commands, source loans/charges are locked, invalid/over-balance commands roll back entirely. Existing partial results or other pending/error receipts require reconciliation. No historical backfill/reprocessing.

Exact SHA256: V2 `86aa12f62de9f6c8918c14c4acc201487d651ea601daecd122e1b22824193021`; V3 `b44a38000fa0858d883008a8ebe26bd3a639e9d91617cf8097978e732748b707`.

## Tests and measured results

All functional tests used the current AppSheet desktop GUI; local SQL tests are supplemental. See the [full review report and evidence](../outputs/lumpsum-db-20260915/REPORT.md).

- **17 synthetic receipt inserts**, all Posted and reconciled: 5 original control, 4 exploratory V2, 5 final V3, 150/210 correctness receipts and a 10 Single Partial compatibility receipt. Form rejects 0, -1, 0.5 and 361 against 360 available. Posted metadata edit preserved child counts/totals and exposed no editable monetary/date fields.
- 150 funds C interest 30/principal 100, then B interest 20. Remaining 210 funds B principal 100 and A interest 10/principal 100. L1 closes; L2 remains active for tomorrow's interest 50. Receipt differences zero. Dev OLAP borrower/loan/charge/repayment values read back and reconcile.
- Local regressions cover missing/invalid/future/no-eligible input, forged Posted, idempotent stale status update, immutable SQL ledger, legacy metadata, pending legacy receipt exclusion, 1,000-charge fan-out and conservation. Separate sessions reject competing overpayment without partial records; an independent borrower completes before first lock release.
- Flyway fresh V1–V3 reconstruction, validate, second migration no-op and checksum mutation rejection passed. Current rebuilt schema differs from V1 as expected. Dev migration and validation passed. All **14 original business-table row counts/fingerprints unchanged**, excluding explicitly identified LS26 fixtures.
- Fresh normalized live Dev schema exactly matches the tested V1–V3 reconstruction, SHA256 `c506666c8a6638cb50ccd55f39a933d683241359c3163471cf5f557920cb592f`. Both development cross-app shortcuts were followed and verified. App routing saved with no editor issues; evidence JSON records the condition and disabled Save state.
- Today's server Add median **14.438 → 5.370 seconds (62.8% reduction)**, five runs each. Against historical original **15.582**, reduction **65.5%**. Save-to-borrower-ready/sync-complete median **14.567 → 12.165 seconds (16.5%)**, 3 versus 5 usable runs. Allocation count **6 → 1** on the six-charge benchmark.
- Sequential small samples, warm-up trend, historical environment differences and screen-range overlap limit extrapolation. Exploratory V2 runs, unavailable timers and pre-submission browser timeouts are recorded separately. No isolated SQL-time, production-speed or sustainable-throughput claim.

Maintained files: `Test-Migrations.ps1` optional regression/concurrency hooks, `Test-LumpSum.sql`, `Test-LumpSumConcurrency.ps1`, development-only `Invoke-LumpSumLab.ps1`, `lumpsum-evidence.mjs` and `lumpsum-dictionary.mjs`. `.gitattributes` preserves migration bytes (`-text`) across checkouts for exact SHA256 promotion; existing V1 bytes were verified unchanged. Evidence lives under `outputs/lumpsum-db-20260915/`.

## Documentation and review status

Updated Model Overview, canonical Data Dictionary, Development Changes, Environment Inventory and this log. Dictionary Dev Differences, explicitly development-only DB Logic rows and Guide document the new semantics. App Settings incorporates the already completed PostgreSQL sync-options change; no live toggle changed here. Production business definitions and the assessment promotion remain intact. All sheets round-trip checked, formula-error scan clear, changed ranges rendered and visually reviewed.

Read-only `scripts/verify-lumpsum-dictionary.py` additionally checked 53,720 existing cells across all 12 sheets, preserving values/types/styles outside the intended sync inventory cells and retaining panes, filters, tables, charts, merges, validation and protection. Initial raw appdoc text captures reached the browser string-size limit; structured table captures provide current consumer definitions. Recorded AppSheet version rollback points do not depend on those text exports being complete.

Existing reporting issue: Closed Loan Principle subtracts outstanding principal from all principal loaned, including principal repaid on still-open loans; some OLAP component displays use a dollar symbol for baht amounts. Loan statuses and repayment values reconcile. These unrelated formulas/displays were not changed.

User checklist: search Dev OLTP Payments for **LS26-CHECK-150** and **LS26-CHECK-210**, inspect allocation order/principal/interest/zero differences, then compare the synthetic borrower's closed 100 loan and active 200 loan in Dev OLAP. Review stable-key ties and immutable posting. Synthetic fixtures remain for this review and must never be promoted as financial data.

Remaining release checks: owner acceptance, multi-device/offline stale-write rejection/recovery, and production notification handling. Direct SQL child writes do not generate AppSheet child-change events; development notifications stayed disabled, so notification parity is not claimed. Arbitrary external ledger writers and concurrent direct historical-record edits are not certified. Daily Analytics/export/Looker execution was not tested. These limits are explicit in the report.

## Rollback and future promotion

Pause receipt entry and reconcile in-flight work. For fallback, add a **new higher Flyway migration** disabling only `process_lump_sum` on `public."Payments"`; retain guard functions/indexes and posted history. Restore both original `[Status] = "Processing"` app conditions and test legacy-path receipts before resuming. App rollback alone is insufficient. Do not edit V2/V3, use repair/clean, delete posted rows or restore a Dev app version reconnecting production.

Future production release requires owner acceptance and explicit deployment approval, verified restorable backup, fresh production rollback versions, schema drift and consumer/notification review, controlled pause/drain, exact tested commit/migration hashes and the repository release-manifest/Flyway runners. Apply SQL and the two app conditions within that controlled cutover; test both current apps before resuming entry. Promote configuration/schema only. Record release approval, verification and rollback in this same log. Repository publication is recovery coverage for source/evidence, not production authorization.


## V4 release status (supersedes historical sections)

Deployment completed at final OLTP **3.000074** after restoring the exact Payments_Form field order that AppSheet reset during the temporary read-only pause. Temporary version **3.000072** was non-runnable while actions lacked write access; **3.000073** restored entry and the tested actions; final **3.000074** has no editor issues. SQL migrated at 16:04:37 Bangkok. The restored backup, exact manifest, successful production validation, schema parity, all 14 unchanged table fingerprints and both production GUI readbacks are recorded in the release report. Development Environment Preparation now records the owner's explicit real-push exception and owner-only Dev routing, preventing a future refresh from silently restoring production recipients or replacing the existing workflow with a stub. Production device delivery remains for review on the next ordinary payment; no production test receipt was inserted.

### Lump-sum release — 15 September 2026

Production OLTP **3.000074**, Dev OLTP **1.000019**, both databases **Flyway V4**. OLAP versions remain production **1.100051** and development **1.000027**. The [release report](../outputs/lumpsum-promotion-20260915/REPORT.md) supersedes the historical V3 design and notification limitation.

PostgreSQL prepares positive allocations and matching repayments atomically, newest eligible charge first with immutable-key ties and interest before principal. Existing AppSheet actions finalize the receipt and close paid loans, producing the existing notification events. Processing remains visible if finalization fails; prepared receipts cannot allocate twice and block another lump-sum receipt until reconciled. SQL validates the final Posted transition. Seven indexes, three functions and four triggers reuse existing tables and columns; no queue or new business field exists. New ls2: children retain negative Allocation Order in Charge Row Number Snapshot. Historical rows retain their prior interpretation.

The receipt event and group both use `[Status] = "Processing"`. Three allocation actions skip Lump Sum; two reconcile assignments select Posted/NOW() for Lump Sum and preserve original other-method expressions. [Exact action expressions](../outputs/lumpsum-promotion-20260915/action-expressions.json) are promotion evidence. Both apps read the same ledger, sources remain isolated (production database-2, Dev database-3), and no schema regeneration, Ref, slice or business-column change is required.

Production notification events, templates and recipient expressions are retained. The owner explicitly authorized the three Dev push bots with `LIST("welct0407@mw-credit.com")` as their sole recipient expression. Other Dev scheduled/export bots remain disabled. Dev Payment Received and Loan Closed runs completed in AppSheet; device receipt is not independently confirmed. New-GUI Dev receipt allocation, finalization, closure and OLAP readback passed. V4 SQL regression and concurrency passed. Earlier V3 speed measurements remain historical; no new V4/production speed percentage is claimed. Offline multi-device recovery, scheduled exports and Looker remain unverified.

Rollback points: Dev OLTP **1.000014**, production OLTP **3.000071**, OLAP unchanged. Production logical backup was restored successfully with all 14 business tables matching. Reconcile prepared receipts before fallback; use a higher migration to disable the processor and restore original action expressions, retaining ledger history and guards. App rollback alone does not undo SQL changes.


Maintained V4 artifacts: immutable V4 migration, Test-LumpSumAppFinalization.sql, updated concurrency test, release action expressions, report and dictionary/doc builders. Complete local V1–V4 regression, validation and concurrency passed. Dev appdoc version 1.000019 confirms saved configuration. Production promotion was explicitly authorized; this authorization also preserves existing production notification features. The queue proposal was discarded without a Dev/production table. Detailed backup, notification run IDs, test receipts and measurement limitations are in the release report. Model overview, canonical dictionary, development/environment registers and this log are updated together. Historical sections below/above describe earlier stages only.
