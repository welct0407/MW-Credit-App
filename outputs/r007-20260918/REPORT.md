# R007 — OLAP SQL optimization

18 September 2026. **DEV implementation complete. Ready subject to owner acceptance and scoped production authorization.** Production has not been changed. Both DEV apps remain Prototype.

## Candidate

DEV SQL **V22**, OLAP **1.000142**, unchanged OLTP **1.000134**. Production baseline is released R006/R005: SQL V21, OLAP 1.100122, OLTP 3.000173. Revision 1 contains [293 exact AppSheet targets](release-delta.json); all match [independent saved DEV readback](dev-comparison-r1.json). AppSheet candidate SHA-256: `b5729594af3bfbef799cc5e33567fcb75b90de4346bfe20e96cf5f46a2905197`. The pinned implementation commit and complete Flyway manifest are recorded in [the frozen package](FROZEN.md).

V22 SHA-256: `409a4ee42ecaeea0f91c906a5f2a3eb77100d9905ce87bfb50c2ffccd8f47671`. It creates five ordinary views and a shared Bangkok reporting-date function. No base financial tables, triggers, indexes or historical financial records were changed. V22 is applied and immutable.

Charges, Repayments, Loans and Borrowers retain their logical identities and READ_ONLY behavior. Their 82 analytical fields are provider-owned, formula-free and individually read-only. Portfolio Summary supplies 40 same-type/precision Statistics dereferences. Statistics remains on its editable base table so existing Recent/Full commands work. Hidden collection helpers replace per-borrower table scans. Metadata, generated objects and provider changes are all in the delta; PROD uses database-2, while DEV uses database-3. [Actual saved storage identities](source-readbacks.json).

## Validation

| Check | Result / evidence |
| --- | --- |
| Migration chain and synthetic boundaries | Passed all 22 migrations; repeated migrate applied zero; checksum tampering rejected. `Test-Migrations.ps1 -TestSqlFile scripts/database/Test-R007.sql`. PostgreSQL 18.6 / Flyway 13.6. Existing runner's baselineRebuildMatch=false is expected when later migrations exist. |
| Restore recovery | Private pre-change DEV dump restored successfully; normalized public/assessment_lab schema matched. Cloud SQL extension/settings excluded from local restore. |
| Independent pre-cutover parity | All 122 analytical fields match for all 64 Borrowers, 108 Loans, 741 Repayments, 917 Charges and one Statistics row. [Restored candidate](candidate-parity.json), [live SQL](sql-dev-parity.json). |
| Post-cutover AppSheet parity | Same key populations, all 122 fields, zero mismatches at the same reporting cutoff. [API comparison](after-parity.json). |
| Preservation | All existing physical fields across ten captured tables unchanged before refresh; collection lists match for every borrower. All 12 slices, 58 original views, 69 actions and all original format rules retain exact saved properties. Two generated views are ref-only. [Preservation report](preservation-and-refresh.json). |
| Current GUI: OLAP | Overview and analytics dashboard/charts load; Borrowers and Partners load. Synthetic borrower → related loan → charge → repayment → borrower navigation succeeds with expected 100 principal / 100 interest / 200 receipt and 60/40 profit split. No editing action appears on the rebound tables. Existing assessment view loads and correctly reports its existing stale input state; no assessment was submitted or lending decision made. |
| Current GUI: refresh | Recent request changed its token/mode and regenerated two dates; Full confirmation then request regenerated all 45 dates, retaining keys. Recent/Full results match on their overlapping dates. |
| Refresh reconciliation | Full refresh updates six formerly stale DEV snapshots; this legitimately changes Peak Cash Pool 30D. [Independent original snapshot oracle](snapshot-reconciliation.json): 45/45 dates match. [Post-refresh check](post-refresh-check.json): 135 expense/net checks plus all 40 AppSheet Statistics fields match refreshed SQL; peak matches refreshed snapshots. |
| Current GUI: OLTP | Dashboard, Collection and Payments load, no financial writes. Manage / Versions confirms unchanged 1.000134. R007 contains no OLTP configuration delta or changes to operational SQL. |
| Final current-editor diagnostics | No errors or configuration warnings beyond the two owner-excluded scheduling execution messages. [OLAP](olap-diagnostics.json), [OLTP](oltp-diagnostics.json). No deployment check run and no mode change. |
| Data dictionary | Exact new objects and changed properties appended to Dev Differences; all original sheets' values/formulas roundtrip unchanged. Production inventory unchanged. [Verification](dictionary-verification.json). |

