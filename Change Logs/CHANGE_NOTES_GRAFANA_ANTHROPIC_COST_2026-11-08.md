# Change notes — Anthropic Claude API cost on the Grafana Cost page, 8 November 2026

## Purpose
The owner asked to put monthly Claude API credit usage on the Grafana Cost page, with the owner creating the key and everything else done for them. The in-app chat row only estimates the PWA chat from token counts; this adds Anthropic's billed figure for the whole organization.

## Changes
- New Infinity datasource `mw-anthropic-cost` ("MW · Anthropic Cost") in `infrastructure/grafana/owned-services.tf.json`: API key auth in header `x-api-key`, allowed host `https://api.anthropic.com`, `prevent_destroy`, secure fields ignored by Terraform.
- Cost dashboard (`mw-cost`): collapsed row 60 "Anthropic · Claude API · billed cost (USD)" after Railway, with table 62 (billed cost by model and cost type for the selected range, from `/v1/organizations/cost_report?bucket_width=1d&limit=31&group_by[]=description`, header `anthropic-version: 2023-06-01`), stat 61 (its sum, through the Dashboard datasource, so one API call) and text 64. Built from `project/scripts/monitoring/dashboards/cost.cjs`; selector `anthropic-cost-detail.jq` (cents to USD; `has_more` is an error rather than an undercount). Native USD in a collapsed row like Azure, GCP and Railway, because the visible page is SGD only and keeps one daily chart (COST-2); not added to the SGD total.
- `scripts/grafana/set_datasource_secret.py`: sets one datasource's encrypted field from a Secret Manager version for fixed pairs (`mw-anthropic-cost` ← `mw-anthropic-admin-cost-key`, `mw-railway-monitoring` ← `mw-railway-grafana-monitoring-token`); the value stays in memory, is format-checked and is never printed.
- Secret Manager: secret `mw-anthropic-admin-cost-key` created in `clever-oasis-508610-n7` (automatic replication, labels `owner=mw-credit`, `purpose=anthropic-cost-monitoring`); the owner added version 1.
- Anthropic account (owner, in the Claude Console): the organization was an individual account ("Will's Individual Org"), and the Admin API answered 403 to every organization report. The owner converted it to a team organization, now named "MW Credit"; the organization ID `fe93c72e-…3c57` is unchanged, so the chat relay's federation rules still point at it. The key is a personal key (`sk-ant-usr…`, linked to the owner, no workspace) created on the API keys page; the owner's role after conversion lets it read the cost report, so no Admin key was needed.
- Applied 8 November 2026 after rebasing on `main` `c86c2e2` (VM-01 retirement): reviewed plan sha256 `a075ba36…0551`, 1 added (`mw-anthropic-cost`), 1 changed (`mw-cost`, only row 60 added); key set with `set_datasource_secret.py` (datasource version 2); recorded in `infrastructure/grafana/operational-secret-references.json`.
- Records: `infrastructure/grafana/README.md`, `project/Documents/Resource_Monitoring.md` (coverage, credentials and rotation), `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (also corrects the provider-row position to y 51 to 54), `project/scripts/monitoring/README.md`.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/test_build_dashboards.cjs` | Pass (layout fit at 1440 and 390 px, datasource and host allow-lists, colour policy) |
| `python3 -B project/scripts/monitoring/test_dashboard_queries.py` | Pass, 72 tests (3 new Anthropic fixtures) |
| `python3 tests/grafana/test_manage.py`; `terraform fmt -check` | Pass |
| First guarded plan (branch before rebase) | Also showed `mw-infra` and `mw_azure_monitoring` changes and an older Azure row 10: the branch predated today's VM-01 retirement on `main`. Not applied; rebased first |
| Guarded plan after rebase, then apply | 1 to add, 1 to change (`mw-cost`: panel 60 added, no other panel or setting changed), 0 to destroy; `Apply complete! Resources: 1 added, 1 changed, 0 destroyed` |
| Direct cost report with the stored key (value never printed) | Before conversion 403 on `cost_report`, `usage_report`, `workspaces`, `users`; after conversion 200, 7 UTC days, one page, US$6.91 month to date |
| Grafana `/api/ds/query` with panel 62's target, month to date (Asia/Bangkok) | 8 rows (Claude Opus 5.5, Sonnet 5.5, Haiku 5.5 by token type), sum US$6.91, matching the direct report |
| Owner's chat turn after the conversion (`monitoring.pwa_chat_recent_turns_v1`, PROD) | 8 November 2026 09:58:41Z, `claude-opus-5-5`, status ok, 5 rounds, 51 s: the relay's federation sign-in to the converted organization works |
| `curl` to `api.anthropic.com` cost report without a key | 401, so the host is reachable |

