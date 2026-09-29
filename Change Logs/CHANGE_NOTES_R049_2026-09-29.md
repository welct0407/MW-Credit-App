# R049 — Upcoming-charge summaries and drilldown

## Scope and authorization

29 September 2026: owner requested refinements to released R048 views. R049 is the sole Open development release. DEV implementation is authorized; this request does not authorize a new PROD promotion.

- Upcoming Charges: date-only groups, daily sum, one borrower/amount summary row per date; tap for the existing-format charge table.
- Collection: retain Date/Total Charge summary after today's charges; move upcoming details behind summary-row navigation.
- Borrowers: insert the same summary after the initial summary section and before loans; same drilldown.
- Preserve seven-day menu, first five distinct borrower dates within three months, bilingual labels/Basis, partner-language menu name and whole-baht display.

## Recovery and dependencies

Starting Git commit: `dccb28adfd2c62d9aca067521a0cbdd3fe3b1b06`. Unrelated Metabase and Risks work is preserved and excluded.

V56 adds `oltp_upcoming_charge_summary_v2` with the same borrower/date key and columns as V1, over the existing bounded event provider. V1 stays unchanged so the released app retains its five-date behavior during migration and app rollback. The DEV `Upcoming Charge Summary` binding will use V2, with separate seven-day and first-five-date slices. No operational table/column, financial row, calculation, grant expansion or OLAP binding change is needed.

## Status

Implementation in progress. V56 applied and validated in DEV only. Full `Test-CI.ps1` exited0, including synthetic summary/detail reconciliation and retained V1 behavior. Private DEV V55 dump was restored and all table fingerprints matched; V56 rehearsal left existing public values unchanged. [Backup evidence](../outputs/r049-upcoming-summary/summary-development-backup.json), [migration](../outputs/r049-upcoming-summary/development-migrate.json), [validation](../outputs/r049-upcoming-summary/development-validate.json). Target identity and SSL verified by the read-only catalog capture.

Browser control disconnected after opening the correct work Chrome profile; owner asked to reconnect. No live AppSheet mutation has been made. Current live app rollback version must be captured before screen edits. DEV GUI integration/testing, both-app diagnostics and AppSheet dictionary closure remain unfinished. Existing apps still use the unchanged V1 provider; no PROD change.

Detailed continuation: [handover](../outputs/r049-upcoming-summary/HANDOVER.md).
