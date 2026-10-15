# R051 — Grafana Infrastructure Uptime

The owner requested two elapsed-duration tiles in the free lower-right row 5 area of Performance: Debian VM and Cloud SQL, grouped under Infrastructure Uptime. Both show days, hours and minutes without displayed seconds. The [implementation evidence](../outputs/grafana-infrastructure-uptime-20261005/README.md) records metric semantics, freshness, scoped collector deployment and rollback.

The Debian tile uses the existing Compute Engine start-uptime GAUGE. The SQL tile uses a new scalar read through the existing read-only reporting connection and the existing Monitoring metric. The owner expressly approved that collector change. Only the collector file was deployed; the next natural timer run exported a successful paired SQL status/uptime sample. No worker runtime, VM/SQL restart, credentials, privileges, network, schema, alert or subscription settings were changed.

Targeted collector and dashboard checks pass. Final saved definitions and reload are verified; the generator reproduces the final resource, with only layout item array ordering normalized. All 69 original panels, layout and settings are preserved. The owner accepted the final screenshot and closed the live item. Repository publication and merge remain separate. R051 remains Open; no merge or release promotion is authorized by this follow-up.
