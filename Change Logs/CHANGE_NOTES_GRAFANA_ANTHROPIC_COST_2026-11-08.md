# Change notes — Anthropic Claude API cost on the Grafana Cost page, 8 November 2026

## Purpose
The owner asked to put monthly Claude API credit usage on the Grafana Cost page, with the owner creating the Admin API key and everything else done for them. The in-app chat row only estimates the PWA chat from token counts; this adds Anthropic's billed figure for the whole organization.

## Changes
- New Infinity datasource `mw-anthropic-cost` ("MW · Anthropic Cost") in `infrastructure/grafana/owned-services.tf.json`: API key auth in header `x-api-key`, allowed host `https://api.anthropic.com`, `prevent_destroy`, secure fields ignored by Terraform.
- Cost dashboard (`mw-cost`): collapsed row 60 "Anthropic · Claude API · billed cost (USD)" after Railway, with table 62 (billed cost by model and cost type for the selected range, from `/v1/organizations/cost_report?bucket_width=1d&limit=31&group_by[]=description`, header `anthropic-version: 2023-06-01`), stat 61 (its sum, through the Dashboard datasource, so one API call) and text 64. Built from `project/scripts/monitoring/dashboards/cost.cjs`; selector `anthropic-cost-detail.jq` (cents to USD; `has_more` is an error rather than an undercount). Native USD in a collapsed row like Azure, GCP and Railway, because the visible page is SGD only and keeps one daily chart (COST-2); not added to the SGD total.
- `scripts/grafana/set_datasource_secret.py`: sets one datasource's encrypted field from a Secret Manager version for fixed pairs (`mw-anthropic-cost` ← `mw-anthropic-admin-cost-key`, `mw-railway-monitoring` ← `mw-railway-grafana-monitoring-token`); the value stays in memory, is format-checked and is never printed.
- Secret Manager: empty secret `mw-anthropic-admin-cost-key` created in `clever-oasis-508610-n7` (automatic replication, labels `owner=mw-credit`, `purpose=anthropic-cost-monitoring`) for the owner to add version 1.
- Records: `infrastructure/grafana/README.md`, `project/Documents/Resource_Monitoring.md` (coverage, credentials and rotation), `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (also corrects the provider-row position to y 51 to 54), `project/scripts/monitoring/README.md`.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/test_build_dashboards.cjs` | Pass (layout fit at 1440 and 390 px, datasource and host allow-lists, colour policy) |
| `python3 -B project/scripts/monitoring/test_dashboard_queries.py` | Pass, 72 tests (3 new Anthropic fixtures) |
| `python3 tests/grafana/test_manage.py`; `terraform fmt -check` | Pass |
| Guarded Terraform plan | 1 to add (`mw-anthropic-cost`), 3 to change: `mw-cost` (this batch) plus `mw-infra` (collapsed Azure VM-01 row) and `mw_azure_monitoring` (VM-01 health-check URL), both already merged and documented as live but never applied |
| `curl` to `api.anthropic.com` cost report without a key | 401, so the host is reachable |

## Not run
Apply, key setting and live query wait for the owner's Admin key (see Remaining work). No financial data or chat traffic is touched.

## Recovery
Remove row 60 from `cost.cjs` and rebuild; move the datasource to an unprotected resource and destroy it through a reviewed plan (as for the R090 retirements); delete the Admin key in the Claude Console and disable the secret version.

## Open questions
- Whether to add Anthropic, converted to SGD, to the Total and provider tiles at the top of the page (left out for now: the top row's provider tiles and conversion are an earlier owner decision).

## Remaining work
- Owner: create the Claude Console Admin key `mw-grafana-cost-report` and add it as version 1 of `mw-anthropic-admin-cost-key`.
- Then: verify the key against the cost report, apply the reviewed plan, run `set_datasource_secret.py --datasource mw-anthropic-cost`, check the row through Grafana's query API and record the datasource version in `infrastructure/grafana/operational-secret-references.json`.