The preserved contract includes AppSheet's rounded intermediate Decimal/Price/Percent values, Number integer-division effects in matrix equal-share/on-time/reliability metrics, empty-history date handling, contribution/withdrawal as-of allocations, whole-baht repayment profit, three forecast loan branches, inclusive date windows and deliberately different Borrower versus Statistics collection amounts. Synthetic SQL tests cover due/future/overdue/partial/on-time/late charges, multiple payments, before/same-date/withdrawn contributions, rolling boundaries, default and no-history cases, all loan types and a day-by-day installment remainder oracle. SQL and saved configuration establish matrix parity; no new matrix UI or report was added.

## Performance

Same Chrome desktop Analytics path and DEV population, five retained sync samples per side. Median **14.641 → 4.608 seconds**, a **68.5% reduction**. Before: 13.449, 14.641, 28.861, 20.252, 14.158 seconds. After: 5.099, 4.113, 6.422, 4.608, 4.546 seconds. Initial post-version warmup and one ambiguous browser click timeout were excluded, explicitly recorded in [after samples](sync-after.json); [baseline](sync-before.json).

This is a small client-wall-time benchmark, including network/client variability, not a throughput guarantee. Single navigation samples include automation overhead and do not establish a navigation speedup: [before](navigation-before.json), [after](navigation-after.json). Server query execution ranged approximately 4–24 ms at current DEV scale; [all five plan summaries](dev-query-plan-summary.json). Plans were inspected privately with ANALYZE/BUFFERS. No evidence justified speculative indexes or instance changes.

## Owner decisions and limits

The owner explicitly said **“Exclude both Prototype scheduling warnings”**: OLAP `Every Hour`, OLTP `Daily 00:05`. Both scheduled definitions remain; Prototype execution limitations are intentional. All other editor issues were cleared. This exception authorizes neither production deployment nor notification tests. No notifications or production financial writes were performed.

All original reporting slice names, filters, ordered membership, types and field values are preserved. No Looker dashboard/source or export route was changed or published. Direct downstream compatibility is supported by exact slice/field parity; no separate live Looker refresh/export delivery test was run. Mobile/offline performance and production load remain unmeasured. Owner acceptance is distinct from successful DEV validation.

## Promotion and recovery

Promote only after explicit owner acceptance/authorization for revision 1. Confirm actual PROD identity and delta-related drift against V21 / OLAP 1.100122, establish fresh PROD restorable backup/app version, and apply the pinned V22 migration first. Rebind four OLAP tables, regenerate and set exact metadata/provider flags, add the summary and hidden helpers, then apply Statistics formulas. Reconcile generated slice membership and view definitions. Use PROD database-2; preserve production routing, schedules and Deployed mode. The package includes all migrations through V22, with V1–V21 prerequisites already released; never copy DEV data. Independently read back every PROD target and verify both current editors and focused runtime/SQL checks before completing the promotion documentation checklist. A push is not a deployment.

Pre-R007 DEV OLAP rollback: restorable **1.000129**. Starting clean repository commit: `bef621c088dadc42a8c6c6fa221e3353a558431c`. Private dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r007-20260918/development-before.dump`, SHA-256 `134e9959ebbf7b62fa2af600ab9b2cdfeb981d53be5bfcb20525ebbe45db5654`. A coherent app-version restore returns all rebindings/formulas/helpers together; additive SQL views can remain unused. SQL corrections/removals require a higher immutable migration. Do not restore the database over newer writes without a separate coordinated recovery decision. Private dumps/raw financial evidence are not published; Git recovery covers only the sanitized artifacts and implementation.
