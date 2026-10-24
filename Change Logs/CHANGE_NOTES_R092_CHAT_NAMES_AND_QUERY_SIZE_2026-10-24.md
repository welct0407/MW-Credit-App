# Change notes — R092 chat borrower names and query size, 24 October 2026

## Purpose
In PROD at 12:00 Bangkok on 24 October 2026 the owner (English preference) asked the chat "What is due today?". Every figure was verified correct (due today ฿7,600, 22 charges, 12 borrowers; overdue ฿96,500, 208 charges, 14 borrowers; total ฿104,100, 230 charges, 18 borrowers), but the borrower names were Thai and the turn was slow: 3 rounds, 177,436 prompt tokens (31,771 cached), 2,377 output tokens, 38.9 s, of which SQL took 0.45 s over 5 queries. This batch, owner-approved ("Go ahead"), fixes both in the chat service only: no SQL, no table or column, no UI, no infrastructure. Designed by Archie (A); Echo (E) and Forge (F) take no part because no UI or infrastructure changes.

## Changes
- **Names follow the reply language** (`services/chat/prompt.mjs`, Byte). The cause: the model selected `"Borrower Name"` (Thai) and the prompt only said to refer to a borrower by name. Now an English reply uses `"Borrowers"."Description"` (Thai name when blank) and a Thai reply uses `"Borrower Name"` (English name when blank), one name per borrower, mirroring V105's push rule. The prompt also tells the model to select both columns in the one query that fetches borrowers (in `reporting_borrower_directory_v1` the English name is `borrower_name`).
- **Aggregate first** (`prompt.mjs`, query discipline). Totals come from sum, count and group by in the first query, never from charge rows; individual charges are fetched only when the reply lists them, as `ORDER BY … LIMIT 10` plus the count and total of the rest in the same statement. Round 1 of the PROD turn fetched all 230 unpaid charge rows (91 KB) and every later round re-sent them.
- **Smaller `sql_query` results** (`services/chat/sql-guard.mjs`, `sql-tool.mjs`, `tools.mjs`, Byte). `ROW_CAP` 500 to 100, `RESULT_LIMIT` 256 KB to 32 KB, `CELL_LIMIT` 256 KB to 32 KB. The row-cap, too-large and oversized-cell error texts and the tool description now say to aggregate in SQL and to LIMIT the listed rows, with the numbers taken from the constants. The limits no longer mirror the decommissioned agent's `conversation_sql.py` (R091). The `pwa_chat_tool_calls` journal cap (256 KB per call) is unchanged and is no longer reached by this tool.
- **Overdue list** (`prompt.mjs`, common questions). More than 10 overdue charges: the newest 10 plus one line with the count and total of the rest, so the portfolio-wide answer fits the cap.
- **Grounding test** (`tests/unit/chat-grounding.test.mjs`, Chase). A total, ten listed lines and the rest ground, with or without a SQL rest total; a wrong rest or total is refused. Grounding itself is unchanged.
- **History epoch.** The prompt and tool declarations are part of `prompt_sha256`, so each existing thread starts a new history epoch once, on its next turn after the deploy (designed behaviour; the seed from the thread's messages carries the conversation over).
- **Documents** (Dewey): `project/outputs/r090-pwa-chatbot/DESIGN.md` (caps and the name rule), `project/Documents/Solution_Design.md` (chat paragraph), `project/Documents/Development_Changes.md` (one R092 row), this note. Not changed because they hold no affected fact: `database/README.md` (no SQL), the Data Dictionary (no object), `Environment_Inventory.md` (pins are recorded at deploy time), `Release_Tracker.md` (the Open row holds only the number; R092 is not frozen).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck` (Byte) | Pass (exit 0) on the batch tree over `1db8d7e9` |
| `node --test tests/unit/chat-*.test.mjs` | 97 tests: 96 pass, 0 fail, 1 skipped (the digest rebuild test, which needs `MW_CHAT_DIGEST_PORT`); final tree, including Chase's new aggregate-first grounding test and the overdue-line wording |
| Chase's review of the diff | No blocking findings; the optional overdue-list wording (newest 10 plus a rest line) was applied |
| `npm run check:docs` | 0 failures, 0 warnings |
| Pull request `Development checks` | Pending |
| DEV re-test of "What is due today?" (English) | Pending |

## Not run
No SQL, database rebuild, Playwright or Terraform check applies: no SQL, UI or infrastructure file changes.

## Recovery
Git baseline `1db8d7e9` (origin/main). The chat service is the only deployed artifact: roll it back by pinning the previous API image on the chat service in DEV and PROD (the R091 image, recorded in the Environment inventory), with no SQL or Hosting step. The prompt epoch change is one-way but harmless: the next turn after a rollback starts another epoch seeded from the thread messages.

## Open questions
None.

## Remaining work
Deploy to DEV, owner re-test, then PROD under the owner's instruction; record the promotion in this note and the pins in the Environment inventory; close R092 in the tracker. The three dead VM keys and the agent's SELECT on the notification, push and jobs tables, carried from R091, remain R092 scope.
