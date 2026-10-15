# IG polling completion hover — 24 September 2026

## Scope and result

Owner clarified that the intended worker is the Instagram group-chat scanner, `mw-conversation-poll`, not the downstream `mw-receipt-summary` worker. Live timer verification found `OnUnitInactiveSec=5min` for the scanner and 20 seconds for Receipts. Neither schedule was changed and no business job was manually invoked.

Performance panel 63 now shows the last scan completion, observed Running/Idle state, observation timestamp and schedule/freshness explanation in its native mouse hover. Times are Singapore time. Existing centered label/light, geometry, other panels, alert rules and notification routes are preserved. Clicking the light opens Performance. The current development release is R028 following the separately published R027 freeze; this monitoring delivery does not alter that frozen package.

## Implementation

- `debian-health.py`: three numeric `worker_timing` series (last_completion, running, status), stable component/field labels, existing monitoring identity. Original health metric remains unchanged for alerts.
- `worker-timing.jq`, query helper, builder and targeted panel updater: same-sample joining, six-minute freshness and explicit missing-time behavior.
- Maintained classic/V2 Performance definitions and visual guide/operating reference/scripts guide updated together.

## Rollback

Starting repository commit: `22dce063ebea60d02164fc74c9f21d74abc11826`. Preserve unrelated concurrent payment-health/risk work. Restore only panel 63 from its pre-change Grafana revision or that repository definition. Full live pre-edit JSON was retained in the editing session; OS clipboard transfer was unavailable. Collector rollback copy is `/opt/mw-resource-monitoring/debian-health.before-receipt-hover-20260924.py`, original SHA256 `601afe8ee36ea0b14dff1245ed7e287f17556c4370cbfb66f143611519c36bec`. Restoring this collector removes future timing samples without touching workload jobs or health alerts.

## Verification

- Debian Python tests: all 10 passed, including monotonic completion conversion and missing/future timestamps.
- jq fresh/idle, stale and empty response cases passed; stale/missing timing never fabricates completion.
- Initial monitoring export reported a transient HTTP error. The bounded diagnostic run then exported successfully; the following normal systemd collector run reported Result=success / ExecMainStatus=0.
- Live preview changed only panel 63 before Grafana normalization. Hover showed completion `2026-09-25 00:25:09 SGT`, matching systemd exit `2026-09-24 23:25:09 +07`; observation `00:25:53 SGT`, state Idle, green light.
- Dashboard saved with change note. Final reload verification recorded before task closure.

Completion means process exit, including empty scans and failed runs; the health light carries the outcome. It does not certify posted payments. Timing can lag by collector and dashboard refresh intervals. No exact next-run prediction is displayed.
