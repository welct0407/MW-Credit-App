# R035 — additive borrower pages

Owner instruction: implement the approved Portfolio and Detail design as two **new** Metabase tabs. Existing tabs/cards, AppSheet definitions and financial records remain unchanged.

Implemented in dashboard 3 as [Borrower Portfolio · New](https://reports.mw-credit.com/dashboard/3?tab=104) and [Borrower Detail · New](https://reports.mw-credit.com/dashboard/3?tab=105). DEV and PROD are V44. The maintained implementation is `scripts/metabase/BorrowerPages.mjs`; design contract is [handover](../borrower-pages-design-20260925/HANDOVER.md).

V44 adds three reporting views and one read-only period function, separating loan and receipt grains before aggregation. Borrower ID controls identity; duplicate labels remain distinguishable. Current positions and governed health ignore the activity period. Period amounts retain signed corrections and default to the previous 30 completed Bangkok days. Detail fails empty without one borrower. The additional-principal scenario is hypothetical.

## Verification and recovery

- Full disposable SQL CI passed, including 17 focused synthetic assertions.
- DEV verification: 18 independent checks and 33 compiled report queries.
- PROD snapshot restored with 26 table fingerprints reconciled; candidate rehearsal passed the same 18 checks and 33 queries.
- Private recovery dump and hash: [backup metadata](production-backup.json). No private rows or credentials are published.
- Metabase dashboard 10 is the recovery copy of dashboard 3 before this batch; the private baseline contains the exact original 12 tabs and 212 placements. Recovery should remove only this batch's new tabs/filters/cards, preserving intervening unrelated work. Compatible V44 providers may remain; no operational restore is needed for dashboard rollback.
- Starting work commit `0aa3b25f0b98f6e95f62c538258a053423ed9590`; monitoring refinement `e81d296` is preserved in R035. Unrelated risk design and R026 output are excluded.

## Delivered behavior

Portfolio contains six summary cards, population/date/source context, principal and interest rankings, top-five-plus-Others interest history, first/repeat weekly lending and an ID-based comparison table. Its name links pass the chosen activity dates to Detail. Chart links select the borrower; the comparison table is the date-preserving drill-through. Others opens no borrower totals.

Detail contains borrower identity, four current cards, authoritative health/schedule context, four period cards, principal/interest trends, active plans, due-month timing, lifetime loans, all-current overdue obligations, period repayments/obligations and a hypothetical additional-principal scenario. A negative scenario input produces an explicit validation message and no projections. Current/lifetime sections ignore the activity filter. Wide evidence tables scroll horizontally at phone width.

There are 32 new visual questions (278–309) and one picker model (277), five independent filters, and two tabs appended after the original tabs. Existing 12 tabs and 212 placements, saved query definitions, formatting, parameters and collection permissions were compared unchanged. No public sharing, app update, financial write, notification or health-rule change.

## Publication and checks

- SQL promoted with the maintained Flyway runner from clean pin `d691d661be7ce98543a3b2e466263c6a78adaabc` and [manifest](flyway-manifest.json). Production 43→44 validated; only the existing reporting user's read access was extended to the four new providers.
- [Saved-card verification](metabase-verification.json): 99 checks / 62 requests cover defaults, selection/clearing, invalid IDs, population filters, current-position invariance, explicit date links, signed summary/ranking/trend reconciliation and scenario validation.
- [Concurrent load check](detail-load-check.json): all 20 Detail requests completed; the slowest wall time was about 32.5 seconds in that run. Additional browser/server observations reached roughly 108 seconds with three reporting connections occupied and requests queued; some refreshes displayed transient failures, and one repeated full verifier hit its 90-second transport timeout. This is not an instant-load guarantee. Unnecessary health joins were removed from three summary cards; [28 final focused checks](refinement-verification.json) passed. A settled browser reload with automated traffic stopped rendered the Portfolio without errors; empty Detail rendered 20 empty cards without errors. Runtime caps and source connection settings were not changed.
- Browser testing uses the owner-confirmed Wel Chrome profile and verified Metabase Gmail account. The date link initially exposed Metabase timestamp serialization; it now emits ISO dates and was retested. Screenshot observations are not committed because they contain borrower data.
- The final health query materializes only required columns from payment health and matrix V3; V3 already supplies schedule status, so the redundant schedule read is removed. Inactive borrowers explicitly show “No active loan.” [Independent parity](health-query-parity.json) verifies all 11 business fields; the query-time display is deliberately excluded. [Fresh uncached checks](health-native-verification.json) for active, inactive and empty selections all completed in under one second. The final browser-only selected Detail load rendered health and scenario with zero chart errors. Dashboard-route checks otherwise use normal caching and are not an uncached benchmark.
- Exact SQL/catalog and saved report definitions are recorded in 41 new dictionary objects; navigation and all 1,211 documents validate with zero errors. Result fingerprints are omitted to avoid exporting source-value samples.

AppSheet readiness/diagnostics are not asserted by this report-only package; prior R026 limitations remain recorded separately. R035 also includes the previously published monitoring changes documented in its release log. R036 is the sole Open development release. Desktop and phone-width checks passed; [browser evidence](gui-verification.json), recovery and publication closure are recorded in the [single checklist](promotion-checklist.md). Final release tag: **R035**. Heavy refreshes can still be slower than individual queries; no runtime sizing/pool changes were made.
