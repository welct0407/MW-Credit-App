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
| CI on the pull request | Pass: `Development checks` run 43375458596 and `Agent tests` run 43375458591 on `23a5491d` |
| PROD verification | Pass, see the PROD promotion record |

## Not run
- The agent lab PostgreSQL suites: no SQL or state change.
- A live Claude call: the first live relevance answers come in PROD, in the cycles after the re-run `--mark-all`.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's answers of 13 November 2026, "Yes, deploy to PROD" (PWA Hosting after CI) and "Hide them" ("Agent change, ships with R148"), relayed by the orchestrator as the scoped PROD approval for R148: PROD Hosting, the agent deploy, one `--mark-all` re-run and the technical records. No SQL, image or Terraform change; no payment, notification or job was forced; no manual cycle, model call or post. No secret value, token, chat text or borrower data appears here. Pins are in the [environment inventory](../../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `b2ec95dcd63068bdece98c1deabf776fd70bfbd3` (merge of PR #305; baseline R147 `a2fc30ab`). CI on the head `23a5491d`: `Development checks` run 43375458596 (check, lint, three Chromium and three iPhone WebKit e2e shards) and `Agent tests` run 43375458591 (test, lab); the generic runner reused the terraform job of run 43186898321 and the database groups of run 43291437377 (no input change since) |
| Agent deploy | Host `vm-mw-credit-agent` over IAP SSH as `codex-cloud`. Checkout `a2fc30ab` to `b2ec95dc`; dry run: only `group_chat_summary.py` changed, agent schema through V12, nothing missing. `deploy-runtime.py --release R148`: freeze 06:13:10Z (rollback directory `runtime-20261113T061311259337Z`; the summary timer paused with the others), install 06:13:26Z, activate 06:13:30Z to 06:13:35Z (probe `396663dc-e536-4c61-9b59-f312f8ac9315`), timers resumed; temporary operator file shredded. Catalogue revision 38 unchanged (`group_chat_summary` enabled), configuration unchanged (cutoff `2026-11-10T00:00:00+00:00`); `check` exit 0; chat relay restarted by hand 06:13:44Z; `/ready` and both `/healthz` report R148 and `b2ec95dc`. Rollback: `deploy-runtime.py rollback --commit b2ec95dcd63068bdece98c1deabf776fd70bfbd3` (restores `a2fc30ab`) |
| Re-run | Summary timer stopped, `group-chat-summary --mark-all` as `mwagent` 06:13:55Z to 06:14:03Z (exit 0): 42 conversations, 6 small, 0 ambiguous, 0 incomplete, 36 groups, 36 marked, 0 already due; timer started again 06:14:03Z |
| Cycles | Nine runs 06:14:38Z to 06:34:16Z: 38 due (36 groups plus 2 retries), 36 summarised, 2 failed, 0 deferred; outcomes 8 stored, 28 cleared, 0 unchanged, 0 superseded (so no second `--mark-all`). The first run (06:15:30Z) exited 2 by design for its two failures, `MODEL_OUTPUT_INVALID` and `GROUP_SUMMARY_FAILED` (one group each); both groups were retried by the normal backoff and completed in later runs without a manual retry. The last run was idle |
| Read-back | `pwa_group_chat_summaries`: 8 rows (before: 12), 8 conversations, 0 shared, 8 with the last message within 72 hours, all regenerated 06:14:38Z to 06:29:46Z. `runtime.group_chat_summary_state`: 36 rows, 0 still due, 0 with `last_error`, 0 attempts outstanding. Heartbeat COMPLETED, exit 0, code `b2ec95dc`. Journals since 06:12Z: only the first run's exit-2 lines; no other warning or error. Journal result lines carry counts, conversation-key hashes and codes; run summaries and audit events carry `effect`, `exit_code`, `reference_reads` (plus host, pid and start token) only: no chat text |
| PWA Hosting | Deployed with this release; see the [PWA note](../../Change%20Logs/CHANGE_NOTES_R148_GROUP_CHAT_SUMMARY_FIXES_2026-11-13.md#prod-promotion-record-forge-13-november-2026-utc) |

## Recovery
Known limit (Chase finding 2): a borrower who is a subject in two groups can briefly end with no card after the re-run, because the relevant group may be superseded by the irrelevant group's older-version row, which is then pruned. Mitigation in the PROD steps: after the re-run drains, if any run reported `superseded` above 0, run `--mark-all` once more. Revert the pull request; summaries pruned as not relevant return when the next substantive message marks the group, or after a `--mark-all` on the previous code.

## Open questions
None.

## Remaining work
PROD done (record above); tagged R148 and closed by the closure pull request. Open for the owner: acceptance (that the cards no longer stack and the irrelevant groups are hidden).
