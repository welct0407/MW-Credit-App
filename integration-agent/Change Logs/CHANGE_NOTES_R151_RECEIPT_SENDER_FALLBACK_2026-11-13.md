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
| Byte's focused unittest (`test_conversation_poll test_payer_resolution test_receipt_identity test_review_cycle test_cli`) | 178 OK on `ca844f2`; 181 OK after Chase's findings (head `dc3aa99`) |
| Byte's full `python -m unittest discover -s tests` | 965 OK, 74 skipped (lab suites) on `ca844f2`; 968 OK, 74 skipped after the findings; `ruff` pass |
| Echo's tests | |
| Chase's lab suites (PostgreSQL 18 disposable cluster via `tests/lab/setup.sh`, the suites listed in `agent-tests.yml`) | 61 OK (`test_state_migration_postgres` and `test_audit_retention_postgres` excluded, see Not run) |
| Chase's Postgres PROD-fixture scratch test | 3 OK: `poll-reprocess` creates one `SENDER` job and a second run creates 0; poll capture records `SENDER`, `UNIDENTIFIED` and `FORWARDED`; the reprocess runs under the lock and touches the wake file |
| Chase's adversarial review | Pass after fixes: no spoofing hole; automatic payment is excluded at both `review_cycle` call sites. Finding 1 (medium): the sender note could push a worst-case options request over 1000 characters; fixed by Byte (the note is added only when the request still fits, with `reserve` for the Corrected-request prefix). Finding 2 (low): the `poll-reprocess` suffix also matched neighbours within 5 seconds and had no eligibility gate; fixed (strict message id match, `message_not_in_history`; the poll's eligibility gate, `not_eligible`, exit 2) |
| Chase's delta re-check of the fixes (head `dc3aa99`, fresh PostgreSQL 18 lab, torn down) | Pass. The PROD-fixture scratch test updated for the strict suffix: 3 of 3 OK (first run one `SENDER` job; second run 0 jobs, `message_not_found`); `tests.test_postgres_state` 43 OK; both findings fixed, no new issues |
| `npm run check:docs` (Dewey) | |
| CI on the pull request | |
| PROD verification | See the PROD promotion record |

