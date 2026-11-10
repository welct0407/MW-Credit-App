# Change notes — chat Confirm always clickable and 100 changes per card (R138), 10 November 2026

## Purpose
Owner report of 10 November 2026: a payment plan update for a borrower through the chat did not work. (1) The Confirm button on the card could not be clicked, even after scrolling; make it clickable directly. (2) The limit of 20 changes per card is still small; raise it to 100. The owner asked the team to work on it.

## Changes
- Confirm (Byte): the cause was the visibility gate CWR-01 (an IntersectionObserver that kept Confirm disabled until the whole card had been seen). Scrolling never registered the middle of a card taller than the pane, so Confirm never armed. The gate is removed: Confirm is enabled when the device is online, the card is pending, not busy and not expired, and the remainder choice (if the card asks for one) is made. The arm hint text is removed. Files: `apps/pwa/src/chat/ChatProposalCard.tsx`, `apps/pwa/src/chat/chat-protocol.ts` (`seenThrough` and the `seen` option removed), `apps/pwa/src/chat/chat-text.ts`.
- Limit 1..20 to 1..100 (Byte): `MAX_GROUP = 100` in `services/chat/proposals.mjs`; the line limit check in `parseChanges` (`services/chat/tools.mjs`) follows it. The group rules are unchanged (no target twice, no line using a record created in the same group, a payment or loan close alone for its borrower).
- `database/migrations/V141__chat_proposal_group_100.sql` (Byte): function only. `pwa_chat_proposal_create_v1` is replaced in place with the V119 body and the limit `BETWEEN 1 AND 100`; no table, column, grant, role, trigger or data change; owner, ACL and comment are kept and proven by the self-check. `database/current/public-functions.sql`, `scripts/database/Test-Chat.sql` and the chat schema digest (`services/chat/assets/schema-digest.json`, rebuilt at 141) follow.
- Chunked proposals (Byte): the VM relay cuts one model request at 110 s, so one call with 100 changes cannot finish. `propose_action` gains the optional boolean `more`. The model sends at most 25 changes per call (`PROPOSE_CHUNK`) with `more:true` on every call but the last; the service holds the planned lines in memory for the turn only (nothing is stored before the final call) and creates the one group, and its one card, on the call without `more`. Errors name the line in the whole group (`LINE_<n>:<code>`). Any failed `propose_action` call (a chunk or the final one, argument errors included) empties the held lines and releases the lock, so the model sends every change again; the only exception is `ONE_PROPOSAL_PER_TURN` after a successful final call (Chase's two review defects, fixed by Byte). Calls run one at a time in call order. Files: `services/chat/tools.mjs`, `services/chat/handler.mjs`, `services/chat/proposals.mjs` (`planLines` and `finishGroup`), `services/chat/prompt.mjs` (the schema digest and prompt change, so every thread opens a new history epoch on its first turn after the deploy).
- Confirm all deadline: `GROUP_DEADLINE_MS` 180 s to 270 s, inside the chat service's 300 s Cloud Run request timeout; lines not claimed by then stay pending ("Confirm N remaining").
- Promotion check (Forge): the generic promotion kind in `scripts/promotion/deploy-business-hosting.mjs` now allows a chat-settings-only `CHAT_MODELS_JSON` change (`maxOutputTokens` and the like, within bounds) together with a chat image change, and the live readback compares `CHAT_MODELS_JSON` exactly; `scripts/promotion/README.md` updated; `tests/unit/business-hosting-delivery.test.mjs`.
- Output budget (Forge): `maxOutputTokens` 16384 to 32768 in `infrastructure/dev/chat-service.tf` and `infrastructure/production/chat-service.tf` (a 100-line group). Written, not applied.
- Tests (Byte): `tests/unit/chat-handler.test.mjs`, `tests/unit/chat-proposals.test.mjs`, `tests/unit/chat-pwa.test.mjs`, `tests/e2e/chat.spec.ts`.
- Records: `database/README.md` (V141), `project/Documents/Solution_Design.md` (R106 paragraph: 100 changes, chunks, no gate), `project/Documents/Release_Tracker.md` (R138 scope), `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| `npm test` (Byte, before the defect fix) | Pass, 1255 pass, 1 skip |
| `node --test tests/unit/chat-handler.test.mjs tests/unit/chat-proposals.test.mjs tests/unit/chat-pwa.test.mjs` (Byte, after the fix) | Pass, 73 of 73 |
| lint, typecheck (Byte) | Pass, 0 lint errors |
| Disposable cluster V1 to V141 (Byte) | Pass; `public-functions.sql` matches; schema digest test 4 of 4; `Test-Chat.sql` pass; `Test-AccessMatrix.sql` pass |
| `chat.spec.ts` e2e (Chase) | Pass, 50 of 50 on Chromium desktop and mobile; WebKit 4 skipped (not run locally) |
| Chase diff review | Two defects found (a failed call kept held lines or the lock): fixed by Byte, covered by the 73 tests above |
| `node --test tests/unit/business-hosting-delivery.test.mjs` (Forge) | Pass, 136 of 136 |
| CI (`Development checks`, `Database migrations`) | TBD (run id) |
| `npm run check:docs` | Pass, 0 failures (Dewey) |
| DEV and PROD promotion records | TBD |

## Not run
Nothing is deployed, applied or pushed by this note. V141 is not applied to DEV or PROD, and the two Terraform changes are not planned or applied (at the time of this note). WebKit e2e was skipped locally. No real model call with a 100-line request was made.

## Recovery
Git baseline: `673c411` (the commit before this batch). V141 is function only: the service build before this change sends at most 20 lines, which V141 accepts, so the database can stay at 141 while the service and Hosting roll back; a later migration restores the 1..20 limit if needed. Terraform: set `maxOutputTokens` back to 16384 in both files.

## Open questions
None for the owner; the DEV test is a long payment plan update, then Confirm without scrolling.

## Remaining work
- Known limits, accepted: a 100-line request can still reach the 240 s turn limit on a slow model, and the model then has to be asked again for the rest; the `recent_actions` read still shows at most 20 rows.
- Owner instruction of 10 November 2026, "Move to dev, test and promote to prod": DEV first (V141 in an owner window after a verified backup at V140, chat image, Hosting, Terraform), then the test, then PROD with its own verified backup. The DEV and PROD promotion records are added when they exist.
