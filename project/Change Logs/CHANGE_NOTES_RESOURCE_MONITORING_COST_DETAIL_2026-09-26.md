# Resource monitoring Cost detail — 25–26 September 2026

## Scope and purpose

Updated the existing Grafana Cost dashboard `mw-resource-cost` in stack `olivecrab1199` so Azure and GCP daily resource tables show the newest usage date first, and each provider has resource and daily cost detail. The live dashboard remains in Asia/Singapore and retains the prior SGD overview and Azure visual settings.

## Changes

- Azure panel 101 and GCP panel 201: Date descending in the detail tables. Azure's source dates are UTC buckets displayed in Singapore time; GCP groups by Singapore date.
- GCP: added selected-range net cost by service/resource (207) and a daily gross, negative-credits and net chart (206). Updated static export explanation (205) to describe credited usage and delayed records. Existing gross, credits and net cards remain.
- Railway: added current-cycle service/resource estimate (304) using published CPU, memory, volume and egress rates, and a Singapore-date daily estimate (305) from hourly CPU, memory and volume samples. The official workspace `customer.currentUsage` card remains authoritative for accrued resource usage. The daily estimate excludes egress, plan fees, included usage, credits and unsampled intervals and will not reconcile exactly to an invoice.
- Updated `scripts/monitoring/Build-Dashboards.ps1`, `Build-EditorResources.ps1`, `Patch-CostDetailResource.ps1`, the two Railway jq selectors, the synthetic cost-detail test, the classic/v2 saved Cost definitions, the monitoring README, the operating reference and the dashboard visual guide. The v2 patch preserved the top overview/Azure panel options and changed only the scoped GCP/Railway layout and affected elements.

## Rollback and checks

Private pre-change live v2 resource: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\resource-monitoring\cost-before-20260925-detail-layout-v2.json`. Restore it with Grafana Edit → Code if this full detail batch must be reverted. The snapshot is outside Git and contains dashboard definitions, not credentials. No provider access, billing export, alert or data-source permissions changed.

`Build-Dashboards.ps1` and `Build-EditorResources.ps1` completed; `Patch-CostDetailResource.ps1` produced 23 visual panels. `node scripts/monitoring/test_cost_detail.cjs outputs/.tmp/openai-hover/jq.exe` passed synthetic date-sorting, pricing and Singapore-day calculations. Live Railway queries returned service rows and a daily series; Grafana displayed the resource table and nonzero chart values with cents. GCP's detailed export produced service/day rows and all three daily series (gross S$0.79, credits S$-0.79, net S$0.00 on the latest displayed day). Grafana displayed the GCP resource table, revised export text and 25 September first in both Azure and GCP detail tables. Azure provider query was not repeatedly refreshed due its rate limits.

Status: Published. No plan change or additional monitoring credential was created. Railway cost breakdowns are estimates, not a replacement for provider billing records.
