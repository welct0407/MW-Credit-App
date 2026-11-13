# Change notes — Receipt sender fallback and review, agent (R151), 13 November 2026

## Purpose
Owner request of 13 November 2026: "implement the sender username fix, and also another clue is the sender's name on the receipt. use these clues to identify the receipt. and if everything fails, it should be sent to review, not keep silent… include this update in next release… push it all the way to prod and reprocess" the borrower's receipt. Incident: a borrower's slip posted in an Instagram group on 13 November 2026 (evening, Bangkok) was recorded `IGNORED` (no job, no notice) because Instagram had dropped the borrower from the group's `participants` list a few seconds later, so the poll no longer saw an enabled borrower. Nothing is deployed. No borrower name, username, identifier or amount appears here.

Design (Archie, accepted):
- **`SENDER` outcome.** When the sender is missing from the participants but the message `from.username` is exactly one enabled borrower, the poll queues a job; a group is scanned when any sender on the first page is an enabled borrower even if no participant is. The receipt cycle still checks the identity binding (`SenderUnbound`, `taken`) and a strong context, and posts automatically as C1/C2.
- **`UNIDENTIFIED` outcome.** An image from any other non-business sender in an eligible group gets a job. After extraction the borrower is resolved by the slip payer name across the enabled borrowers (narrowed by the group's borrowers). The result always goes to a Reviewer and never posts automatically; an unresolved or unreadable name holds as `PAYER_UNRESOLVED` or `PAYER_NAME_UNREADABLE` with the existing notice. A `NOT_PAYMENT_RECEIPT` image stays silent, so photos from non-borrowers are now read and archived as non-receipts.
- **`PAYER_NAME_OTHER_BORROWER` hold.** In context C3 (the forwarder in a 3-member group) a slip whose payer name matches exactly one other enabled borrower, and not the group's borrower, is held for review. This amends R095's "the name never holds in a strong context".
- **`poll-reprocess`.** Operator one-shot `poll-reprocess --conversation-id ID [--message-id-suffix S]` turns a recorded `IGNORED` image message of yesterday or today into a job under the new rules; idempotent; counts only. The R119 recheck shares its core.
- No configuration switch, catalogue revision unchanged (38), no migration, no SQL.

## Changes
As built.
- `src/mw_integration_agent/` (Byte, commit `ca844f2`): `conversation_poll.py`, `receipt_identity.py`, `receipt_rules.py`, `receipt_run.py`, `receipt_hold.py`, `review_cycle.py`, `review_resend.py`, `partner_review.py` and `cli.py`, with five test files.
- `poll-reprocess --conversation-id ID [--message-id-suffix S]` takes `conversation-poll.lock` without waiting, reads from yesterday 00:00 Bangkok and requires exactly one `IGNORED` row match. It is idempotent and prints counts only; it exits 2 when the lock is busy or the suffix matches no row or several. The R119 `recheck_ignored` shares its core.
- `UNIDENTIFIED` jobs are created only from `payer_name_cutoff` onward.
- Sender note "Sender is not a known borrower; borrower matched by the payer name on the slip." appears after the Borrower line in the standard request, after the options block and before "Transferred" in the options request, and in the loan-close request.
- The `PAYER_NAME_OTHER_BORROWER` hold lists the group's borrower first, then the slip-named one, with no nickname tip; unknown-sender `PAYER_UNRESOLVED` and `PAYER_NAME_UNREADABLE` holds omit the nickname tip.
- Byte fixed a shadowed variable in the poll's cursor-advance input; behaviour differs only for re-read C4 messages.
- Same R151 agent deploy: the group chat summary diagnostics change of PR #311 has its [own note](CHANGE_NOTES_R151_GROUP_CHAT_SUMMARY_DIAGNOSTICS_2026-11-13.md); its sections are not repeated here.
- PROD after the merge (Forge): the agent deploy, then `poll-reprocess` for the one recorded receipt; owner authority: the request quoted above, relayed by the orchestrator as the scoped PROD approval. See the PROD promotion record.
- Documents (Dewey): `integration-agent/SERVICE_CATALOGUE.md` (the `partner_receipt_review` and `conversation_poll` rows; no new revision header, see below), `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/docs/RECEIPTS.md`, `integration-agent/docs/OPERATIONS.md`, `project/Documents/Solution_Design.md`, `project/Documents/Release_Tracker.md` and this note.
- Catalogue decision: revisions 34 to 37 each added a header because a service, switch or deploy-helper acceptance changed. This change adds none of these and, like R095 and R148, records its behaviour in the two service rows without a revision; `service-catalogue.json` stays at revision 38.
- Not changed: SQL, the command service contract, the catalogue file, the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's `ruff` 0.16.8 | Pass (on `ca844f2`, clean tree) |
| Byte's focused unittest (`test_conversation_poll test_payer_resolution test_receipt_identity test_review_cycle test_cli`) | 178 OK |
| Byte's full `python -m unittest discover -s tests` | 965 OK, 74 skipped (lab suites) |
| Echo's tests | |
| Chase's review | To come |
| `npm run check:docs` (Dewey) | |
| CI on the pull request | |
| PROD verification | See the PROD promotion record |

## Not run
- To be filled with the evidence (for example the agent lab PostgreSQL suites, if no SQL or state change; a live Instagram or Claude call before PROD).

## PROD promotion record (Forge, UTC)
Placeholder: Forge fills this section (authority, package, agent deploy, the `poll-reprocess` run and read-back, counts only; no secret, chat text, borrower name, username or amount).

## Recovery
Revert the pull request and redeploy the previous agent commit; no data, schema or configuration was changed. Jobs queued by `SENDER` or `UNIDENTIFIED` stay in the receipt tables and go through the normal review or reject path; a job that posted is reversed only by the existing payment-correction process, never by the agent.

## Open questions
None.

## Remaining work
Byte's "As built" bullets, the Checks table, the PROD record and owner acceptance (that the recorded receipt is posted or held for review, and that a slip from a sender missing from the participants is no longer silent).
