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
| `node --test tests/unit/chat-*.test.mjs` | 97 tests: 96 pass, 0 fail, 1 skipped (the digest rebuild test, which needs `MW_CHAT_DIGEST_PORT`), on the merged tree |
| Chase's review of the diff | No blocking findings; the optional overdue-list wording was applied |
| `npm run check:docs` | Pass, 0 failures, 0 warnings, on the closure documents |
| Pull request `Development checks` (PR #139, head `70b1c427`) | Pass: run [40067322942](https://github.com/welct0407/MW-Credit-App/actions/runs/40067322942) (check, lint; e2e and terraform skipped as unaffected) and Database migrations run [40067308617](https://github.com/welct0407/MW-Credit-App/actions/runs/40067308617) (guards and the four rebuild groups); merged as `99ce0f06` |
| DEV and PROD chat smoke | Pass, see the Environment inventory rows (`/health` 200, 401 without a token, preflight 204, no ERROR logs) |

## Not run
No SQL, database rebuild, Playwright or Terraform check applies: no SQL, UI or infrastructure file changes.

## Recovery
Git baseline `1db8d7e9` (origin/main). The chat service is the only deployed artifact: roll it back by pinning the previous API image on the chat service in DEV and PROD (the R091 image, recorded in the Environment inventory), with no SQL or Hosting step. The prompt epoch change is one-way but harmless: the next turn after a rollback starts another epoch seeded from the thread messages.

## Open questions
None.

## Remaining work
Finish the DEV and PROD chat image deploys (Forge), fill the placeholders in the promotion record and the Environment inventory, then mark R092 Released and create the tag. The three dead VM keys and the agent's SELECT on the notification, push and jobs tables, carried from R091, are carried to R094 (R092 and R093 did not take them).

## Promotion record

[Template](../project/scripts/releases/templates/promotion-checklist.md), revision 14 October 2026. Recovery: [Release recovery runbook](../project/Documents/Rules/Release_Recovery_Runbook.md). Deployment pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md).

