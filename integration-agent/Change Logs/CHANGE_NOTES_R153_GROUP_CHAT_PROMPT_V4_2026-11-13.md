# Change notes — Group chat summary prompt version 4, agent (R153), 13 November 2026

## Purpose
Owner decision of 13 November 2026, "follow your recommendation to work on the prompt": group chat summaries were running into the 160 and 200 character limits (R152 observation: 4 runs failed `MODEL_OUTPUT_INVALID_HEADLINE_LENGTH`), and the card needs the most recent topic last so it can be shown in bold.

## Changes
- `src/mw_integration_agent/group_chat_summary.py` and `tests/test_group_chat_summary.py` (Byte): `PROMPT_VERSION` 4. Wording: "Keep it short: the headline is one short sentence of about 80 characters in each language and a point about 120; never more than 160 for the headline and 200 for a point. Thai vowel and tone marks each count as a character." and "Order the points oldest first; the last point is the most recent topic." Limits, schema, contract and SQL are unchanged; no truncation.
- Documents (Dewey): `docs/CONVERSATION_POLL.md` (prompt version 4, source digest, re-run note).
- Effect: the prompt version is part of the source digest, so every group with a substantive message in the 3-day window is summarised again once after the deploy. `--mark-all` does not regenerate a group with no substantive message in the window (no model call; the table stores no prompt version).
- Known limitation (Chase, low): a row that `--mark-all` does not regenerate keeps its v3 point order, so the bolded last point may not be the newest topic until the group next changes; cosmetic.
- Not changed: `SERVICE_CATALOGUE.md` and `service-catalogue.json` (revision 38; no service, unit, setting or switch changes), agent migrations, configuration.

## Checks
| Command | Result |
| --- | --- |
| Byte's `python3 -m unittest -v tests.test_group_chat_summary` (agent unittest) | 69 OK |
| Byte's `ruff` | Clean |
| `npm run check:docs` | Clean (see the root R153 note) |
| PROD verification | Pass, see the PROD deploy section |

## Not run
Nothing claimed yet. After the agent deploy and one `--mark-all`, the journal's `HEADLINE_LENGTH` failure count is the evidence that the shorter text works.

## Recovery
Git baseline `cc22d763`; redeploy the R152 agent (prompt version 3). No state change to undo.

## PROD deploy
Deployed 13 November 2026 as part of the R153 promotion: `deploy-runtime.py --release R153` at `025e8a51` (freeze 18:53:41Z, activate 18:53:56Z), no agent migration and no `mw_agent` backup (as R151). `--mark-all` at 18:54:45Z marked 36 groups; 8 runs to 19:13:34Z: 36 summarised, 0 failed (no `MODEL_OUTPUT_INVALID_*`), 9 stored, 27 cleared. Headline length Thai average 69, maximum 90; English average 89, maximum 101, so the 4 R152 length failures did not recur. Rollback: `deploy-runtime.py rollback`. Full record: [R153 PROD promotion record](../../Change%20Logs/CHANGE_NOTES_R153_GROUP_CHAT_LINK_AND_PROMPT_2026-11-13.md#prod-promotion-record-forge-13-november-2026-utc).

## Open questions
None.

## Remaining work
Owner acceptance.
