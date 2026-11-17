# Change notes — group chat summary run statistics (agent), 17 November 2026

## Purpose
R166, owner request of 17 November 2026: statistics on the performance of the chat summary agent in Grafana. The agent has to record what each run did so the collector can export it.

## Changes
- Catalogue revision 40 (`service-catalogue.json` revision and the `SERVICE_CATALOGUE.md` revision 40 paragraph). No service is added, removed or switched; no new setting, unit, timer, secret or identity.
- Each `group_chat_summary` run records its effect in `runtime.job_runs`. The `summary` holds `due`, `summarised`, `failed`, `deferred`, `outcomes` (`stored`, `unchanged`, `superseded`, `cleared`), `errors` (fixed code to count), `waits` (seconds from `changed_at` to finish) and `refresh` (`reported`, `pending`, `outcomes`, `seconds`), on every non-idle run including a failed run that exits 2; idle, already-running, dry-run and `--mark-all` runs write none, and the job-completed event carries it too. No conversation keys, ids or text. Counts and timings only: no chat text, no borrower data.
- No agent migration (agent V13 stays); the table already exists.
- The monitoring side (collector series, the `mw-agent` row 25, the alert rule) is in the [root note](../../Change%20Logs/CHANGE_NOTES_R166_GROUP_CHAT_SUMMARY_MONITORING_2026-11-17.md).
- Code (Byte): `cli.py`, `group_chat_summary.py`, `service-catalogue.json` (revision 40), `scripts/deploy-runtime.py` (`R166_REVISIONS` = (39, 40)), and the tests `test_group_chat_summary.py`, `test_deploy_runtime.py`, `test_config.py` and `test_receipt_recognition.py`.
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
