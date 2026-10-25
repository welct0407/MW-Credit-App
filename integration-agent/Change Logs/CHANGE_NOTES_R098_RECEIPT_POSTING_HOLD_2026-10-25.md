# Change notes — receipt posting hold (R098), 25 October 2026

## Purpose
Fay's 100.00 THB slip of 25 October 2026 (sent 14:24:08 Bangkok) was approved for automatic payment at 14:24:49 but posted only at 14:29:48. Every automatic payment since 21 October waited the same way. This batch removes the hold. The owner asked for this fix to go to production with R098.

## Changes
- Cause: when an image starts processing, `receipt_run.py` sets the job's `retry_after` 300 s ahead to guard against crashes (`RECEIPT_PROCESSING_STARTED`). `ReceiptJournal.accept` did not clear it. `review_cycle.execute_approved` skips a review whose job has a future `retry_after`, because that is how the not-sent submit retry waits (AGT-SEND-03, 15 minutes). So each approved payment waited until the crash guard ran out.
- `src/mw_integration_agent/receipt_journal.py`: `accept` sets `retry_after=0` together with `VALIDATED`. The not-sent retry still sets its own `retry_after` after a failed submit, so its 15-minute spacing is unchanged.
- `tests/test_review_cycle.py`: `test_automatic_review_after_processing_claim_posts_in_same_run` runs the image phase through the real crash guard and `accept`, then checks that the automatic payment posts in the same run. The earlier same-run test inserted a `VALIDATED` job directly, so it missed the hold.
- Docs: `docs/RECEIPTS.md` (retry ladder); `project/Documents/Development_Changes.md` (R098 row; partial R082 measurement).
- No migration, no config change, no catalogue change, no unit change.

## Checks
| Command | Result |
| --- | --- |
| New test without the fix, then with it | Fails without the fix (the review stays APPROVED); passes with it |
| `python -m unittest discover -s tests` (in `integration-agent/`, locked requirements, `PYTHONPATH=src`) | 618 tests OK, 70 skipped (lab suites) |
| `ruff check --no-cache integration-agent` | Clean |
| Read-only PROD readback on `vm-mw-credit-agent` (`mw_agent`, `SET ROLE mw_agent_worker`, read-only transaction) | Fay's job `4feaf496…`: `retry_after` 14:29:44.891 Bangkok, exactly 300 s after the processing claim at 14:24:44.89. Posting came in the first run after that (14:29:45). Automatic payments since 21 October took 303 to 356 s from proposal to result notice |
| Pull request `Development checks` and Agent tests | See the pull request |

## Not run
- Lab suites against PostgreSQL in this session; the pull request's agent tests run them. The change only adds a column to an existing `UPDATE`.
- Real-receipt timing after deployment: needs the next real slip after R098 is on the VM.

## Recovery
Revert the commit. Live: roll the agent back to the previous package with `deploy-runtime.py rollback` (see the [environment inventory](../../project/Documents/Environment_Inventory.md#debian-agent-host)). No state change needs undoing. The column already allows 0, and an older package ignores a cleared `retry_after`.

## Open questions
None.

## Remaining work
- Deploys with R098 (the R098 promotion session owns the deploy).
- After deployment, check the next real automatic payment: it should reach POSTED about 40 s after capture instead of about 6 minutes.
