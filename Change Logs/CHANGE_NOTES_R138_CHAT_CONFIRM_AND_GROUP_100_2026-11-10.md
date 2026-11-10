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
- Group confirm progress (found by the DEV test, PWA only; pre-existing since R106 D12, more visible at 100 lines): during a group confirm the card showed its local guess ("3 done · 97 not run", "Confirm 97 remaining", disabled while busy), and after a remount mid-run the same with an enabled button (the server refuses with 409 `proposal_executing`; no double save is possible, each line is claimed once and request ids are idempotent). `groupView` takes a `running` option, the card checks `groupInFlight` on mount with an immediate read, and `runningEnded` (two quiet reads) ends `pollGroup` through its `until` option. New e2e tests "R138: a confirm stream that drops mid-group" and "R138 (Chase): a card mounted mid-run".
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
| CI, PR #277 head `456a6c9` | Pass: `Development checks` run 42763518963 (including 3 iPhone WebKit shards), `Database migrations` run 42763496030, agent run 42763519179 |
| Group-confirm card fix (Byte, Chase) | Pass: chat unit 77 of 77; `chat.spec.ts` proposal tests desktop-chromium 9 of 9; lint; typecheck. Chase's review of the first version found the remount and early-clear defects, both fixed. CI run 42770027498 on the package commit `541a47e6` |
| `npm run check:docs` | Pass, 0 failures (Dewey) |
| DEV functional test (Chase) | Pass, see DEV deployment evidence |
| PROD promotion | Pass, see the PROD promotion record below |

## DEV deployment evidence
Forge, 10 November 2026 (UTC). Package: PR #277 head `456a6c9`; CI as in the Checks table.
- Backup at V140: `dev-refresh-a4d6e40050f34892a670adcb75462fac` (restore check passed, 39 table fingerprints).
- Image: digest `sha256:cc44946e…`, Cloud Build `8b2abd9a…`.
- V141: six DEV owner windows open 05:58:14Z to 06:06:20Z (the README requires all six for the post-migrate reconcile; R137 precedent); applied 05:58:41Z; `verify` schema 141.
- Terraform: the DEV tfvars `chat_models` override also set to `maxOutputTokens` 32768; plan 0 add, 3 change, 0 destroy, applied 06:09:28Z to 06:10:03Z; settings generation `1794290965690897` (previous `1794221803831392`). Revisions: read `00079-xjb`, command `00096-wl7`, chat `00048-cfx`.
- Hosting: version `79e38b3da3d9aefe`, build-version R138 `6b180668…` (before the group-confirm card fix). Read-only smoke passed, no ERROR logs.
- Rollback: settings generation `1794221803831392`, then Hosting `7cb80157ed2451f1`; V141 stays (function only).
- Functional test (Chase): 100 synthetic `charge.create` lines on the DEV test loan `f500147e-…`. The chat sent 3 chunks of 25 with `more:true` and a final call; the turn took 122.9 s with 15,430 output tokens and no timeout. One 100-line card appeared with Confirm enabled at once, without scrolling. Confirm `a87efdfe-…` returned 200 in 74.9 s with 100 of 100 done (about 0.73 s per line). Left in DEV: 100 synthetic charges (18 November 2026 to 25 February 2027, 1 baht interest, notes "R138 DEV test n").
- Hosting redeploy with the group-confirm card fix (Forge, 07:02:50Z to 07:02:57Z) from `541a47e6`: version `d48809b344706a34`, release `1794294177046000`, build-version R138 `4a37780042239ff73cc1772b`, entry `/assets/index-BNK2iKl9.js`; images unchanged (the runner reports no image change for the PWA-only delta); smoke passed. Rollback: Hosting `79e38b3da3d9aefe`.
- Team note: a second Chase worker was started for the DEV test instead of continuing the first (orchestrator error).

## Not run
No authenticated PROD read, financial write or forced notification. Real iOS Safari was not exercised (CI iPhone WebKit shards passed). WebKit e2e was skipped locally, and CI ran it on the iPhone WebKit shards. No real model call with a 100-line request was made.

## Recovery
Git baseline: `673c411` (the commit before this batch). V141 is function only: the service build before this change sends at most 20 lines, which V141 accepts, so the database can stay at 141 while the service and Hosting roll back; a later migration restores the 1..20 limit if needed. Terraform: set `maxOutputTokens` back to 16384 in both files.

## Open questions
None for the owner; the DEV test is a long payment plan update, then Confirm without scrolling.

## Remaining work
- Owner acceptance in PROD: the first real chat plan update (Confirm clickable at once, a long card).
- Known limits, accepted: the 240 s turn limit leaves a thin margin on a slow model (the DEV 100-line turn took 122.9 s), and the `recent_actions` read sees only 5 rows. Echo's deferred items CWR-14 to CWR-17: collapse long cards, a summary block, a sticky bar and a tap guard. Real iOS Safari was not exercised.
- The DEV test left 100 synthetic charges on the DEV test loan.

