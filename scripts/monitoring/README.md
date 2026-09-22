# Resource monitoring tools

Use PowerShell 7 from the bundled runtime, with repository root as the current directory. No dependencies are installed in outputs. See [operating reference](../../Documents/Resource_Monitoring.md) for live links, scopes and limitations.

## Routine dashboard updates

1. Modify `Build-Dashboards.ps1` / `Query.Helpers.ps1`.
2. Run `pwsh -NoProfile -File scripts/monitoring/Build-Dashboards.ps1`.
3. With explicitly authorized temporary Grafana setup access stored privately, run `Verify-Queries.ps1 -Page performance` or `-Page cost` for affected queries. This calls real provider APIs; avoid repeated cost runs because Azure rate limits apply. Raw responses are saved privately; repository evidence contains status and row counts.
4. Run `Publish-Dashboards.ps1 -Update`, which backs up current definitions before replacing the two named dashboards. Creation without `-Update` refuses overwrite. Newly created folder permissions can take time to propagate; inspect existing assets before resuming a failed initial publication with `-Update`.
5. Verify the current Grafana UI, revoke temporary setup access, update the change log and publish sanitized files.

Every dashboard update must also update the [visual guide](../../Documents/Resource_Monitoring_Dashboard_Guide.md) before completion, per the owner's standing instruction. Reconcile all affected panel IDs, labels/groups, metric/probe meaning, units, limits, freshness, status mappings and limitations with the saved definition. Keep implementation/access/recovery details in the operating reference.

`Monitoring.Common.ps1` uses the private path documented in the operating reference. A revoked/expired setup token must be replaced through authorized setup; dashboards do not need this token to run.

## Availability collectors

`debian-health.py` is installed independently at `/opt/mw-resource-monitoring/debian-health.py`; `mw-resource-health.service` uses the existing integration-agent Python virtual environment and mwagent identity. The matching systemd timer runs every two minutes. It reads existing private configuration in place and sends only numeric health states through the existing VM identity to GCP Monitoring. No credential copies or new public ports are needed. Installation consists of copying these three files to their respective `/opt/mw-resource-monitoring` and `/etc/systemd/system` paths, `systemctl daemon-reload`, then enabling the dedicated timer. Capture any existing copies before updates. Do not restart or invoke business jobs as part of installation.

`test_debian_health.py` checks timer semantics. `test_availability_queries.py <performance-dashboard.json>` uses jq to exercise the actual dashboard selectors against failed, missing and stale fixtures. Run them with Python on Debian, where jq is already installed.

The external webhook uptime check is owned by Google Cloud Monitoring, not either VM. Its saved configuration and the credential-free public OpenAI data source are under outputs. Keep the generated uptime check ID and public-source UID synchronized with `Query.Helpers.ps1`/the configuration files. No Azure scheduled probe is retained: VM-01 is not 24x7.

Rollback: restore the private pre-availability dashboard resource, disable/stop only `mw-resource-health.timer` and its service, remove only its dedicated files/units after preserving evidence, and remove the dedicated uptime-check configuration/public-status source if no longer referenced. Existing provider metrics/data sources, workload jobs and historical monitoring samples are unaffected. GCP custom metric history may be retained after collector removal.

For authenticated browser updates without a new API token, use Grafana's **Edit → Code** JSON resource editor. Capture its entire JSON to the private `performance-before-refinement-v2.json` / `cost-before-refinement-v2.json` baseline files before editing. `Build-EditorResources.ps1` converts the maintained classic dashboard JSON into that current v2 envelope and preserves the baseline's annotations/preferences. Apply the generated `*-editor-resource.json`, save with a change note, then verify the saved UI. These JSON resources contain dashboard definitions only, no credentials. Both formats are included for recovery; do not import both as separate dashboards.

## Initial provisioning (already completed)

`Initialize-Azure.ps1` checks the signed-in tenant/subscription/account, creates a dedicated one-year service-principal secret and group-scoped read permissions. It refuses existing principals/credentials.

`Initialize-Gcp.ps1 -ApprovedKeyCreationException` is a security-sensitive, one-time procedure requiring owner authorization. It creates the dedicated monitoring identity/dataset, temporarily makes project-level exceptions for both key-creation constraints, creates one key outside Git, and restores inherited enforcement in `finally`. It refuses an existing key or local policy. Do not rerun for routine dashboard changes. If interrupted, inspect/restore project policies immediately and reconcile the existing identity/key; never automatically create another key.

Detailed GCP billing export and the Railway workspace token were configured in their authenticated web consoles. `Install-DataSources.ps1` installs only the three named Infinity sources and refuses existing UIDs. It never writes plaintext credentials into generated dashboards. No workload deployment, business database write or AppSheet change is part of these tools.
