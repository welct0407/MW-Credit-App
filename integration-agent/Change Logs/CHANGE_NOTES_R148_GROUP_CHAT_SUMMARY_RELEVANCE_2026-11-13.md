# Change notes — Group chat summary relevance, agent (R148), 13 November 2026

## Purpose
Owner decision of 13 November 2026, "Hide them": a group with nothing collection-relevant gets no card and no list mark. The model says whether the window holds anything relevant; if not, the group's summary rows are pruned. The PWA half (stacked cards) is in the [PWA change note](../../Change%20Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_FIXES_2026-11-13.md). Nothing is deployed.

## Changes
As built.
- `src/mw_integration_agent/group_chat_summary.py` (Byte): the output schema gains a required boolean `relevant`. `false` is accepted with no content checks and posts this group's prune command (empty borrower list, null summary), counted under `cleared`, with the marker cleared and the digest stored; `true` goes through the existing checks; a missing or non-boolean value is `MODEL_OUTPUT_INVALID`. The prompt version is 2, so every digest changes and each group is summarised again once after the deploy. A group that is not relevant still costs one model call per new substantive burst.
- PROD, after the deploy: one more `group-chat-summary --mark-all` so every group is re-checked (Forge); owner authority: "Hide them" ("Agent change, ships with R148") and the R148 PROD approval.
- Documents (Dewey): `docs/CONVERSATION_POLL.md` (output schema and relevance), `docs/OPERATIONS.md` (the re-run step), `Solution_Design.md` (card rule), and this note.
- Not changed: SQL, the command service contract, the catalogue, the configuration schema, units and migrations.

## Checks
| Command | Result |
| --- | --- |
| Byte's agent unittest `test_group_chat_summary` and `test_cli` | 60 OK; after Chase's finding 1, `test_group_chat_summary` 56 OK |
| Byte's `ruff` | Pass (final) |
| Chase's review | Pass. Probe: `relevant` false skips the content checks and true keeps them; a missing value, `"false"`, `0` or an extra key is `MODEL_OUTPUT_INVALID`; a shared group with `relevant` false posts an empty-list prune for its own conversation key only (the prune is scoped by `conversation_key`, proven in the R146 SQL lab); a sentinel text is absent from the post, audit and stdout; the digest differs between prompt versions 1 and 2. Finding 1 fixed by Byte: the relevant-true list names reminders repeated with no reply, or the borrower not answering, and contactability; the false example is narrowed to a routine reminder answered as usual; `PROMPT_VERSION` stays 2; `ruff` pass. Finding 2 (below) is a known limit with a mitigation |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request and the PROD verification | Pending |

## Not run
- The agent lab PostgreSQL suites: no SQL or state change.
- A live Claude call: the first live relevance answers come in PROD, in the cycles after the re-run `--mark-all`.
- PROD steps: pending the deploy.

## Recovery
Known limit (Chase finding 2): a borrower who is a subject in two groups can briefly end with no card after the re-run, because the relevant group may be superseded by the irrelevant group's older-version row, which is then pruned. Mitigation in the PROD steps: after the re-run drains, if any run reported `superseded` above 0, run `--mark-all` once more. Revert the pull request; summaries pruned as not relevant return when the next substantive message marks the group, or after a `--mark-all` on the previous code.

## Open questions
None.

## Remaining work
Implementation, CI, agent deploy, the `--mark-all` re-run and a read-back of the row counts.