## PROD promotion record (Forge, 10 November 2026, UTC)
Authority: the owner's instruction of 10 November 2026, "Move to dev, test and promote to prod", relayed by the orchestrator as the scoped PROD approval for R138: the PROD backup and restore verification, V141 (a function only) on `loan_manager_prod`, the standard temporary owner window and its restoration, the changed images, the chat `maxOutputTokens` setting, Hosting and the technical records. No payment, notification or job was forced, and no financial correction or other data write was made; the smoke is read-only. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in `gs://mw-credit-operator-private-737787224638/promotion-packages/r138/`.

| Step | Result |
| --- | --- |
| Freeze | Release R138; package `541a47e6153adc9a2691b705b6dd913f48291fab` (PR #277 head, as R137 was promoted from its PR head), merged to `main` as `de80ca66` (07:20Z). Baseline R137 `0e9997c8`. Next unused number R140 (R139 opened by the closure pull request) |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod`, Hosting site `mw-credit-prod-737787224638` |
| Baseline capture | Flyway head 140. Revisions read `00051-kh6`, command `00056-tr2`, chat `00035-8x4` on `d5eae8f1…`; notify `00029-2nb`, jobs `00029-9dp` on `f8cb243b…`; settings generation `1794223508302093`; Hosting `17fa23f731e997e3` (R137). The PROD tfvars `chat_models` override held `maxOutputTokens` 16384 and was set to 32768 |
| Backup at V140 | `prod-promotion-6415db3d20b64c7bb2d93ba360642f4c`, 07:06:38Z to 07:09:09Z: dump sha256 `1abc549a14b998f32031e5d90b9a1ed9c2d7d434f7ce77954b72d7bf3c58c2bd`, restore check passed, 39 table fingerprints |
| Image | Cloud Build `3940b107-7b38-4de4-86be-3914aab2f60f`, digest `sha256:843de14510490e20c1517a15215f57b3d6b63c3e8247b6b6b58030d8f0801324` |
| SQL package | Manifest `release-r138-v141-541a47e6-prod.json` (production transaction 140 to 141); V141 sha256 `03141c6534b15514ee76cac43d4ffacf4d2a12763fe0ccae685c66098d0738dc` |
| Owner window and V141 | Six-owner window (R137 precedent) 07:12:00Z to 07:13:46Z; V141 installed 07:12:55Z; `verify` schema 141 at 07:14:20Z; readback ok |
| Terraform | Plan 0 add, 3 change, 0 destroy, applied 07:16:43Z to 07:17:20Z, settings generation `1794295000512841` (previous `1794223508302093`), re-plan clean. Revisions read `00052-t7m`, command `00057-887`, chat `00036-zwl`; notify and jobs unchanged |
| Hosting | Generic runner as `mw-credit-unattended-admin`, 07:18:26Z to 07:19:07Z: version `31c51ca5c1242984`, release `1794295141261000`, build-version R138 `54dc608e15dfae64b9abebb5`, entry `/assets/index-Dqa7MtHT.js`. The live `CHAT_MODELS_JSON` equals the plan (Opus 5.5, `maxOutputTokens` 32768) |
| CI receipts | `Development checks` run 42770027498 on `541a47e6`; Terraform evidence run 42763518963 and `Database migrations` run 42763496030 on `456a6c9` (input-equivalent) |
| Smoke (read-only) | Passed; no ERROR logs 07:06Z to 07:19:33Z |
| Rollback | Settings generation `1794223508302093`, then Hosting `17fa23f731e997e3`. V141 by a forward fix only (a later migration restoring the 1 to 20 limit; the earlier service sends at most 20 lines, which V141 accepts) |

### Deviations
- None recorded.

### Limitations
- No authenticated PROD read, financial write or forced notification; PROD owner acceptance is pending.

### Tag record
Annotated tag `R138` on `541a47e6153adc9a2691b705b6dd913f48291fab` (the PR #277 head, on `main` through merge `de80ca66`) through the Release tag workflow, run [42774674165](https://github.com/welct0407/MW-Credit-App/actions/runs/42774674165), succeeded; GitHub Release published in the same run.

### Closure notes
- Acceptance: PROD acceptance by the owner is pending (the first real chat plan update).
- Data Dictionary: not refreshed. V141 replaces one function body and changes no table, column, view or grant, so no relation record changes.

### Prune (closure)
Deleted as outside the retention window with no inbound link from any current document (no link needed repointing; Git keeps them, last present at `de80ca66`): `Change Logs/CHANGE_NOTES_LOAN_REPORTS_REDESIGN_DESIGN_2026-10-26.md` and `integration-agent/Change Logs/CHANGE_NOTES_POLL_TIMEOUT_AND_HEALTH_2026-10-26.md`. The window after this closure is R138, R137 and R136, so no release note left it and no evidence became uncited. The Development Changes row for R138 is removed (the tracker row links this record).
