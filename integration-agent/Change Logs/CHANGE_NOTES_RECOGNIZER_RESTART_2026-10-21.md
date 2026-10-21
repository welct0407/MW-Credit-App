# Change notes — receipt recognizer restarted by the runtime deploy, 21 October 2026

## Purpose
Partner slip recognition in PROD answered "unavailable" for every slip from the R084 catalogue change (about 12:00Z, 21 October 2026) until 13:17:58Z. A partner tried the same 100 baht slip for one borrower twice. This batch records the incident and its live fix. It also changes the deploy engine so a code deploy cannot leave the recognizer on old code again.

## Changes
- Cause: `mw-receipt-recognition.service` had been running since 19 October 2026 19:43Z on `55964c7`, because `deploy-runtime.py` restarted only `mw-instagram-webhook`. The recognizer re-reads config and catalogue on every request but keeps the package it started with. R084 added the catalogue services `claude_partner_conversation`, `gemini_partner_conversation` and `conversation_sql_read`, which the old `validate_catalogue` rejects as unknown. Each request therefore failed with 503 `disabled`, cause `config_invalid:ConfigurationError`, and the command API returned "unavailable" in about 0.7 s. The last success was at 09:57Z; five partner attempts failed between 13:11Z and 13:13Z. Recognition never writes, so no business data changed.
- Live fix (owner go in session): `systemctl restart mw-receipt-recognition.service` at 13:17:58Z, 12 s after the R085 activation (13:17:46Z), so the recognizer runs the deployed R085 commit. `/healthz` then returned `{"status":"ok","enabled":true}`. No config, catalogue or package change.
- `scripts/deploy-shared-receipt-api.py` (the engine of `deploy-runtime.py`): new `RECOGNIZER` and `restart_recognizer()`. `activate`, after the receiver is ready, restarts the recognizer when it is running, requires a new InvocationID and waits up to 30 s for `/healthz` to report the `enabled` state that the new config and catalogue give. A failure rolls back automatically with timers stopped. `rollback` does the same against the backed-up files. A stopped (installed-disabled) recognizer stays stopped. `dry-run` reports the recognizer InvocationID and state. `invocation()` takes a unit.
- `tests/test_deploy_shared_receipt_api.py`: the host fake gains a recognizer whose health judges the live files, and a "stale" mode that rejects the newly activated files as tonight's process did. There are five new tests (stopped stays stopped; running restarts before the timers resume; disabled by the files is accepted; stale rejection rolls back with timers stopped; manual rollback restarts it) and a dry-run assertion.
- `docs/OPERATIONS.md`: the `activate` and rollback steps, and the config-only route, now include the recognizer restart and health check.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest tests.test_deploy_shared_receipt_api tests.test_deploy_runtime` (in `integration-agent/`) | 46 tests OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 746 tests OK, 97 skipped (lab suites) |
| `ruff check --no-cache integration-agent` | Clean |
| `npm run check:docs` | 0 failures, 0 warnings |
| The two deploy test modules against the previous engine | 6 of the new or changed tests fail (2 failures, 4 errors), including the stale-rejection case |
| `journalctl -u mw-receipt-recognition.service` on `vm-mw-credit-agent` | 503 `config_invalid:ConfigurationError` from 13:11:43Z to 13:13:40Z; the last success, `recognized`, at 09:57:40Z |
| `curl http://10.148.0.2:8790/healthz` after the restart | `{"status":"ok","enabled":true}` |

## Not run
- The pull request's CI checks (not opened yet).
- The engine change first ran on the VM at the R086 agent deploy (see Remaining work).
- No real slip has been recognized since the restart; the partner's re-upload is the first.

## Recovery
Revert this batch's commit; the previous engine restarts only the receiver. After any deploy run with the previous engine, restart `mw-receipt-recognition.service` by hand and check `/healthz`.

## Open questions
None.

## Remaining work
Done. The R086 agent deploy (21 October 2026, 15:12Z) was the first to restart the recognizer with this engine, and `/healthz` was ok ([record](../../Change%20Logs/CHANGE_NOTES_R086_WAKE_AND_LOAN_CLOSE_FIX_2026-10-21.md)). The R087 deploy did the same at 16:35:53Z with a new InvocationID (`1ae31900…` to `f6ac10d8…`) and `/healthz` enabled ([record](../../Change%20Logs/CHANGE_NOTES_R087_SLIP_ACCOUNT_NUMBERS_2026-10-21.md#promotion-record)). None.
