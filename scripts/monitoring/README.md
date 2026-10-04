# Resource monitoring tools

R050 development: [Grafana MCP Events bridge](grafana-mcp-bridge/README.md) adds source for owner-authenticated ChatGPT/Dots event subscriptions and durable callbacks. It is not deployed or connected; existing IRM/mobile routes are retained. See its [design and deployment prerequisites](../../Documents/Grafana_MCP_Events_Bridge.md).

Live since 25 September: `debian-health.py` exports read-only receipt queue health for worker revision 21. Eight Payment processing panels and the existing Debian IRM alert implement the [receipt monitoring handover](https://github.com/welct0407/MW-Integration-Agent/blob/main/docs/MONITORING_IMPLEMENTATION_HANDOVER.md). See [verified deployment evidence](../../outputs/receipt-monitoring-20260925/README.md).

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

`test_cost_overview_queries.py <cost-dashboard.json>` checks the SGD overview's actual jq selectors for missing billing, source-currency mismatches, provider pagination/incomplete results and stale/invalid FX. The top bar uses `public-fx-source.json` for the credential-free Frankfurter source and shows its ECB reference date/rate. Keep missing GCP null and the provider-period/partial-total caveats visible when changing the conversion or transformations.

The external webhook uptime check is owned by Google Cloud Monitoring, not either VM. Its saved configuration and the credential-free public OpenAI data source are under outputs. Keep the generated uptime check ID and public-source UID synchronized with `Query.Helpers.ps1`/the configuration files. No Azure scheduled probe is retained: VM-01 is not 24x7.

Rollback: restore the private pre-availability dashboard resource, disable/stop only `mw-resource-health.timer` and its service, remove only its dedicated files/units after preserving evidence, and remove the dedicated uptime-check configuration/public-status source if no longer referenced. Existing provider metrics/data sources, workload jobs and historical monitoring samples are unaffected. GCP custom metric history may be retained after collector removal.

For authenticated browser updates without a new API token, use Grafana's **Edit → Code** JSON resource editor. Capture its entire JSON to the private `performance-before-refinement-v2.json` / `cost-before-refinement-v2.json` baseline files before editing. `Build-EditorResources.ps1` converts the maintained classic dashboard JSON into that current v2 envelope and preserves the baseline's annotations/preferences. Apply the generated `*-editor-resource.json`, save with a change note, then verify the saved UI. These JSON resources contain dashboard definitions only, no credentials. Both formats are included for recovery; do not import both as separate dashboards.

### Cost detail layout (25–26 September 2026)

`Build-Dashboards.ps1` contains the Azure/GCP newest-first detail sorts, GCP resource and gross/credits/net daily panels, and Railway estimated resource/daily panels. Railway selectors are `railway-resource-cost.jq` and `railway-daily-estimate.jq`; they use published rates rather than a daily provider cost ledger. Test the selectors with `node scripts/monitoring/test_cost_detail.cjs <path-to-jq>` before publication. The private live rollback point is `cost-before-20260925-detail-layout-v2.json` in the resource-monitoring credential directory.

For this saved dashboard, run `Build-EditorResources.ps1 -Pages cost -CostBaselinePath <private-live-backup>`, then `Patch-CostDetailResource.ps1 -LiveBaselinePath <private-live-backup>`. The latter copies only the affected Cost panel definitions and GCP/Railway row layout into the preserved live resource. Review `cost-editor-resource.json` before pasting it into Grafana Edit → Code. If a later task changes the live dashboard, first capture a fresh v2 backup and reconcile that change; do not replay the dated resource blindly.

## Initial provisioning (already completed)

### OpenAI incident details (24 September 2026)

`openai-status.jq` is the canonical product-state/incident selector. The credential-free source uses `https://status.openai.com/proxy/status.openai.com`, the public interface used by the current official website. This is not a separately documented stable API: validate website identity, product groups and response arrays; incompatible responses become Unknown. Do not fall back to the obsolete `/api/v2/summary.json`, which returned incomplete older components during this change.

`Update-OpenAiPanels.ps1` patches only panels 54/55 in the maintained classic/V2 resources and writes `openai-alert-query.json`. For live dashboard edits, start with a fresh UI Code export and copy only those panel changes to preserve owner preferences. `Build-Dashboards.ps1` also reproduces the panel options. Rows to fields exposes incident text as the dynamic field name. The data link uses that name as its native hover title; a fixed display name retains the centered product label above the light, and the URL field supplies the click-through link. No HTML/script/plugin is needed.

The alert appends `| {component,value}` to the canonical selector and retains only a stable product label and binary impairment value. Do not add incident text or Checked time as alert labels. Keep the existing 10-minute pending period, 2-minute evaluation, IRM contact and Keep Last State behavior. Validate with `node scripts/monitoring/test_openai_status.cjs <path-to-jq>`; use the bundled Node runtime and an official jq executable. Fixtures stay local and must not be saved into live alert queries.

`Initialize-Azure.ps1` checks the signed-in tenant/subscription/account, creates a dedicated one-year service-principal secret and group-scoped read permissions. It refuses existing principals/credentials.

`Initialize-AzureVmControl.ps1` separately provisions the owner-approved single-VM control identity with only read, instanceView, start and deallocate permissions. It never runs a power operation and must not be replayed against the existing identity. `VmControl.Helpers.ps1` is retained as inactive preparation only: the owner removed panel 15 and the dashboard builder no longer calls it. Do not re-enable it without a new request and supported Grafana authenticated actions. Power-cycle testing is disruptive because VM-01 hosts the desktop/Codex session; do not use deallocation as an automated smoke test.

`Initialize-Gcp.ps1 -ApprovedKeyCreationException` is a security-sensitive, one-time procedure requiring owner authorization. It creates the dedicated monitoring identity/dataset, temporarily makes project-level exceptions for both key-creation constraints, creates one key outside Git, and restores inherited enforcement in `finally`. It refuses an existing key or local policy. Do not rerun for routine dashboard changes. If interrupted, inspect/restore project policies immediately and reconcile the existing identity/key; never automatically create another key.

Detailed GCP billing export and the Railway workspace token were configured in their authenticated web consoles. `Install-DataSources.ps1` installs only the three named Infinity sources and refuses existing UIDs. It never writes plaintext credentials into generated dashboards. No workload deployment, business database write or AppSheet change is part of these tools.

### IG polling timing hover
`worker-timing.jq` formats same-sample numeric worker timing values in SGT, rejects pagination and returns Unknown after six minutes. `Update-PollingTimingPanel.ps1` patches only panel 63 in maintained classic/V2 resources. Start live edits from a fresh Code export and transfer only panel 63 to preserve owner layout/preferences. The builder includes the same query/transformation. Validate collector logic with `test_debian_health.py`; test fresh/stale/missing timing responses with official jq. No workload timer changes or business-job invocation are needed.

### Metabase health group

`metabase_probes.py` uses liveness/readiness, a fixed saved SELECT 1 canary, the public chart shell/protected API guard, and the read-only Railway PITR status probe in `metabase_pitr.py`. It is deployed next to `debian-health.py`; the latter requires the module. Key storage is external and restricted; see the operating reference for IDs and rollback. `Initialize-MetabaseProbe.ps1` is a guarded one-time helper, not a deployment step. `Update-MetabasePanels.ps1` patches the seven Metabase panel definitions and availability-grid positions in maintained classic/V2 JSON; the builder calls its layout function too. For live publication preserve the full fresh UI definition, its `grafana.app/folder` annotation and owner preferences before applying the scoped patch. Omitting that folder annotation in a V2 API PUT moves the dashboard to the root folder and hides it from the setup service account. Run `test_metabase_probes.py` plus collector tests; test `metabase-probe.jq`, `metabase-backup.jq` and `metabase-pitr.jq` for fresh/stale/missing samples. No workload schedules are changed.

The four Live tiles and PITR share Grafana-managed rule `MW | Metabase component unhealthy` (`ffzb4act1o0zka`). Its canonical selector is `metabase-alert.jq`; `Build-MetabaseAlertQuery.ps1` writes the sanitized Infinity query to `outputs/resource-monitoring-20260922/metabase-alert-query.json`. The selector emits one stable `component` label and binary `value` per tile. Only fresh Down (0) or Degraded (2) yields 1; Unknown, Paused, missing or older-than-six-minute telemetry yields 0. The Daily and Weekly tiles share `MW | Metabase scheduled backup unhealthy` (`mw-metabase-backup-health`), using `metabase-backup-alert.jq` against Railway's scheduled-backup list. Both rules use Last reduction, threshold above 0, 2-minute evaluation, 4-minute pending period, KeepLast on no-data/error, and direct `MW Performance IRM` contact. Edit the named rules in Grafana to change alert behavior, then update the guide and operating reference. Pause/delete only these rules to remove Metabase push alerts without changing the tiles or collector.


## Payment monitoring maintenance

`payment-dashboard.js` patches classic or V2 Performance definitions without changing existing panel contents. `Build-Dashboards.ps1` invokes it using bundled Node. For a scoped edit, pass a fresh exported Performance JSON and output path directly: `node scripts/monitoring/payment-dashboard.js <input.json> <output.json>`. Existing live UI changes must be reconciled before publishing a regenerated baseline. The maintained editor-resource file is the saved live snapshot; the classic file is the reproducible builder format.

`receipt-pipeline.jq` aligns queue fields with fresh status; `receipt-trend.jq` inserts null gaps; `group-scanning.jq` emits the Group scanning status and same-sample last-completion epoch in milliseconds for the two-value Stat tile; `debian-alert.jq` is the existing Debian rule selector. The completion field uses Grafana's `time:DD MMM HH:mm` custom unit in the dashboard's Singapore timezone, with an Unavailable override for missing/stale timing. Update the named rule in the UI, not a duplicate rule. The latter's no-data/error policies must remain Alerting, four-minute pending and direct MW Performance IRM contact. Canonical files contain no secrets or borrower data.

Tests: bundled Python `-m unittest discover -s scripts/monitoring -p test_debian_health.py`; `test_receipt_queries.py` requires jq (available on Debian); `node scripts/monitoring/test_payment_dashboard.cjs` checks preservation/idempotence and stage fields. Synthetic fixtures are never sent to live monitoring or business APIs.

### Receipt notification health correction — 2 October 2026

Worker revision 25 separates optional result delivery from receipt processing health. `failed_notifications` remains the retained unresolved delivery count; `notification_status` separately reports its health. Optional Partner-result failures do not degrade `receipts`; stalled intake, required review/hold attention and uncertain posting still do. Keep the Notification failures panel and its counts visible. Neither green processing status nor acknowledgement means delivered.

Canonical replacement description for existing Debian rule `afz3o5cmmfabkb` (description only; selector, labels, thresholds and contact unchanged):

> Monitors 12 Debian components. Receipt health includes worker availability, stalled intake, required review/hold attention and unconfirmed posting. Optional Partner-result notification failures remain visible separately and do not degrade receipt processing. Receipts and polling alert for missing, stale, invalid or Unknown telemetry. Four-minute pending period; existing no-data/error and contact settings remain unchanged.

The description and panel text need a scoped update from a fresh live Grafana definition; this source correction does not claim that UI metadata has been saved. Parent browser verification at 09:13:58 UTC on 2 October reported Pipeline Healthy, Receipts green, all 12 component instances Normal, processing queues zero, retained completed total 56 and Partner-result failures 2, with fresh 09:11:21 telemetry. Those failure records were preserved.


## Pending R050 audit relay health

The candidate collector requires the matching MW `relay_health` module before deployment. It uses completed outcome/backlog evidence with the existing `audit_relay` component label and exports bounded numeric diagnostics through the existing worker metric. Missing inspection fails DOWN. Units, dashboards and alert selectors stay unchanged. See [R050 checks and rollout/rollback](../../Change%20Logs/CHANGE_NOTES_R050_DURABLE_OPERATOR_AUDIT_2026-10-04.md). Current live timer/result behavior remains the baseline until a separately approved rollout.

### R051 bridge/subscription row 5 and daily VM-01 chart — telemetry live; dashboard handoff

See [checkpoint and proposals](../../outputs/grafana-row5-vm01-20261004/README.md) and [concrete rollout approval scope](../../outputs/grafana-row5-vm01-20261004/ROLLOUT_PROPOSAL.md). Apply `node scripts/monitoring/row5-dashboard.js performance <fresh-private-export> <private-patch>` and `node scripts/monitoring/row5-dashboard.js cost <fresh-private-export> <private-patch> <fresh-performance-export>` only after parent reconciles live layout/datasources and establishes both rollback exports. It refuses wrong identity/timezone, occupied IDs and unsupported overview overlap. Proposed full resources under outputs are dated-source examples, not live import payloads. No builder/publication change is activated before reconciliation.

`azure-daily-availability.jq` uses only passive VM availability PT1M samples, clips selected partial days and preserves null gaps; observed available hours differ from exact running and billable allocated time. `azure-power-history.js` correlates completed Activity Log operations as evidence only, without inferring continuous guest uptime or invoking Azure/controller actions. All Activity Log pages and a sufficient pre-period lookback are required; no assumed initial state.

Optional Cloud Run instrumentation is under `grafana-mcp-bridge/src/monitoring.ts`. It adds numeric exports after natural dispatch only when new `MONITORING_ENABLED=true` is explicitly configured. It needs approved metricWriter access, the new oldest-pending index, verified private expected membership and a pinned Cloud Run rollout. No Debian/integration-worker runtime change. `build-bridge-alert-proposals.js` writes paused rule proposals for a separate IRM-only contact; it never installs/unpauses or changes filters. Legacy missing grant metadata remains Unknown until ordinary host renewal provides authenticated deadline data.

Relevant checks: `node scripts/monitoring/test_row5_dashboard.cjs`, `test_azure_power_history.cjs`, `test_bridge_alert_proposals.cjs`; bridge `npm run build` and targeted monitoring/events/store/offline-auth tests. No fixture is sent to live monitoring or business services.
