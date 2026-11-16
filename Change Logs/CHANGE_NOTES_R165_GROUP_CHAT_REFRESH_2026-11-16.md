# Change notes — Group chat summary refresh button (R165), 16 November 2026

## Purpose
Owner request of 16 November 2026: a refresh button on the Collection detail's group chat summary card that asks the integration agent for a fresh summary instead of waiting for the next new message and the quiet period.

## Changes
Owner authorizations of 16 November 2026 (recorded as given):
- Migration V150, new table `public.pwa_group_chat_refresh_requests` and the functions `pwa_request_group_chat_refresh_v1` and `pwa_complete_group_chat_refresh_v1`, with V97 change-log triggers and V147-style grants.
- The new integration-agent capability, a PWA-triggered forced summary run. The PROD agent deploy happens only with this release's promotion.
- Visual option A: a 44 by 44 px icon-only refresh button in the card heading.
- The card stays hidden for a borrower without a summary; the owner declined a "No summary yet" card.
- Production approval, once (owner instruction of 16 November 2026): "push when it's all verified. promote all the way to prod." It covers V150, the reader grant, backups, the merge of the R165 pull request to `main` for the package, the command-service and API images, PWA Hosting and the integration-agent PROD deploy of catalogue revision 39. Order: V150 before the new images, because without it a tap answers 503 and the card shows "Couldn't refresh".

Flow:
1. The PWA calls `POST /api/collection/{borrowerId}/chat-refresh` on the command service (body exactly `{}`; read-capability member, Partner resolved by the server, no notification). It replies 200 `{ok:true, kind (accepted|pending|recent), requestId, requestedAt, completedAt, outcome}`, or 400, 403, 404, 409, 415 or 503. The request is not queued again while one is pending within 10 minutes or completed within 60 seconds.
2. The agent's existing 2-minute `group_chat_summary` run reads `GET /internal/agent/group-chat-refreshes` (200 `{environment, requests:[{borrowerId, requestId, requestedAt}]}`, open requests younger than 10 minutes, oldest first, at most 20; 401; 404 with no policy or another method, read by the agent as no requests; 503 `refresh_unavailable`, also before V150). It summarises the requested groups first, then posts the outcome (`stored`, `unchanged`, `cleared`, `no_group` or `failed`) to `POST /internal/agent/group-chat-refreshes` (`{command:{schemaVersion:1, environment, requestId, outcome}}`, at most 4096 bytes; 200 `completed`, `replayed` or `unknown_request`; 400 `invalid_refresh_command`; 401; 503 `refresh_unavailable` or `refresh_outcome_unknown`). A borrower's groups are every group whose remembered members include the borrower; requested groups (oldest request first) come before marked ones within the 5-group limit and 150 s budget; a request is reported only when all its groups ran; a failed requested group does not change the back-off. A multi-group borrower takes the first applicable outcome of stored, unchanged, failed, cleared.
3. The Collection detail and the offline dataset carry `groupChatRefresh {requestedAt, completedAt, outcome}`: omitted before V150 or without the reader grant, null with the grant and no request. The offline dataset shape moves from v12 to v13, so every installed bundle re-downloads once. The PWA polls every 15 seconds while the card is open and stops after 6 minutes.

