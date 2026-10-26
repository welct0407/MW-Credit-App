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
| Commit / merge | `c3b62a8` and `0fcdfc3` on `claude/great-dirac-nr42ue`; merged to `main` as `374551d` by pull request 170 (owner approved 26 October) |
| Collector (`debian-health.py`) | Installed on `vm-mw-credit-agent` (project `clever-oasis-508610-n7`) 10:30 ICT from `c3b62a8`; previous file kept as `/opt/mw-resource-monitoring/debian-health.before-polling-degraded-20261026.py` (identical to the prior `HEAD` copy). First run 10:31:16: `polling` 1, exported; `last-points.json` holds `polling_last_success` |
| Grafana alert rule | Saved plan changed only `MW \| Debian component unhealthy` (`afz3o5cmmfabkb`) `root_selector` (`$v==2` → `($v==2 and $n!="polling")`); applied 10:31:39 ICT as `codex-cloud`; re-plan: no changes; live selector byte-identical to `debian-alert.jq` |
| Runtime (`deploy-runtime.py`) | `update-from-github.sh` `dbd2c89` → `374551d`; dry-run: changed modules `conversation_poll.py`, `instagram.py`, `state_migration.py`, units unchanged, schema check `ok` (through V11, no drift) with the temporary root-only operator connection file (Secret Manager, never printed; shredded and removed afterwards, as at R094/R098); freeze 11:46:52 ICT, install, activate (probe `6f332001-b2f8-40ac-b22e-bfb1c59563b9`), timers resumed |
| Post-deploy evidence | `code_version` `374551d`; receiver `/ready` true, cloudflared 4 connections, no failed units. Poll runs 11:48-11:53 ICT: all exit 0, 5-7 s, `eligible_conversations` 20, `failed_conversations` 0. Collector `polling`/`receipts`/`audit_relay` 1, exported; `polling_last_success` advancing. Receipt summary 16, audit relay 12, email retry 2 runs since activation, 0 failures |
| Pre-deploy poll runs | 10:25-10:32 ICT: 8 runs, exit 0, 6-7 s, `failed_conversations` 0 |

## Not run
- Live measurement of the 01:00-08:00 ICT window after deploy: pending.

## Recovery
Runtime: `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 374551d60fda07f4768f0beafa4dd100bfa6954b` in `/opt/mw-integration-agent-src` restores `dbd2c89` from `/var/lib/mw-integration-agent/rollback/runtime-20261026T044652298574Z`. Collector: copy back the `.before-polling-degraded-20261026.py` file. Alert: revert the one `root_selector` line and plan/apply. `polling_last_success` in `last-points.json` is ignored by older collectors.

## Open questions
None.

## Remaining work
- After the 27 October 01:00-08:00 ICT window, confirm no exit-2 cluster and record any `(…Error)` detail and run durations.
