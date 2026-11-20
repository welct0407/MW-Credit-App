# Change notes — R177 receipt first-time-right, 20 November 2026

## Purpose
Raise the share of genuine incoming slips that post on the first pass without a human, and make that share visible. Owner request of 20 November 2026. The owner also approved the `mw_agent` V15 database change and authorized PROD promotion of A, B and D ("Push to prod"): enabling `receipt_arrears_auto_enabled` and the outgoing-transfer switch in the PROD agent config, V15 after a verified `mw_agent` backup, and the Grafana apply. Promoted to PROD on 20 November 2026.

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
| Live Grafana datasource connectivity | Done at promotion: datasource health OK (see the PROD promotion record) |
| V15 on PROD | Done at promotion, after the verified `mw_agent` backup (see the PROD promotion record) |

Not verified in PROD: a real arrears auto-post and a real outgoing ignore, which need natural slips. Any live financial write was not authorized and none was made. A skipped check is not a pass.

## Recovery
Git baseline `main` `ee653fa` (R176 owner acceptance); PROD baseline agent R175 `5c5002f0`, `mw_agent` V14. See the PROD promotion record below for the rollback commands and the `mw_agent` backup; DEV or Grafana changes, once applied, are recorded here with their prior state.

## Open questions
None.

## Applied
Promoted to PROD on 20 November 2026 07:14Z to 07:22Z under the owner's "Push to prod" and "Ok with database change": the Debian agent on R177, `mw_agent` V15 after a verified backup, the two switches on, and the Grafana apply. Tag `R177` (annotated, object `19c40e63`) on `0f668aa2`, created by the Release tag workflow, which also published the GitHub Release. PROD first-time-right, 6 to 20 November: 137/190 = 72.1%.

## Closure records (Dewey)
- Environment inventory: the agent host, `mw_agent` V15, catalogue (47 unchanged) and Grafana R177 rows; component versions regenerated (`render --write`, `render --check`).
- Pruned at closure (Open R178 plus the three newest Released: R177, R176, R175): `Change Logs/CHANGE_NOTES_R174_RECONSIDER_STATE_GUARD_2026-11-18.md` and `integration-agent/Change Logs/CHANGE_NOTES_RECONSIDER_STATE_GUARD_2026-11-18.md`, with their links repointed to permalinks at `0f668aa2`; the R174 follow-up row of the open development changes is removed. Also deleted as an unlinked note outside the window: `integration-agent/Change Logs/CHANGE_NOTES_RECEIPT_SOURCE_404_CLOSE_2026-11-04.md` (no inbound links; Git keeps it).
- Drift (`drift --env prod`): 0 drift, 7 unverified (the credentialed facts were not observed in this session: the agent `/ready`, schema, Grafana tags, notify and jobs); the public facts match (PWA R172, read, command and chat R176 on `2636231b`). The agent and Grafana facts are recorded by the promotion record above.
- Dictionary: no change (no `loan_manager` object; the V15 function is documented in `integration-agent/docs/POSTGRESQL_OPERATIONS.md`).

## Remaining work
Owner acceptance, written into the next release's closure pull request. Watch for the first natural arrears auto-post and outgoing ignore in PROD.

## PROD promotion record (Forge, 20 November 2026 UTC)
Authority: owner, 20 November 2026, in session: "Push to prod" and "Ok with database change" (A, B, D); it covers the V15 migration, the backup, the two config switches and the Grafana apply. Item C and the twin-record guard were dropped by the owner. No loan_manager SQL, Cloud Run image, catalogue revision (47 live equals 47 in the repository), Hosting, Metabase, notification, job or financial write.

Package: `main` 0f668aa27990372765a02cd8d1fb979ff9ff9847 (merge of PR #369, head f6711b3). CI: Development checks 44687315119, agent tests 44687315045. Baseline: agent R175 `5c5002f0`, `mw_agent` V14 (installed 18 November 14:42:06Z), Grafana plan before R177 showed no drift.
Target: project clever-oasis-508610-n7, instance mw-credit-pg-20261017, database mw_agent, VM vm-mw-credit-agent (asia-southeast1-a), Grafana state in the project's Terraform state bucket under `grafana`.

| Step | Result |
| --- | --- |
| Checkout fast-forward (`update-from-github.sh`) | 07:14Z, HEAD 0f668aa, clean |
| Agent dry run `--commit` | Checkout matches; changed modules `cli`, `config`, `partner_notice`, `receipt_rules`, `receipt_run`, `review_cycle`, `review_proposal`; no unit change; catalogue 47; shipped through V15 |
| Config edit before the freeze | Backup `/root/config.json.pre-r177`; the three keys added with switches off; `check` ok |
| Agent freeze | 07:15:08Z; rollback dir `runtime-20261120T071508917027Z`; metadata sha256 5c4070f01ebc9f1fbee42ba2cbdcfb01b065bf471f713eedea8a7057150f0927 |
| `mw_agent` backup (writers paused) | 07:15:59Z to 07:17:25Z, PG18 tools through the loopback tunnel; dump `mw_agent-before-r177-v15.dump` sha256 b95c117c7399432d8615b95ee0c74b60bdc4319232188dc79cf42fb3db0e2d67; restored into a PG18 lab, 28 table fingerprints equal (269,900 rows); kept at `gs://mw-credit-operator-private-737787224638/promotion-packages/r177/` with its `.sha256` and `mw_agent-before-r177.json`, read back from the bucket |
| V15 | 07:17:58.06Z to 07:17:58.75Z as postgres with a temporary operator file (removed 07:19Z); only V15 applied (installed 07:17:58.67Z, sha256 6532e2e36c2b…); function SECURITY DEFINER, STABLE, owner `mw_agent_owner`, search_path pinned, EXECUTE for `mw_agent_owner` and `mw_agent_dashboard` only, CONNECT for `mw_agent_dashboard` and `mw_grafana_reader`; the dashboard role cannot select `runtime.receipt_jobs` |
| Install and activate | Units unchanged; activate 07:18:25Z; receiver ready, release R177, commit 0f668aa; 9 timers and paths resumed |
| Switches on (A, B) | `config-only-change.py apply --tag r177-switches`, config sha256 ff7c0162…; `check`: `receipt_arrears_auto_enabled` and `receipt_outgoing_ignore_enabled` true; recognizer and relay healthz R177; problems none; receipt cycle COMPLETED 07:19:20Z; no warnings since the freeze |
| Grafana apply | `build-dashboards --check`; plan 1 add, 5 change (sha256 186dd2e8…5920); apply 07:20:16Z to 07:20:29Z, 1 added, 5 changed, 0 destroyed; re-plan no changes |
| Datasource secret | `set_datasource_secret.py --datasource mw-agent-receipts --provisioning-version 1 --secret-version 1`: `--check` formatValid, then set; datasource version 2 |
| Readback | Datasource health OK; panel 34 61 Bangkok days from 21 September; panel 35 65% of 300 (30 days); 6 to 20 November 137/190 = 72.1%; dashboards `mw-agent` 20, `mw-now` 20, `mw-pwa` 20, `mw-infra` 18, `mw-cost` 24, all release R177; `mw-agent-questions` health OK |
| Tag | `R177` (annotated, object 19c40e63) on 0f668aa by the Release tag workflow |

Recovery: agent `deploy-runtime.py rollback --commit 5c5002f00c21b3e7687b9b16be5f70c1fd780b2b` with `/root/config.json.pre-r177`. V15 may stay (a read-only function) or have its CONNECT and EXECUTE revoked; the restore point is the `mw_agent` dump above. Grafana: a reviewed plan removing the datasource and panels.
