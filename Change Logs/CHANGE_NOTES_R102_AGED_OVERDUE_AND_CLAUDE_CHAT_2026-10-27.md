# Change notes — R102 Long/Aged overdue status and Claude Opus 5.5 chat model, 27 October 2026

## Purpose
R102 adds a Collection status "Long/Aged overdue" (oldest overdue charge older than about one week, dark grey, between Overdue and Fully paid) and a Claude Opus 5.5 chat model reached through a Debian-VM relay to the Anthropic API (Medium effort, default when it works).

## Changes
- Collection status `long_overdue` ("Long overdue" / "เกินกำหนดนาน", colour `#37474f`): an unpaid charge 8 or more days past due on the Bangkok business date; Overdue is now 1 to 7 days. Group order is not_paid, partially_paid, overdue, long_overdue, fully_paid. Rows carry `overdueDays`; the tile line reads "Long overdue · N days". `services/api/collection-read-contract.mjs` (cursor version 4, so a pre-deploy cursor is rejected as `Invalid cursor`), `services/api/synthetic-read-adapter.mjs`, `services/business/dashboard.mjs` (metric `longOverdue`), `apps/pwa/src/CollectionRecords.tsx`, `Dashboard.tsx`, `live-style.css`, `main.tsx`, `preview-session.ts`. The offline dataset reuses the same read, with no cache schema change.
- V114 `database/migrations/V114__long_overdue_collection_status.sql` replaces the two V22 OLAP views (`olap_borrowers_analytics` status 'Long Overdue'; `olap_portfolio_summary` gains the appended column "Borrowers with Long Overdue Payment", and "Borrowers with Overdue Payment" now counts 1 to 7 days). No table, column, trigger or grant change. Test: `scripts/database/Test-LongOverdue.sql`.
- Metabase: lane model `models/collection-summary.sql`, `CollectionMonitor.mjs`, `Build-RemainingPages.mjs`, `ReorderCollectionStatusLanes.mjs`, `Verify-CollectionMonitor.mjs`, and the new guarded `AddLongOverdueLane.mjs`. It is applied at PROD promotion, right after V114, then verified.
- Chat model Claude Opus 5.5 (`claude-opus-5-5`, fixed Medium effort) through the relay service `mw-chat-relay` on the Debian VM (port 8791). `services/chat/claude.mjs` (Anthropic dialect), `config.mjs`, `engine.mjs`, `gemini.mjs`, `handler.mjs`, `prompt.mjs`, `runtime.mjs`, `server.mjs`, `tools.mjs`, `assets/schema-digest.json`. Picker order: Claude Opus 5.5, then the three Gemini models. A failed relay turn shows the existing "model unavailable" text; there is no silent fallback.
- V115 `database/migrations/V115__chat_claude_model_ids.sql` widens chat model ids to allow `claude-*`: one CHECK constraint and two functions, no table or column. It needs the chat owner window.
- Keyless access to the Anthropic API: workload identity federation from the VM identity `mw-integration-agent@`, one workspace, service account and federation rule per environment (`mw-credit-chat-dev`, `mw-credit-chat-prod`). The relay requests a fresh Google ID token per exchange and keeps the access token in memory only. No Anthropic API key or Secret Manager secret exists. Relay code and tests: `integration-agent` (see its [change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R102_CHAT_RELAY_2026-10-27.md)).
- Infrastructure: `infrastructure/ecosystem-debian/chat-relay.tf` (firewall `allow-chat-relay-run-egress`, applied 27 October 2026 19:04Z, plan sha `20f2fe5c…4275`, 1 add); `infrastructure/dev` and `infrastructure/production` `chat-service.tf` (the `chat_relay.enabled` switch, off; Direct VPC egress, `CHAT_RELAY_URL`, model list). Gemini stays the default until the DEV proof of Claude passes.
- Owner additions after the first DEV pass (28 October 2026, "include the fix in R102, and sort latest first", then "fewest days first"):
  - R102-DEV-01, pre-existing since R090: the read service (`services/api/read-handler.mjs`) and the foundation handler (`services/production/handler.mjs`) accept `X-MW-Wake-Deadline` in CORS preflights, which the PWA sends on reads. The value is ignored there; origins and methods are unchanged. New `tests/unit/cors-wake-deadline.test.mjs`.
  - Long overdue sorts fewest days first, then name and id; other groups keep their order. The board cursor is v5 and carries the sort key; v3 and v4 cursors get 400, and the PWA (`CollectionRecords.tsx`, with the status carried by `ReadFailure.tsx` and `live-main.tsx`) reloads page 1 once on a 400 to a cursor request.
  - Checks: lint, typecheck, unit tests 125/125 and then 123/123, `collection-postgres` 24/24, `collection-read.spec.ts` 4/4, `mw-db-ci -Group phase5` all pass. Chase review: no defects.
