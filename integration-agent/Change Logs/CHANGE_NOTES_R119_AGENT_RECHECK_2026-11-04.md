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
| Pull request agent CI (`test`, `lab`) | Pass: agent-tests run 41767072409 on head `778558d` (`main` `0a8a8cd` has the same tree) |
| Chase (agent part) | conversation_poll tests 43 OK with 2 new (an ambiguous time match is left alone; the snapshot is kept when a scan raises); `receipt_reconsider`, `receipt_recheck` and `deploy_runtime` tests and ruff pass. No high-severity defect. |

## Not run
- A real Instagram or PROD recheck. Also not run: a 320 px layout check and WebKit (PWA part, see the release note).
- Live Instagram and the VM: the recheck is exercised only against fakes and SQLite (and the lab in CI). The first live evidence is the first real master change after activation.

## Known limitations
- A slip whose message id changed, with another message from the group within 5 seconds, is skipped as ambiguous and stays ignored.
- Re-enabling a borrower replays their ignored slips from yesterday and today (intended).
- On a run where the master changed, `receipt-worker.lock` is held for the whole scan, so the worker skips that minute.
- Archive guard: a held job with no archived original is counted as `held_skipped_no_archive` and retried on the next master change.

## Recovery
- Switch off: set `conversation_poll_recheck_enabled` to false in the live configuration (a configuration-only change; restore the saved backup). The snapshot file can stay; it is read only while the switch is on.
- Code: `deploy-runtime.py rollback --commit <deployed>` restores the previous runtime. Jobs and rows the recheck created stay ordinary receipt jobs. A requeued hold keeps its prior state in `receipt_reconsiderations`. Nothing posted can be undone by a rollback.

## Open questions
None. Activation of the switch is covered by the owner's "take R119 all the way to PROD" and is recorded below when done.

## Remaining work
None. Open: the first real borrower-master change with the recheck on (live evidence).

## Deploy record
Forge, 4 November 2026 (UTC), under the owner's "All the way to PROD" for R119, after V134 and the PROD images. No secret value or borrower data appears here.

| Step | Evidence |
| --- | --- |
| Baseline | VM `vm-mw-credit-agent` in `clever-oasis-508610-n7` (identity `mw-integration-agent@…`); live `code_version` `5c61fc4` (PR #227, receipt source gone after two attempts), catalogue revision 34; `receipt_archive_enabled` true and `conversation_poll_enabled` true; `conversation_poll_recheck_enabled` absent |
| Checkout | `update-from-github.sh` to `0a8a8cd` |
| Dry run | Schema through V11, no drift; 1 module added (`receipt_recheck.py`), 3 changed; units unchanged; ancestry `ancestor` |
| Freeze | 04:11:43Z, rollback directory `runtime-20261104T041143831923Z` |
| Install | No removed files, no unit changes |
| Activate | 04:12:02Z to 04:12:10Z, probe `7429fbc4-29a1-4833-804f-2bb3bb364f67`; six timers and paths resumed |
| Readback | `/ready` true with `code_version` `0a8a8cd`; catalogue revision 35; `check` passes; no failed units |
| Switch | `config-only-change.py apply --tag r119-recheck` 04:12:43Z to 04:12:53Z: backup `/root/config.json.pre-r119-recheck`, one key added (`conversation_poll_recheck_enabled: true`), no other key changed; `check` passed; triggers resumed; live file `root:mwagent` 0640 |
| First run | The poll at 04:13:48Z: 36 conversations, 0 failures, `recheck: snapshot_written`; snapshot `state/conversation-poll-master.json` mode 0600 |
| Deviation | The deploy engine needed an `mw_agent` operator connection file that was absent on the VM (as in R113 and R118). A temporary root-only file was used and shredded afterwards |
| Rollback | Switch: `config-only-change.py restore --tag r119-recheck`. Code: `deploy-runtime.py rollback` to the freeze above, which restores `5c61fc4` |
