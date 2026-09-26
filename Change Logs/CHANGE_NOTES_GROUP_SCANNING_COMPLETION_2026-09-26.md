# Group scanning completion in Performance tile — 26 September 2026

## Scope and purpose

The Performance dashboard's **1 · Group scanning** tile now shows the latest completed Instagram group-chat scan time directly below its API polling status light. The same timing details remain available on status hover. This uses the existing worker-timing telemetry and does not change the scan schedule or collector. Starting Git commit: `302ca89`.

## Changed objects

- Grafana dashboard `mw-resource-performance`, panel 101 only: a two-row stat with the polling light and **Last scan · SGT** in Singapore day/month and 24-hour time. Its description explains freshness and the five-minute-after-completion schedule.
- `scripts/monitoring/group-scanning.jq` is the maintained selector for panel 101. `payment-dashboard.js` and its test consume it for both classic and editor-resource dashboard definitions.
- Updated both saved Performance dashboard JSON definitions, the visual guide, the operating reference and the monitoring scripts README.

## Verification and rollback

The live Grafana tile showed the status light and a scan completion time; after reloading it showed a newer time, confirming the value updates. A post-save Grafana export differed from the pre-change export only in panel 101. The saved panel's selector, display unit, orientation and description were compared with that export. The existing payment dashboard test passed for both dashboard formats and idempotence; `git diff --check` passed.

Private rollback export: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring\performance-before-scan-completion-20260926.json`. Restore panel 101 from that export if needed, leaving all other panels intact. No alerts changed. Missing or stale worker-timing samples display **Unavailable**; the timestamp is a completed scan, not proof that any receipt was posted.

Status: implemented and live; no remaining manual test.
