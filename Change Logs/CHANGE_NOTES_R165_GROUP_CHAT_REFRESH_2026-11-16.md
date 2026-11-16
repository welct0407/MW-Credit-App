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
| `Development checks` run [43907338253](https://github.com/welct0407/MW-Credit-App/actions/runs/43907338253) on the corrected head `b67a4aa7` | Success, after one re-run of a flaky `loan-rollover-independent` e2e on mobile-chromium shard 3; it passed on the identical product code in run 43903703827 |
| `Database migrations` run [43907321517](https://github.com/welct0407/MW-Credit-App/actions/runs/43907321517) | Success |
| Pull request | PR #341 merged 16 November 2026 as `main` `907650de4a928392e76805503724dd607828c2db` (the package), baseline R164 `d10a445e` |
| DEV deployment and read-back | Pass: see the DEV deployment record below |
| PROD promotion and read-back | Pass: see the PROD promotion record below |
| Release tag | `R165` on `907650de` (Release tag run 43917865117, success; the same run published the GitHub Release) |

## Not run
- Byte did not run the full `mw-db-ci` or the Playwright suite locally; they are left to the pull request's `Development checks` run. `test_receipt_qr` is not run for lack of `zxingcpp` in this container.
- The day-change scenario of `offline-delta-v4-collection-cash-lab.test.mjs` (needs a libfaketime lab), the live polling against the DEV API (there is no DEV agent) and the full `mw-db-ci` and Playwright suite locally (left to the pull request's CI).
- The agent half cannot be exercised in DEV (there is no DEV agent); it is verified in PROD after promotion.

## Recovery
Git baseline R164 package `d10a445e` (the work tree was written on `58fc004`); the R165 package is `907650de`. Deployed: the rollback targets are in the PROD promotion record below (Hosting, the `before-r165` settings, the agent rollback). V150 is forward-only: a deployed table is left in place and unused. A database before V150 or without the reader grant omits `groupChatRefresh`, and a tap answers 503. The reader grant is undone with `REVOKE`. A PROD database change needs a verified restorable backup; its reference is recorded in the promotion record. The agent rolls back with `deploy-runtime.py rollback` to the previous commit.

## Open questions
None. Owner acceptance is pending, and is recorded in the next closure or product pull request.

## Remaining work
Owner acceptance, including the first real refresh tap. Grafana dashboards and Metabase reports drift stays unverified (credentialed reads not supplied).

## DEV deployment record (Forge, 16 November 2026 UTC)
Authority: the owner's production approval above (DEV first). Package: a clean `git archive` of `b67a4aa7` (merged as `907650de`). Baseline: DEV Flyway 149, read `00098-fcv`, command `00115-h26` and chat `00067-tz4` on `178a0f03…` (R161), notify and jobs R159, Hosting R163 `576c3a4da920176e`.

| Step | Result |
| --- | --- |
| Backup | `dev-refresh-1fa7e94517a04f84887b2a40a2c4c519`: restore and 41 table fingerprints ok |
| Owner window | Six DEV owners including `mw_changes_owner_dev`, 16:41:03Z to 16:50:01Z, then restored |
| V150 | Installed 16:41:31Z, head 150, `validate` clean 16:49:06Z |
| Reader grant | `configure-dev-read-role.py --apply` 16:50:34Z, readable columns 82 to 86 |
| Image | Cloud Build `31dae790-f3fb-4fa5-8c1c-e61fad548cfa`, digest `sha256:cf5b3845…58da` |
| Terraform | 0 add, 3 change, 0 destroy (image only), applied 16:56:55Z to 16:57:30Z: read `00099-gx8`, command `00116-dsz`, chat `00068-qw6`; settings object generation `1794848302236700` |
| Hosting | Version `4b54402500fb6ae2` (build R165), 16:59:51Z |
| Smoke | `/health` R165 `b67a4aa7` on the three services; three origins; unauthenticated 401; signed-in detail `groupChatRefresh` null; `POST chat-refresh` accepted, then pending (synthetic borrower); no ERROR or 42501 logs |
| Agent | No DEV agent exists; the request stays pending, as expected |

Deviation: the DEV settings object `gs://mw-credit-app-tfstate-737787224638/activation/dev.activation.tfvars` was stale: it still held the R158 images on read, command and chat and the R144 images on the workers, because the R159 and R161 DEV applies never uploaded it. Forge rebuilt `before-r165` from the live state (a no-change plan proved it) and uploaded the R165 settings (generation `1794848302236700`). The files `dev.activation.tfvars.before-r159` and `before-r161`, cited by earlier Environment Inventory rows, were never in the bucket; those rows now say so and name the images instead.

## PROD promotion record (Forge, 16 November 2026 UTC)
Authority: the owner's production approval of 16 November 2026, "push when it's all verified. promote all the way to prod." Package `main` `907650de4a928392e76805503724dd607828c2db` (PR #341, head `b67a4aa7`); baseline R164 `d10a445e`. Freeze 17:02:06Z. Target: project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod`, Hosting site `mw-credit-prod-737787224638`, VM `vm-mw-credit-agent`. Baseline before: Flyway 149; read `00064-xnt`, command `00069-gnv`, chat `00048-zqm` on `a68fdedc…` (R161); notify `00031-mzf` and jobs `00031-dmq` on `56f17745…` (R159); settings state generation `1794730721261561`; Hosting `d5ca4b365e2accf1` (R163); agent R164 `d10a445e`, catalogue revision 38.

| Step | Result |
| --- | --- |
| CI | `Development checks` 43907338253 on `b67a4aa7` (attempt 2 after one flaky e2e re-run) and `Database migrations` 43907321517 green; the Terraform receipt is run 43747953271 on `300ae4e3` (the R165 runs skipped Terraform) |
| Manifest | `release-r165-v150-907650de-prod.json`, 150 migrations, V150 sha256 `60d8182f…67fb` |
| Backup | 17:03:33Z to 17:06:02Z at V149, dump sha256 `f20dfc85b79bba225ae2f77fbd994af9e90b023f491f9e1d5ebe68a147c14544`; listing, isolated restore and 41 table fingerprints ok; recovery record `prod-promotion-00c5cc8003834440858c0afa211c0c7e` |
| CONNECT preflight | 17:07:27Z, sha256 `56c6ee6b…7692` |
| Owner window | `mw_changes_owner_prod` 17:07:47Z to 17:10:01Z, then restored |
| V150 | Check pending `["150"]`; apply 17:08:27Z to 17:09:46Z; V150 installed 17:09:06Z (6.7 s, checksum -2144326310); 150 success rows, 0 failed; verify 17:15:12Z at schema 150 |
| Access | `mw_app_prod` DML and EXECUTE; the functions are owned by `postgres` and not `SECURITY DEFINER`; `mw_integration_agent` has none; triggers present |
| Reader grant | Guarded transaction 17:10:18Z to 17:10:20Z: the four granted columns true, `request_id` and `requested_by` false |
| Image | Cloud Build `61c20704-8681-4905-93e7-aaaadd82aa27` (`cloudbuild-business.yaml`, R165), digest `sha256:e64810b2ab6d38f3c1e84f9d4ca74e191cd9b5a1d91f80e7937482029faa9332` |
| Terraform | `before-r165` plan showed no change; the R165 plan 0 add, 3 change, 0 destroy (image only), sha256 `e3adfc3a…78ab`, applied 17:11:13Z to 17:11:49Z: read `00065-8xs`, command `00070-4vx`, chat `00049-vdq`; notify and jobs unchanged; state generation `1794849108546687` |
| Hosting | Generic runner, package sha256 `94f10d43…d0ba`; apply 17:16:44Z to 17:17:33Z: version `cafa7eb0c47db457`, release `1794849447551000`, build R165 `72a87d567e0f24362d0f952e` |
| Agent | `deploy-runtime.py` update `d10a445e` to `907650de`; freeze 17:18:39Z, rollback directory `runtime-20261116T171839515323Z` (metadata sha256 `c2fe3b3e62cf39df2f0c98c4b0e95dc45488ea9fee2cd5e06dfd40da75b44968`); install 17:18:43Z; activate 17:18:47Z to 17:18:52Z, probe `d54acf3e-e78e-4ce5-b1e3-c724f3e59008`; `mw-chat-relay` restarted 17:19:07Z; the temporary operator file was shredded |
| Verification | `/health` R165 `907650de` on the three services; the three origins serve R165 (`72a87d56…`); unauthenticated 401 on read, `chat-refresh` and the agent route; agent `/ready` true at R165; catalogue 38 to 39 with switches identical; the first R165 `group_chat_summary` run at 17:20:42Z reported the refresh block `requested 0`, errors `[]`; the command service logged `GET /internal/agent/group-chat-refreshes` 200 at 17:20:42Z; no ERROR, 42501 or permission-denied since 17:08Z (checked 17:21:59Z) |
| Tag | `R165` on `907650de`, Release tag run 43917865117 (success; the same run published the GitHub Release) |

Rollback: Hosting `d5ca4b365e2accf1`; the private `production.activation.before-r165.tfvars` (R161 image `a68fdedc…`), a plan of 0 add, 3 change, 0 destroy; the agent `deploy-runtime.py rollback --commit d10a445e…`. V150 and the grant may stay (forward fix; the V149 backup is the restore point).

Not exercised in PROD: a real refresh tap (PROD refuses the DEV test account by design); the owner's first tap is the first live request.

Deviation: the PROD settings object `activation/production.activation.tfvars` (generation `1794675284506672`) was stale: it still held the R158 image `0b99ddf8…` on read, command and chat and `63e5b48f…` on the workers, because the R159 and R161 applies never uploaded it. The private `after-r161` file matched the live state (a no-change plan), and the R165 settings were uploaded as generation `1794849158807698`.

Private material: `gs://mw-credit-operator-private-737787224638/promotion-packages/r165/` (21 objects) and `r165-dev/` (6 objects).

Component versions at this release (`component-versions.mjs derive --release R165 --commit R165`): PWA frontend, API read, API command, Chat service, Database schema (V150) and Integration agent (revision 39) changed in R165; Notification worker and Jobs worker stay R159.

Drift (Forge, read-only, facts refreshed 17:26:14Z): `node scripts/promotion/component-versions.mjs drift --env all --observed <private drift-observed.json> --strict` reported drift 0 and unverified 2 (exit 2). DEV: PWA, read, command and chat R165 (`b67a4aa7`), notify and jobs R159 (`5b887d09`), schema 150. PROD: PWA, read, command and chat R165 (`907650de`), notify and jobs R159, schema 150, agent R165 revision 39. Unverified: `grafana-dashboards` and `metabase-reports` (both R144; the credentialed reads were not supplied, as in R161).

Data Dictionary: a read-only PROD capture (`codex-cloud-read`, read-only transaction, 16 November 2026 17:27:19Z, PostgreSQL 18.6, 103 relations, 1,588 columns, 525 constraints, 104 indexes, 244 routines, 482 triggers; metadata sha256 `5b2be8b72af09015306eccbf304595975a93a818aadf15a59b10367c66cb8697`, collector sha256 `fa339a5eaa43218cab4415c5b0b0c176c808cf8b82661521b6ce1b6a0dfc07d9`, file sha256 `f5e449cae51ce5a1bc6fa7aa79e28936bb595c080cf503bfc01bbe3a704ac8a3`) was reconciled for exactly three objects with `reconcile_captures.py --only`: the relation `public.pwa_group_chat_refresh_requests` and the routines `pwa_request_group_chat_refresh_v1(actor jsonb, p_borrower_id text)` and `pwa_complete_group_chat_refresh_v1(canonical_json text)`. Nothing was preserved or orphaned, the index was rebuilt and validation passes. The sanitized observations are `project/outputs/dictionary-r165-20261116/production-postgresql-observations.json`.

Closure: the tag exists, the freeze pin, this record, the tag record and the prune are published in the R165 closure pull request. Pruned: the R162 change note (`CHANGE_NOTES_IPAD_WEBKIT_ROUTINE_2026-11-15.md`, outside the window of Open plus the three newest Released releases); its links now point to commit `907650de`.
