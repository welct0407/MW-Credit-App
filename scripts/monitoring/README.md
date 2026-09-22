# Resource monitoring tools

Use PowerShell 7 from the bundled runtime, with repository root as the current directory. No dependencies are installed in outputs. See [operating reference](../../Documents/Resource_Monitoring.md) for live links, scopes and limitations.

## Routine dashboard updates

1. Modify `Build-Dashboards.ps1` / `Query.Helpers.ps1`.
2. Run `pwsh -NoProfile -File scripts/monitoring/Build-Dashboards.ps1`.
3. With explicitly authorized temporary Grafana setup access stored privately, run `Verify-Queries.ps1 -Page performance` or `-Page cost` for affected queries. This calls real provider APIs; avoid repeated cost runs because Azure rate limits apply. Raw responses are saved privately; repository evidence contains status and row counts.
4. Run `Publish-Dashboards.ps1 -Update`, which backs up current definitions before replacing the two named dashboards. Creation without `-Update` refuses overwrite. Newly created folder permissions can take time to propagate; inspect existing assets before resuming a failed initial publication with `-Update`.
5. Verify the current Grafana UI, revoke temporary setup access, update the change log and publish sanitized files.

`Monitoring.Common.ps1` uses the private path documented in the operating reference. A revoked/expired setup token must be replaced through authorized setup; dashboards do not need this token to run.

For authenticated browser updates without a new API token, use Grafana's **Edit → Code** JSON resource editor. Capture its entire JSON to the private `performance-before-refinement-v2.json` / `cost-before-refinement-v2.json` baseline files before editing. `Build-EditorResources.ps1` converts the maintained classic dashboard JSON into that current v2 envelope and preserves the baseline's annotations/preferences. Apply the generated `*-editor-resource.json`, save with a change note, then verify the saved UI. These JSON resources contain dashboard definitions only, no credentials. Both formats are included for recovery; do not import both as separate dashboards.

## Initial provisioning (already completed)

`Initialize-Azure.ps1` checks the signed-in tenant/subscription/account, creates a dedicated one-year service-principal secret and group-scoped read permissions. It refuses existing principals/credentials.

`Initialize-Gcp.ps1 -ApprovedKeyCreationException` is a security-sensitive, one-time procedure requiring owner authorization. It creates the dedicated monitoring identity/dataset, temporarily makes project-level exceptions for both key-creation constraints, creates one key outside Git, and restores inherited enforcement in `finally`. It refuses an existing key or local policy. Do not rerun for routine dashboard changes. If interrupted, inspect/restore project policies immediately and reconcile the existing identity/key; never automatically create another key.

Detailed GCP billing export and the Railway workspace token were configured in their authenticated web consoles. `Install-DataSources.ps1` installs only the three named Infinity sources and refuses existing UIDs. It never writes plaintext credentials into generated dashboards. No workload deployment, business database write or AppSheet change is part of these tools.
