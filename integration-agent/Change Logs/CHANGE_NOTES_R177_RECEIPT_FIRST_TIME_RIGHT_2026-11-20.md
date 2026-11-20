# Change notes — R177 receipt first-time-right, 20 November 2026

## Purpose
Raise the share of genuine incoming slips that post on the first pass without a human, and make that share visible. Owner request of 20 November 2026. The owner also approved the `mw_agent` V15 database change and authorized PROD promotion of A, B and D ("Push to prod"): enabling `receipt_arrears_auto_enabled` and the outgoing-transfer switch in the PROD agent config, V15 after a verified `mw_agent` backup, and the Grafana apply. Promotion is not yet done.

Evidence (read-only, PROD, 6 to 20 November 2026, aggregates only): 202 incoming slip jobs, 137 auto-posted first pass (68%, median 24 s). Gaps found:
- 14 slips went to "Overpayment review" although the amount was at or below the total unpaid charges through the slip date (5 exactly equal, 9 partial; 8 of the 9 were booked as newest-first Lump Sum would book them). Cause: the plan auto-posts only when the amount is within the latest charge day's total.
- 8 slips were the partner's own outgoing transfers, shown in borrower groups; each needed a manual Reject, and one whose amount fitted a due would have auto-posted as incoming.
- One Review thread showed unclear wording and count mismatches (item C); the owner dropped item C and the twin-record guard.

## Changes
- A (auto-post arrears): `receipt_arrears_auto_enabled` in `integration-agent/src/mw_integration_agent/review_proposal.py` and `review_cycle.py`; `partner_notice.py` adds the "Still unpaid: ฿X from <date>" line to the ✅ notice when older charges remain (with arrears on it also appears on a plain partial Lump Sum within the latest day; truthful and switch-gated).
- B (outgoing transfers ignored): `receipt_outgoing_ignore_enabled` and `receipt_outgoing_senders` (`receipt_rules.py` carries the `match_account` refactor); IGNORED / `OUTGOING_TRANSFER` before validation, no notice.
- C and the twin-record guard: dropped by the owner; not built.
- D (first-time-right on Grafana `mw-agent`): agent migration V15 `monitoring.receipt_ftr_daily_v1()`; datasource `mw-agent-receipts`; panels 34 and 35; `DASHBOARD_RELEASE` R177 (`project/scripts/monitoring/dashboards/`, `infrastructure/grafana/`).
- Config: `integration-agent/config.example.json` template, all keys default off; no catalogue revision.
- Documents updated: `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Resource_Monitoring_Dashboard_Guide.md`, `project/scripts/monitoring/README.md`, `integration-agent/README.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/docs/RECEIPTS.md`, `integration-agent/docs/POSTGRESQL_OPERATIONS.md`.

## Checks
| Command | Result |
| --- | --- |
| ruff | Pass (Byte, `9fed88c`) |
| Agent unit tests | 1,139 OK, 82 skipped (Byte, `9fed88c`) |
| Agent PostgreSQL lab, V1 to V15 | 92 OK (Byte, `9fed88c`) |
| `node project/scripts/monitoring/test_build_dashboards.cjs` | OK (Byte, `9fed88c`) |
| `test_dashboard_queries.py` | 88 OK (Byte, `9fed88c`) |
| Grafana tests; `terraform fmt` and `validate` | Pass (Forge, `af77eb7`) |
| Grafana read-only plan | 1 add, 0 change, 0 destroy (Forge, `af77eb7`) |
| Chase adversarial review of `ee653fa..9fed88c` | Pass, no defects |
| Argument-removal mutation at `review_cycle.py:324` | Caught by 3 tests (Chase) |
| First-time-right function body, read only on live `mw_agent` | 6 to 20 November 137/190 = 72.1%; full history 292/463 = 63.1% (Chase) |
| `npm run check:docs` | 0 failures, 1 pre-existing warning (an old note, Dewey) |

## Not run
| Check | Why |
| --- | --- |
| Real extraction order on historic accepted outgoing slips | The extraction is not kept |
| Live Grafana datasource connectivity | After Forge's apply |
| V15 on PROD | At promotion, after the verified `mw_agent` backup |

Any live financial write is not authorized. PROD promotion is authorized but not yet performed. A skipped check is not a pass.

## Recovery
Git baseline `main` `ee653fa` (R176 owner acceptance). No deployment has happened yet; the PROD record will name the `mw_agent` backup; DEV or Grafana changes, once applied, are recorded here with their prior state.

## Open questions
None.

## Remaining work
Implementation (Byte), tests (Echo), review (Chase), Grafana change (Forge or Byte as assigned), then documentation and this note's Checks.
