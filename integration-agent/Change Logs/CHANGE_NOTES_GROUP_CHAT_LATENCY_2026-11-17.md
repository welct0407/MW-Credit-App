# Change notes — group chat summary latency (R168), 17 November 2026

## Purpose
Owner request, 17 November 2026: "go ahead with items 2 and 3, and item 1 follow your recommendation of 3 mins quiet rule. engage the team to work on this." PROD metrics of R166 (17 November, about 10:13 to 12:21Z) showed a new message taking 11 to 14 minutes to reach the card. This batch cuts that wait. Development only; PROD promotion was approved by the owner on 17 November 2026 once verified.

## Changes
- Baseline (R166 PROD metrics): a run with one group took 11 to 30 s, of which the model call took 4 to 9 s; groups waited 623 to 626 s from marker to summary; one refresh tap took 107 s from tap to report. About 90% of the end-to-end time was the fixed 10-minute wait, because `QUIET_SECONDS` and `MAX_WAIT_SECONDS` were both 600 and the quiet rule never applied.
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

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- `test_receipt_qr` locally (`zxingcpp` missing in the container).
- No DEV agent exists, so the agent half (the 25 x 100 listing and the new latency) is verified only in PROD after promotion. No PWA, SQL, Cloud Run, Hosting or Grafana change, so those checks do not apply.

## Recovery
Before deployment: none needed. After deployment: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime, then reinstall the saved timer `/root/mw-group-chat-summary.timer.pre-r168`, `systemctl daemon-reload` and restart the timer. Markers and summaries are not changed by the rollback.

## Open questions
None. The owner approved promotion on 17 November 2026: "once verified, promote R168 all the way to prod".

## Remaining work
Pull request CI, merge, PROD promotion (owner approved 17 November 2026) with Forge's agent deploy at revision 41 and the timer hand-install, read-back of marker-to-summary time, `effect.seconds` and `instagram_calls`, tag, closure.
