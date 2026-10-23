# Change notes — R090 Cost page: last 10 Partner questions and their cost, 22 October 2026

## Purpose
Owner request: a Cost page section listing the 10 latest questions put to the Partner conversation agent and each one's cost (input, output, everything for that question). Owner decisions the same day: the question text is read by Grafana directly from the agent database (no copy in Cloud Monitoring), through Grafana Private Data Source Connect (PDC) on the Debian VM, and tokens are priced at list price.

## Changes
- Agent side (V9, V10, `message_id` on the usage event, role `mw_agent_dashboard`, login `mw_grafana_reader`): see `integration-agent/Change Logs/CHANGE_NOTES_QUESTION_USAGE_V9_V10_2026-10-22.md`.
- Prices: `project/scripts/monitoring/model-prices.json`, SGD per million tokens as billed on the billing account in October (billing export, Vertex AI SKUs, cost divided by usage): Gemini 4 Argon 5.1125 input, 0.2556 cached input, 25.5617 output (thinking bills as output); Gemini 3.8 Flash 1.9172, 0.1917, 9.5857. Third-party listings disagreed (Argon's $2/$10 introductory rate is not what the account is billed); the billed rate is used. Claude has no October usage, so it has no row; a Claude turn would show tokens without a cost.
- Cost dashboard: row 49 'Partner chat · cost per question' and table 50 'Partner chat · last 10 questions' (y 27 to 40; the collapsed provider rows move to y 41 to 43). The SQL calls `monitoring.recent_questions_v1(10)` and joins the price table from `model-prices.json`; Cost (SGD) = uncached input × input + cached × cached + (output + thinking) × output, per million; footer sums the listed questions. Datasource `mw-agent-questions` (type `grafana-postgresql-datasource`) added to the builder's allowed list.
- PDC: `project/scripts/monitoring/install-grafana-pdc.sh` and `mw-grafana-pdc.service` (pinned `pdc-agent` v0.0.66, SHA-256 `10e0bdc6…6878`; user `mwpdc`; token, cluster and hosted Grafana ID only in root-only `/etc/mw-grafana-pdc/pdc.env`; outbound only; gossh with `-permit-domains 127.0.0.1`, so the tunnel reaches only the Cloud SQL proxy).
- Datasource `mw-agent-questions` in `infrastructure/grafana/owned-services.tf.json`: `127.0.0.1:5432` (the proxy listens on IPv4 only), database `mw_agent`, user `mw_grafana_reader`, two connections, PDC network `b69f5334-…` (`pdc-olivecrab1199-default`); the password stays outside Terraform (`ignore_changes`).
- Records: `Resource_Monitoring_Dashboard_Guide.md` (Cost 49, 50), `project/scripts/monitoring/README.md` (Partner question cost), `integration-agent/docs/POSTGRESQL_OPERATIONS.md`.

## Checks
| Command | Result |
| --- | --- |
| `node project/scripts/monitoring/build-dashboards.cjs --check`, `test_build_dashboards.cjs`, `test_dashboard_queries.py` | Pass (Cost 31 panels; 62 query tests OK) |
| The generated panel-50 SQL as a lab login holding only `mw_agent_dashboard` (disposable PostgreSQL 18, V1 to V9 applied, the live 17:37Z turn's token counts) | Columns Asked, Question, Model, Input, Cached, Output, Thinking, Cost (SGD); 66,806 / 112,623 / 2,360 / 2,299 tokens → S$0.4894, equal to the hand calculation |
| Live `monitoring.recent_questions_v1(10)` as `mw_grafana_reader` | 10 rows; see the agent change note |
| `npm run check:docs` | 0 failures, 0 warnings |
| PDC agent install on `vm-mw-credit-agent` (owner created the token for network `pdc-olivecrab1199-default`, cluster `prod-ap-southeast-1`, hosted Grafana 1839781; Secret Manager `mw-grafana-pdc-token`) | Archive SHA-256 verified; version 2 of the secret was rejected by Grafana ("invalid credentials"); version 1 authenticated to `private-datasource-connect-prod-ap-southeast-1.grafana.net`; version 2 disabled. Final unit: `-use-gossh -permit-domains 127.0.0.1 -metrics-addr 127.0.0.1:8090`, metrics on loopback only |
| Grafana plan-002 from a clean export of `6fee0cb` | sha256 `81550a93a9ffdd3a96f07e325fcf3e6605b8df0424b104e47c36e80bc245c40b`, 1 to add (datasource `mw-agent-questions`), 1 to change (`mw-cost`); applied; reader password set from Secret Manager through the Grafana API (not printed, not in Terraform) |
| Datasource health | First "network unreachable" for `localhost:5432` and `127.0.0.1:5432`: the datasource had no PDC network. The owner selected `pdc-olivecrab1199-default` in the datasource UI (network ID `b69f5334-ca2f-4ad7-bc8f-3a93fe9e74ba` in `secureSocksProxyUsername`); then "Database Connection OK" |
| Host limit | With `-permit-domains 127.0.0.1`: `127.0.0.1:5432` OK; a test URL `169.254.169.254:80` refused ("general SOCKS server failure"), datasource restored to `127.0.0.1:5432` and OK again |
| Panel 50 query through `/api/ds/query` (30 days) | HTTP 200: 10 rows; the 9 since 21 October priced S$0.16 to S$0.51 each (17:35Z today S$0.4894); the 14 October question "No usage record" |
| Owner report, 23 October 2026: the Cost column read "4 currencySGD" (no such Grafana unit; the narrow column cut the value). Unit changed to the page's `prefix:S$`, 2 decimals (e.g. S$0.49), footer the same; `test_build_dashboards.cjs` pins it | Builder tests pass; applied as below |
| Re-plan from a clean export of `ccf321f` (URL, network ID and connection lifetime written into Terraform as the UI stored them) | No changes |

## Not run
- A screenshot review of panel 50 in the browser (the query result above is the panel's data).
- The pull request's CI checks.

## Recovery
Revert this commit and apply the Grafana plan (the section disappears); `systemctl disable --now mw-grafana-pdc` and remove its files (see the installer header). Agent recovery is in the agent change note.

## Open questions
None.

## Remaining work
None.