- Owner addition, 28 October 2026 ("in cash dashboard, i want the date selection field to always default to yesterday (current date - 1), whenever i open the page"): in `apps/pwa/src/CashWorkspace.tsx` the Cash Statement Date opens on the Bangkok business date minus one day at every page open, even over a saved or draft date. If yesterday is not offered, it falls back to the latest offered earlier date. The saved default account still applies. The prompt reads "This account is not your default." and compares the account only. "Save as defaults" sends the account and keeps the stored `statementDate`, so the preference command contract is unchanged. Checks: lint, typecheck, `phase5-final-ui-independent -g "R102 Cash|R062 cash"` 4/4, `refresh-hold-independent` cash 4/4, and Chase's new reopen test (pick another date, leave, return, yesterday again) 2/2 desktop and mobile. Chase review: no defects; Bangkok date checked at 16:59Z, 17:00Z, 18:30Z and 00:30Z.
- Adversarial review fixes (Chase's four findings, fixed by Byte): `Verify-RemainingPages.mjs` counts 'Long Overdue' as `Build-RemainingPages.mjs` does; `services/agent-conversations/virtuals.mjs` orders '4 - เกินกำหนดนาน Long Overdue' before Fully Paid (now 5); the relay ends a stream cut at its 110 s deadline with an SSE `timeout_error` (upstream break `api_error`) and `claude.mjs` maps it, or a started stream without `stop_reason`, to `MODEL_TIMEOUT`; the Dashboard hides the Long Overdue row when a cached response has no `longOverdue` value.
- Documents: Development Changes, Release Tracker, Solution Design, `database/README.md`, Metabase README, chat design `project/outputs/r090-pwa-chatbot/DESIGN.md`, Environment Inventory.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` (Byte, tree) | Pass |
| `npm run typecheck` (Byte) | Pass |
| `npm run check:docs` (Byte) | 0 failures |
| `node --test` (Byte) | 380 pass, 1 skip on 26 files; 174/174 on 12 files after the fixes |
| Agent unittest (Byte) | 637 OK |
| `test_chat_relay` (Byte) | 18 OK |
| ruff (Byte) | Pass |
| Disposable PostgreSQL chain to V115 with `Test-LongOverdue`, `Test-Chat`, `Test-AccessMatrix` (Byte) | Pass |
| `collection-postgres.test.mjs` (Byte) | 23/23 |
| `AddLongOverdueLane.mjs` dry run (Byte) | OK |
| Playwright R102 Dashboard and Page7 Dashboard (Byte) | 4/4 |
| `terraform fmt` and `validate`, 3 stacks (Forge) | Pass |
| `terraform test` (Forge) | DEV 33, PROD 22 |
| `ecosystem-debian` apply (Forge) | 1 add, sha `20f2fe5c…4275`, read-back OK, re-plan no changes |
| Playwright `collection-read` (Chase) | 2/2 |
| Playwright borrower-search, collection-loading-shift, upcoming-read, live-search-timer (Chase) | 18/18 |
| Playwright `phase5-final-ui-independent` and `chat.spec.ts` (Chase) | 95 pass, 1 flaky: P6 T9 management unsent draft (closed-page route callback under load; 3/3 in isolation, unrelated to R102) |
| Adversarial review (Chase) | 4 findings, all fixed by Byte |
| DEV chat proof 1, Claude grounded turn (Chase) | Pass: thread `13a1a5b0…`, 13.9 s, 2 rounds with 2 `sql_query` calls; answer 12 Long overdue with the oldest at 64 days, matching the Collection API (21 rows: 12 long_overdue and 9 overdue, max `overdueDays` 64) |
| DEV chat proof 2, follow-up turn (Chase) | Pass: thread `5f82e547…`, 10.4 s, 3 borrowers over 30 days, matching the API |
| DEV chat proof 3, relay journal (Chase) | Pass: 5 DEV-caller lines with HTTP 200, only metadata logged; 0 token or body matches |
| DEV chat proof 4, unavailable model (Chase) | Pass at API level: relay down 05:39:20Z to 05:40:11Z; message `e2bbd7d5…` returned `MODEL_UNAVAILABLE` in 1.6 s with no Gemini fallback. The PWA wording comes from `chat-text.ts:9` and was not seen on a device |
| DEV chat proof 5, Gemini still works (Chase) | Pass: thread `e56de114…`, 13.3 s |
| DEV default switch to `claude-opus-5-5` (Forge) | Applied: chat revision `00015-h54` |
| Pull request `Development checks` and database groups | Pass on `3908f85`: check, lint, e2e shards 1 to 3, rebuild phase5, phase8, receiving and migrations, guards. Earlier reds: the `qs` audit advisory (fixed `184353b`) and the phase5 harness lacking V114 views (fixed `5e613a3`, `3908f85`) |
| DEV visual pass (Echo, iPhone Pro Max emulation, test account) | R102-COL-01/03/04/05/06/07 and R102-CHAT-01/02/03 pass: Long overdue (12) after Overdue (9), `#37474f`, "Long overdue · 23 days" / "เกินกำหนดนาน · 23 วัน", group total matches the tiles, Dashboard count after Overdue, Claude first and labelled. R102-CHAT-04 superseded by the DEV default switch. Optional R102-COL-08 (sort Long overdue oldest first) not applied |

## Not run
The DEV device pass (Echo), the PWA "model unavailable" wording on a device (proof 4 was at API level), the Data Dictionary regeneration, and the Metabase apply (both at PROD promotion). A skipped check is not a pass.

Deploy order: apply V114 and V115 before the app images in each environment, because `dashboard.mjs` selects the V114 column.

## DEV deployment (Forge, 28 October 2026, UTC)
Authority: the owner's instruction "open the PR, test it in Dev, and let me review in Dev first before prod promotion". It covers DEV only; nothing in PROD was touched. Source: PR #177 head `3908f85c40a2260808674eaf7c8fc91a5738c647` (branch `claude/wonderful-sagan-uc24wu`), CI green on that head. The VM relay was deployed earlier from `49f6044` ([agent note](../integration-agent/Change%20Logs/CHANGE_NOTES_R102_CHAT_RELAY_2026-10-27.md)).

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| 1. DEV database | Target verified before every write: project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_dev` (tunnel identity, `inet_server_addr` NULL). Read check as `codex-cloud-read`. Backup `Backup-ProductionPromotion.py --environment development --expected-version 113`, 05:13:56Z to 05:16:17Z. Owner window `owner-authority-cli.mjs prepare` on the chat, notify, jobs, changes and journal owners: dry run 05:16:36Z, applied 05:16:48Z to 05:16:59Z (20 statements). `Invoke-Flyway.ps1 -Environment development -Command migrate` at `3908f85` (clean checkout), 05:17:04Z to 05:24:31Z. `info` 05:24:49Z, `validate` 05:25:03Z. Window restored 05:25:28Z to 05:25:38Z (`restore --apply`, 20 statements) | Before: head 113, 0 failed. Backup: archive listing and restore passed, fingerprints match for 37 tables, dump sha256 `b73250d9…f139`. Migrate: V114 31.8 s, V115 2.6 s, `targetSchemaVersion` 115; post-migrate application-role reconcile ran (objects 1831, rights 297, memberships 2, unchanged before and after). `info`: schemaVersion 115, all Success. `validate`: successful, 0 invalid. Readback: `olap_portfolio_summary` has "Borrowers with Long Overdue Payment"; the `pwa_chat_threads` model CHECK allows `claude-*`; view ACLs unchanged (`mw_app_dev`, `mw_chat_read_dev` read); after the close, `postgres` memberships of the owner roles are back to their baseline (no inherit, no set) and no owner holds CREATE on `public`. The local admin credential file was deleted after the run | Restore backup `dev-refresh-674722569adf4b17a18c4a0d7cf0f067` (V113) from `gs://mw-credit-operator-private-737787224638/dev-backups/`, or a later forward migration. Private records: `owner-authority-dev-prepare-550d2bda-bc99-4af9-b42a-2e2797357f48.json`, `application-role-d04a93e6-c6ce-4123-acf0-40290843d18b.json` |
| 2. DEV image | Cloud Build `0b22fabf-96f1-4583-8870-cac85035e007` (`cloudbuild-command.yaml`, builder `mw-credit-app-build`, staging bucket `mw-credit-app-builds-737787224638`) from a clean `git archive` of `3908f85`, 05:27:13Z to 05:28:00Z, SUCCESS. A first submit to the default staging bucket was refused (403, the builder cannot read it); its upload was deleted | `mw-credit-app/api@sha256:7171b465c71b1d82fe9bbdd0c64949513c30c62bfa2e5cae50089e893d8f8fd2`; the container smoke steps passed | Previous image `d7f65789…dddf` (R101) |
| 3. DEV Terraform | Activation file: `read_image`, `command_image` and `chat_image` pinned to `7171b465…`, plus `chat_relay = { enabled = true }`. The default stays `gemini-4-argon`. Previous activation generation `1792959210372977`, copy kept privately as `dev.activation.tfvars.pre-r102-gen1792959210372977`. Plan 0 add, 3 change, 0 destroy (binary sha256 `8c777588…732a`, text sha256 `cc142e07…5610`). Read and command: image only. Chat: image, `CHAT_MODELS_JSON`, `CHAT_RELAY_URL`, `vpc_access`. Published as activation generation `1793165391765453`; applied 05:29:53Z to 05:30:31Z | 0 add, 3 change, 0 destroy; re-plan no changes. Revisions at 100%: read `00046-phg`, command `00063-mhk`, chat `00014-vjk`. Notify `00022-mjg` and jobs `00022-c97` unchanged (Ready, image `ef7beb4b…`). Chat readback: network interface default/default, egress `private-ranges-only`, `CHAT_RELAY_URL=http://10.148.0.2:8791/v1/chat/messages`, models `claude-opus-5-5`, `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash`, default `gemini-4-argon` | Restore activation generation `1792959210372977` (republish the private copy) and apply. That reverts the images and turns off the relay wiring |
| 4. DEV Hosting | `.env.live-dev` (mode 0600, gitignored) from `mw-credit-app-dev-firebase-web` (project and auth domain asserted DEV) plus the live R101 bundle's settings: read, command and chat origins, `VITE_COMMAND_MODE=dev-owner-testing`, `VITE_NOTIFICATIONS=enabled`. `MW_RELEASE_NUMBER=R102 npm run build:live-dev` exit 0; the file was deleted after the build. A first build without the Firebase project id and auth domain failed the check and was rebuilt, not deployed. `deploy-hosting.mjs --live-dev --check` passed (15 files, `no-store`); deploy 05:33:29Z to 05:33:36Z | Version `8b0da9e96de6e231`, release `1793165615517000`. Live `build-version.json`: release `R102`, version `e7d62cbe51e090ca6c58df40`, entry `/assets/index-B63KvHjd.js`; `sw.js` `no-store`. Compiled origins equal the live R101 bundle's | Redeploy the previous version `77b82c653a7272d3` (release `1792959460997000`) |
| 5. Smoke | Unauthenticated probes; one test-account session through `scripts/dev/claude-test-token.mjs` (token never printed, file deleted afterwards) | `/health` 200 on read, command and chat; notify 403 and jobs 404 (private services, unchanged and Ready). 401 without a token on chat `/api/chat/models` and `/api/chat/threads` and on read and command `/api/session`. As the test account, `/api/chat/models` lists Claude Opus 5.5 first with default `gemini-4-argon`. One synthetic thread `57f0c69d-af9a-4c9e-b20b-0f96883c6312` on `claude-opus-5-5` with one prompt ("Reply with the single word OK.") returned 200 in 5.5 s, status ok, reply "OK". The `chat_turn` log shows code ok, 1 round, 3858 ms. The VM relay journal shows the DEV chat identity accepted: environment `dev`, rule `fdrl_015LhxsBXmuQTpNgZ88DMofy`, HTTP 200 `relayed`, 3648 ms, upstream request `req_011CgU6FoAZMYjjuqczyXkfE`. No ERROR logs in read, command or chat since 05:29Z | The test thread is synthetic DEV data |

| 6. Relay window for Chase's unavailable-model proof | `systemctl stop mw-chat-relay` on the VM; a safety restart was scheduled for 10 minutes later (`mw-chat-relay-safety-restart.timer`) | Stopped 05:39:20Z: inactive, nothing listening on 8791, connection refused. Chase's proof passed at 05:39:35Z. Started 05:40:11Z and the safety timer cancelled. Active, `/healthz` ok and enabled, listening on `10.148.0.2:8791`. Other VM services unchanged | `systemctl start mw-chat-relay` |
| 7. DEV default switch (authorized after Chase's DEV proofs 1 to 5 passed) | Activation file: a `chat_models` block identical to the variable default except `default = "claude-opus-5-5"`, Gemini models still listed. Previous activation generation `1793165391765453`, private copy `dev.activation.tfvars.pre-r102-default-gen1793165391765453`. Plan 0 add, 1 change, 0 destroy: chat `CHAT_MODELS_JSON` `default` only (binary sha256 `c4b0b0ed…9461`, text sha256 `6930e51a…1503`). Published as generation `1793166070377743`; applied 05:41:13Z to 05:41:40Z | Re-plan no changes. Chat revision `mw-credit-app-chat-dev-00015-h54` at 100%. As the test account, `/api/chat/models` reports default `claude-opus-5-5`, with all four models available. A new thread takes `models.default` in the PWA (`ChatWorkspace.tsx`), so it starts on Claude; the API itself still requires an explicit model (a POST without one gets 400, unchanged behaviour). The test account's existing `gemini-4-argon` thread `e56de114-ac47-4b64-9ac2-603094965825` keeps its saved model | Set `default = "gemini-4-argon"` in the DEV activation `chat_models` (or republish generation `1793165391765453`) and apply: a config-only chat revision |

Not done in this step: the device pass and anything in PROD.

### Second DEV deploy (Forge, 28 October 2026, UTC): `b3fa05b`
Source: PR #177 head `b3fa05b9bcde49a84991716883380a33e2e3c6db`, CI green on that head. Changes since `3908f85`: the read service and the foundation handler accept `X-MW-Wake-Deadline` in CORS; Long overdue sorts fewest days first (board cursor v5); the PWA reloads page 1 after a stale-cursor 400. No SQL; the DEV database stays at V115. Authority: the owner's DEV-review instruction, DEV only.

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| 1. DEV image | Cloud Build `5bfb68a6-ca4e-40db-b052-6dfd0936c6f8` (`cloudbuild-command.yaml`, builder `mw-credit-app-build`, staging `mw-credit-app-builds-737787224638`) from a clean `git archive` of `b3fa05b`, 06:23:00Z to 06:23:49Z, SUCCESS | `mw-credit-app/api@sha256:7a193c9fe7abb24335a9f818789361d6b456e361a32333f1597151a9a61edae5` | Previous image `7171b465…8fd2` (`3908f85`) |
| 2. DEV Terraform | Activation: `read_image`, `command_image` and `chat_image` pinned to `7a193c9f…`. Chat `CHAT_MODELS_JSON` (default `claude-opus-5-5`) and the relay wiring unchanged. Previous generation `1793166070377743` (equal to the local file; private copy `dev.activation.tfvars.pre-r102b-gen1793166070377743`). Plan 0 add, 3 change, 0 destroy, images only (binary sha256 `cabeb588…3c92`, text sha256 `34d73c44…2f49`). Published as generation `1793168697855428`; applied 06:25:01Z to 06:25:38Z | Re-plan no changes. Revisions at 100%: read `00047-nqz`, command `00064-4zd`, chat `00016-zdm`. Chat readback: `CHAT_RELAY_URL` set, default `claude-opus-5-5`, egress `private-ranges-only` | Republish generation `1793166070377743` (the private copy) and apply |
| 3. DEV Hosting | Same route as the first deploy (temporary 0600 `.env.live-dev`, deleted after the build). `MW_RELEASE_NUMBER=R102 npm run build:live-dev` at `b3fa05b` (clean checkout) exit 0; `--check` passed (15 files); deploy 06:26:47Z to 06:26:53Z | Version `f60e05997c6f5998`, release `1793168812972000`. Live `build-version.json`: R102, version `a42ca298e5b8f0340e1d5365`, entry `/assets/index-DN8vbQAE.js` | Redeploy version `8b0da9e96de6e231` (first R102 deploy) |
| 4. Smoke | Unauthenticated probes; one test-account Collection GET (token never printed, file deleted afterwards) | `/health` 200 on read, command and chat. Preflight `OPTIONS /api/collection` from `https://dev-lm.mw-credit.com` with `authorization, x-mw-wake-deadline`: 204. With `authorization, x-unknown-header`: 403. As the test account, `GET /api/collection` 200 with 21 items (12 `long_overdue`, 9 `overdue`); the `long_overdue` rows' `overdueDays` are 9, 10, 14, 19, 19, 20, 21, 22, 23, 41, 42, 64, which is ascending. No ERROR logs in read, command or chat since 06:25Z | — |

### Third DEV deploy (Forge, 28 October 2026, UTC): Hosting only, `c3c74df`
Source: PR #177 head `c3c74df28af386177aaa9ae694c7eb40154a8d16` (check, lint and e2e x3 green). The only product change since `b3fa05b` is in the PWA (`apps/pwa/src/CashWorkspace.tsx`, `cash-view.ts`): the Cash Statement Date opens on yesterday. No service, SQL or Terraform change, so the images and Cloud Run revisions stay as they are (read `00047-nqz`, command `00064-4zd`, chat `00016-zdm`). Authority: the owner's DEV-review instruction, DEV only.

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| DEV Hosting | Same route (temporary 0600 `.env.live-dev`, deleted after the build). `MW_RELEASE_NUMBER=R102 npm run build:live-dev` at `c3c74df` (clean checkout) exit 0; `--check` passed (15 files); deploy 06:54:43Z to 06:54:49Z | Version `18ff0ae926b872e9`, release `1793170488940000`. Live `build-version.json`: R102, version `487b26542279005c3f7298c1`, entry `/assets/index-YKhHZ33O.js`. `build-version.json` carries no commit field; the served entry bundle embeds source commit `c3c74df`. `/health` 200 on read, command and chat | Redeploy version `f60e05997c6f5998` (second R102 deploy) |

## PROD promotion (28 October 2026, UTC)

### Promotion record (Forge, 28 October 2026, UTC)
[Template](../project/scripts/releases/templates/promotion-checklist.md). Pins are only in the [Environment inventory](../project/Documents/Environment_Inventory.md). No secret value, token or borrower data appears here.

**Continue here**
- **Scope:** R102 to PROD.
  - V114 and V115 on `loan_manager_prod`.
  - Read, command and chat images (one image), with the chat relay wiring.
  - The PROD entries for the VM chat relay.
  - PWA Hosting.
  - The Metabase lane, by Byte (next section).
  - Notify and jobs stay on their R091 image.
- **Authority:** the owner's "promote to production" for R102 (28 October 2026), relayed by the orchestrator. It covers the backup and restore check, V114 and V115, the chat owner window, the image, Cloud Run, Terraform, Hosting, the VM relay PROD configuration and these records. It does not cover forced notifications, payments, jobs or chat turns.
- **Freeze:** 2026-10-28T07:34:26Z.
  - Package `main` at `b216968ad45f2228d88a6f53ba9bc07f813636db`, the PR #177 merge. Its tree equals `5deae79` and its code equals DEV's `c3c74df`.
  - Delivery-tool commit `51d72f06222fe94358f794aaabd12e492ca72018`: Byte's R102 runner kind `3de5cc0` plus the global-build readback from `126a155`, runner files only; `node --test tests/unit/business-hosting-delivery.test.mjs` 114/114, exit 0 (see step 10).
  - Next unused release number: R103.
  - Migration bytes: V114 sha256 `af10766e…84af9`, V115 `669d9b31…7252e`, the same as applied to DEV at `3908f85`.
- **Baseline at freeze, used for recovery:**
  - Revisions: read `00028-crh`, command `00033-qvh`, chat `00011-ngn`, all on `99abc23c…61e6` (R101); notify `00022-4lt` and jobs `00022-42m` on `50953149…0468`.
  - Hosting version `6f15f2aa732be9c7`, release `1792964245484000` (R101).
  - Flyway head 113: 113 rows, all successful.
  - PROD activation generation `1792964036695139`.
  - VM: checkout detached at `49f6044`, `config.json` sha256 `9363d74c…5c5c`.

| Step | What ran | Result | Recovery |
| --- | --- | --- | --- |
| 1. Backup | Target `clever-oasis-508610-n7` / `mw-credit-pg-20261017` / `loan_manager_prod`, verified before every database action (system identifier `7685391508477894672`, `inet_server_addr` NULL through the tunnel). `Backup-ProductionPromotion.py --expected-version 113` from a clean checkout of `b216968`, 07:35:51Z to 07:38:16Z | `prod-promotion-08659cdaf2554f8d9d745d4d4ce1fd2d`: dump sha256 `b158e819…020b`, archive listing and isolated restore passed, fingerprints match for 37 tables. Copied to `gs://mw-credit-operator-private-737787224638/prod-backups/` | Restore this backup (V113) |
| 2. Migration package | `Invoke-CloudFlyway.py prepare`, 07:38:55Z to 07:39:36Z. The DEV evidence is the validation reference: DEV V114 and V115 at `3908f85`, the DEV info and validate, and the disposable chain with `Test-LongOverdue`, `Test-Chat` and `Test-AccessMatrix`. `connect_preflight.py --baseline 113 --target 115`, 07:39:41Z to 07:40:09Z. `check`, 07:40:15Z to 07:40:51Z | Release file `release-r102-v115-b216968.json` (private), 115 migrations, commit `b216968`. Preflight `connect-preflight-2026-10-28T074009Z.json`, sha256 `93a3a460…a38e`: 18 retained consumers, 17 DEV principals, 0 DEV sessions. `check`: 0 writes, pending exactly 114 and 115 | n/a |
| 3. Owner window | `owner-authority-cli.mjs prepare --environment production --owner mw_chat_owner_prod` (baseline 113, source pin `b216968`, backup proof above). Dry run 07:41:20Z, applied 07:41:30Z to 07:41:36Z (4 statements) | Record `owner-authority-prod-prepare-f2d9e66b-baf8-4236-bf53-99a65923c563.json` (private) | `restore --apply` with that record |
| 4. V114 and V115 | `Invoke-CloudFlyway.py apply`, one grouped transaction, 07:41:42Z to 07:43:31Z | 2 migrations executed, version 115. Both rows installed 07:42:23.921Z: V114 31.4 s (checksum -1327275677), V115 2.4 s (checksum 1917255405). The runner's own validate and info passed with nothing pending | Forward migration only; the backup in step 1 is the safety net |
| 5. Window restored | `restore --apply`, 07:43:44Z to 07:43:53Z (4 statements). The local admin credential file was deleted afterwards | `postgres` membership in `mw_chat_owner_prod` is back to no inherit and no set; the chat owner has no CREATE on `public` | — |
| 6. Readback | `Invoke-CloudFlyway.py verify --target prod` at 07:44:03Z, plus read-only queries as `codex-cloud-read` | Validation successful, schemaVersion 115, 0 pending, 0 writes. History: 115 versioned rows, all successful. The `pwa_chat_threads` CHECK allows `claude-*`. The two OLAP views keep their owner `postgres` and their ACLs (`mw_app_prod`, `mw_chat_read_prod`, `metabase_borrower_reader`, `mw_reviewer_dml`, `mw_integration_agent` read). `olap_portfolio_summary`: Overdue 2, Long Overdue 11. `olap_borrowers_analytics`: Long Overdue 11, Overdue 2, Not Paid 5, Partially Paid 1, Fully Paid 5 | — |
| 7. PROD image | Cloud Build `f3f9e683-633e-4b59-b6d9-4023f683f2b1` (`cloudbuild-business.yaml`, builder `mw-credit-app-build-prod`, staging `mw-credit-app-prod-builds-737787224638`, source generation `1793172976662171`) from a clean `git archive` of `b216968`, 07:36:18Z to 07:37:20Z, SUCCESS. The container smoke steps passed | `mw-credit-app-prod/api@sha256:599e19b64600b94720f6ef803fdc1f1f494b1d525c62e3430487abfd9717ff26`, tag `keep-r102-runtime`. Not a relabelled DEV image | Previous image `99abc23c…61e6` (R101) |
| 8. VM relay (PROD) | `vm-mw-credit-agent`. Checkout moved from detached `49f6044` to `main`: `git checkout main`, then `update-from-github.sh` fast-forward to `b216968`, clean (07:46:49Z). Config-only change (OPERATIONS.md procedure): backup `/root/config.json.pre-r102-prod`; worker timers and the wake path stopped 07:47:55Z; caller `mw-credit-app-chat-prod@` (subject `109821788246551148361`, `prod`, verified against the service account's unique id) and `chat_relay_wif.prod` added (organization `fe93c72e-…3c57`, rule `fdrl_01FQt7BocPj6Nbztk78KLKrx`, service account `svac_019kDNyni1Jxk488bQXbiMbZ`, workspace `wrkspc_01MPUWyGuZGX2SJa8zBZrgax`, audience `https://api.anthropic.com/mw-credit-chat-prod`). The DEV entries were kept. `check` ok; receiver, recognizer and relay restarted; timers started 07:48:27Z | `config.json` sha256 `177bd31b…a5a5`, 89 keys; catalogue unchanged (`56a660e6…9c25`). The installed package is unchanged: `/ready` `code_version` stays `49f6044`, whose `integration-agent/` bytes equal `b216968` except the change note. One PROD federation exchange on the VM, 07:50:46Z: 200, `Bearer`, `expires_in` 600, scope `workspace:developer` (token discarded, not printed). After the incident fix below: `/ready` true, relay and recognizer `/healthz` ok, 0 failed units, all 7 timers and the wake path active | Config back with `/root/config.json.pre-r102-prod` (mode 0640 root:mwagent) through the same procedure, or archive the PROD rule in the Claude Console. Checkout: `git checkout --detach 49f6044` |
| 9. PROD Terraform | Activation: `runtime_image_overrides` read, command and chat set to `599e19b6…`; `chat_relay = { enabled = true }`; a `chat_models` block identical to the variable default except `default = "claude-opus-5-5"`, with the three Gemini models still listed. Private copy of the previous generation: `production.activation.tfvars.pre-r102-gen1792964036695139`. `Invoke-Terraform.ps1 -Stack production` plan from the clean `b216968` checkout, 07:45:25Z: 0 add, 3 change, 0 destroy. Saved plan `production-r102.tfplan` (binary sha256 `f7244670…6678`, text sha256 `fc724316…1def`). Changes: read and command image only; chat image, `CHAT_MODELS_JSON`, `CHAT_RELAY_URL` added, `vpc_access` added. These match the runner's `R102_PLAN_ACTIONS`. Published as activation generation `1793173874352889` at 07:51:17Z; applied 07:51:17Z to 07:51:56Z | Re-plan: no changes. Revisions at 100%: read `00029-tzt`, command `00034-8m8`, chat `00012-7lz`, all on `599e19b6…`. Notify `00022-4lt` and jobs `00022-42m` unchanged. Chat readback: models `claude-opus-5-5`, `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash`, default `claude-opus-5-5`, `maxRounds` 16; `CHAT_RELAY_URL=http://10.148.0.2:8791/v1/chat/messages`; network interface default/default, egress `private-ranges-only` | Republish generation `1792964036695139` (the private copy) and apply. This reverts the images and turns off the relay wiring, a config-only chat revision |
| 10. PROD Hosting | Operator `mw-credit-unattended-admin`, runner `deploy-business-hosting.mjs` (R102 kind, schemaVersion 33) from a clean clone.<br>• **Candidate:** `buildProductionBusinessCandidate` (release `R102`, the R101 public config input) from the clean `b216968` checkout: marker version `d092d986cf2b73f0a7aa4c17`, entry `/assets/index-BU83gPDJ.js`, public config sha256 `6eea01ac…` (equal to R101), 16 files. Private package `promotion-packages/r102/promotion-package.json`, sha256 `02981205…cdfcb`.<br>• **CI gate:** the R074 gate needed a successful run that executed `terraform` for R102's terraform inputs; the only evidence (run 40634156857) was cancelled. The orchestrator dispatched `ci.yml` on `main` with `force: true`: run 40653479949 on `b216968`, all green. It is cited for check, e2e and terraform. Rebuild jobs cite run 40642495092 (stage evidence) and guards run 40650268012.<br>• **First `--apply` (08:08:21Z), refused before any write:** the live readback failed because Cloud Build `f3f9e683` is a global build (submitted without `--region`), and the runner read builds at `asia-southeast1` only. Decision B: Byte's readback falls back to `global` only on a regional 404, with the build id and project exact (126a155).<br>• **Delivery-tool commit:** 126a155 also carried the Metabase commit 3556210, which the gate refuses (only runner files may lie between the package and the tool commit). So the delivery-tool commit is `51d72f06222fe94358f794aaabd12e492ca72018`: parent `3de5cc0`, only `scripts/promotion/deploy-business-hosting.mjs`, `scripts/promotion/README.md` and `tests/unit/business-hosting-delivery.test.mjs`, byte-identical to 126a155. `deliveryToolChecks`: the runner's unit test 114/114, exit 0. Diff reviewed by the orchestrator instead of Chase because of the interim exposure. The orchestrator merges `51d72f0` into the branch.<br>• **Apply:** `--check` passed, then `--apply` 08:25:43Z to 08:26:27Z. | Version `83c857918dfcbeb4`, release `1793175980087000`, 16 files, `no-store`. Live `build-version.json` on `lm.mw-credit.com` and on the `web.app` host: release `R102`, version `d092d986cf2b73f0a7aa4c17`, entry `/assets/index-BU83gPDJ.js`. The served entry bundle embeds source commit `b216968` and `"R102"`. `no-store` on `build-version.json` and `sw.js`; `/` 200. Receipt `promotion-receipts/R102-HOSTING-RECEIPT.json` (private). The interim window, with the R101 PWA on the R102 API, ran from 07:51:56Z to 08:26:27Z. Post-Hosting smoke 08:27Z: `/health` 200 on read, command and chat; `/api/collection` 401 without a token; preflight with `x-mw-wake-deadline` 204; no ERROR logs in the five PROD services since 07:51Z; VM 0 failed units and relay `/healthz` ok | Redeploy version `6f15f2aa732be9c7`, release `1792964245484000` (R101) |
| 11. Smoke (read-only) | Unauthenticated probes and read-only queries. No PROD chat turn was created, and no test account was used | `/health` 200 on read, command and chat. 401 without a token on read `/api/session` and `/api/collection`, command `/api/session`, chat `/api/chat/models` and `/api/chat/threads`. Preflight from `https://lm.mw-credit.com`: read with `authorization, x-mw-wake-deadline` 204; with `authorization, x-unknown-header` 403; command 204; chat 204. Long overdue count 11 from the V114 views (step 6). No ERROR logs in read, command, chat, notify or jobs since 07:51Z (checked 08:01:37Z). Relay journal: no request lines since the restart (no PROD turn yet). The owner's first PROD chat is the real-use check | — |

**VM incident during step 8 (07:47:30Z to 07:50:01Z), recovered**
- **Cause.** The first attempt of the config script failed its own `check` because the `--catalogue` argument was missing. Its restore branch then copied the backup back with `cp -p`, but the backup had just been set to mode 0600. `config.json` therefore became `root:mwagent` 0600, which the `mwagent` service user cannot read. The second run inherited that mode.
- **Impact.** The receiver, recognizer and relay could not start on restart, and each worker timer service failed once at its config read, so no work was done.
  - **Receiver:** one inbound request reached the tunnel in the window. It was refused at 07:48:15Z (`connection refused` to 127.0.0.1:8000). That request was the Cloud Monitoring uptime check from Belgium, which failed from 07:48:20Z to 07:49:10Z and passed again from 07:53:20Z; the other two regions passed. No Instagram delivery is recorded: `runtime.ingress_messages` has no row since 2026-10-27 17:52Z, and `ingress_work` has 197 rows, all DONE. The receiver does not log refused requests itself, so a Meta POST between 07:47:30Z and 07:48:00Z cannot be ruled out from logs. Meta retries failed deliveries, and nothing has arrived since.
  - **Recognizer:** the PROD command service received no requests between 07:46Z and 07:51:28Z, when the new revision started. So 0 recognition calls failed.
  - **Relay:** no relay request lines in that window and no `chat_turn` logs on DEV or PROD since 07:40Z.
  - **Workers:** audit-relay, conversation-poll, resource-health, cash-statement-email-retry and receipt-summary each failed once. Each next tick succeeded between 07:58Z and 08:00Z. Heartbeats show COMPLETED with exit code 0. No `job_runs` row has started since 07:40Z other than 17 COMPLETED ones, and the only INTERRUPTED rows predate this (September and 16 October). Cash statement and audit retention were not due.
- **Fix.** 07:50Z: `chmod 0640` (`root:mwagent`, as the other files in `/etc/mw-integration-agent`), `reset-failed`, restart. `/ready` true at 07:50:01Z, 0 failed units.
- **Follow-up (proposed, not done):** in any config-only restore, copy with `install -m 0640 -o root -g mwagent` (or chmod the backup only after copying it back) instead of `cp -p` from a 0600 backup.
- The 07:47:30Z to 07:48:00Z gap for Meta deliveries cannot be verified from logs. It is mitigated by Meta's retries, and no delivery has arrived since.

**Build-region miss and the interim window**
- **The miss.** Cloud Build `f3f9e683` was submitted without `--region asia-southeast1`, so it is a global build. The runner reads builds at `locations/asia-southeast1`, which answers 404 for it, so the Hosting `--apply` stopped at the live readback before any write. The image itself is the reviewed one: SUCCESS, from the clean archive of `b216968`, digest `599e19b6…`.
- **Decision B (orchestrator).** PROD stays as it is, with no rollback. Byte changes the runner's build readback to also accept `locations/global`, with every identity check still exact. Hosting then runs from the new delivery-tool commit.
- **Interim window.** From the 07:51:56Z apply until the Hosting release, the R101 PWA runs against the R102 read, command and chat services. Read-only assessment of the R101 client (`10d543d`):
  - Collection board: `statusLabel` has no `long_overdue` entry, so the Long overdue group heading and tile status text are blank and unstyled. Amounts and group totals still show, and the group sorts after Overdue.
  - Dashboard: it lists a fixed set of metrics, so there is no Long overdue row, and Overdue shows the 1 to 7 day count only (2 instead of 13).
  - Cursors: a v3 board cursor would get 400 with no automatic reload in R101. But the PROD board has 24 rows, one page under the 25 limit, so it returns no next cursor.
  - PROD read logs from 07:51Z to 08:02Z (paths and status only): `/api/collection` GET 200 ×4, plus one charges and one upcoming GET 200; 0 cursor requests, 0 responses with status 400.
  - Chat: the R101 `chat/ChatWorkspace.tsx` picks `models.default`, so a new thread starts on Claude Opus 5.5 through the relay, which is configured for PROD. The picker lists the four models the server returns.
  - So the owner could see blank Long overdue labels and a lower Overdue count on the Dashboard, but no Collection errors.
- The PROD Firebase web API key, a public client identifier, was echoed in the session terminal while the R101 package was inspected. It was not written to a file or Git.

### Metabase (PROD) (Byte, 28 October 2026, UTC)
Authority: the owner's "promote to production", after Forge confirmed V114 in PROD (guarded Flyway apply 07:41:42Z to 07:43:31Z, head 115). Source: Metabase `reports.mw-credit.com`, database 2 (`loan_manager_prod` as `metabase_borrower_reader`). The admin key came from Secret Manager `mw-metabase-admin-api-key`, read by the scripts and never printed.

The first `--prepare` refused because tab 19 is now named "10 · Collection Monitor", and model 162 and card 122 are stored in Metabase's newer query format (MBQL 5). Before any write, the script was changed:
- It matches tab 19 by its id.
- It parses and re-renders both query formats structurally.
- It refuses anything else and refuses a replay.
- A read-only `--plan` prints the change per object.
- Unit tests in `tests/unit/metabase-long-overdue-lane.test.mjs` use the live shapes.

| Object | Change | Id |
| --- | --- | --- |
| Model 162 (Collection Status Summary) | Zero-filled status list adds `Long Overdue` after `Overdue` | 162 |
| Card 248 (Collection detail) | Row highlights add `Long Overdue` (`#ECEFF1`) | 248 |
| Card 122 ("Not paid / overdue", remaining pages) | Its "or" filter adds a `Long Overdue` clause | 122 |
| Card 251 ("Unclassified people · expected 0") | Not-equals list adds `Long Overdue` (follow-up step `--apply-unclassified`) | 251 |
| Dashboard 3 filter `collection-detail-status` | Values add `Long Overdue` | dashboard 3 |
| Dashboard 3 tab 19 | Five lanes on rows 6 and 8, widths 5/5/5/5/4 | dashboard 3, tab 19 |
| New "⚫ Long overdue · people" | Created | 412 |
| New "⚫ Long overdue · borrowers" | Created | 413 |
| Dashboard 32 (Loan Reports · proposed) board | Five lanes (`--refine`) | 396 |
| Dashboard 32 new lane question | Created; collection tab rebuilt | 414 |

Dashboard 32 refine:
- Dashboard 3 changes on purpose with this lane, so `ProposedLoanReports.mjs --rebaseline-dashboard3=R102` renewed its guard baseline from live dashboard 3 first. The new step only runs once lane cards 412 and 413 are placed on tab 19.
- Then `--refine --only=collection.board,collection.lane-long-overdue,collection`: the dry run passed (board 5 rows, lane 11 rows), then the refine ran.

Before-state copies (private, outside Git), in `gs://mw-credit-operator-private-737787224638/promotion-receipts/r102-metabase/`:
- `r102-long-overdue-lane/before.json`: dashboard 3 and cards 248, 162 and 122 before `--apply`.
- `r102-long-overdue-lane/before-251.json`
- `state.json` and `unclassified-state.json`
- `dashboard-32/`: the dashboard 3 baselines, `proposed-before-refine.json` and `question-before-refine-396.json`.

The session copy is under `~/.mw-private/MW-Credit-App/metabase`.

| Check | Result |
| --- | --- |
| `AddLongOverdueLane.mjs --plan` and `--plan-unclassified` (read-only) | Exactly the intended change per object; other query keys unchanged |
| `AddLongOverdueLane.mjs --verify` (post-apply read-back) | Passed: five lanes in order and widths, other placements unchanged, filter and highlights, model 162 statuses, card 122 statuses; evidence `project/outputs/r102-long-overdue-lane/verification.json` |
| `AddLongOverdueLane.mjs --verify-unclassified` | Passed; card 251 returns 0 (it returned 11 after the first apply, which is why the follow-up step was added) |
| `ProposedLoanReports.mjs --verify` after the refine | 27 of 27 checks passed (`project/outputs/loan-reports-redesign-20261026/verification.json`) |
| Read-only reconciliation (counts only) | Card 412 = 11, equal to the PROD view's `Long Overdue` count of 11. Card 122 = 17, equal to the view's Not Paid + Overdue + Long Overdue count of 17 (it was 18 at 07:55Z; live data moved). Card 251 = 0; the view has 0 statuses outside the five |
| `node --test tests/unit/metabase-long-overdue-lane.test.mjs` | 7 of 7 passed |

Not run: `Verify-CollectionMonitor.mjs` and `Verify-RemainingPages.mjs`. Both read private baselines that exist only on VM-01 (the R025 and R016 Windows paths); the reconciliation above replaces them, as the orchestrator decided.

Recovery (remove the lane). Restore from the private copies above, using the admin API:
1. `PUT card/251`, `card/162`, `card/122` and `card/248` with the `dataset_query` and `visualization_settings` from the before copies.
2. `PUT dashboard/3` with the parameter values from `before.json`.
3. `PUT dashboard/3/cards` with the tab 19 placements from `before.json` (this drops 412 and 413 from the dashboard); then archive cards 412 and 413.
4. Dashboard 32: `PUT card/396` from `question-before-refine-396.json`, archive 414, then restore the collection tab from `proposed-before-refine.json` (or `--refine --only=collection` with the four-lane layout from Git).

The lane depends on V114: if V114 is rolled back, remove the lane first.

## Recovery
- Git baseline: the commit before the R102 package. Product code, Terraform and documents revert with the pull request.
- V114 and V115 are forward migrations, not edited in place once applied. Roll back by a later migration that restores the V113 view bodies (V114) and the V114 CHECK and function bodies (V115). Both are definition-only, so a PROD backup stays the safety net.
- Chat: set `chat_relay.enabled` to false (a config-only Cloud Run revision) and keep or restore the Gemini default; stop `mw-chat-relay` on the VM. Archive the federation rule in the Anthropic Console to revoke access.
- Firewall: remove `allow-chat-relay-run-egress` through the `ecosystem-debian` stack.
- Metabase: `AddLongOverdueLane.mjs` writes a private baseline before `--apply`; restore from it.

## Open questions
- Owner review on DEV before any PROD promotion (owner instruction of 28 October 2026).
- Pre-existing since R090, found in the DEV pass (R102-DEV-01): the PWA sends `X-MW-Wake-Deadline` on reads, but the read service's CORS allowlist accepts only `Authorization`, so browser preflights to the read service get 403 `origin_denied` (DEV today; PROD 126 refused from 24 to 26 October, none granted) and those reads fall back to the offline copy. Not caused by R102; the owner chose to fix it in R102 (see Changes).

## Remaining work
Anthropic workload identity federation (identifiers, not secrets; owner set up in the Claude Console on 28 October 2026). Organization `fe93c72e-d3c5-4710-8de5-465493fd3c57`, issuer `google-cloud`; both rules match `sub` `111496211387247382045` and the `mw-integration-agent@` email, scope `workspace:developer`, lifetime 600 s.

| Env | Rule | Service account | Workspace | Audience |
| --- | --- | --- | --- | --- |
| DEV | `fdrl_015LhxsBXmuQTpNgZ88DMofy` | `svac_012cXQHFn4eG1b21um6iHEpF` | `wrkspc_013UyN3VKLEsFST7c5jvq6Y5` | `https://api.anthropic.com/mw-credit-chat-dev` |
| PROD | `fdrl_01FQt7BocPj6Nbztk78KLKrx` | `svac_019kDNyni1Jxk488bQXbiMbZ` | `wrkspc_01MPUWyGuZGX2SJa8zBZrgax` | `https://api.anthropic.com/mw-credit-chat-prod` |

The DEV values are in the VM relay configuration; the PROD values and the PROD caller go in at promotion.

Owner review on DEV, then PROD promotion on the owner's instruction (V114 and V115 before the images; Metabase `AddLongOverdueLane.mjs` right after V114; PROD relay values and caller). Regenerate the Data Dictionary entries for the two OLAP views (`public.olap_borrowers_analytics`, `public.olap_portfolio_summary`) and the chat model CHECK and functions at PROD promotion, from a read-only PROD capture: the dictionary records `loan_manager_prod` only, so a DEV capture would put DEV ACLs and a state PROD does not have into production records.
Known behavior: chat text streams only in the final round, after the tool rounds, so the first text appears 10 to 14 s after sending.