## Not run
- The two second-cluster lab suites, `test_state_migration_postgres` and `test_audit_retention_postgres`: no state schema change.
- A live Instagram or Claude call before PROD.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's request of 13 November 2026 quoted in Purpose ("… push it all the way to prod and reprocess" the borrower's receipt) and "yes, both changes go into prod together" (PR #311 and PR #312), relayed by the orchestrator as the scoped PROD approval: the agent deploy, one `poll-reprocess` run and the technical records. No SQL, migration, Terraform, configuration or catalogue change; no extra cycle, notice or payment was forced. No secret value, token, chat text, borrower name, username, identifier or amount appears here. Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `e0a08916fe5224fc619f75b100af071f0c5cede9` (merge of PR #312, which includes the PR #311 merge `1081509f`; baseline R148 `b2ec95dc`). CI on the head `0888c337`: `Development checks` run 43450527813 and `Agent tests` run 43450528058 (test, lab); PR #311: `Development checks` run 43447427105 |
| Preflight | Read-only, before the deploy and again before the reprocess: no payment for the borrower since 12 November 2026 (0 rows, read through the agent's business read path) |
| Agent deploy | Host `vm-mw-credit-agent` over IAP SSH as `codex-cloud`. Checkout `b2ec95dc` to `e0a08916` by `update-from-github.sh` (15:18:37Z); dry run: 10 modules changed (`cli`, `conversation_poll`, `group_chat_summary`, `partner_review`, `receipt_hold`, `receipt_identity`, `receipt_rules`, `receipt_run`, `review_cycle`, `review_resend`), none added or removed, units unchanged, agent schema through V12 with nothing missing or drifted, live and repository catalogue revision 38 with the same `implemented` flags, lock file unchanged. `deploy-runtime.py --release R151`: freeze 15:19:13Z (rollback directory `runtime-20261113T151914156724Z`), install 15:19:14Z to 15:19:19Z (no files removed, no unit changes), activate 15:19:19Z to 15:19:23Z (probe `fc101a84-f0de-4411-a944-056080378d7e`), seven timers and the wake path resumed; temporary root-only operator connection file (`postgres` through the 5432 proxy, password from Secret Manager on stdin, never printed) shredded after activation. Chat relay restarted by hand 15:19:33Z; `check` exit 0; `/ready` and both `/healthz` (recognizer, relay) report R151 and `e0a08916`; configuration unchanged apart from `code_version` and `code_release`. Rollback: `deploy-runtime.py rollback --commit e0a08916fe5224fc619f75b100af071f0c5cede9` (restores `b2ec95dc`) |
| Poll after deploy | Three runs 15:20:10Z to about 15:23Z: each 42 conversations, 38 eligible (36 before the deploy: the sender rule now scans two more groups), 0 image jobs, 0 failed conversations, no errors; receipt cycles with no failures or notification failures; 0 failed units |
| `poll-reprocess` | As `mwagent`, 15:20:25Z to 15:20:32Z, one group, message-id suffix (strict match): `status` ok, 1 message, 1 reclassified, 1 job, 0 skipped as existing, 0 unmatched, 0 still ignored, exit 0. The poll row now reads `SENDER`; the wake started the receipt cycle at 15:20:32Z |
| Read-back | One receipt job: status `REVIEW_REQUESTED`; resolved borrower and sender borrower both equal the expected borrower Row ID; slip amount and date read as posted. One Reviewer review, state `PENDING`, action `Loan Close` (the slip covers the open loan), no payment attached, expires 14 November 2026 15:20Z (22:20 Bangkok). One review-request notice, Instagram `ACCEPTED` (email copy `PENDING` as usual). No payment posted by the cycle (the borrower's payments since 12 November: still 0); no review-result notice. The owner or Reviewer decides the review by Instagram reply as usual |
| Tag | `R151` on `e0a08916fe5224fc619f75b100af071f0c5cede9` (the package commit), created by the Release tag workflow, run [43452174847](https://github.com/welct0407/MW-Credit-App/actions/runs/43452174847) (success, 15:23:42Z to 15:24:09Z); confirmed with `git ls-remote --tags origin R151` on 13 November 2026 (the peeled tag points to `e0a08916`) |
| Components | `render --write` after the tag: the integration agent is R151 (changed, catalogue revision 38); every other component keeps its earlier release; `render --check` passes |

### Prune at closure
Deleted (inbound links repointed to commit `e0a08916`): `Change Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_FIXES_2026-11-13.md` and `integration-agent/Change Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_RELEVANCE_2026-11-13.md`, outside the window of the Open release and the three newest Released releases (R151, R150, R149); their links in the release tracker and the environment inventory now point at the permalink. The R148 follow-up row was already removed from `Development_Changes.md` by the acceptance record. No evidence became uncited.

## Recovery
Revert the pull request and redeploy the previous agent commit; no data, schema or configuration was changed. Jobs queued by `SENDER` or `UNIDENTIFIED` stay in the receipt tables and go through the normal review or reject path; a job that posted is reversed only by the existing payment-correction process, never by the agent.

## Open questions
None.

## Remaining work
PROD done (record above); tagged R151 and closed by the closure pull request. Open: the Reviewer's decision on the pending Loan Close review for the reprocessed receipt (expires 14 November 2026, 22:20 Bangkok), and owner acceptance (that a slip from a sender missing from the participants is no longer silent).

Known limit (pre-existing, not fixed here): when a review request is too long to send, the reserved review row stays `PENDING` with nothing sent and the Reviewer gets only a hold alert.

Caveat for the PROD run: when no participant is enabled, the `poll-reprocess` eligibility gate needs the sender's message on the first history page, otherwise it answers `not_eligible`. The PROD case's group has an enabled participant, so it is eligible.
