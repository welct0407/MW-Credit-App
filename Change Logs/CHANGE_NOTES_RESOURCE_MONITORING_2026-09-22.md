# Centralized resource monitoring — 22 September 2026

## Scope and authority

Owner requested implementation of Grafana Cloud monitoring for Azure VM, GCP VM/Cloud SQL and Railway, with separate performance and cost pages. This is infrastructure monitoring, not an AppSheet definition or business database promotion.

Starting Git commit: `a0e2d394a251bb155e73f667c672785b7bf30e48`. Existing R016 reporting/model edits are unrelated and must remain untouched.

## Baseline and rollback

- Grafana stack: `olivecrab1199.grafana.net`, work account. Existing data sources are Grafana-managed defaults; existing dashboards are vendor-provided. New monitoring assets will use distinct names/UIDs. Rollback removes only the new assets and dedicated access.
- Azure: tenant `9e29c895-606a-420b-acc2-1c24375df4d9`; VM `VM-01`, resource group `RG-MWCREDIT`, subscription `50f792fa-803e-4280-833d-1fe60fef5293`, Southeast Asia. User completed sign-in as requested.
- GCP: project `clever-oasis-508610-n7`; VM `vm-mw-credit-agent`, zone `asia-southeast1-a`; Cloud SQL target remains the shared `appsheet-pg-prod-20260914` instance. Monitoring/BigQuery APIs already enabled. No BigQuery datasets returned at baseline.
- Railway: existing MW Credit Metabase project `c8e57452-36dc-41f1-8d00-856b521a96c7`; production environment `df3ba125-0d62-446a-b4d8-5196780982c9`. An unrelated staged service change was visible; it must not be deployed by this task.
- Credentials and private recovery records: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring`. No credential recovery coverage claimed merely from this folder.

## Decisions and changes

- Owner approved temporary Grafana setup access. Created `mw-resource-monitoring-setup`, numerical ID 18, Editor plus Data Sources Creator/Reader/Writer. Token `setup-20260922-1day` expires 23 September; revoke after setup.
- Owner approved a project-scoped temporary GCP service-account key-creation policy exception, one dedicated monitoring key, and immediate restoration of enforcement. Dedicated identity is limited to monitoring and the billing dataset.
- Preserve native billing currencies and distinguish credits, accrued usage and forecasts. Missing data must not be shown as zero.
- Created Azure `mw-grafana-monitoring` app/service principal with Monitoring Reader on RG-MWCREDIT and Cost Management Reader on RG-MWCREDIT/RG-BACKUP. Created one-year secret privately. No workload restart or configuration change.
- Created GCP dedicated monitoring service account, project Monitoring Viewer/BigQuery Job User roles and reader access to `mw_cloud_billing` in US. Enabled detailed Cloud Billing export to this dataset. Both legacy and managed service-account key-creation constraints were restored to inherited enforced state after the approved key creation.
- Owner approved Railway `mw-grafana-monitoring` workspace token, including its write capability. Only read queries are used. Existing staged service change was not deployed.
- Created three Infinity backend data sources, with provider-specific allowed hosts and credentials in Grafana encrypted settings. Data-source UIDs and precise coverage are recorded in [Resource_Monitoring.md](../Documents/Resource_Monitoring.md).
- Published `MW Resources · Performance` (24 panels) and `MW Resources · Cost` (16 panels) in folder `mw-resource-monitoring`. Five-minute performance refresh; hourly costs; Bangkok timezone; navigation links between pages. Queries run directly against provider APIs. No new alert delivery or subscriptions.
- Added maintained initialization, query, build, verification and publication scripts under `scripts/monitoring`; sanitized JSON definitions/checks under `outputs/resource-monitoring-20260922`; operating/recovery reference under `Documents/Resource_Monitoring.md`. No AppSheet model/dictionary change, business DB migration or product release number applies.

## Rollback details

Existing vendor dashboards/data sources and provider resources were preserved. Initial source inventory and later before-update dashboard snapshots are stored privately. Rollback removes only the two new dashboards, three dedicated sources and dedicated provider access, and disables this detailed export if unwanted. Preserve exported billing records unless separately authorized to delete them. Existing GCP organization policy inheritance was restored, not replaced with an organization-wide change.

The initialization scripts refuse existing credentials/identities rather than rotate or overwrite them. Live dashboard updates capture private baseline JSON. Credential backups are outside Git; no off-device credential recovery coverage is claimed.

## Verification and status

- All 22 retained unique performance queries returned HTTP 200 and real samples (72/73 points over six hours). Two exploratory ephemeral-disk queries returned no rows and were excluded from the final dashboard; their original check evidence remains labeled by panel name.
- Azure cost returned 98 RG-MWCREDIT and 12 RG-BACKUP rows. UI total reconciled to the combined raw query total. Shared dashboard queries feed the cost summary/chart/resource table without repeated source requests for each visualization.
- Railway cost returned one row, and the UI rendered current accrued USD usage and billing-cycle dates. Source API GraphQL errors are handled explicitly.
- GCP BigQuery query succeeded with the pending-export row and null amounts. UI verified **Awaiting first billing export** and **No data** totals, not zero. Populated-export cost reconciliation remains pending Google's initial delivery; no live GCP cost total is claimed. The dashboard discovers the table automatically when it appears.
- Current Grafana UI verified all four performance sections, cost summaries/table fields, correct units and navigation. Saved final dashboard versions/panel counts were read back; evidence is `verification-summary.json`. Azure provider throttling occurred during early probing; subsequent live queries and GUI rendering succeeded, with a dedicated ClientType header and hourly cost refresh.
- Temporary Grafana setup token was revoked; HTTP 401 verified using the old token. Setup service account was also disabled. Runtime provider credentials remain dedicated to the data sources. Evidence: `setup-access-cleanup.json`.
- PowerShell parser checks passed. Generated dashboard definitions contain no secrets. Repository publication is the final closure step; only this task's scripts, documentation and sanitized definitions/checks are included. Unrelated R016 work is preserved.

**Status:** dashboards published and live performance/Azure/Railway data verified; GCP cost export connected, awaiting first provider delivery. No further owner action is required for the automatic first load, but actual GCP amounts cannot be reconciled before records exist.
