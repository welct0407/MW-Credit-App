# Change notes — result notices to an opted-out Partner, 22 October 2026

## Purpose
The Grafana Now dashboard (R089) showed "6 · Notify · failed" at 5. Three of the five were review results (STALE 14 October, REJECTED 17 October, MANUAL_REQUIRED 21 October) for a Partner whose IG integration was switched off from about 10 to 21 October. The other two are the 2 October POSTED result that reached neither Partner (Instagram route unavailable, email rejected, three attempts). The owner asked for the opted-out cause to be fixed.

## Changes
- Cause: `review_cycle.notify()` skipped opted-out Partners only for POSTED results, so REJECTED, MANUAL_REQUIRED, STALE, EXPIRED and UNKNOWN results were reserved for them. `partner_notice.dispatch()` then refused the send in `eligible()` ("Partner is not currently opted in") and held the row as `REVIEW` / `IG_PREFLIGHT_FAILED`, which `receipt_health` counted as a failed delivery and never cleared. A read-only check on `vm-mw-credit-agent` confirmed that the three rows' stored Partner snapshot had `enabled` false and that the current row is opted in again. No message, retry or write was made.
- `review_cycle.notify()`: no result of any state is reserved for an opted-out Partner, and a reserved result whose Partner is opted out at dispatch is held as `PARTNER_DISABLED` for every state (previously POSTED only). Holding instead of emailing stays deliberate: an opted-out Partner gets neither Instagram nor email (`docs/RECEIPTS.md`, `tests/test_partner_notice.py::test_email_requires_provider_window_evidence`).
- `receipt_health`: `failed_notifications` also excludes a result held as `IG_PREFLIGHT_FAILED` whose stored Partner snapshot is opted out, so the three existing rows stop counting without editing them. `inspect()` reads the `partner` snapshot for this; only counts leave the VM.
- Tests: `test_review_cycle` gains the no-result-for-opted-out-Partner case for every non-POSTED state and the opted-out-at-dispatch case; `test_receipt_health` gains opted-out, opted-in and unreadable-snapshot cases.
- Owner decision (same day): acknowledge the two 2 October POSTED notices and stop counting them. Both were already acknowledged on 2 October 2026 09:25:53Z (`ACKNOWLEDGED_UNDELIVERED`, operations `1394a205…` and `7517abd5…`), so no new acknowledgement is written. `receipt_health.inspect()` reads `optional_notification_acknowledged` events from `audit.events` on a direct worker connection in a read-only transaction (the state adapter serves only `runtime` tables; a first version read through it and was refused with `STATE_TABLE_NOT_ALLOWED`, caught before deploy); on a read failure it keeps counting. `failed_notifications` skips acknowledged notices. Tests cover the skip, the read-only worker transaction, a read failure, SQLite and that `inspect()` does not read audit through the adapter.
- Owner decision (same day), no catch-up: `notify()` reserves a result in the run that reaches it, or on a later run only while no notice for that result exists yet (crash recovery). A Partner opted in again later no longer receives every POSTED (or other) result decided while opted out; previously 76 such results went to the re-enabled Partner on 21 October. Known limit: if every Partner was opted out when a result was reached, the first Partner opted in afterwards still receives it. Tests: a Partner opted in later gets no earlier result; a result with no notice yet is still reserved on a later run.
- Docs: `docs/RECEIPTS.md` (failed-count rule, acknowledgement, no catch-up) and `docs/MONITORING_IMPLEMENTATION_HANDOVER.md` (`failed_notifications` row).

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_review_cycle tests.test_receipt_health tests.test_partner_notice tests.test_hold_reply` (in `integration-agent/`) | 109 tests OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 2 failures and 27 errors, all present on the unchanged tree in this cloud session (no `psycopg`, PostgreSQL lab suites, and `test_claude_conversation` / `test_server` failing the same way before the change) |
| `ruff check --no-cache` on the four changed files | Clean |
| `deploy-runtime.py` on `vm-mw-credit-agent` (owner go in session), from `/opt/mw-integration-agent-src` detached at `1d02af8` (previously `6ea1540`, an ancestor) | dry-run 12:54:09Z: agent schema through V8, only `receipt_health.py` and `review_cycle.py` change, 9 units unchanged; freeze 12:54:23Z, backup `runtime-20261022T125423416236Z` (metadata sha256 `bbc97e9a…5059`); install 12:54:24Z; activate 12:54:30–34Z, probe `976af0b7-…` |
| Receiver and recognizer after activate | Receiver InvocationID `702885bf…` → `d2b81907…`, `/ready` `code_version` `1d02af8`, `failed: []`; recognizer `65e63543…` → `6e382bed…`, `/healthz` `{"status":"ok","enabled":true}`; 0 failed units, 8 timers and both wake paths active |
| Receipt cycle after deploy | 12:54:42Z and the next run: `failures: []`, `notification_failures: []` |
| `receipt_health.inspect()` and the collector | `failed_notifications` 5 → 2; collector exported 2 at 12:55:06Z (5 until 12:52:55Z) |
| Acknowledgement rule `9d30d60`: read-only pre-check on the VM, then `deploy-runtime.py` | Pre-check: `acknowledged(config)` returned both 2 October notices, `inspect()` 0. Dry-run 13:07:21Z (only `receipt_health.py`), freeze 13:07:22Z backup `runtime-20261022T130722225055Z` (metadata sha256 `be0df72e…8ce1`), activate 13:07:26–31Z probe `c6188244-…`; receiver `7eb71b83…` `/ready` `9d30d60`, recognizer `7193ac49…` `/healthz` ok; receipt cycle 13:07:38Z clean |
| `failed_notifications` after the acknowledgement rule | `inspect()` 0, `notification_status` 1; collector 2 through 13:06:10Z, 0 at 13:08:20Z |
| No-catch-up rule `d444d67`: read-only adapter check, then `deploy-runtime.py` | The new lookup runs through the PostgreSQL state adapter as `SELECT 1 FROM runtime.partner_notices WHERE stream='receipt' AND event_key=%s LIMIT 1` (row for an existing event, none for a made-up one). Dry-run 13:27:01Z (only `review_cycle.py`), freeze 13:27:02Z backup `runtime-20261022T132702444836Z` (metadata sha256 `97780d17…493c`), activate 13:27:07–12Z probe `38110fef-…`; receiver `80c3a603…` `/ready` `d444d67`, recognizer `d5e08326…` `/healthz` ok; receipt cycle 13:27:25Z clean; `failed_notifications` 0 |

## Not run
- The pull request's CI checks.

## Recovery
`deploy-runtime.py rollback --commit d444d67…` restores `9d30d60` from `runtime-20261022T132702444836Z`, `rollback --commit 9d30d60…` restores `1d02af8` from `runtime-20261022T130722225055Z`, and `rollback --commit 1d02af8…` restores `6ea1540` from `runtime-20261022T125423416236Z`; or revert this commit and redeploy. The previous rule reserves non-POSTED results for opted-out Partners again and counts them. The install and activate steps used a short-lived `codex-cloud` IAM database sign-in file in root-only tmpfs `/run/mw-op/`, shredded at 12:54:46Z, because the agent's own identity cannot read the agent schema history.

## Open questions
None.

## Remaining work
- The VM checkout is detached at `d444d67`, which is on branch `claude/vigilant-allen-kfzogm` only; merge it to `main` with a merge commit (not squash) so `update-from-github.sh` can fast-forward next time.