### Continue here
- Outcome/scope and affected components: R092 is Released to DEV and PROD (24 October 2026) as a chat-service-only release: the chat prompt (borrower names follow the reply language; aggregate first) and the `sql_query` limits (100 rows, 32 KB). Only the chat service `mw-credit-app-chat-{dev,prod}` changed. No SQL, no Hosting, no change to the reader, command, notify and jobs services.
- State and next action or actual blocker: applied and verified in DEV and PROD. Tag `R092` on `99ce0f06`; next: the owner's first English "What is due today?" in PROD.
- Source/artifact/configuration pins; runner manifest link: source `99ce0f06` (PR #139 merged to `main`; baseline R091 `db7789e3`). No runner manifest (see Deviations). Images, Cloud Build ids, plan hashes and activation generations are in the Environment inventory.
- Existing owner authority and any explicit hands-on checkpoint: the owner's instruction of 24 October 2026, "don't stop at dev. push all the way to prod", the scoped production approval for the chat-image-only R092. It covers the DEV and PROD chat image apply and the standard records. It does not cover forced notifications, jobs or financial writes, and none happened. The owner skipped the DEV re-test.
- Previous deployed baseline and recovery: DEV and PROD chat on the R091-era images, other services unchanged. Rollback: DEV restore the previous `chat_image`; PROD set `runtime_image_overrides` back to `{}` (or the R091 digest); plan 0/1/0, apply, publish the activation (previous revisions and generations in the inventory).
- Scope freeze/next-number handoff: R092 Frozen and R093 opened with the counter at R094 in the [tracker](../project/Documents/Release_Tracker.md); R092 is now Released there.
- Checks: see Checks above (PR #139 runs 40067322942 and 40067308617).

### Promotion
| Step | Completion evidence |
| --- | --- |
| Scope, target, authority and usable recovery confirmed | Owner instruction recorded once above; PROD target verified by Forge (project `clever-oasis-508610-n7`, `asia-southeast1`, `mw-credit-app-chat-prod`); previous revision, image and activation generation captured as the rollback |
| Required affected checks passed or explicit owner deferral recorded | Merged PR #139; the owner skipped the DEV re-test |
| Tested package captured; tracker freeze/handoff published | DEV image built from an exact git archive of `99ce0f06` (Cloud Build `91e7e0b8-4c33-45ef-a6d4-2194ecda640e`); PROD image built the same way (Cloud Build `42e3ce47-c72b-41a7-b5b5-c20072ed172a`, tag `keep-r092-runtime`); freeze published with R093 opened |
| Changed components deployed in dependency order | DEV chat 05:51:54Z to 05:52:24Z, plan 0/1/0, re-plan no changes; PROD chat 05:57:37Z to 05:58:17Z, plan 0/1/0 (`runtime_image_overrides["chat"]`), re-plan no changes |
| Version/environment and affected PROD smoke verified once | DEV and PROD chat `/health` 200, 401 without a token, preflight 204, no ERROR logs; the other four services unchanged in both; nothing forced |
| Actual outcome/changed owning facts recorded; intended publication and final tag verified | Inventory, tracker, Development Changes and this note updated; tag `R092` on `99ce0f06` (annotated tag `e06f2afd`, Release tag workflow, 24 October 2026) |

SQL: none. Infrastructure: the reviewed 0/1/0 plan per environment with its actual apply and re-plan. Notification and jobs: unchanged; nothing forced.

### Deviations and limitations
1. No Hosting step and no runner kind: the Hosting runner (`deploy-business-hosting.mjs`) is a Hosting, SQL and five-service kind per release and does not fit a chat-only image; the R087 and R090 batch 2c precedent (Cloud Build, Terraform plan and apply, activation publish) was used. The live app marker stays at R091.
2. PROD chat runs a different image from the other four services (`runtime_image_overrides["chat"]`); their code is behaviourally unchanged. The next release's runner kind must pin the chat service separately.
3. The owner's DEV re-test was skipped by the owner's instruction.
4. The builds needed the established builder identities and staging buckets, because the default compute service account cannot read the source bucket. A failed first submit left one unused source tarball in `gs://clever-oasis-508610-n7_cloudbuild/source/` (not built, not deleted).
5. Limitation: the first English "What is due today?" in PROD is the real acceptance check (English names, fewer rounds and prompt tokens); each thread starts one new history epoch.

### Close
- Outcome: applied and verified in DEV and PROD (smoke above); owner re-test follows.
- Recovery reference: Continue here and the Recovery section above.
- Changed documents, if any: Environment inventory (DEV and PROD chat rows, keep tag), Release Tracker, Development Changes, `DESIGN.md`, Solution Design, and links repointed for the pruning below.
- Published evidence/tag: tag `R092` on `99ce0f06` (annotated tag `e06f2afd`, Release tag workflow, 24 October 2026).
- Outstanding owner action, if any: the first English re-test in PROD; the default chat model decision from R090 remains open.

### Closure pruning (release workflow, 24 October 2026)
- Inbound links repointed first to the commit permalink of `99ce0f06` (the last commit where the targets exist): `database/README.md`, `project/Documents/Development_Changes.md`, `project/Documents/Release_Tracker.md` and `project/Documents/Environment_Inventory.md`.
- Change notes deleted (R089 left the retention window of R092, R091 and R090): `Change Logs/CHANGE_NOTES_R089_GRAFANA_REVAMP_2026-10-22.md` and `Change Logs/CHANGE_NOTES_R089_NOTIFICATION_HISTORY_TEXT_2026-10-22.md`.
- Development Changes: the R092 row is replaced by one R092 follow-up row; the R089 rows stay as carried follow-ups with permalinks.
- Evidence deleted: none (`npm run check:docs` reports no uncited evidence).
