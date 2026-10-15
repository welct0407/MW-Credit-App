# R008 revision 2 — manual charge sync repair

DEV OLTP **1.000178**, SQL **V24**, OLAP **1.000169**, both Prototype. Production remains unchanged. This revision includes all 167 revision-1 targets and seven additional property targets covering six date expressions. [Complete revised delta](release-delta.json), [saved readback](saved-sync-repair.json), [comparison](dev-comparison.json). The retained [revision-1 package](../FROZEN.md) is historical and must not be promoted as the current candidate.

## Cause and correction

The owner's Generate All Today's Charges attempt at UTC 2026-09-18 16:52:59 submitted a September 19 token. Audit reported client timezone offset -480 (UTC+8), while the verified DEV database used Asia/Bangkok (UTC+7), still September 18. The unchanged V8 SQL guard correctly rejected the mismatched date. Sync retries repeated the same queued request. The owner canceled that request in their browser before authorizing reproduction.

The manual per-loan request, its eligibility condition, bulk row selection and bulk visibility now use `DATE(UTCNOW() + "007:00:00")`. The directly dependent Loans Last Interest Charge Date cutoff and Accrued Interest Days formula use the same date, avoiding a second device-local date dependency. Existing type/interval/anchor/duplicate rules remain intact. AppSheet's [UTCNOW documentation](https://support.google.com/appsheet/answer/10107371?hl=en) defines UTC time independently of the device timezone; the device clock must still be accurate.

No SQL function, guard, migration, schedule, route, recipient, schema, app permission or OLAP configuration changed. OLAP's R007 provider calculations already use Bangkok's business date. Generated process/output column metadata has no separate App formula to edit. Existing SQL idempotency and stale-request protections remain active. A genuinely offline request crossing Bangkok midnight is still rejected by design.

## Verification

- Independent reloaded saved AppDoc: 1.000178, database-3, six final expressions read back. No unsaved editor changes.
- Current GUI Generate All Today's Charges completed: 24 queued loan updates drained to zero without error. The action disappeared after all eligible rows were processed. A further ordinary sync completed without error.
- Read-only DEV SQL before/after: September 19 charges **8 → 32**, total charges **935 → 959**, today's request tokens **0 → 24**. Zero duplicate generated loan/date groups. No borrower identities or raw financial payloads are published.
- [SQL and GUI evidence](sync-test-evidence.json): after the additional sync, counts remained 32 / 959 / 24 with zero duplicates. Read-only SQL boundary checks confirm the incident's UTC+8/Bangkok date mismatch before 17:00 UTC and agreement at Bangkok midnight.
- Current saved OLTP editor diagnostics: only the existing Prototype limitation `Scheduled event 'Daily 00:05' is only triggered when app is in deployed state`. No configuration errors or other warnings. OLAP 1.000169 diagnostics are reused from revision 1 because that app and its dependencies were not changed. No deployment check or mode change.
- The exact pre-midnight incident was established from audit evidence; the live successful test occurred after Bangkok midnight. No device-clock manipulation or claim of a live pre-midnight retest. The explicit UTC+7 expression removes the observed one-hour mismatch.
- The 167 unaffected revision-1 configuration observations and financial regression tests are explicitly reused with their original versions/timestamps. Seven new saved targets are independently read back; the full comparison has 174 verified items.
- Model overview and dictionary reconciled. Ten exact DEV difference rows appended at A2715:E2724, preserving all existing workbook values/formulas and production references; rendered samples checked. The existing dictionary's Production column holds the prior expression for these new rows, as read from pre-repair DEV 1.000176; actual PROD drift remains a promotion check. Saved formula fingerprints independently match the browser's six observed strings. Tracker, environment inventory and development differences point to revision 2. Unrelated reports, routes, SQL and production documentation retain their prior state; production closure checklist remains pending until authorized promotion.

## Recovery and readiness

Starting clean Git `f181e31a31f5ee1d71fcf206f021c1a098257051`; prior R008 implementation commit and freeze retained. App rollback **1.000176**. Before bulk testing, private snapshot `r008-20260918/development-before-sync-repair-20260919.dump`, SHA256 **b562e15ac7dbfa57063ae50b3f92559c08e16d37783c7f6a4c730d3326265d4d**, was restored successfully in isolation with matching normalized public/assessment_lab schema. Do not restore it over later financial writes. Prefer a forward app correction if required.

**Ready for review, subject to the existing R008 owner checks.** The reported sync defect is fixed in DEV. Owner acceptance and production authorization remain pending. Compact-form/mobile acceptance, explicit live opening allocations and production notification recipient review remain as listed in the [original report](../REPORT.md). This repair does not claim an app-wide timezone conversion for unrelated workflows.
