# Change notes — R119 agent recheck of ignored and held slips, 4 November 2026

## Purpose
Owner request, 3 and 4 November 2026 ("There're some items queued for R119. Fix them"; "include the held-slip auto recheck"; "take R119 all the way to PROD"). A group slip is decided once, so a slip from a sender who was not yet an enabled borrower stayed `IGNORED`, and a slip held for a cause the owner fixed later in the app stayed held until someone ran `receipt-reconsider`. Gun's 100-baht slip (3 November) and the Yeah and Fay holds were posted by hand. The agent now rechecks both once the borrower master changes. The release note is [R119](../../Change%20Logs/CHANGE_NOTES_R119_REBATE_LINES_AGENT_RECHECK_2026-11-04.md).

## Changes
- **Switch.** `config.py`: `conversation_poll_recheck_enabled` (boolean, default false, absent means off). It requires `conversation_poll_enabled`; otherwise the configuration is refused. Nothing below runs while it is off, and a `--date` backfill never rechecks.
- **Trigger: a change in the borrower master.** `conversation_poll.py` keeps a snapshot next to its lock, `conversation-poll-master.json` (mode 0600, written atomically): the enabled Instagram usernames (`receipt_master.masters()`, normalised) and a digest of the active cash accounts' numbers and alternative numbers. No database column is added.
  - The first run, or an unreadable snapshot, only writes the snapshot and rechecks nothing.
  - A grown enabled set rechecks ignored slips of the new usernames and `PAYER_UNRESOLVED` holds. A changed account digest rechecks `RECIPIENT_UNKNOWN_OR_AMBIGUOUS` holds.
  - The snapshot moves only after the whole recheck succeeded. A group that could not be read (`recheck_errors`) keeps the old snapshot, so the next run tries again.
- **Ignored slips.** `recheck_ignored()`, called from `scan()` for each group with a newly enabled participant: it re-reads history from yesterday's local midnight and finds that participant's image messages. A message matches an `IGNORED` row in `conversation_poll_messages` by message id or, because Meta's ids change between reads, by conversation and `event_time` within 5 seconds. It is skipped when a `receipt_jobs` row for the same conversation, sender and sent time exists. In one transaction the row becomes `BORROWER` (no new outcome value, so `receipt_identity.py` is unaffected) and the job is inserted with the usual poll source and job key. The cursor and every other recorded outcome stay. The payer, duplicate, archive and idempotency guards apply when the worker runs the job.
- **Held slips.** New `receipt_recheck.py`, called by the poll under `receipt-worker.lock` taken without waiting (a busy worker skips the recheck and keeps the snapshot). It requeues today's and yesterday's `REVIEW` jobs held `PAYER_UNRESOLVED` (enabled set grew) or `RECIPIENT_UNKNOWN_OR_AMBIGUOUS` (accounts changed) through `receipt_reconsider.requeue`, with detail `AUTO_RECHECK_MASTER_CHANGED` and the saved extraction kept (no new OCR). Skipped: a job whose partner review was decided, a job with no archived original to read again, and a job already requeued from the same hold since the snapshot was written (one recheck per change).
- **`receipt_reconsider.py`.** The reconsider body moved into a shared `requeue(db,job,detail,review,…)` (lock-free; the caller holds the lock) that keeps the `receipt_reconsiderations` record and the superseding of a pending review. `receipt-reconsider` now also accepts a `PREPARED` job from `receipt-prepare` (source kind `operator-selected`), the supported route for Gun's case instead of a database edit. A decided review is still refused.
- **Catalogue revision 35.** `SERVICE_CATALOGUE.md` and `service-catalogue.json`: new behaviour of `conversation_poll`, no service or switch added. `scripts/deploy-runtime.py` accepts the live revision 34 to candidate 35 change only when services and switches are unchanged (the R112 template hash).
- Docs: `docs/CONVERSATION_POLL.md`, `docs/OPERATIONS.md`, `docs/PARTNER_REVIEW.md`, `docs/RECEIPTS.md`.

## Checks
| Command | Result |
| --- | --- |
| `PYTHONPATH=src python3 -m unittest tests.test_conversation_poll tests.test_receipt_reconsider tests.test_receipt_prepare tests.test_receipt_recheck` (in `integration-agent/`) | 51 tests OK (Byte, working tree). New: an ignored slip is picked up after the borrower is enabled; a changed message id is matched by time; nothing on the first run; no duplicate job; the cursor is kept; other senders stay ignored; nothing with the switch off; the PREPARED route and a decided review still refused; both hold codes, the once-only guard and a decided review for the held recheck. |
| `PYTHONPATH=src python3 -m unittest discover -s tests` (in `integration-agent/`) | 738 tests OK (Byte, working tree) |
| `ruff check --no-cache integration-agent` | Clean (Byte) |
| Pull request agent CI (`test`, `lab`) | Pending: record the run and commit |
| Chase review | Pending |

## Not run
- Live Instagram and the VM: the recheck is exercised only against fakes and SQLite (and the lab in CI). The first live evidence is the first real master change after activation.

## Recovery
- Switch off: set `conversation_poll_recheck_enabled` to false in the live configuration (a configuration-only change; restore the saved backup). The snapshot file can stay; it is read only while the switch is on.
- Code: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Jobs and rows the recheck created stay ordinary receipt jobs. A requeued hold keeps its prior state in `receipt_reconsiderations`. Nothing posted can be undone by a rollback.

## Open questions
None. Activation of the switch is covered by the owner's "take R119 all the way to PROD" and is recorded below when done.

## Remaining work
Deploy to the VM and activate the switch after a configuration backup (Forge), then record it here.

## Deploy record
Pending (Forge): VM `vm-mw-credit-agent`, revision 35, freeze and rollback directory, readback, configuration backup and the switch activation time.
