# Receipt monitoring implementation — 25 September 2026

Owner request: implement the monitoring handover. Completed on the existing collector, Grafana Performance dashboard and Debian IRM rule. This is authorized monitoring operations, not AppSheet/SQL promotion; R036 stays Open. No financial writes, business cycles, activation changes, new scheduler, credentials or schema.

## Deployment and recovery

- Starting AppSheet repository commit: `ab4e28551f9932e413c03b6c2daebbd0e4d74a54`; Integration Agent docs baseline `6f11a26df74396390d5c0fb45afbac595d64931b`.
- Debian target: `clever-oasis-508610-n7 / asia-southeast1-a / vm-mw-credit-agent`, instance `8223265527494214160`. Existing worker revision 21 supplies read-only queue inspection.
- Collector installed at `/opt/mw-resource-monitoring/debian-health.py`; SHA256 `9d942e0c732f63008274033694bc1c5c4da1511c13d700e0b32eba16449e7899`, matches maintained source. Rollback `/opt/mw-resource-monitoring/debian-health.before-receipts-20260925T152923Z.py`. Existing timer remains active/waiting; latest service Result=success, ExecMainStatus=0. Only monitoring was explicitly invoked.
- [Performance](https://monitor.mw-credit.com/d/mw-resource-performance): baseline generation25 → saved generation27, updated `2026-09-25T15:42:04Z`. 50 original elements unchanged by deep comparison; all five original row layouts preserved; eight added elements and one added row. Desktop UI verified individual labels/counts/colors and trend. Grafana supplies normal visualization defaults on save.
- Private full before/after exports: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring\performance-{before,after}-receipts-20260925.json`. Sanitized saved V2 definition is [performance-editor-resource.json](../resource-monitoring-20260922/performance-editor-resource.json); classic builder definition also updated. No Cost publication.
- Existing Debian alert UID `afz3o5cmmfabkb` updated at 23:33:57 SGT. Previous version available in rule history (baseline version1); canonical selector `scripts/monitoring/debian-alert.jq`. Restore its previous version and KeepLast policies only for an intentional rollback. Keep business journals/posted payments unchanged.

## Verification

- 15 collector unit tests passed on Windows bundled Python and Debian, including disabled processing, service impairment, import/DB/schema failure and numeric field validation.
- Seven jq fixture tests passed on Debian: real zero/recent queue, stale/missing/paused/skewed/malformed/misaligned samples, pagination rejection, critical component missing/Unknown/error semantics and trend outage gaps.
- Eight existing worker health tests passed against the installed Debian module: normal work is healthy; aged/unknown work is degraded; held/review notices checked; one failed Partner result remains visible despite another successful recipient. First attempt found no installed tests directory; supplied the same repository test source to the installed interpreter, with no live business calls.
- Node classic/V2 patch checks passed: non-mutation, idempotence, unique IDs, existing panel/row preservation and separate stage fields. Saved query contents reconciled with maintained selectors; only Grafana-added presentation defaults differ.
- GCP API verified metric `custom.googleapis.com/mw_resource_monitoring/receipt_pipeline`: INT64 GAUGE, label field, 14 series, no truncation, all newest samples aligned at `2026-09-25T15:40:32.307135Z`. Successful live writes use the existing VM identity.
- Numeric observations: status2, held_receipts2, pending_reviews1, overdue_reviews1, completed_payments19; pending_images/validated_receipts/approved_payments/stalled_jobs/unnotified_holds/unconfirmed_postings/undelivered_reviews/failed_notifications/oldest_pending_seconds all0. These are dated observations, not future claims.
- Saved rule readback: Last >0, ten-minute query, two-minute evaluation, four-minute pending, contact MW Performance IRM, no-data/error **Alerting**. Receipt impairment1, other11 components0. Missing/stale/Unknown receipts/polling now unhealthy; intentional fresh Paused nonpaging.
- Real receipts alert [notification evidence](https://monitor.mw-credit.com/alerting/notifications-history/view/71f789d8-124c-4331-90ce-8df8c6339922?ts=1790350741827): **Delivered successfully** to MW Performance IRM / oncall#1 at 23:39:01 SGT. No synthetic business incident or test push. Phone display/owner reading was not independently verified.

## Limits and operation

Two already-notified manual holds remain visible; the overdue review makes workflow health Degraded. This monitoring task does not resolve or replay them. Queue counts are snapshots; POSTED is retained journal total. Stages can overlap. A successful scan only covers what Meta returns. Missing/stale telemetry never becomes zero; historical ranges excluding fresh samples show unavailable. Gaps over six minutes break trend lines. Monitor outages depend on Grafana/GCP/IRM availability; no duplicate watchdog was introduced.

See [visual guide](../../Documents/Resource_Monitoring_Dashboard_Guide.md) for each panel, threshold and meaning, and [operating reference](../../Documents/Resource_Monitoring.md) for recovery. AppSheet apps, database, model dictionary and release promotion manifests are unaffected.
