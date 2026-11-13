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
- `integration-agent/src/` (Byte): to be filled from Byte's report.
- PROD after the merge (Forge): the agent deploy, then `poll-reprocess` for the one recorded receipt; owner authority: the request quoted above, relayed by the orchestrator as the scoped PROD approval. See the PROD promotion record.
- Documents (Dewey): `integration-agent/SERVICE_CATALOGUE.md` (the `partner_receipt_review` and `conversation_poll` rows; no new revision header, see below), `integration-agent/docs/CONVERSATION_POLL.md`, `integration-agent/docs/PARTNER_REVIEW.md`, `integration-agent/docs/RECEIPTS.md`, `integration-agent/docs/OPERATIONS.md`, `project/Documents/Solution_Design.md`, `project/Documents/Release_Tracker.md` and this note.
- Catalogue decision: revisions 34 to 37 each added a header because a service, switch or deploy-helper acceptance changed. This change adds none of these and, like R095 and R148, records its behaviour in the two service rows without a revision; `service-catalogue.json` stays at revision 38.
- Not changed: SQL, the command service contract, the catalogue file, the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's agent unittests | |
| Byte's `ruff` | |
| Echo's tests | |
| Chase's review | |
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
