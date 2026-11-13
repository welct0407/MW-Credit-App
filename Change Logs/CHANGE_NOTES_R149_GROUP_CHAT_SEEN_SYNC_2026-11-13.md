# Change notes — Group chat seen sync (R149), 13 November 2026

## Purpose
Owner request of 13 November 2026: the new-message mark on the Collection list should be synced across devices signed in with the same account, so the owner does not see the mark again on each other device. Since R146 the seen state is per device (a `localStorage` map). Owner authorization: a new table, one last-seen time per user and borrower, and PROD once tested. Nothing is deployed.

## Changes
As built.
- `database/migrations/V147__group_chat_seen.sql`: table `public.pwa_group_chat_seen` (primary key `borrower_id, partner_id`; foreign keys to Borrowers and Partners on delete cascade; `seen_last_message_at`, `updated_at`; index on `partner_id`) and `pwa_mark_group_chat_seen_v1(actor jsonb, borrower text, seen timestamptz)` returning `{kind stored|unchanged|ignored, seenAt}` (invoker, owner `postgres`; actor recheck 42501, unknown borrower P0002, no summary gives `ignored`, the value is clamped to the summary's `last_message_at`, forward-only upsert so an equal or older value changes no row and writes no change-log row). V97 row-change triggers (tracked tables 20 to 21); grants to `mw_app_<env>` with PUBLIC and `mw_integration_agent` revoked; `database/current/public-functions.sql` regenerated; `Test-GroupChatSeen.sql` and changes to the access-matrix, row-change, trigger-order and `Test-StatementBatch.sql` tests, and `ledger-owner-operator-independent.test.mjs`.
- Reader: columns `borrower_id`, `partner_id` and `seen_last_message_at` in `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py` (an operator grant step in DEV and PROD; until it is applied the read omits `chatSeenAt` and devices behave as in R146). `scripts/chat/build-schema-digest.mjs`: the table is excluded from the chat schema digest (the chat image is a touched component).
- Command service (`services/payment-command/handler.mjs`, `store.mjs`): `POST /api/collection/{borrowerId}/chat-seen`, body exactly `{lastMessageAt}`; the partner comes from the server actor only; capability read (own row only); no notification wake; replies 200, 400, 403, 404, 409 `command_busy`, 415, 503.
- Read and offline (`services/api/collection-read-contract.mjs`, `borrower-read-store.mjs`, `services/business/offline-dataset-delta.mjs`, `offline-dataset-chunks.mjs`): list items gain `chatSeenAt` for the caller's partner (omitted when the table or grant is missing); the table is an optional source of the `collection` domain keyed `borrower_id`, with no version bump; each seen write is one targeted collection delta on every device, including the other user's.
- PWA (`apps/pwa/src/chat-seen.ts`, new `chat-seen-sync.ts`, `CollectionRecords.tsx`): the mark shows only when `chatSummaryAt` is within 72 hours and newer than the server seen value, the page's session memory and the device's local value; `chat-seen-sync.ts` posts once per newly shown version, keeps unsent values in `localStorage` `mw-credit.chat-seen-unsent:<scope>` and flushes them on mount, online, visibility and render; 401, 409, 429, 5xx and network errors keep the value, 400, 403 and 404 drop it; a reader-only shell sends nothing.
- Documents (Dewey): this note, the release tracker, `database/README.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `docs/Development_Read_Service.md`, and the Data Dictionary `human-api.yaml` and `application.yaml`; the relation and routine records are captured from PROD at closure.
- Review corrections (Byte, after Chase's review): an `ownerTesting` gate copied into `markChatSeen` was removed for this route only (it is a store-wide build switch, always true in the DEV and PROD environment store, so it never fired there); unit tests cover a read-only partner getting 200 and writing only its own row, and a member without read or an unknown email getting 403. `chat-seen-sync` no longer resends an accepted value when storage refuses writes, and every 4xx except 401, 408, 409 and 429 is dropped.
- Order in PROD: V147 before the new command image (otherwise the command answers 503 and devices keep their unsent values).
- Not changed: the agent and the summary generation.

## Checks
| Command | Result |
| --- | --- |
| Byte's `mw-db-ci` migrations group | Exit 0 |
| Byte's `Test-GroupChatSeen.sql` | Pass |
| Byte's offline collection lab | 4 pass, 1 skipped |
| Byte's `npm test` | 1352 pass, 1 skipped (before the review corrections; CI's run is authoritative) |
| Byte's `npm run typecheck`, `npm run lint` and `npm run build` | Clean |
| Byte's e2e `chat-seen-sync` and `chat-summary` | 8 passed on each of three Chromium projects; 4 passed on WebKit |
| Chase's review | Pass. Endpoint: the partner comes only from the server actor, the body and path cannot name another partner, a query string is refused, CORS ok. SQL probe on a fresh V147 cluster: a wrong partner id for the email, an uppercase email or an extra actor key gives 42501 with the other partner's row untouched; the reader cannot EXECUTE; grants only to `mw_app_<env>`; not a definer; an equal or older value gives `unchanged` with `xmin` unchanged and no change-log row; a future time is clamped; 24 parallel transactions end at the maximum value with 6 stored, 18 unchanged, 6 change-log rows and no deadlocks. The read query filters `partner_id` server-side; offline is collection-only and optional |
| After Byte's corrections: `group-chat-seen` and `chat-seen` unit tests | 19 pass |
| After Byte's corrections: typecheck, lint and build | Clean |
| After Byte's corrections: `chat-seen-sync` e2e (mobile and desktop Chromium) | 2 passed |
| `npm run check:docs` (Dewey) | Pass |
| CI on the pull request | Pass: `Development checks` run 43420123915, `Database migrations` run 43420099934, `Agent tests` run 43420123972 on `25466c7a` |
| DEV migration, reader grant and deploy | Pass, see the DEV deployment record |
| PROD verification | Pass, see the PROD promotion record |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- The faketime day-change offline case (needs the faketime lab).

## DEV deployment record (Forge, 13 November 2026 UTC)
Authority: the owner's R149 approval ("Yes, new table + PROD", ship once tested), which the orchestrator confirmed covers this DEV deploy. Package `011d89d9161ee81ee4326313f07ab04484e8ed33` (merge of PR #307). DEV was at V146 with R146 services and Hosting before this run. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Backup | At V146: `dev-refresh-2dbaaf694db44e50be199d3b1ef131c3` (observed 12:03:51Z), dump sha256 `89762f2b...d885`, listing and restore passed, 40 tables matched |
| Migration | Six-owner window 12:06:23Z to 12:14:13Z (restored). V147 installed 12:06:45Z by `Invoke-Flyway.ps1 -Environment development migrate` (checksum -1800310386, file sha256 `6bb38930...9722`); post-migrate reconcile 573 statements, 0 violations; runner done 12:13:43Z; validate clean, head 147. `mw_app_dev` SELECT, INSERT and UPDATE on `pwa_group_chat_seen` and EXECUTE on `pwa_mark_group_chat_seen_v1`; 2 triggers; 0 rows |
| Reader grants | `configure-dev-read-role.py --apply`: the planned statement was the one GRANT; `borrower_id`, `partner_id`, `seen_last_message_at` true, `updated_at` false; no write and no EXECUTE for the read login |
| Image | Cloud Build `6a0d994b-5808-49fd-a45e-64599360f49f` (`cloudbuild-command.yaml`, `_MW_RELEASE=R149`), 12:14:54Z to 12:15:31Z, digest `sha256:290dac00a0e4ef425095fad7fa49c7d20212de82d01ee5327e95f52d70bac55c` |
| Terraform | Plan 0 add, 3 change, 0 destroy (image only on read, command and chat), settings generation `1794572198963944` (previous `1794513268161364`), applied 12:16:41Z to 12:17:31Z, re-plan clean. Revisions read `00092-b2f`, command `00109-2c8`, chat `00061-t4n`; notify and jobs unchanged |
| Hosting | `build:live-dev` (nine settings, file shredded): build-version R149 `fd93b63704f32df494bcd1da`, entry `/assets/index-B3XoraEz.js`; version `fe94daf3baea10c3`, release `1794572317738000`, deployed 12:18:29Z to 12:18:38Z; `--check` 17 files. This also brings the R148 PWA changes to DEV (DEV was on R146) |
| Smoke | `/health` R149 and `011d89d9` on read, command and chat; unauthenticated `POST /api/collection/<id>/chat-seen` 401 (nothing written); agent route still 404; no ERROR logs after 12:16Z |
| Rollback | Settings generation `1794513268161364` (R146 image `f3a61d00...`), plan 0/3/0 and publish; Hosting `68cfe05bd9feddb3` (R146). V147 may stay: the R146 image does not read the table |

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's answer of 13 November 2026, "Yes, new table + PROD" (sync the summary list mark across devices; ship to PROD as R149 once tested), relayed by the orchestrator as the scoped PROD approval for R149: a verified backup, the tested V147 with the standard temporary owner window, the PROD reader column grants, the read, command and chat images, Hosting and the technical records. No user write was made (no sanctioned PROD path); no payment, notification or job was forced. No secret value, token, chat text or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Freeze | 12:18:55Z; package `011d89d9161ee81ee4326313f07ab04484e8ed33`; baseline R148 `b2ec95dc`. The generic runner derived V147 and the read, command and chat images (notify and jobs unchanged), plus Hosting. Next unused number R150 (opened by the closure pull request) |
| CI | `Development checks` run 43420123915 (check, lint, three Chromium and three iPhone WebKit e2e shards) and `Database migrations` run 43420099934 (guards and the four groups) on `25466c7a`; `Agent tests` run 43420123972; the terraform job reused from run 43186898321 (no infrastructure change since). Accepted by the runner's per-job gate |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017` (system id `7685391508477894672`), database `loan_manager_prod`, services `mw-credit-app-*-prod`, registry `mw-credit-app-prod`, state `mw-credit-app-prod-tfstate-737787224638` (prefix `application`), Hosting site `mw-credit-prod-737787224638` |
| Baseline | Flyway 146. Read `00057-8bk`, command `00062-6p4`, chat `00041-hds` on `7f0c0aa2...` (R146); notify `00030-285`, jobs `00030-29l` on `63e5b48f...` (R144); settings generation `1794529636503002`; Hosting `fde9cd8546c21116` (R148) |
| Backup | At V146: `prod-promotion-e34efe1ae6fd4187bbcb487bb6c89ec4` (observed 12:19:41Z, finished 12:22:06Z), dump sha256 `47e342dd1c046b58a6cd53464cafeee29ec211392b50db1f4cc95ce4fc5b530d`, listing and restore passed, 40 tables matched |
| Image | Cloud Build `680ebdb1-08bf-4aad-9c2a-00acdf0506ba` (`cloudbuild-business.yaml` as `mw-credit-app-build-prod`, git archive of `011d89d9`, `_MW_RELEASE=R149`), 12:19:33Z to 12:20:08Z, digest `sha256:3cf271c1e9bdb2f5fe5a01c58b69b1a6880702014b9046e8a45f6dbd0fa5ea0a` |
| SQL | Manifest `release-r149-v147-011d89d9-prod.json` (147 migrations; `prepare` cited the DEV validation above). Connect preflight 12:22:17Z (18 retained, 0 DEV sessions). Six-owner window (notify, jobs, ledger, changes, journal and chat owners) 12:22:23Z to 12:25:11Z, restored (no owner left with inherit or set). Check: pending V147 only. Apply 12:23:08Z to 12:24:26Z (installed 12:23:48Z, 5.5 s, checksum -1800310386 as DEV); `verify --target prod` schema 147, validate clean, nothing pending. Readback: `mw_app_prod` arwd on the table and EXECUTE on `pwa_mark_group_chat_seen_v1`, `mw_integration_agent` no EXECUTE, 2 triggers, 0 rows |
| Reader grants | One guarded transaction as `postgres`, 12:25:24Z to 12:25:27Z: SELECT (`borrower_id`, `partner_id`, `seen_last_message_at`) on `pwa_group_chat_seen` to `mw-credit-app-read-prod@clever-oasis-508610-n7.iam` (`reader-capability-contract.json`). Before: owner and `mw_app_prod` only. Readback: the three columns true, `updated_at` false, no table-level privilege, no EXECUTE. Rollback: the matching `REVOKE` |
| Terraform | V147 before the images. Plan 0 add, 3 change, 0 destroy, `template.containers.image` only on read, command and chat (plan sha256 `d98cc146...`, JSON `6faed766...`), settings generation `1794572792175197`, applied 12:26:35Z to 12:27:12Z, re-plan clean. Revisions read `00058-c4b`, command `00063-ccp`, chat `00042-m9q`; notify and jobs unchanged |
| Hosting | Generic runner (`kindRule: generic-v1`) as `mw-credit-unattended-admin`: `--check` passed (18 files), `--apply` 12:28:41Z to 12:29:29Z: version `55e0ff3a841029d5`, release `1794572962649000`, build-version R149 `d49305b96632fc52e424a906`, entry `/assets/index-DdqWin3L.js`, package sha256 `f2f3cd01...`; PROD origins only |
| Smoke (read-only) | `/health` R149 and `011d89d9` on read, command and chat; `lm.mw-credit.com` 200 with the R149 marker; unauthenticated `POST /api/collection/<id>/chat-seen` 401 (nothing written); no ERROR logs on the five PROD services after 12:22Z; `pwa_group_chat_seen` 0 rows |
| Data Dictionary | Read-only PROD catalog capture 12:29:45Z as `codex-cloud-read` (schema 147, read-only session), kept privately outside Git for Dewey's reconcile of `pwa_group_chat_seen` and `pwa_mark_group_chat_seen_v1` |
| Tag | `R149` on `011d89d9161ee81ee4326313f07ab04484e8ed33` (the package commit), created by the Release tag workflow, run [43425922300](https://github.com/welct0407/MW-Credit-App/actions/runs/43425922300) (success, 12:31:45Z to 12:32:13Z); confirmed with `git ls-remote --tags origin R149` on 13 November 2026 at 12:32Z (the peeled tag points to `011d89d9`) |
| Components | `render --write` after the tag: the PWA frontend, read, command and chat services and the database schema (V147) are R149 (changed); notify and jobs keep their earlier release |
| Dictionary | Applied from Forge's capture (12:29:45Z, schema 147, file sha256 `056a7c9f932856d3b155822c9ada827a26837eb044464652b8c71210fbf13b8d`, private, outside Git): the helper's plan changed only two new records, the relation `public.pwa_group_chat_seen` and the routine `public.pwa_mark_group_chat_seen_v1(actor jsonb, p_borrower_id text, p_seen timestamp with time zone)`; no other object changed. `dictionary.py index` and `validate` clean. The sanitized catalog metadata the records cite is kept as [evidence](../project/outputs/dictionary-r149-20261113/production-postgresql-observations.json); `human-api.yaml`, `application.yaml` and `agent-api.yaml` now say released |
| Rollback | Services: settings generation `1794529636503002` (the private `production.activation.before-r149.tfvars`), plan 0/3/0 and publish. Hosting `fde9cd8546c21116` (R148). Reader grants: `REVOKE`. Database: forward-fix only; the table may stay (the R146 image does not read it); restore point the V146 backup above |

### Limitations
- No authenticated PROD write or read (no sanctioned PROD token route); the first seen rows appear when a user opens a summary. Owner acceptance pending.

### Prune at closure
Deleted (inbound links repointed to commit `011d89d9`): `Change Logs/CHANGE_NOTES_R146_GROUP_CHAT_SUMMARY_2026-11-12.md` and `integration-agent/Change Logs/CHANGE_NOTES_R146_GROUP_CHAT_SUMMARY_2026-11-12.md`, outside the window of the Open release and the three newest Released releases (R149, R148, R147); their links in the release tracker and the environment inventory now point at the permalink. No section of `Development_Changes.md` belonged to an older released release (the R149 follow-up row was added), and the applied dictionary plan and coverage files were deleted (only the cited observations file stays).

## Recovery
Revert the pull request; Hosting rollback to the previous version (in the environment inventory); the table may stay. Until the reader grant is applied, devices behave as in R146.

## Open questions
None.

## Remaining work
DEV and PROD done (records above); Data Dictionary records applied; tagged R149 and closed by the closure pull request. Open for the owner: acceptance (that the mark clears on a second device); R148 acceptance is also still pending.
