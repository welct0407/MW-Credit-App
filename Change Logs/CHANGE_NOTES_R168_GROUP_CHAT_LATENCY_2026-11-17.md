# Change notes — R168 group chat summary latency, 17 November 2026

## Purpose
Owner request, 17 November 2026: cut the wait before a group chat summary appears (items 2 and 3 as proposed, and a 3-minute quiet rule for item 1). Integration agent only; the detail is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_GROUP_CHAT_LATENCY_2026-11-17.md). Development only; PROD promotion was approved by the owner on 17 November 2026 once verified.

## Changes
- Measured baseline (R166 PROD, 17 November about 10:13 to 12:21Z): marker to summary 623 to 626 s; one-group runs 11 to 30 s (model call 4 to 9 s); one refresh tap 107 s; new message to card 11 to 14 minutes, about 90% of it the fixed 10-minute wait (quiet period equal to the maximum wait).
- Decisions: quiet period 600 to 180 s with the 600 s maximum wait kept; timer every minute (hand-installed at promotion); the summariser listing stops paging once its selected groups are found and reads 25 conversations by 100 messages per page; `job_runs.summary.effect` gains `seconds` and `instagram_calls`; catalogue revision 41.
- Docs: `integration-agent/SERVICE_CATALOGUE.md`, `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/docs/OPERATIONS.md`, `integration-agent/README.md`, `project/Documents/Resource_Monitoring.md` (new effect fields), `project/Documents/Resource_Monitoring_Dashboard_Guide.md` (timer cadence), `project/Documents/Solution_Design.md` (run cadence), `project/Documents/Release_Tracker.md` (R168 scope, Open) and `project/Documents/Development_Changes.md`.
- Carry-overs left stale on purpose: the "every 2 minutes" comment in `apps/pwa/src/chat-refresh.ts` (the 6-minute cutoff still holds; no PWA change), and the 600 s, 1,200 s and 10-minute values in `debian-health.py` and `mw-agent.json`, which are still correct.

