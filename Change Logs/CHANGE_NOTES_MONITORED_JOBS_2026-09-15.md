# Monitored development jobs and phase 7

Status: **implemented, verified and owner-accepted on 16 September 2026**. Scope authorized 15 September: development AppSheet charge scheduling, phase 7 SQL analytics and removal of the external Calendar dependency. Production was not changed by this task.

## Changes and ownership

- DEV OLTP 1.000048 owns daily charge requests at 00:05 Bangkok. Existing eligibility and SQL generation rules retained; development pg_cron job 1 paused.
- DEV OLAP 1.000050 owns hourly :00 analytics and Dashboard Recent/Full requests. Applied immutable Flyway V11 adds the approved nullable Statistics[Analytics Refresh Request], atomic date-range upserts, unique date index and request trigger.
- Both apps use development database-3, host 34.158.38.171. Shared Statistics field reconciled in both apps; all 12 OLAP slices preserved. Daily Analytics is read-only, Calendar binding/views/actions and duplicate bot removed. Historical SQL Calendar objects remain unused for recovery.
- Both apps deployed solely for scheduled execution. Nonessential export/financial bots remain disabled; no new notification task enabled. Existing reviewed owner-only notification routes retained.
- SQL preserves Model 2 metric definitions and snapshot IDs. Pending Charges EOD still excludes a whole charge after its first payment, including partial payment. Full refresh is required for older backdated edits.

## Rollback points

Before editing: DEV OLTP **1.000042**, OLAP **1.000040**, database **V10**. Private logical dump and normalized schema recorded under Documents/ChatGPT/AppSheet-Loan-Project/monitored-jobs-20260915; dump listing verified, full restore not tested. Hashes and paths are in the [report](../outputs/monitored-jobs-20260915/REPORT.md).

To revert charge scheduling, disable/save/verify the AppSheet bot before re-enabling development pg_cron. Never overlap them. To revert analytics, disable its bot and command actions, then restore the recorded app versions; additive SQL can remain dormant. SQL corrections/removal require V12+; never edit applied V11 or Flyway history. Restoring data requires reconciliation of later development writes.

## Checks and acceptance

- Local V1–V11 rebuild; prior payment, atomic close, generation and default regressions/concurrency tests passed. Analytics regression passed parity, repeat/no-op, stable keys, malformed requests and transaction rollback. Flyway development apply/validate passed.
- Current AppSheet GUI charge failure appeared in Automation Monitor; both selected updates rolled back. Corrected retry completed with synthetic charges 125/130. Original eligibility restored and fixture auto-generation disabled.
- Current GUI Full and Recent refreshes passed; independent old-expression comparison matched all 42 dates and 12 stored metrics. Original 42 IDs remained unchanged through midnight addition of date 43.
- Natural hourly run at 00:00:05 Bangkok, 16 September completed. All 24 natural daily runs at 00:05:03 completed; SQL confirms 24 generated charges and zero duplicate generated loan/date pairs. Midnight analytics precedes daily generation; next hourly/manual refresh incorporates it.
- Before natural daily generation, original records in 13 nonanalytics tables matched the baseline, excluding named synthetic fixtures and the new request field. Subsequent scheduled writes are expected.
- Both-app schema/settings and OLAP slices reconciled; owner synced both apps and answered **“Looks correct — accept development changes.”** The requested manual checks are accepted.
- Audit History Alerts are enabled in both apps; owner received no error email. **Automatic error-email delivery remains unverified.** No Looker edit/audit or offline/multiple-device test was performed; curated reporting fields are unchanged.
- Dictionary roundtrip preserved expected values across 12 sheets, zero spreadsheet errors, native OOXML features preserved, and changed ranges visually checked.

## Deliverables and recovery

Updated model overview and dictionary, development changes, environment inventory, database README, CI regression entry, V11 migration, maintained audit/test/dictionary scripts, and aggregate evidence in outputs/monitored-jobs-20260915. Sources and credentials are excluded. Private backup coverage is separate from repository publication.

Repository checkpoint: task-only commit and normal upstream push required after final diff checks; the completion response records the verified commit. Repository publication does not authorize production deployment.