## Not run
No browser render of the row (verified through Grafana's query API instead). No financial data or chat traffic is touched.

## Recovery
Remove row 60 from `cost.cjs` and rebuild; move the datasource to an unprotected resource and destroy it through a reviewed plan (as for the R090 retirements); delete the key in the Claude Console (API keys) and disable the secret version.

## Open questions
- Whether to add Anthropic, converted to SGD, to the Total and provider tiles at the top of the page (left out for now: the top row's provider tiles and conversion are an earlier owner decision).

## Remaining work
None. Merge this branch to `main` so the next Grafana apply from `main` keeps row 60 and `mw-anthropic-cost`.

## Follow-up — 8 November 2026: Claude API limit tile, Azure removed from the Cost page

### Purpose
Owner instruction: "Limit is 200 usd and keep it in USD. Don't include in total amount, but keep it separate on the upper part of the dashboard. You may remove azure as it's no longer used."

### Changes
- `cost.cjs` and `mw-cost.json`: Azure removed from the Cost page (tile 2, collapsed row 10 with 101 to 104, Azure in TOTAL 1, Last month 9, daily chart 6, rules text 40 and descriptions); `cost-prior-azure.jq` deleted. TOTAL is GCP plus Railway at the ECB USD/SGD rate. Top row: Total (1), GCP (3), Railway (4), width 8 each; y 4: 'Last month, same day · GCP' (9, GCP only), GCP budget (8), new tile 65 'Claude API · US$200 limit' (x 16, width 8).
- Tile 65: own query on `mw-anthropic-cost` (`bucket_width=1d`, `limit=31`), rolling `now-31d` window with hidden time override, selector `anthropic-cost-month.jq` keeps the current UTC calendar month; fields 'To yesterday (UTC)' (US$, 2 decimals, neutral) and 'Limit used' (whole %, green below 80, orange from 80, red from 100); limit constant 200 (`ANTHROPIC_LIMIT_USD`). Not in the SGD total. Complete UTC days only: today appears after 07:00 Bangkok and the tile shows 0 on the 1st. Row 60 (table 62) stays collapsed and errors when the range holds no complete UTC day.
- Collapsed rows now GCP 20 (y 51), Railway 30 (y 52), Anthropic 60 (y 53).
- Datasource `mw-azure-monitoring` stays defined in Terraform and is no longer used by any dashboard.
- Records: `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (Cost table, 80/100 % colour variant), `project/Documents/Resource_Monitoring.md` (coverage, cost calculation, Azure marked unused), `project/scripts/monitoring/README.md` (selector list).

### Checks
| Command | Result |
| --- | --- |
| Byte's dashboard build and query tests | Reported by Byte (build, layout fit and query fixtures for `anthropic-cost-month.jq`) |
| Chase, live read-only queries, 8 November | Tile 65 US$6.908 / 3.454 % (October's US$7.43 in the 31-day window excluded); TOTAL = GCP -S$0.0014 + Railway US$11.01 x 1.2816 = S$14.11 with no Azure or Anthropic input; tiles 9, 8, 6 and 62 return without error |
| Echo UX review | Codes COST-A1 to C5 and D1 accepted; D1 is the documentation update above |
| `npm run -s check:docs` | See the report below |
| Apply | pending Forge |

### Recovery
Revert `cost.cjs`, restore `cost-prior-azure.jq` and rebuild `mw-cost.json` from the previous commit, then apply through a reviewed plan; the Terraform dashboard resource is replaced in place and no data is touched.

### Open questions
- Retire the unused datasource `mw-azure-monitoring` (and the Azure app `mw-grafana-monitoring`)? Separate owner decision.

### Remaining work
Apply the dashboard (Forge), then merge the branch to `main`.
