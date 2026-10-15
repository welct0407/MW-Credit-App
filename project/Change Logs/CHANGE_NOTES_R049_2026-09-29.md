# R049 — Upcoming-charge summaries and drilldown

## Scope and authorization

29 September 2026: owner requested refinements to released R048 views. R049 is the sole Open development release. DEV implementation is authorized; this request does not authorize a new PROD promotion.

- Upcoming Charges: date-only groups, daily sum, one borrower/amount summary row per date; tap for the existing-format charge table.
- Collection: retain Date/Total Charge summary after today's charges; move upcoming details behind summary-row navigation.
- Borrowers: insert the same summary after the initial summary section and before loans; same drilldown.
- Preserve seven-day menu, first five distinct borrower dates within three months, bilingual labels/Basis, partner-language menu name and whole-baht display.

## Recovery and dependencies

Starting Git commit: `dccb28adfd2c62d9aca067521a0cbdd3fe3b1b06`. Unrelated Metabase and Risks work is preserved and excluded.

V56 adds `oltp_upcoming_charge_summary_v2` with the same borrower/date key and columns as V1, over the existing bounded event provider. V1 stays unchanged so the released app retains its five-date behavior during migration and app rollback. The DEV `Upcoming Charge Summary` binding uses V2, with separate seven-day and first-five-date slices. No operational table/column, financial row, calculation, grant expansion or OLAP binding change is needed.

## Status

DEV implementation complete; owner review pending. V56 applied and validated in DEV only. Full `Test-CI.ps1` exited0, including synthetic summary/detail reconciliation and retained V1 behavior. Private DEV V55 dump was restored and all table fingerprints matched; V56 rehearsal left existing public values unchanged. [Backup evidence](../outputs/r049-upcoming-summary/summary-development-backup.json), [migration](../outputs/r049-upcoming-summary/development-migrate.json), [validation](../outputs/r049-upcoming-summary/development-validate.json). Target identity and SSL verified by the read-only catalog capture.

DEV OLTP rollback version **1.000152** was recorded before edits. Final saved version **1.000157** is runnable; DEV OLAP remains **1.000045**. Both editors report no issues. Current GUI checks passed for Upcoming Charges, Collection and Borrowers, including summary columns, placement, row drilldown, matching totals, bilingual detail title and back navigation. A transient unquoted view-title expression was corrected before final verification. The final AppDoc comparison identifies exactly 12 affected objects and no unrelated changes; private HTML and DOM captures agree.

The implementation rebinds the existing summary table, adds a seven-day slice, caps the borrower slice to five dates, adds a shared detail view/navigation action and explicit two-column borrower inline view, and adjusts Collection/Borrowers detail order. Generated reference action/detail view are included in exact DEV dictionary overlays. Production canonical definitions remain unchanged. No operational writes or notifications were triggered.

Documentation closure covers tracker, environment inventory, development differences, model overview, database reference, 13 dictionary overlays/index, sanitized evidence and maintained closure helper. No OLAP, Looker, routing or deployment changes apply. R049 remains Open; no release tag or production readiness/deployment claim. See [handover](../outputs/r049-upcoming-summary/HANDOVER.md) for implementation, tests, limitations and rollback.

## Production promotion authorized

Owner requested promotion on 29 September 2026. Scope frozen at 2026-09-29T11:17:41.705563+00:00 using tested Git1991896, DEV OLTP1.000157/OLAP1.000045/V56. Production baseline OLTP3.000260/OLAP1.100208/V55 and verified restorable database backup recorded in [freeze pin](../outputs/r049-production/freeze-pin.json). R050 opened as sole development release; RC capture and production steps remain in the single [checklist](../outputs/r049-production/promotion-checklist.md).

## Production delivery and closure

The existing PROD OLTP app was upgraded by App Upgrade from definition-only `MW-OLTP-R049-RC1-578763613` version1.000006 to **3.000263**. All 22 RC SQL bindings were changed to PROD `database-2`; no DEV binding remained. The candidate retained the production theme, logo, companion link, API setting and receipt paths/store. Its scheduled-bot guard excluded the RC name. PROD Flyway advanced from V55 to **V56** from the pinned tested package after the verified backup, and post-migration validation passed. OLAP remained1.100208.

PROD AppDoc verifies the new V2 summary binding, 22 PROD SQL sources and no DEV source. Both PROD apps loaded and synced, both editors showed no issues, and the OLTP logo loaded and matched its previous appearance. Read-only GUI checks passed for Upcoming Charges, Collection and Borrowers summaries and their drilldowns; no financial writes or forced notifications occurred. The sole RC definition was deleted after validation, and the production logo remained loaded. The verified backup, PROD OLTP3.000260 and compatible retained V1 provider are the rollback points. [Promotion evidence](../outputs/r049-production/README.md) and the [single checklist](../outputs/r049-production/promotion-checklist.md) record the checks and limits.

This batch updated the release tracker, environment inventory, development differences, model overview, database reference, exact production dictionary objects and closed DEV overlays, dictionary index, manifest, evidence and this log. The new targeted production metadata capture and closure helpers under `scripts/dictionary/` perform read-only capture and guarded repository documentation updates only. No OLAP definition, Looker report, financial data, notification route or new schema beyond V56 was changed. R049 is Released; R050 remains the sole Open development release.
