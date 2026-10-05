# R051 — Infrastructure Uptime

Owner scope: add Debian VM and Cloud SQL uptime tiles beside Delivery continuity, under a matching **Infrastructure Uptime** header. Display days, hours and minutes; retain seconds internally. The original row 5 groups and Cost/Azure chart remain the merged PR12 baseline.

## Meaning and freshness

- **Debian VM** uses the latest raw Compute Engine `instance/uptime_total` GAUGE for the existing Debian host. It measures elapsed time since Compute Engine VM start, not service availability or guaranteed guest reboot age. Sampling is every 60 seconds, with up to 120 seconds visibility delay.
- **Cloud SQL** measures elapsed time since PostgreSQL `pg_postmaster_start_time()` on the shared PROD and DEV instance. The existing reporting connection reads a scalar from `loan_manager_prod`; restart or failover resets this value. It is neither allocation age nor an availability percentage.
- Both displays floor elapsed seconds to whole minutes. They require samples no older than six minutes, and reject timestamps more than two minutes in the future. SQL additionally requires a successful status and uptime with the exact same observation timestamp. Failed, missing, invalid or stale data is **Unknown**, with query errors visible. No extrapolation or fallback to a previous healthy sample.
- These are current elapsed durations. Singapore remains the dashboard timezone; the tiles do not calculate calendar-day totals. Historical ranges excluding fresh data return Unknown. Exporter failure and retention gaps do not establish historical availability.

## Approved collector change and rollback

The owner explicitly approved adding the read to the existing Debian collector, superseding the earlier SQL-telemetry decline. Live preflight confirmed the existing proxy binding, reporting role, read-only transaction and permission to execute `pg_postmaster_start_time()`. The read uses an isolated savepoint and does not widen privileges or alter original connectivity checks.

Only `/opt/mw-resource-monitoring/debian-health.py` was backed up and atomically replaced at **2026-10-05T12:17:38.708820Z**. The timer and service definitions were unchanged, and the next scheduled collection supplied verification. No restart or timer trigger was performed.

| Evidence | Value |
| --- | --- |
| Before SHA-256 | `64475e2a34aa9a98a62d85058be2fe8a60d5c92281e92f4a2d94012891253510` |
| Installed SHA-256 | `9f79bb7f8938548bdf6c811bbe293d3eeab5e81fd87599ad08f30c63b429b79c` |
| Backup | `/var/backups/mw-resource-monitoring/sql-uptime-20261005T121738Z/debian-health.py` |
| Natural SQL observation | `2026-10-05T12:18:48.567711Z`, status 1, 1294782 seconds |
| Successful export | `2026-10-05T12:19:00.620704Z`, database health 1 |
| Browser datasource verification | 1294920 seconds displayed as `14d 23h 42m` |

For an authorized rollback, restore the recorded backup with its existing ownership/mode and verify the next natural collection. Do not restart the VM or SQL instance. Dashboard rollback uses the fresh private pre-change export or Grafana version history; private exports and Library identities are recorded in final save evidence. The export uses the existing `worker_timing` metric, fixed component `cloud_sql_prod`, and numeric fields `status` / `uptime_seconds`. No credentials or business identifiers enter metric labels.

## Source and verification

`scripts/monitoring/uptime-dashboard.js` owns query, formatting and placement guards. `test_uptime_dashboard.cjs` checks raw GAUGE selection, failure/freshness behavior, paired SQL observations, whole-minute formatting and preservation of unrelated dashboard content. `test_sql_uptime.py` checks the reporting read, validation and paired export; existing `test_debian_health.py` covers original collector behavior.

The final dashboard was saved at **12:29:20 UTC** and reloaded successfully. The owner accepted the screenshot: “ok. it looks fine. we can close this item.” See [exact save and acceptance evidence](live-acceptance.json) and [scoped saved definitions](saved-uptime-panels.json). Removing IDs 128/129/130 exactly recovers the original 69 elements, layout and settings. The generator reproduces the final resource with only layout item array ordering normalized by Grafana. Both Stat panels use `values:true` and `fields:"/.*/"` to include the formatted strings. Final placement is header ID130 at x20/y17/w4/h1, with tiles 128/129 at x20/x22, y18/w2/h4. Existing saved Debian panel128 is preserved through the scoped formatting/layout changes. No new alert, subscription, contact, filter, IAM, credential, network, SQL schema or business operation is part of this follow-up. Owner VM-01 idle hold persists.

Run `node scripts/monitoring/test_uptime_dashboard.cjs` for local synthetic regression coverage. For exact live reconciliation, provide the private original 69-element export, intermediate saved Debian export and final saved export as three arguments. Generate a scoped proposal from the intermediate saved Debian export using `node scripts/monitoring/uptime-dashboard.js <saved-debian-v2.json> <proposal-v2.json>`; do not replay an intermediate or historical import against current LIVE. No live edit is needed for this completed item.

Validation: dashboard synthetic regressions and exact saved-export reconciliation pass; SQL uptime tests **3/3**, existing Debian health tests **20/20**, and whitespace checks pass. Live collector hash still matches the source, timer is active and the service result is success; eight natural SQL observations through 12:34:42 UTC exported successfully. Neither existing CI workflow path filter matches this change: Database covers database paths, and Grafana MCP bridge covers its own subdirectory. No release tracker/closeout changes are duplicated from separate PR13.
