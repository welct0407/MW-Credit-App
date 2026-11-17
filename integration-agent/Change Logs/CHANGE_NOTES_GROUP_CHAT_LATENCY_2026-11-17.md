# Change notes — group chat summary latency (R168), 17 November 2026

## Purpose
Owner request, 17 November 2026: "go ahead with items 2 and 3, and item 1 follow your recommendation of 3 mins quiet rule. engage the team to work on this." PROD metrics of R166 (17 November, about 10:13 to 12:21Z) showed a new message taking 11 to 14 minutes to reach the card. This batch cuts that wait. Development only; PROD promotion was approved by the owner on 17 November 2026 once verified.

## Changes
- Baseline (R166 PROD metrics): a run with one group took 11 to 30 s, of which the model call took 4 to 9 s; groups waited 623 to 626 s from marker to summary; one refresh tap took 107 s from tap to run start (`refresh.seconds` measures to the run start, corrected in R170). About 90% of the end-to-end time was the fixed 10-minute wait, because `QUIET_SECONDS` and `MAX_WAIT_SECONDS` were both 600 and the quiet rule never applied.
- Decision 1 (owner: 3-minute quiet rule): `QUIET_SECONDS` 600 to 180, `MAX_WAIT_SECONDS` stays 600. A group is due 3 minutes after its newest substantive text or 10 minutes after `changed_at`, whichever comes first. A chat that pauses gets more model calls (owner's choice).
- Decision 2: `systemd/mw-group-chat-summary.timer` `OnUnitInactiveSec` 2min to 1min. The deploy helper installs no timer files, so Forge installs the timer by hand and runs `systemctl daemon-reload` at promotion (`docs/OPERATIONS.md`).
- Decision 3a: `conversations()` stops paging once every selected group is found. A missing id still pages to the end and fails as `GROUP_NOT_FOUND`.
- Decision 3b: the summariser's own listing uses `LIST_CONVERSATIONS` 25 per page and `LIST_MESSAGES` 100 per conversation, so one pass usually covers the 3-day window and `history_page` is rarely needed. `conversation_poll` is unchanged. Unproven until PROD: a refusal of the 25 x 100 query shape fails the selected groups into the normal back-off.
- Decision 3c: `runtime.job_runs.summary.effect` adds `seconds` (`listing`, `groups`, `model`, `post`; run totals) and `instagram_calls`. No collector or dashboard change.
- Decision 4: catalogue revision 41, services unchanged; `deploy-runtime.py` `R168_REVISIONS` = (40, 41).
- Code and tests (Byte, not edited here): `src/`, `tests/`, `systemd/mw-group-chat-summary.timer`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Byte's deviations: the `groups` seconds include each group's model and post time; `run_effect` gives zeros when absent; two run-budget tests moved to a fake clock.
- Docs: `SERVICE_CATALOGUE.md` (revision 41 paragraph, `group_chat_summary` row), `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md` (timer hand-install, read-back, rollback), `README.md`.
- Carry-overs left stale on purpose: the comment "every 2 minutes" in `apps/pwa/src/chat-refresh.ts` (its 6-minute cutoff still holds; R168 stays agent-only); the comment in `debian-health.py` and the `mw-agent.json` description "every 2" (the stale 600 s, backlog 1,200 s and target 10 minutes there are still correct). The R165 and R146 history paragraphs keep the 2-minute and 10-minute wording of their time.

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
| PROD promotion and read-back | Pass: see the PROD deployment record below |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- `test_receipt_qr` locally (`zxingcpp` missing in the container).
- No DEV agent exists, so the agent half (the 25 x 100 listing and the new latency) is verified only in PROD after promotion. No PWA, SQL, Cloud Run, Hosting or Grafana change, so those checks do not apply.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime, then reinstall the saved timer `/root/mw-group-chat-summary.timer.pre-r168`, `systemctl daemon-reload` and restart the timer. Markers and summaries are not changed by the rollback.

## Open questions
None. The owner approved promotion on 17 November 2026: "once verified, promote R168 all the way to prod".

## Remaining work
Owner acceptance; read the first non-idle run's `effect` (`seconds`, `instagram_calls`) and the marker-to-summary time. Everything else (pull request CI, merge, PROD promotion, tag, closure) is done.

## PROD deployment record (Forge, 17 November 2026 UTC)
Authority: owner, 17 November 2026, "once verified, promote R168 all the way to prod". Package `main` `605f334e64bfcbbc9d805034b59bfd4c614ba886` (PR #347; tree identical to the tested head `3af32d2`), from R166 `2482808e`. Host `vm-mw-credit-agent` (project `clever-oasis-508610-n7`). No agent migration, setting, secret or switch change.

| Step | Result |
| --- | --- |
| Deploy | `update-from-github` to `605f334e`, clean; dry-run: only `group_chat_summary.py` differs, no service unit change; schema applied through V13. Temporary root-only operator file `/root/r168-op` 14:04:08Z to 14:04:35Z (shredded). Freeze `--release R168` 14:04:25Z (backup `runtime-20261117T140425969401Z`, metadata sha256 `328bc798a13462421bd8b159e8df3748b5370d1830b8ed7bcf1ec0f37bfaf3b7`); install to 14:04:31Z; activate to 14:04:35Z (probe `9538a0c3-2f78-4006-a93c-694a356bd5f3`); `mw-chat-relay` restarted 14:04:45Z |
| Read-back | `/ready` true at R168 `605f334e`; recognizer and relay `/healthz` R168; catalogue 40 to 41 |
| Timer | Saved `/root/mw-group-chat-summary.timer.pre-r168` (sha256 `43b6973f…`, equal to the R166 repository file); installed `systemd/mw-group-chat-summary.timer` 14:04:58Z (root 0644, sha256 `9708c808…`); `systemd-analyze verify` ok; `daemon-reload`; restarted 14:04:59Z; `OnUnitInactiveUSec=1min`; runs at about one-minute intervals |
| Verification | Runs to 14:09Z idle (0 waiting), exit 0; no error- or warning-level `mw-*` journal lines (only the pre-existing `systemd-ssh-generator` AF_VSOCK lines at `daemon-reload`); collector run 14:05:44Z exported with `code_version_match` 1 and `group_chat_summary` health 1 |
| Effect | The first non-idle `job_runs.summary.effect` with `seconds` and `instagram_calls`: not yet observed (no group became due; nothing was forced). Marker-to-summary time is to be read from the first runs with work |

Rollback: `deploy-runtime.py rollback --commit 2482808e1016bcddf0d27b9e45358b772dfc929b`, restart `mw-chat-relay`, reinstall `/root/mw-group-chat-summary.timer.pre-r168` (root 0644), `systemctl daemon-reload`, restart the timer. Full record: the [root R168 change note](../../Change%20Logs/CHANGE_NOTES_R168_GROUP_CHAT_LATENCY_2026-11-17.md#prod-promotion-record-forge-17-november-2026-utc).

Tag record: `R168` on `605f334e64bfcbbc9d805034b59bfd4c614ba886`, created by Release tag run 44100194834 (success, 14:10Z), which also published the GitHub Release.

Component versions at this release (`component-versions.mjs derive --release R168 --commit R168`): the integration agent changed in R168 (revision 41); every other component keeps its earlier release (PWA, read, command, chat and schema R165; notify and jobs R159; Grafana dashboards R167; Metabase reports R144).

Drift after the tag: re-run by Dewey with public facts only (`node scripts/promotion/component-versions.mjs drift --env all`): drift 0, unverified 11 (every credentialed fact: schema, notify, jobs, agent, Grafana dashboards, Metabase reports and PostgreSQL, as no observed file was supplied); the public PWA, read, command and chat builds match R165. Forge's pre-tag run with the credentialed facts gave drift 1, the PROD agent at R168 against the last tag's R166, which the tag clears; its unverified schema, Grafana and Metabase are untouched by R168. The credentialed run was not repeated after the tag.

Not yet observed: the first non-idle run's `job_runs.summary.effect` with `seconds` and `instagram_calls`, and the new marker-to-summary time (all runs were idle up to 14:10Z). Owner acceptance is pending.

Closure: the tag exists; the freeze pin, this record, the tag record and the prune are published in the R168 closure pull request. Pruned (outside the window of Open plus the three newest Released releases): the R165 change notes `Change Logs/CHANGE_NOTES_R165_GROUP_CHAT_REFRESH_2026-11-16.md` and `integration-agent/Change Logs/CHANGE_NOTES_GROUP_CHAT_REFRESH_2026-11-16.md`; their links now point to commit `605f334e`.
