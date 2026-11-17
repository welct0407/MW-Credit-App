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

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- `test_receipt_qr` locally (`zxingcpp` missing in the container).
- No DEV agent exists, so the agent half (the 25 x 100 listing and the new latency) is verified only in PROD after promotion. No PWA, SQL, Cloud Run, Hosting or Grafana change, so those checks do not apply.

## Recovery
Revert the batch commit. After a PROD deploy, follow the agent change note: roll the agent back with `deploy-runtime.py rollback` and reinstall the saved timer.

## Open questions
None. The owner approved promotion on 17 November 2026: "once verified, promote R168 all the way to prod".

## Remaining work
Pull request CI, merge, PROD promotion (owner approved 17 November 2026) with Forge's agent deploy at revision 41 and the timer hand-install, read-back of marker-to-summary time, `effect.seconds` and `instagram_calls`, tag, closure.
