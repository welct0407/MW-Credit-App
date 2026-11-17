# Change notes — group chat summary run statistics (agent), 17 November 2026

## Purpose
R166, owner request of 17 November 2026: statistics on the performance of the chat summary agent in Grafana. The agent has to record what each run did so the collector can export it.

## Changes
- Catalogue revision 40 (`service-catalogue.json` revision and the `SERVICE_CATALOGUE.md` revision 40 paragraph). No service is added, removed or switched; no new setting, unit, timer, secret or identity.
- Each `group_chat_summary` run records its effect in `runtime.job_runs`. The `summary` holds `due`, `summarised`, `failed`, `deferred`, `outcomes` (`stored`, `unchanged`, `superseded`, `cleared`), `errors` (fixed code to count), `waits` (seconds from `changed_at` to finish) and `refresh` (`reported`, `pending`, `outcomes`, `seconds`), on every non-idle run including a failed run that exits 2; idle, already-running, dry-run and `--mark-all` runs write none, and the job-completed event carries it too. No conversation keys, ids or text. Counts and timings only: no chat text, no borrower data.
- No agent migration (agent V13 stays); the table already exists.
- The monitoring side (collector series, the `mw-agent` row 25, the alert rule) is in the [root note](../../Change%20Logs/CHANGE_NOTES_R166_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md).
- Code (Byte): `cli.py`, `group_chat_summary.py`, `service-catalogue.json` (revision 40), `scripts/deploy-runtime.py` (`R166_REVISIONS` = (39, 40)), and the tests `test_group_chat_summary.py`, `test_deploy_runtime.py`, `test_config.py` and `test_receipt_recognition.py`.
- Deployment (owner decision of 17 November 2026, "Clear it, then alert"): after the agent and collector deploy, the team clears the one PROD group that has failed with `GROUP_NOT_FOUND` for about 48 hours (13 attempts, in back-off) with the [clearing step](../docs/OPERATIONS.md#clearing-a-permanently-failing-group-summary-r166), then the dashboards and last the alert rule are applied. Record the key, code and time in the PROD record. Per-run audit records are under the service name `group-chat-summary` (with a hyphen); `runtime.job_runs.summary` has no effect key until this agent is deployed.
- Docs: `SERVICE_CATALOGUE.md`, `README.md`, `docs/OPERATIONS.md`.

## Checks
| Command | Result |
| --- | --- |
| `python -m unittest discover -s tests` (in `integration-agent/`, base `5d8d6783`, uncommitted tree) | 999 run; only `test_receipt_qr` fails on the import (zxingcpp missing in the container); the targeted suites pass (Byte) |
| `ruff check src tests` | Pass (Byte) |
| `npm run check:docs` | Pass, 0 failures (Dewey) |

## Not run
`test_receipt_qr` (zxingcpp missing in the container). Chase's verification of the whole batch passed with no defects (see the [root note](../../Change%20Logs/CHANGE_NOTES_R166_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md#checks)). No DEV agent exists, so the agent half is verified only in PROD after promotion.

## Recovery
Before deployment: revert the commit. After deployment: `deploy-runtime.py rollback --commit <previous>`; the dashboard row then shows no new data and the alert rule reads no data (KeepLast).

## Open questions
None.

## Remaining work
Byte's final field names, Chase's evidence, the PROD agent deploy with the R166 promotion and its record.

## PROD agent record (Forge, 17 November 2026 UTC)
Authority: the owner's PROD approval of 17 November 2026 and the decision "Clear it, then alert". The full promotion (collector, clearing, Grafana) is in the [root note](../../Change%20Logs/CHANGE_NOTES_R166_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md#prod-promotion-record-forge-17-november-2026-utc). Agent: `update-from-github` `907650de` to `2482808e1016bcddf0d27b9e45358b772dfc929b`, clean; only `cli.py` and `group_chat_summary.py` changed, no unit change; freeze `--release R166` 10:12:59Z, backup `runtime-20261117T101259203904Z` (metadata sha256 `9b21b107e7f43ae094ac504be94aa2f3d99cb2318ec0f0f08578b200f14dda2a`); install 10:13:02Z; activate 10:13:06Z to 10:13:10Z (probe `a877f87c-ea86-4208-92f5-e23a4327cb48`); `mw-chat-relay` restarted 10:13:20Z; no agent migration, so no `mw_agent` backup. `/ready` true at R166, catalogue revision 39 to 40, switches identical. Clearing at 10:19:34Z: `UPDATE 1`, key `9a3146a07f817fe27b0f892cde54150a`, code `GROUP_NOT_FOUND`. Rollback: `deploy-runtime.py rollback --commit 907650de…` and restart the relay. A `job_runs.summary.effect` record has not yet been observed (written only by a run with work).
