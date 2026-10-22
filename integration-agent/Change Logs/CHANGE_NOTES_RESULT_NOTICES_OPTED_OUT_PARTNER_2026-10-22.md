# Change notes — result notices to an opted-out Partner, 22 October 2026

## Purpose
The Grafana Now dashboard (R089) showed "6 · Notify · failed" at 5. Three of the five were review results (STALE 14 October, REJECTED 17 October, MANUAL_REQUIRED 21 October) for a Partner whose IG integration was switched off from about 10 to 21 October. The other two are the 2 October POSTED result that reached neither Partner (Instagram route unavailable, email rejected, three attempts). The owner asked for the opted-out cause to be fixed.

## Changes
- Cause: `review_cycle.notify()` skipped opted-out Partners only for POSTED results, so REJECTED, MANUAL_REQUIRED, STALE, EXPIRED and UNKNOWN results were reserved for them. `partner_notice.dispatch()` then refused the send in `eligible()` ("Partner is not currently opted in") and held the row as `REVIEW` / `IG_PREFLIGHT_FAILED`, which `receipt_health` counted as a failed delivery and never cleared. A read-only check on `vm-mw-credit-agent` confirmed that the three rows' stored Partner snapshot had `enabled` false and that the current row is opted in again. No message, retry or write was made.
- `review_cycle.notify()`: no result of any state is reserved for an opted-out Partner, and a reserved result whose Partner is opted out at dispatch is held as `PARTNER_DISABLED` for every state (previously POSTED only). Holding instead of emailing stays deliberate: an opted-out Partner gets neither Instagram nor email (`docs/RECEIPTS.md`, `tests/test_partner_notice.py::test_email_requires_provider_window_evidence`).
- `receipt_health`: `failed_notifications` also excludes a result held as `IG_PREFLIGHT_FAILED` whose stored Partner snapshot is opted out, so the three existing rows stop counting without editing them. `inspect()` reads the `partner` snapshot for this; only counts leave the VM.
- Tests: `test_review_cycle` gains the no-result-for-opted-out-Partner case for every non-POSTED state and the opted-out-at-dispatch case; `test_receipt_health` gains opted-out, opted-in and unreadable-snapshot cases.
- Docs: `docs/RECEIPTS.md` (failed-count rule) and `docs/MONITORING_IMPLEMENTATION_HANDOVER.md` (`failed_notifications` row).

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_review_cycle tests.test_receipt_health tests.test_partner_notice tests.test_hold_reply` (in `integration-agent/`) | 109 tests OK |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 2 failures and 27 errors, all present on the unchanged tree in this cloud session (no `psycopg`, PostgreSQL lab suites, and `test_claude_conversation` / `test_server` failing the same way before the change) |
| `ruff check --no-cache` on the four changed files | Clean |

## Not run
- The pull request's CI checks.
- The runtime deploy to `vm-mw-credit-agent` and the live count after it (see Remaining work).

## Recovery
Revert this batch's commit and redeploy; the previous rule reserves non-POSTED results for opted-out Partners again and counts them.

## Open questions
- The two 2 October POSTED notices: `scripts/acknowledge-receipt-notices.py` accepts them, but by the documented rule an acknowledgement does not reset `failed_notifications`, so the tile stays at 2 after this change. Owner decision.
- Re-enabling a Partner still reserves every POSTED result they missed while opted out (76 were sent to this Partner on 21 October). Owner decision.

## Remaining work
Deploy with `scripts/deploy-runtime.py` and confirm `failed_notifications` drops from 5 to 2.