## Checks
| Command | Result |
| --- | --- |
| Byte: `PYTHONPATH=src python -m unittest discover -s tests` (in `integration-agent/`) | 1010 run, 76 skipped, 1 error: `test_receipt_qr` (`zxingcpp` is missing in the container); not caused by this batch |
| Byte: `ruff check --no-cache .` (in `integration-agent/`) | Pass (ruff 0.16.9 locally; CI pins 0.16.8) |
| Byte: PostgreSQL lab (`tests/lab/setup.sh`): `test_postgres_state`, `test_state_migration_postgres`, `test_audit_retention_postgres` | 68 OK, 23 skipped. `due()` is covered on SQLite only. |
| Chase: adversarial review of the diff; `test_group_chat_summary test_deploy_runtime test_conversation_poll test_config` | Verdict pass, no defects (early exit, `CountingApi` forwarding, `timed()` re-raise, effect holds no keys, ids or text, forced refresh unchanged, 25 x 100 query string matches the poll's format, R168 deploy check mirrors R166). 200 run, 199 pass, 1 error: `psycopg` missing in the sandbox for a `test_config` password-projector test, covered by Byte's PostgreSQL lab. Full suite, ruff and lab results are Byte's. |
| `npm run check:docs` | 0 failures, 0 warnings (same tree) |
| `Development checks` run 44098327293 and integration-agent tests run 44098327219 on the tested head `3af32d2` | Success (PR #347; merged as `605f334e`, tree identical) |
| Release tag | `R168` on `605f334e` (Release tag run 44100194834) |
| `Development checks` run 44098327293 and integration-agent tests run 44098327219 | Success; the package `main` `605f334e` (PR #347) has the same tree as the tested head `3af32d2` (`0e7a9297`) |
| PROD promotion and read-back | Pass: see the PROD promotion record below |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- `test_receipt_qr` locally (`zxingcpp` missing in the container).
- No DEV agent exists, so the agent half (the 25 x 100 listing and the new latency) is verified only in PROD after promotion. No PWA, SQL, Cloud Run, Hosting or Grafana change, so those checks do not apply.

## Recovery
Revert the batch commit. After a PROD deploy, follow the agent change note: roll the agent back with `deploy-runtime.py rollback` and reinstall the saved timer.

## Open questions
None. The owner approved promotion on 17 November 2026: "once verified, promote R168 all the way to prod".

## Remaining work
Owner acceptance; read the first non-idle run's `effect` (`seconds`, `instagram_calls`) and the marker-to-summary time. Everything else (pull request CI, merge, PROD promotion, tag, closure) is done.

## PROD promotion record (Forge, 17 November 2026 UTC)
Authority: the owner's approval of 17 November 2026, "once verified, promote R168 all the way to prod". Package `main` `605f334e64bfcbbc9d805034b59bfd4c614ba886` (merge of PR #347; tree `0e7a9297` identical to the tested head `3af32d2`). Baseline R166 `2482808e`. Target `vm-mw-credit-agent` (project `clever-oasis-508610-n7`, zone `asia-southeast1-a`), state database `mw_agent` on `mw-credit-pg-20261017`. Integration agent only: no SQL, no agent migration, no Cloud Run, Hosting, Terraform, IAM, Grafana, collector or secret change.

| Step | Result |
| --- | --- |
| CI | `Development checks` 44098327293 and the agent tests 44098327219, both success |
| Baseline (14:00Z) | `/ready` true at R166 `2482808e` (started 10:13:08Z), catalogue 40; checkout `main` `2482808e`, clean; live timer `OnUnitInactiveSec=2min` (sha256 `43b6973f…`, identical to the R166 repository file), runs about every 2 minutes; `runtime.group_chat_summary_state` 39 rows, 0 waiting, none in back-off; 24 runs in 24 hours, 4 with an effect (keys without `seconds` or `instagram_calls`) |
| Agent | `update-from-github` `2482808e` to `605f334e`, clean; dry-run: only `group_chat_summary.py` differs, no service unit change, ancestry ancestor; schema check with the operator file: applied through V13, nothing missing or drifted. Temporary root-only `/root/r168-op` (`postgres` through the 5432 proxy to `mw-credit-pg-20261017`, password on stdin from Secret Manager, never printed) created 14:04:08Z, shredded 14:04:35Z. Freeze `--release R168` 14:04:25Z to 14:04:26Z, backup `runtime-20261117T140425969401Z` (metadata sha256 `328bc798a13462421bd8b159e8df3748b5370d1830b8ed7bcf1ec0f37bfaf3b7`); install to 14:04:31Z (no unit changed or removed); activate to 14:04:35Z, probe `9538a0c3-2f78-4006-a93c-694a356bd5f3`, receiver restarted 14:04:32Z, recognizer 14:04:34Z, all seven triggers resumed; `mw-chat-relay` restarted 14:04:45Z. `/ready` true at R168 `605f334e` (started 14:04:33Z); recognizer (8790) and relay (8791) `/healthz` R168 `605f334e`; catalogue 40 to 41; config `code_release` R168 |
| Timer | Live file saved as `/root/mw-group-chat-summary.timer.pre-r168` (root 0644, sha256 `43b6973f79058e0f3cfc2b7aa2de2837f5ea8f04a2a1b57c2a6fed86d8629203`, equal to the R166 repository file); package file installed 14:04:58Z (root:root 0644, sha256 `9708c8081e7fa54f6a72cedb22fa4d541561de5953c60453ec357526dc9da484`); `systemd-analyze verify` ok; `daemon-reload`; timer restarted 14:04:59Z; `TimersMonotonic` `OnUnitInactiveUSec=1min`, `NeedDaemonReload=no`; `list-timers` and the journal show runs at about one-minute intervals (14:05:48Z, 14:06:58Z, 14:09:04Z) |
| Verification | All summary runs to 14:09Z idle (0 waiting, no chat activity), exit 0; no error- or warning-level journal lines from any `mw-*` unit; the only error-level lines are `systemd-ssh-generator` AF_VSOCK messages at each `daemon-reload`, host noise that also appeared 3 times between 10:00Z and 14:04Z. Collector run 14:05:44Z exported (`webhook_code_version` `605f334e`, `code_version_match` 1, health `group_chat_summary` 1, waiting 0, oldest wait -1, back-off 0) |
| First non-idle effect | Not yet observed (no group became due in the session; no run or refresh was forced). Read it at the first non-idle run: `runtime.job_runs.summary->'effect'` should carry `seconds` and `instagram_calls` |

Drift (Forge, read-only, before the tag): `node scripts/promotion/component-versions.mjs drift --env all --observed <private drift-observed.json> --strict` reported drift 1 and unverified 4 (exit 1). The drift is the expected one: PROD agent observed R168 `605f334e` (catalogue 41) against the last tag's R166; it matches once `R168` is tagged. Freshly observed: notify R159 `5b887d09` in DEV and PROD (`/health` with an identity token); jobs R159 (its `/health` path returns 404, so it was recorded as R159 `5b887d09` because it runs the same image digest as notify in each environment); PostgreSQL `POSTGRES_18`. Unverified: schema (DEV and PROD), Grafana dashboards and Metabase reports, because no credentialed read was made; R168 changes none of them. Matches: DEV and PROD PWA, read, command and chat R165, notify and jobs R159.

Rollback (if needed): `sudo python3 integration-agent/scripts/deploy-runtime.py rollback --commit 2482808e1016bcddf0d27b9e45358b772dfc929b` (may need the same temporary operator file), restart `mw-chat-relay`, then `install -m 0644 -o root -g root /root/mw-group-chat-summary.timer.pre-r168 /etc/systemd/system/mw-group-chat-summary.timer`, `systemctl daemon-reload` and `systemctl restart mw-group-chat-summary.timer`.

Private evidence: `gs://mw-credit-operator-private-737787224638/promotion-packages/r168/` (5 objects: the three phase outputs, the observed facts and the drift output).

Tag record: `R168` on `605f334e64bfcbbc9d805034b59bfd4c614ba886`, created by Release tag run 44100194834 (success, 14:10Z), which also published the GitHub Release.

Component versions at this release (`component-versions.mjs derive --release R168 --commit R168`): the integration agent changed in R168 (revision 41); every other component keeps its earlier release (PWA, read, command, chat and schema R165; notify and jobs R159; Grafana dashboards R167; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact: schema, notify, jobs, agent, Grafana dashboards, Metabase reports and PostgreSQL, as no observed file was supplied); the public PWA, read, command and chat builds match R165. Forge's pre-tag run with the credentialed facts gave drift 1, the PROD agent at R168 against the last tag's R166, which the tag clears; its unverified schema, Grafana and Metabase are untouched by R168. The credentialed run was not repeated after the tag.

Not yet observed: the first non-idle run's `job_runs.summary.effect` with `seconds` and `instagram_calls`, and the new marker-to-summary time (all runs were idle up to 14:10Z). Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R168 closure pull request. Pruned (outside the window of Open plus the three newest Released releases): the R165 change notes `Change Logs/CHANGE_NOTES_R165_GROUP_CHAT_REFRESH_2026-11-16.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_REFRESH_2026-11-16.md`; their links now point to commit `605f334e`.
