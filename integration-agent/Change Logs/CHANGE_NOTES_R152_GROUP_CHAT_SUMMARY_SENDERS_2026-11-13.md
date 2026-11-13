# Change notes — Group chat summary subject from senders, agent (R152), 13 November 2026

## Purpose
Owner incident of 13 November 2026, with a screenshot: one referrer's Collection page showed the summary of another borrower's group, and the card text showed a raw role token (`other_1`). Instagram had stopped listing the borrower as a participant of her group, so the participants-only resolver treated the referrer as the only borrower and made her the subject; the summary then named the real borrower with a token the card did not translate. This change counts the message senders that match a borrower username as group members and replaces role tokens in card text with role words. Agent only. The release (R152 scope in the tracker, the merge, the PROD agent deploy, the `--mark-all` re-run and the closure) belongs to another session; nothing is deployed here.

## Changes
As built.
- `src/mw_integration_agent/group_chat_summary.py` (`resolve()`, `message_senders`) and `conversation_poll.py` (Byte): `resolve()` counts the message senders (not participants, not the business account) whose username matches exactly one borrower as group members for referrers, subjects, tokens and labels; ambiguity and the three-member minimum include them. The summariser reads the 3-day window before resolving, and the poll passes the scan's messages as senders at its one call site in `capture_conversation` (R151 receipt classification unchanged). `subjects_sha256` stays the participants-only digest on both sides, so there is no re-mark loop; a change visible only through senders marks the group at its next substantive text. Numbered role tokens in card text are replaced with role words (Borrower / ผู้กู้, Referrer / ผู้แนะนำ, Partner / หุ้นส่วน, MW Credit, Other / อื่น ๆ; bare `partner` and `business` are not replaced) and the instructions forbid tokens in the text. `PROMPT_VERSION` is 3, so every digest changes and each marked group is summarised again once after the deploy.
- Documents (Dewey): this note, the group chat summary sections of `docs/CONVERSATION_POLL.md` (subject rule: participants plus recent senders; prompt version 3) and `docs/OPERATIONS.md` (the re-run after the deploy). The release tracker, `Development_Changes.md` and the other session's notes are not touched here.
- Not changed: SQL, migrations, the command service, the PWA, the catalogue and the configuration schema.
- Agent migration `database/migrations/V13__group_chat_summary_members.sql` (owner authorization of 13 November 2026, "Add the column now"): `runtime.group_chat_summary_state.member_borrower_ids text NOT NULL DEFAULT '[]'`, a JSON array of borrower Row IDs with a 16 KB check; ids only, no usernames or text. The SQLite fallback gains the column (`ensure_group_chat_summary_state` for pre-V13 journals). Who gets a summary is now: participants, the senders in the 3-day window and the remembered borrowers; remembered ids still in the master count for referrer detection, subjects and the three-member minimum; the summariser stores the union after each run; ids of deleted borrower rows are dropped; the poll reads the column but never writes it; the digest stays participants-only.
- Accepted risk: a remembered borrower is forgotten only when her row is deleted, so a borrower who truly left stays a subject of that group (if she is in another group too, the newer conversation's summary wins on her card).
- Limits: the fix learns a departed borrower's id only if her messages are still inside the 3-day window at the first cycle after the deploy (the incident borrower stopped being listed at 20:36 Bangkok on 13 November), so the release must run before about 20:00 Bangkok on 16 November. `--dry-run` and `--mark-all` stay participants-based, so a group with subjects only through a departed sender is marked by the poll at its next text.
- PROD order (release session): a verified `mw_agent` backup, `agent-state-admin.py migrate` (V13), the agent deploy, one `--mark-all` between timer firings, then watch the cycles; without V13 the new code fails every summary-switch poll scan and summary run.
- Follow-up for Byte: the `scripts/deploy-runtime.py` docstring is code and is not updated here.
- Release (other session): the agent deploy, then one `--mark-all`; expected: the referrer's row for that group is pruned and the departed borrower's row is stored if enabled and relevant.

## Checks
| Command | Result |
| --- | --- |
| Byte's `test_group_chat_summary` | 66 OK before V13 |
| Byte's agent tests against a fresh agent lab with V13 | 126 OK |
| Byte's agent tests against an empty server | 29 OK |
| Byte's full agent `discover` with V13 | 974 run, 76 skipped, 2 errors (the `zxingcpp` import, and a one-off `chat_relay` flake that passed 3 times alone) |
| Byte's `ruff` | Pass |
| Chase's review and the recheck after V13 | Pass. Probe: an unlisted, silent F with remembered `["F","R"]` gives subjects `['F']`, referrers `['R']` and no token for F; a deleted F or a malformed stored value falls back to participants-only; the digest is identical across 6 sender and remembered combinations (no re-mark loop); only sorted borrower Row IDs are stored, failed runs leave the value and deleted borrowers are dropped. V13 on existing V12 rows: rows get `[]` with attempts, backoff and `last_error` unchanged, grants byte-identical, owner unchanged; the check accepts `["F","R"]` and refuses `{}`, non-JSON, `"x"` and more than 16 KB. `conversation_poll.py` has exactly two summary-only hunks and the R151 classification is untouched; the "MW MW Credit" collapse works; the `chat_relay` flake is unrelated by imports |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request | `Agent tests` run 43459797787 (test, and lab with V13) and `Development checks` run 43459797650 on head `46e8f3ef` |
| PROD verification | Pass, see the PROD promotion record |

## Not run
- Agent migration V13 on a live database: DEV has no agent, so it is first applied in PROD by the release session after a verified backup.
- A live Instagram read and a live Claude call: the first real run is the PROD re-run after the R152 agent deploy.

## PROD promotion record (Forge, 13 November 2026 UTC)
Deployed with PR #314 as one R152 agent deploy; the full record (authority, verified `mw_agent` backup, V13, deploy, re-run and cycles) is in the [review row order note](CHANGE_NOTES_R152_REVIEW_ROW_ORDER_2026-11-13.md#prod-promotion-record-forge-13-november-2026-utc). In short: agent V13 applied 16:15:45Z after a verified backup; `cd4c721b` active 16:16:05Z (`/ready` and `/healthz` R152); `--mark-all` 16:16:20Z marked 36 groups; the cycles drained with 0 superseded. Incident group: its state row remembers the expected borrower among 2 members; its only summary row is that borrower's, and the referrer has no summary row. No chat text, borrower name, username or amount appears here.

## Recovery
Revert the pull request; in PROD the agent deploy rollback (`deploy-runtime.py rollback`) by the other session.

## Open questions
None.

## Remaining work
Implementation and verification; then the other session's R152 agent deploy and `--mark-all` re-run.

Operational finding for the release session (Chase): `member_borrower_ids` starts as `[]` on every existing row, so the incident group is repaired only if the departed borrower's last message is still inside the 3-day window at the post-deploy re-run. Afterwards read back that group's state row (conversation key and borrower ids only) and confirm it contains her id, or confirm the referrer has no summary row for that conversation key. If she is already silent, a one-row seed needs a scoped owner OK.