Documents updated (Dewey):
- `project/Documents/Release_Tracker.md`: the R165 row (scope, authorizations, links).
- `project/Documents/Development_Changes.md`: the R165 outstanding-work row.
- `project/Documents/Solution_Design.md` and `project/Documents/PWA_Data_Model_Overview.md`: the R165 paragraphs.
- `database/README.md`: the V150 entry (not yet applied).
- `docs/Development_Read_Service.md`: the `groupChatRefresh` read key.
- `project/Documents/Environment_Inventory.md`: two planned, not applied, Database schema rows (DEV and PROD) for V150 and the reader column grant on `pwa_group_chat_refresh_requests(borrower_id, requested_at, completed_at, outcome)` that Forge prepared in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py`. They become applied records when verified.
- Data Dictionary PWA records `systems/pwa/human-api.yaml`, `agent-api.yaml` and `application.yaml` (route, key and card behaviour) and the rebuilt `index.json`. The PostgreSQL relation and routine records for the new table and functions follow a PROD capture at release closure, as for R146 and R149.
- Integration agent: see the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_GROUP_CHAT_REFRESH_2026-11-16.md) (catalogue revision 39, README, Conversation poll, Operations).
- Not changed: infrastructure, IAM, secrets, hosts, deployment pins.

Files (Byte, uncommitted on base `58fc004`):
- New: `database/migrations/V150__group_chat_refresh_requests.sql`, `scripts/database/Test-GroupChatRefresh.sql`, `apps/pwa/src/chat-refresh.ts`, `tests/unit/group-chat-refresh.test.mjs`.
- Database and chat: `database/current/public-functions.sql`, `scripts/database/Test-StatementBatch.sql` (lock-key count 14 to 15), `Test-AccessMatrix.sql`, `Test-RowChanges.sql` (row triggers 21 to 22), `Test-TriggerOrder.sql`, `scripts/chat/build-schema-digest.mjs`, `services/chat/assets/schema-digest.json` (the new table is excluded, the functions fall under the existing `public.pwa_` exclusion, only `"migration"` changed to 150).
- Services: `services/payment-command/handler.mjs` and `store.mjs`, `services/agent-receipts/contract.mjs` and `runtime.mjs`, `services/api/collection-read-contract.mjs`, `services/business/offline-dataset-chunks.mjs` and `offline-dataset-delta.mjs`.
- PWA: `apps/pwa/src/CollectionChatSummary.tsx`, `CollectionRecords.tsx`, `offline-dataset.ts`, `live-style.css`, `style.css`, `main.tsx`.
- Integration agent: `src/.../group_chat_summary.py`, `receipt_api.py`, `scripts/deploy-runtime.py` (`R165_REVISIONS`), tests `test_group_chat_summary.py`, `test_deploy_runtime.py`, `test_config.py`, `test_receipt_recognition.py`.
- Tests: `tests/unit/offline-dataset-delta.test.mjs`, `tests/unit/collection-read.test.mjs`, `tests/integration/ledger-owner-operator-independent.test.mjs`, `tests/e2e/collection-chat-summary.spec.ts`.
- Forge: `scripts/production/reader-capability-contract.json`, `scripts/configure-dev-read-role.py`.
- Catalogue file `integration-agent/service-catalogue.json` (Dewey), at revision 39.

Data rules: no borrower data, secrets or Instagram identifiers are recorded here; tests use invented data only.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, work tree) |
| Full migration chain plus `Test-StatementBatch.sql` on a disposable PostgreSQL 18 | Pass (Byte, base `58fc004`, uncommitted work tree) |
| `npm run typecheck` | Pass (Byte, same tree) |
| Lint | Pass, 2 old warnings (Byte, same tree) |
| `npm test` | 1397 pass, 0 fail, 1 skip (Byte, same tree) |
| `tests/unit/group-chat-refresh.test.mjs` | 11 of 11 pass (Byte, same tree) |
| `ruff check` (integration agent) | Pass (Byte, same tree) |
| Agent `unittest` | 993 run; only `test_receipt_qr` fails, because `zxingcpp` is missing in the container (Byte) |
| `Run-R053OperatorIndependent.ps1 -LedgerOwner` as `postgres` | Pass, 1 of 1 (Chase; V1 to V92 as superuser, then the non-superuser operator to V150; 22 ALWAYS row triggers and 22 truncate triggers) |
| `offline-delta-v4-collection-cash-lab.test.mjs` on a lab at V1 to V150 | 4 pass, 0 fail, 1 skipped (Chase; the day-change scenario needs a libfaketime lab, not set up) |
| `npx playwright test tests/e2e/collection-chat-summary.spec.ts --trace off`, desktop-chromium and mobile-chromium | 29 passed, 3 skipped, 0 failed (Chase) |
| `Update-PublicFunctions.ps1` compare | Matches (Chase) |
| `python -m unittest tests.test_group_chat_summary` (integration agent) | 82 OK (Chase) |
| SQL probes on the lab (Chase) | Accepted, pending, recent and stale-replace paths; 42501 for actor and EXECUTE; P0002; a replay keeps the first outcome; 11 malformed inputs give 22023; concurrent taps leave one row; grants are exactly `mw_app_dev` under hostile default privileges; triggers ENABLE ALWAYS |
| Polling timers (Chase) | Clear on outcome and on closing the detail |
| Chase's verdict | Pass. One defect fixed before the push: device clock skew; the 6-minute wait is now counted on the device clock from the tap or first sight, capped (Byte; unit test 12 of 12, typecheck and lint pass) |
| Echo's rendered review (WebKit iPhone 17 Pro Max, 320 to 480 px, Thai and English, current and stale, with and without the speaker tag, five states) | Pass after UX-CHATREF-18 (the offline disabled look) was fixed in `apps/pwa/src/live-style.css` and `style.css` |
| First CI run on `6cf7e7c` (Development checks [43903703827](https://github.com/welct0407/MW-Credit-App/actions/runs/43903703827), Database migrations [43903647075](https://github.com/welct0407/MW-Credit-App/actions/runs/43903647075)) | Two failures, both test-only, fixed in the next commit. (1) `rebuild (migrations)`: `scripts/database/Test-GroupChatRefresh.sql` compared sorted reply keys under CI's `en_US.UTF-8` collation (R131), which sorts `requestedAt` before `requestId`; now `ORDER BY k COLLATE "C"`. Chase re-ran `Test-MigrationsCloud.py` with `MW_DB_COLLATION=en_US.UTF-8`: 150 migrations, SQL passed, concurrency and checksum checks passed. (2) `e2e iPhone WebKit (shard w3)`: `tests/e2e/referrers-independent.spec.ts:37` raced the header `h1` (the view title once signed in) against the page `h2`, both "Referrers"; reproduced on base `58fc004` at the same rate (Chase), so it predates R165. Now `level:2`; mobile-webkit `--repeat-each 3`: 30 passed. All other jobs passed |
| `Development checks` run on the corrected head | Pending: the run id is added after the push |
| DEV deployment (V150, reader grant, images, Hosting) and PROD promotion evidence | Pending: Forge's records are added when the promotion runs |

## Not run
- Byte did not run the full `mw-db-ci` or the Playwright suite locally; they are left to the pull request's `Development checks` run. `test_receipt_qr` is not run for lack of `zxingcpp` in this container.
- The day-change scenario of `offline-delta-v4-collection-cash-lab.test.mjs` (needs a libfaketime lab), the live polling against the DEV API (there is no DEV agent) and the full `mw-db-ci` and Playwright suite locally (left to the pull request's CI).
- The agent half cannot be exercised in DEV (there is no DEV agent); it is verified in PROD after promotion.

## Recovery
Git baseline R164 `main` `58fc004`. Before deployment, revert the commit. V150 is forward-only: a deployed table is left in place and unused. A database before V150 or without the reader grant omits `groupChatRefresh`, and a tap answers 503. The reader grant is undone with `REVOKE`. A PROD database change needs a verified restorable backup; its reference is recorded in the promotion record. The agent rolls back with `deploy-runtime.py rollback` to the previous commit.

## Open questions
None.

## Remaining work
Byte's code and tests, Chase's verification, the DEV deployment evidence, the owner's promotion instruction, then the promotion record and the Data Dictionary PostgreSQL records at closure.
