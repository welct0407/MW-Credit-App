# Grafana dictionary namespace

Status: **planned; no definitions imported**. The Excel source did not supply a Grafana inventory. This directory reserves the system namespace without asserting any dashboards, data sources or alerts exist.

When Grafana documentation is requested, follow the [shared format](../../FORMAT.md), register this system as active, and use an exact instance reference as `identity.component`. Prefer files grouped into `dashboards/`, `datasources/`, `alert-rules/` and `recording-rules/`, with stable Grafana UIDs as object identities where available.

Record dashboard/panel relationships, query expressions, variables, units, thresholds, refresh settings and data-source references when in scope. Keep credentials and secure data-source settings outside the repository. Link the owning provisioning/query files rather than maintaining a second editable implementation. Coverage and saved-state evidence must be explicit.

The same find/read/update/validate tooling supports this namespace. No Grafana connection or live changes were part of the dictionary migration.
