# Change notes — conversation poll timeout and polling health semantics, 26 October 2026

## Purpose
Owner-approved fix for false polling Down alerts. Forge journal evidence for 24-26 October: 89 of 2,447 poll runs (3.6%) exited 2. 86 were the first conversation-list Graph call (100 conversations × last 100 messages) exceeding the 20 s urllib timeout, clustered 01:00-08:00 ICT (84 of 86 ended at 21-22 s); 2 were HTTP 500 code 1; 1 was a per-conversation failure. The health collector reported every failed run as Down.

## Changes
- `src/mw_integration_agent/instagram.py`: the request error names the exception class only (`Instagram API request failed (TimeoutError)`; never URL, query or token); `Instagram(config, read_timeout=…)` with `SEND_TIMEOUT = 20` for sends (requests with a body).
- `src/mw_integration_agent/conversation_poll.py`: first list call asks for 20 messages per conversation (`FIRST_PAGE_MESSAGES`), follow-up history pages stay at 100, so reach per scan is 20 + 9 × 100; poll reads use `READ_TIMEOUT = 40` s per socket operation; per-conversation failure code is `POLL_CONVERSATION_UNAVAILABLE:<Class>`.
- `project/scripts/monitoring/debian-health.py`: new `polling_status()`. One failed run is Degraded; Down = timer or unit inactive or not loaded, a run hung over 600 s, or no successful run for over 600 s. The last success is kept as `polling_last_success` in `last-points.json`.
- `project/scripts/monitoring/debian-alert.jq`: polling Degraded no longer pages; `group-scanning.jq` and `worker-timing.jq`: schedule text 5 to 1 minute. The live Grafana rule text is changed by Forge in `infrastructure/grafana/owned-services.tf.json` (separate record).
- Tests: `tests/test_conversation_poll.py`, `tests/test_instagram_transport.py`, `project/scripts/monitoring/test_debian_health.py`, `test_receipt_queries.py`.
- Docs: `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md`, `SERVICE_CATALOGUE.md` (poll cadence text), `project/Documents/Rules/Grafana_Alert_Troubleshooting_Runbook.md`, `project/Documents/Resource_Monitoring.md`, `project/scripts/monitoring/README.md`.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_conversation_poll tests.test_instagram_transport tests.test_receipt_identity` (in `integration-agent/`) | 44 OK; the full suite's database-dependent errors are unchanged from `HEAD` in the cloud session (no locked venv), so CI is the full run |
| `python3 -m unittest test_debian_health test_receipt_queries test_dashboard_queries` (in `project/scripts/monitoring/`) | OK (3 skipped: need psycopg), including the clock-skew and missing-start-time cases |
| `node test_build_dashboards.cjs`; `node build-dashboards.cjs --check`; `ruff check --no-cache integration-agent` | Pass; no dashboard change |
| `debian-alert.jq` on synthetic input | polling 0, 4 and missing data page; polling 2 does not; other components' 2 still page |
| `npm run check:docs` | 0 failures, 0 warnings |

## Deployment
| Item | Value |
| --- | --- |
| Commit / merge | TBD |
| Deploy time (Asia/Bangkok) | TBD |
| Collector (`debian-health.py`) and runtime installed | TBD |
| Post-deploy evidence (poll runs, exit codes, first-call duration, Debian polling status) | TBD |

## Not run
- Live measurement of the 01:00-08:00 ICT window after deploy: pending.

## Recovery
Revert the merge commit and redeploy; the collector keeps the previous file beside the new one. `polling_last_success` in `last-points.json` is ignored by older collectors.

## Open questions
None.

## Remaining work
- Fill the deployment section; confirm no exit-2 cluster the following night.
