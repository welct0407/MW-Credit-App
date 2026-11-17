# Change notes — group chat refresh tap latency (R169), 17 November 2026

## Purpose
Owner request, 17 November 2026: "go ahead with all three, promote R169 to prod", after asking to make refresh taps faster and asking about cost and log volume. Integration agent only; PROD promotion is approved.

## Changes
- Baseline (first R168 tap run, PROD 15:52:37Z to 15:53:01Z): total 24.8 s; listing 5.8 s; groups 18.4 s (model 8.9 s, post 0.2 s); `instagram_calls` 2; tap to report 40 s, about 16 s of it waiting for the 1-minute timer. This is also the first non-idle run effect of R168 with `seconds` and `instagram_calls`.
- Design A: `history_since` gains `limit`; the summariser stops at 100 in-window messages (identical rows and digest); the poll is unchanged.
- Design B: a single-group node read was probed in PROD (Forge, read-only, once) and refused (HTTP 400, code 100, subcode 33, 0.59 s); a listing page of 25 x 100 took 7.94 s. `conversations()` therefore reads one small page first (`LIST_CONVERSATIONS_FIRST` 5), stops if every wanted group is on it, else runs the R168 pass (25 per page, early exit). Worst case: the R168 cost plus one small request.
- Design C: new `group-chat-refresh-watch` command (no job, heartbeat, audit or database row) every 15 s from `mw-group-chat-refresh-watch.timer` (`OnUnitInactiveSec=15s`, `AccuracySec=1s`) and `.service` (`LogLevelMax=notice`); an open request makes it touch `state/group-chat-refresh-wake`, and `mw-group-chat-refresh-wake.path` starts `mw-group-chat-summary.service`. Expected tap: about 12 to 20 s. Catalogue revision 42, services unchanged; `R169_REVISIONS` = (41, 42).
- Cost and logs (owner's questions): Cloud Run is request-billed with `cpu_idle` true; about 130,000 to 173,000 extra read-only GETs a month, under US$1. Empty checks write no audit, job or database row; only Cloud Run request log lines and journald grow, a few MB a day.
- Probe record: Forge's probe called the Instagram client's internal `_request` to avoid the per-call audit row, so the three probe reads have no audit row.
- Byte's deviations: `test_config_only_change.py` pins updated (the trigger list is built from the unit files); the watcher prints a status line only when it wakes (the journal drops it at `LogLevelMax=notice`).
- Promotion plan: Forge hand-installs the watcher `.service` and `.timer` before the deploy (disabled); the deploy installs the path; then `enable --now` of the path and timer. Rollback: `disable --now` of both.
- Read-back list for Forge at promotion: both new units active; `OnUnitInactiveUSec` 15s; no `job_runs` or audit rows from empty checks; journal at notice or above only; a tap starts a run within about 15 s and its effect shows `seconds` and `instagram_calls` (about 1 call and a listing of about 2 s expected).
- Code and tests (Byte, not edited here): `src/`, `tests/`, `systemd/`, `service-catalogue.json`, `scripts/deploy-runtime.py`.
- Docs: `SERVICE_CATALOGUE.md` (revision 42, row), `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md` (install order, read-back, rollback), `README.md`; the stale "source" and "in development" wording of R168 is now "live".

## Checks
| Command | Result |
| --- | --- |
| Byte: `PYTHONPATH=src:$PYTHONPATH python -m unittest discover -s tests` (in `integration-agent/`, base `dc7eb63`, uncommitted) | 1021 run, 76 skipped, 1 error: `test_receipt_qr` (`zxingcpp` is missing locally); not caused by this batch |
| Byte: `ruff check --no-cache .` (in `integration-agent/`) | Pass |
| Byte: PostgreSQL lab | Not run: no database path is touched |
| Chase: adversarial review and `test_group_chat_summary test_deploy_runtime test_conversation_poll test_cli test_systemd_units test_deploy_shared_receipt_api test_config_only_change` | Pass, no blocking defects. 264 OK; ruff pass. Reviewed: the `limit` path keeps every read page's validation and the poll's behaviour; `[:100]` equivalence; merge and `GROUP_NOT_FOUND`; the watcher writes only the wake file (`open('w')` gives `PathChanged`, as `mw-receipt-wake.path`) and no database, job, heartbeat or audit row, with its token from the metadata server and no cache write; a wake lost during a running summary is re-sent 15 s later; an open request re-wakes every 15 s until closed (unchanged groups make no model call). Minor, not fixed: `conversations()` with an empty `wanted` still makes the first request (never called that way). |
| `npm run check:docs` | 0 failures, 0 warnings (Chase, same tree) |
| The pull request's `Development checks` and integration-agent tests runs | PENDING: to be cited at closure |

## Not run
- The full Playwright and `mw-db-ci` suites: the pull request's CI is the one broad run.
- No DEV agent exists, so the agent half (the one-page listing, the 100-message stop and the watcher) is verified only in PROD after promotion.

## Recovery
Before deployment: none needed. After deployment: `systemctl disable --now mw-group-chat-refresh-wake.path mw-group-chat-refresh-watch.timer` (taps are then served by the 1-minute timer), then `deploy-runtime.py rollback --commit 605f334e64bfcbbc9d805034b59bfd4c614ba886` if the code must go back. The watcher writes no state, so nothing else needs undoing.

## Open questions
None. The owner approved promotion on 17 November 2026: "go ahead with all three, promote R169 to prod".

## Remaining work
Pull request CI, merge; PROD promotion with Forge's hand-install of the watcher `.service` and `.timer`, the agent deploy at revision 42, `enable --now` of the path and timer and the read-back; tag; closure.
