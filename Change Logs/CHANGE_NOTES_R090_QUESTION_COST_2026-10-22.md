# Change notes — R090 Cost page: last 10 Partner questions and their cost, 22 October 2026

## Purpose
Owner request: a Cost page section listing the 10 latest questions put to the Partner conversation agent and each one's cost (input, output, everything for that question). Owner decisions the same day: the question text is read by Grafana directly from the agent database (no copy in Cloud Monitoring), through Grafana Private Data Source Connect (PDC) on the Debian VM, and tokens are priced at list price.

## Changes
- Agent side (V9, V10, `message_id` on the usage event, role `mw_agent_dashboard`, login `mw_grafana_reader`): see `integration-agent/Change Logs/CHANGE_NOTES_QUESTION_USAGE_V9_V10_2026-10-22.md`.
- Prices: `project/scripts/monitoring/model-prices.json`, SGD per million tokens as billed on the billing account in October (billing export, Vertex AI SKUs, cost divided by usage): Gemini 4 Argon 5.1125 input, 0.2556 cached input, 25.5617 output (thinking bills as output); Gemini 3.8 Flash 1.9172, 0.1917, 9.5857. Third-party listings disagreed (Argon's $2/$10 introductory rate is not what the account is billed); the billed rate is used. Claude has no October usage, so it has no row; a Claude turn would show tokens without a cost.
- Cost dashboard: row 49 'Partner chat · cost per question' and table 50 'Partner chat · last 10 questions' (y 27 to 40; the collapsed provider rows move to y 41 to 43). The SQL calls `monitoring.recent_questions_v1(10)` and joins the price table from `model-prices.json`; Cost (SGD) = uncached input × input + cached × cached + (output + thinking) × output, per million; footer sums the listed questions. Datasource `mw-agent-questions` (type `grafana-postgresql-datasource`) added to the builder's allowed list.
- PDC: `project/scripts/monitoring/install-grafana-pdc.sh` and `mw-grafana-pdc.service` (pinned `pdc-agent` v0.0.66, SHA-256 `10e0bdc6…6878`; user `mwpdc`; token, cluster and hosted Grafana ID only in root-only `/etc/mw-grafana-pdc/pdc.env`; outbound only).
- Records: `Resource_Monitoring_Dashboard_Guide.md` (Cost 49, 50), `project/scripts/monitoring/README.md` (Partner question cost), `integration-agent/docs/POSTGRESQL_OPERATIONS.md`.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/build-dashboards.cjs --check`, `test_build_dashboards.cjs`, `test_dashboard_queries.py` | Pass (Cost 31 panels; 62 query tests OK) |
| The generated panel-50 SQL as a lab login holding only `mw_agent_dashboard` (disposable PostgreSQL 18, V1 to V9 applied, the live 17:37Z turn's token counts) | Columns Asked, Question, Model, Input, Cached, Output, Thinking, Cost (SGD); 66,806 / 112,623 / 2,360 / 2,299 tokens → S$0.4894, equal to the hand calculation |
| Live `monitoring.recent_questions_v1(10)` as `mw_grafana_reader` | 10 rows; see the agent change note |
| `npm run check:docs` | 0 failures, 0 warnings |

## Not run
- PDC agent install, the Grafana datasource and the Cost dashboard apply: they need the owner's PDC token (Grafana Cloud, Connections → Private data source connect) in Secret Manager `mw-grafana-pdc-token` and the network's cluster and hosted Grafana ID.
- The pull request's CI checks.

## Recovery
Revert this commit and apply the Grafana plan (the section disappears); `systemctl disable --now mw-grafana-pdc` and remove its files (see the installer header). Agent recovery is in the agent change note.

## Open questions
None.

## Remaining work
- After the owner's PDC token: install the PDC agent, add datasource `mw-agent-questions` (Terraform, password through the Grafana API), apply the Cost dashboard, check panel 50 live, record here.
