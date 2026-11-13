# Change notes — Group chat summary (R146), 12 November 2026

## Purpose
Owner decisions of 12 and 13 November 2026: show a short summary of the last three days of an AI-collection borrower's Instagram group chat on the Collection detail page, and mark the borrower on the Collection list when the summary is new. Display only; nothing is deployed. The agent half is in the [agent change note](../integration-agent/Change%20Logs/CHANGE_NOTES_R146_GROUP_CHAT_SUMMARY_2026-11-12.md).

## Changes
As built, on the settled tree (HEAD `4406a42` plus the batch, to be committed by the orchestrator).
- `database/migrations/V146__group_chat_summaries.sql` (built): table `public.pwa_group_chat_summaries` (16 columns, one row per borrower, cascade on borrower delete), function `pwa_put_group_chat_summary_v1` (security invoker, one advisory lock, result `{kind, stored, unchanged, superseded, skipped, pruned}`, 22023 to 400, P0002 to 422), grants to `mw_app_<env>` with PUBLIC and `mw_integration_agent` revoked, V97 row-change and truncate triggers (tracked tables 19 to 20); needs `mw_changes_owner_<env>` in the owner window (PROD: `prepare --owner mw_changes_owner_prod`); `database/current/public-functions.sql` regenerated; SQL tests: new `Test-GroupChatSummary.sql` and changes to the access-matrix, row-change, trigger-order and `Test-StatementBatch.sql` (the include and the advisory-key count 13 to 14) tests; `tests/integration/ledger-owner-operator-independent.test.mjs` (19 to 20 triggers). `Test-ProdDefaultPrivileges.sql` is not changed.
- `services/agent-receipts/` (`runtime.mjs`, `contract.mjs`; built): `POST /internal/agent/group-chat-summaries`, its own handler branch behind the unchanged token check and policy; body exactly `{command}`, at most 16,384 bytes, for the policy environment; `canonicalGroupChatSummary` (exact keys, code-point limits 160 and 200, no control characters, sorted unique ids, `requestId` must equal the agent's derivation, one test vector shared by Node and Python); no actor Partner, after-commit effect or notification. Replies: 200 `{kind}`, 400 `invalid_summary_command` (including SQLSTATE 22023), 401, 422 `unknown_borrower`, 503 `summary_unavailable` or `summary_outcome_unknown`, 404 without a policy, for another method or a longer path.
- `services/api/collection-read-contract.mjs`, `scripts/production/reader-capability-contract.json` and `scripts/configure-dev-read-role.py`: `chatSummaryAt` on collection items, `groupChat` on the borrower detail; the reader has column grants only, so ten columns are listed and the guard uses `has_column_privilege`; the DEV grant is an operator step (Forge), PROD at promotion.
- `scripts/chat/build-schema-digest.mjs`: the table is excluded from the chat schema digest; the chat image becomes a touched component.
- `scripts/database/Test-PaidDateOrder.sql`: `SET TIME ZONE 'Asia/Bangkok'` (a clock-dependent failure that predates this batch).
- `database/README.md`: V146 entry and tracked tables 20.
- `services/business/offline-dataset-delta.mjs` and `offline-dataset-chunks.mjs` (built): the table joins the `collection` domain only (key `borrower_id`); `business-offline-v9`, so every installed bundle walks once; bundle key `groupChatByBorrower`, an array of `{borrowerId, ...groupChat}`; a change-log key is mapped to its borrower before the records lookups. `services/api/collection-read-contract.mjs`: a malformed stored row reads null and there is no server age filter.
- `apps/pwa/src/` (built): `CollectionChatSummary.tsx` (read-only card under the amounts, collapsed and expanded, stale after 72 hours hides the last-message line, per-field language fallback), the list mark kept on the name's last word (`NameWithChatMark`), `chat-seen.ts` (per-device key `mw-credit.chat-seen:<scope>`, entries older than 30 days dropped, unreadable or unwritable storage gives no marks), `CollectionRecords.tsx`, `offline-dataset.ts` (`groupChat` in the synthesised detail), the sample `SAMPLE-002` in `fixtures.ts` and `main.tsx`, `live-style.css` and `style.css`.
- Documents (Dewey): `Release_Tracker.md` (scope), `Development_Changes.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `docs/Development_Read_Service.md`, the agent documents, and the Data Dictionary `agent-api.yaml`, `human-api.yaml` and `application.yaml` by hand, and the relation and routine records from the PROD capture (see the PROD promotion record).
- CI fix (PR #300, first `Development checks` run 43282611114 on head `3f439ad`, job "rebuild (phase5)"): `phase6-management-independent.test.mjs` ran the offline-delta source fingerprint on the management family pinned at V85 (plus the V114 views), where `pwa_group_chat_summaries` does not exist (42P01). In `services/business/offline-dataset-delta.mjs` the table is now an optional source: one catalog query checks that it exists and is readable, otherwise it is left out of the fingerprint (the collection version changes once when the table appears, and bundles walk then). `tests/unit/offline-dataset-delta.test.mjs` covers the absent table.
- Review correction (Chase): `NameWithChatMark` could split a Thai name mid-character; the split is now `splitNameForMark` in `chat-seen.ts`, grapheme-based (`Intl.Segmenter`, with a code-point fallback that keeps combining marks, variation selectors and ZWJ), and the name text is always unchanged.
- Review corrections (PWA part): seen storage that reads but refuses writes marks the scope unwritable for the session, so no marks are shown, and the seen event is still dispatched. The agent corrections are in the agent note.
- Not changed: Terraform, IAM, secrets, Cloud Run configuration and the chat tool's read role.

## Checks
| Command | Result |
| --- | --- |
| Byte's `npm test` | Pass: 1337 tests, 1336 pass, 1 skipped (final, settled tree) |
| Byte's `npm run typecheck`, `npm run lint` and `npm run build` | Clean and ok (final, uncommitted tree) |
| Byte's `mw-db-ci` migrations group | The main chain passed; the V145 route first failed for a clock reason (`Test-PaidDateOrder.sql` depended on the time zone between 17:00 and 24:00 UTC), fixed with `SET TIME ZONE 'Asia/Bangkok'`; the route rerun inside the failing window passed |
| Byte's phase 8 | Exit 0 |
| Byte's offline collection lab at V146 | 4 pass, 1 skipped (the day-change case needs the faketime lab) |
| Byte's ad-hoc lab, endpoint against the real function | stored, unchanged, 422 and cleared as expected |
| Byte's ad-hoc lab, reader guard | false, false, true, false for no grant, 9 of 10 columns, all columns, table missing |
| Byte's agent focused unittest | 233 OK; the group summary unittest 44 OK |
| Byte's agent `discover` | 919 run, 73 skipped, 1 import error in `test_receipt_qr` (`zxingcpp` not installed in this session; unrelated to R146) |
| Byte's agent lab PostgreSQL state tests | 42 OK (supersedes 41; one test added) |
| Byte's agent state migration and retention tests | 23 OK |
| Byte's `ruff` | Pass |
| Byte's `npx playwright test tests/e2e/collection-chat-summary.spec.ts tests/e2e/collection-read.spec.ts tests/e2e/collection-loading-shift.spec.ts --project=mobile-chromium --project=desktop-chromium` | 14 passed (final) |
| Echo's UX review on a real WebKit iPhone 17 Pro Max (system dependencies installed) and desktop two-panel | Reviewed: list mark, detail collapsed and expanded, shared group, stale, Thai and English, desktop. Findings UX-CHAT-01, 02, 04 and 06 fixed; 03, 05 and 07 not taken. Measured collapsed card height now 246 px English and 184 px Thai (276 and 208 before the fixes; the design estimated about 150 px) |
| Chase's verification: fresh cluster, `Test-GroupChatSummary.sql` through `Test-MigrationsCloud.py --sql-only` | Pass: 146 migrations, `public-functions.sql` matches, checksum tamper rejected |
| Chase's verification: reader guard and chat roles | Pass: guard false, false, true; the chat roles cannot read the table |
| Chase's verification: request id | Python and Node derivations match, 5 of 5 vectors |
| Chase's verification: endpoint auth probe | Only valid claims answer 200; wrong audience, issuer, email, subject, `email_verified`, expired, future `iat`, missing `exp` and a bad token answer 401; a query string or trailing slash answers 404; an environment mismatch answers 400 |
| Chase's data-rule scan of the 4,547-line diff | Clean: no real chat text, username, phone or account number |
| `npm run check:docs` (Dewey, Chase) | Pass (0 failures, 0 warnings) |
| Chase's re-check of the review corrections | Pass: ping at a sentence end keeps the member token and the period; a silent unpinged `borrower_2` is rejected and a pinged `referrer_1` accepted; storage that refuses writes gives no mark after render; a self-referral gives no referrer; the state migration fix holds. PWA diff re-check pass (footer and expander row 44 px, stale hides the last-message line, Thai tags 13 px, sample CSS in step) |
| After Chase's last fix (`splitNameForMark`): typecheck and lint | Clean |
| `node --test tests/unit/chat-seen.test.mjs` | 5 pass |
| `collection-chat-summary` spec, mobile and desktop Chromium | 4 passed |
| `PLAYWRIGHT_WEBKIT=1` `--project=mobile-webkit` chat summary spec (real WebKit, iPhone 17 Pro Max) | 2 passed |
| `npm run build` | ok |
| CI run 43282611114 on `3f439ad`, job "rebuild (phase5)" | Failed (42P01 in the management family at V85); fixed as described in Changes |
| `Run-Phase5.ps1 -ManagementOnly` | Before the fix exit 1 (42P01); after it exit 0 (30 pass) |
| `mw-db-ci` phase5, phase8 and receiving | Exit 0 |
| Offline collection lab at V146 (after the fix) | 4 pass, 1 skipped |
| `npm test` after the CI fix | 1339 tests, 1338 pass, 1 skipped; typecheck and lint clean |
| Full `npm test` 1337 tests, 1336 pass, 1 skipped before the last fix (the `chat-seen` test file grew since); the CI run is authoritative |
| CI on the pull request: `Development checks` on head `8da0f73` (PR #300) | Pass (run 43291448699) |
| DEV migration, reader grant, deploy and smoke | Done; see the [DEV deployment record](#dev-deployment-record-forge-12-november-2026-utc) |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- A live Claude call and the live Instagram message shape: the first real run happens at the PROD switch-on.
- The agent lab PostgreSQL suites and the database CI after the last corrections: those paths are untouched by them; CI runs the database groups.
- Concurrent puts under real concurrency (the advisory lock is tested serially).
- The full `mw-db-ci` migrations group on the final tree: CI runs it.
- `test_receipt_qr`: import error because `zxingcpp` is not installed in this session.
- The faketime day-change offline case: skipped without the faketime lab.
- The agent in DEV: there is no DEV agent, so agent V12, the service and the live model call were not run there.
- Every PROD step (migration, images, Hosting, agent deploy, timer install, dry run, switch-on): not authorized.

## DEV deployment record (Forge, 12 November 2026 UTC)
Authority: the owner's scope for R146 (a DEV deploy and a few synthetic summary rows in DEV). Nothing in PROD was touched. Deployment pins (Hosting version, Cloud Run revisions, Flyway row) are only in the [Environment inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments). No secret value appears here.

| Step | Result |
| --- | --- |
| Source | PR #300 head `8da0f73`, after its `Development checks` run 43291448699 passed |
| Backup | DEV backup at V145, `dev-refresh-393289594cef445b89b6a610d93b28f6`; restore test passed (39 tables matched) |
| Owner window | The six DEV owners, 19:43:35Z to 19:51:31Z |
| Migration | V146 installed 19:44:01Z by the guarded runner; role reconcile 569 statements, 0 violations; validate clean; head 146 |
| Access check | `mw_app_dev` has SELECT and INSERT on the table and EXECUTE on the function; the function is owned by `postgres` and is not a definer; `mw_integration_agent` cannot execute it |
| Reader grants | The ten display columns only, no write, applied 19:51:51Z |
| Images | Cloud Build image; Terraform plan 0 to add, 3 to change, 0 to destroy (image only: read, command, chat); applied; re-plan clean |
| Hosting | DEV Hosting deployed about 19:56Z; `--check` passed; `.env.live-dev` shredded |
| Smoke | `/health` on the three services reports R146 and the `8da0f739` commit; the agent route answers 404 in DEV (no policy); an unauthenticated read answers 401; no ERROR logs |
| Agent | Agent V12 not applied in DEV (there is no DEV agent) |
| Synthetic seed | 19:57:38Z through `pwa_put_group_chat_summary_v1` (`SET LOCAL ROLE postgres`; invented text; commands built with the repository's canonicaliser): (a) R112 SYNTHETIC CHAT FORWARD G, fresh, 4 points, mark; (b) R114 SYNTHETIC SPLIT S and R113 SYNTHETIC SPLIT B, one shared group, fresh, 3 points with an Other borrower point, marks; (c) R136 DEV test rollover borrower, last message 5 days ago, muted, no mark. Read-back matched |

Cleanup: call the function once per synthetic key with `borrowerIds` `[]` and `summary` null (the script is kept outside the repository). Rollback: the previous DEV settings generation and Hosting version (in the inventory); V146 and the table may stay.

## PROD promotion record (Forge, 13 November 2026 UTC)
Authority: the owner's instruction of 13 November 2026, "Promote to prod and let me check", relayed by the orchestrator as the scoped PROD approval for R146: a verified backup, the tested V146 with the standard temporary owner window, the PROD reader column grants, the read, command and chat images, Hosting, the agent deploy with agent V12, the unit install, the cutoff, the dry run and the technical records. The switch-on followed the dry run (row below). No payment, notification or job was forced and no financial or borrower data was written. No secret value, token, chat text or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Freeze | 00:17:34Z; package `e80e1238974b857a977522dd259fc13ea53a1607` (merge of PR #300; main had not moved from `4406a42`). Baseline R145 `89e388d1`. The runner derived V146 only and the read, command and chat images (notify and jobs unchanged), plus Hosting and the agent. Next unused number R147 (opened by the closure pull request) |
| CI | `Development checks` run 43291448699 on `8da0f73` (check, lint), browser shards run 43282657807 on `3f439ad` (inputs unchanged), terraform job run 43186898321 on `f1caa91b` (no infrastructure or CI change since), `Database migrations` run 43291437377 on `8da0f73` (guards and the four groups), records-only run 43296033645 on `38bc462`; accepted by the generic runner's per-job gate |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017` (system id `7685391508477894672`), database `loan_manager_prod`, services `mw-credit-app-*-prod`, registry `mw-credit-app-prod`, state `mw-credit-app-prod-tfstate-737787224638` (prefix `application`), Hosting site `mw-credit-prod-737787224638`, host `vm-mw-credit-agent` (`mw_agent`) |
| Baseline capture | Flyway 145 (145 successful rows). Read `00056-82h`, command `00061-d9h`, chat `00040-2f7`, notify `00030-285`, jobs `00030-29l`, all on `63e5b48f...` (R144); settings generation `1794475576840235`; Hosting `854b64df2b836f27` (R142); agent `51ba52d3`, catalogue revision 37, agent schema through V11 |
| Prerequisites | `mw_integration_agent` can read `"Borrowers"."Ref Referrer"` (true). The receipt reader's PROD caller is on Claude with `receipt_claude_model` `claude-opus-5-5` and effort low through the same PROD federation rule (`chat_relay_wif.prod` complete), the evidence that the workspace allows the model |
| Backup | At V145: `prod-promotion-e84105c1b08d46d3b69c7dff584813c6` (observed 00:18:47Z, finished 00:21:19Z), dump sha256 `ebb2cd5855fe3001cda5e0c8443e64d6337fe920deba3c68501b631c0250e655`, listing and restore passed, 39 tables matched |
| Image | Cloud Build `4464bbcf-4bab-4f50-9c08-fb48085ebc89` (`cloudbuild-business.yaml` as `mw-credit-app-build-prod`, git archive of `e80e1238`, `_MW_RELEASE=R146`), 00:17:51Z to 00:18:30Z, digest `sha256:7f0c0aa21e092e339ee2e0687a215a9e2c44a9797d9a75370f399138ec6977cf` |
| SQL | Manifest `release-r146-v146-e80e1238-prod.json` (146 migrations; V146 sha256 `40ed6e1f...509d`, as DEV). Connect preflight 00:22:06Z (18 retained, 0 DEV sessions). Six-owner window (notify, jobs, ledger, changes, journal and chat owners) 00:22:27Z to 00:25:39Z, restored (inherit and set false, no CREATE on public). Check: pending V146 only. Apply 00:23:16Z to 00:24:37Z (installed 00:23:55Z, 8.8 s, checksum 1703748038 as DEV); `verify --target prod`: schema 146, validate clean, nothing pending. Readback: `mw_app_prod` arwd on the table and EXECUTE on `pwa_put_group_chat_summary_v1`, `mw_integration_agent` no EXECUTE, 2 triggers, 0 rows |
| Reader grants | One guarded transaction as `postgres`, 00:25:58Z to 00:26:01Z: SELECT on the ten display columns of `pwa_group_chat_summaries` to `mw-credit-app-read-prod@clever-oasis-508610-n7.iam` (`reader-capability-contract.json`). Before: owner and `mw_app_prod` only. Readback: the ten columns true, the six provenance columns false, no table-level privilege. Rollback: the matching `REVOKE` |
| Terraform | Plan 0 add, 3 change, 0 destroy, `template.containers.image` only on read, command and chat (plan sha256 `5a68e816...`, JSON `d89f1c34...`), settings published as generation `1794529636503002`, applied 00:27:19Z to 00:27:55Z, re-plan clean. Revisions read `00057-8bk`, command `00062-6p4`, chat `00041-hds`; notify and jobs unchanged |
| Hosting | Generic runner (`kindRule: generic-v1`) as `mw-credit-unattended-admin`: `--check` passed (18 files), `--apply` 00:30:24Z to 00:31:10Z: version `17a2c9d3cef2e6e8`, release `1794529863981000`, build-version R146 `82e94cdf1186b0b1b2c9ef55`, entry `/assets/index-BJ4AxO8Q.js`, package sha256 `672e367c...`; PROD origins only |
| Smoke (read-only) | `/health` on read, command and chat: R146 and `e80e1238`; `lm.mw-credit.com` 200 with the R146 marker; the agent route answers 401 to an unauthenticated POST (nothing posted); `pwa_group_chat_summaries` has 0 rows, so every collection read returns `chatSummaryAt` and `groupChat` null (read as `codex-cloud-read`; there is no sanctioned PROD token route for an authenticated API read); no ERROR logs on the five PROD services after 00:22Z |
| Agent units | `mw-group-chat-summary.service` and `.timer` installed from `systemd/` at 00:32:48Z (root 0644), daemon-reload; timer disabled and inactive |
| Agent deploy | Checkout `51ba52d3` to `e80e1238` (`update-from-github.sh`); temporary root-only operator file for `mw_agent` (shredded 00:35:37Z). `deploy-runtime.py --release R146`: freeze 00:33:22Z (rollback directory `runtime-20261113T003323126490Z`); agent V12 by `agent-state-admin.py migrate` 00:33:36Z; install 00:33:45Z; activate 00:33:58Z to 00:34:02Z (probe `6045d256-cad5-4e1e-9f80-75406cb564bd`), timers resumed. Catalogue revision 38 with `group_chat_summary` disabled; `check` exit 0; `/ready` and the recognizer and relay `/healthz` report R146 and `e80e1238` |
| Agent config | `config-only-change.py apply --tag r146-gcs-config` 00:34:35Z to 00:34:47Z: `group_chat_summary_enabled` false, `group_chat_summary_cutoff` `2026-11-13T00:34:02+00:00` (the activation time), model `claude-opus-5-5`, effort `low`, routine prefixes `["📌"]`, min letters 9; nothing else changed |
| Dry run | `group-chat-summary --dry-run` as `mwagent`, 00:35:19Z to 00:35:22Z: 42 conversations, 6 with fewer than three participants, 0 ambiguous, 36 groups, 37 subjects, 11 referrers excluded, 1 shared group. Participants only; no message text, model call, post or state write |
| Switch-on | Orchestrator decision under the same owner instruction: the dry-run counts pass the design's gate (11 of 36 groups with an excluded referrer, 1 shared). `config-only-change.py apply --tag r146-gcs-on --config ... --catalogue ...` 00:38:44Z to 00:38:58Z: only `group_chat_summary_enabled` true and the host catalogue entry `group_chat_summary` enabled (revision 38 unchanged, no repository or package change); the helper's `check` passed (cutoff, model, poll, receipt API, PROD business database and the complete PROD rule). `mw-group-chat-summary.timer` enabled and started 00:39:11Z |
| After switch-on | Firings at 00:39:11Z, 00:41:12Z and 00:43:14Z: exit 0, each `idle` with 0 due, 0 summarised, 0 failed, 0 stored; heartbeat `group-chat-summary` COMPLETED, exit 0, 3 consecutive no-ops, code `e80e1238`; `runtime.group_chat_summary_state` 0 rows; `pwa_group_chat_summaries` 0 rows; no warning or error in the summary or poll journals. The journal and state carry counts and codes only, no chat text. No manual run or post |
| Tag | `R146` on `e80e1238974b857a977522dd259fc13ea53a1607` (the package commit), created by the Release tag workflow, run [43339483019](https://github.com/welct0407/MW-Credit-App/actions/runs/43339483019); confirmed with `git ls-remote --tags origin R146` on 13 November 2026 at 00:45Z (the peeled tag points to `e80e1238`) |
| Components | `render --write` after the tag: PWA, read, command, chat, schema (V146) and agent (revision 38) are R146 (changed); notify and jobs stay R144 |
| Dictionary | Read-only capture (`codex-cloud-read`) of `loan_manager_prod` at Flyway 146, 13 November 2026 00:46:53Z, file sha256 `e7b9703e8e006d25e61d4211a5ed8096d9268b5eb18797c319e3e01ad510ccac` (the file itself is private and stays outside Git). The helper's plan changed only two new records, the relation `public.pwa_group_chat_summaries` and the routine `public.pwa_put_group_chat_summary_v1(canonical_json text)`; no other object changed (the `pwa_row_changes` tracked-table list is not part of a record). Applied, `dictionary.py index` and `validate` clean. The sanitized catalog metadata the two records cite is kept as [evidence](../project/outputs/dictionary-r146-20261113/production-postgresql-observations.json) (catalog names and role names only; no data or secret values) |
| Rollback | Switch-on: `systemctl disable --now mw-group-chat-summary.timer`, then `config-only-change.py restore --tag r146-gcs-on` (summaries age into the muted state; the table stays). Services: settings generation `1794475576840235` (the private `production.activation.before-r146.tfvars`), plan 0/3/0 and publish. Hosting `854b64df2b836f27`. Reader grants: `REVOKE`. Agent: `config-only-change.py restore --tag r146-gcs-config`, then `deploy-runtime.py rollback --commit e80e1238974b857a977522dd259fc13ea53a1607` (restores `51ba52d3`); remove the two unit files. Database: forward-fix only; the table may stay (the R144 image does not read it); restore point the V145 backup above |

### Limitations
- The service is on since 00:39Z; the first summary appears only after a substantive message from the cutoff (00:34:02Z) onwards and a 10-minute quiet period. The one shared group is either two unrelated borrowers in one group or a referrer whose borrower lacks "Ref Referrer" (then the referrer's page also shows that group's summary, marked shared); worth a check of the records.
- No authenticated PROD API read (no sanctioned PROD token route); the empty table is the evidence for the null fields. Owner acceptance pending.

### Prune at closure
Deleted (inbound links repointed to commit `e80e1238`): `Change Logs/CHANGE_NOTES_R143_GRAFANA_RECOGNIZER_ROUTING_2026-11-12.md`, outside the window of the Open release and the three newest Released releases (R146, R145, R144); its links in the release tracker and the environment inventory now point at the permalink. The R146 "remaining work" row of `Development_Changes.md` became the "R146 follow-up" row (owner acceptance, shared-group check, dictionary capture); no other section of that file belonged to an older released release, and no uncited evidence was found (`npm run check:docs` reports no warning).

## Recovery
Revert the pull request for files. PROD: see the rollback row of the PROD promotion record; the first rollback is the agent switch (summaries age into the muted state), and a Hosting rollback removes the card. The DEV table and synthetic rows are disposable.

## Open questions
None.

## Remaining work
Promoted to PROD and switched on, 13 November 2026 (record above); tagged R146 and closed by the closure pull request. Open for the owner: acceptance ("let me check"); the dry run found 1 shared group (expected near zero), which is either two unrelated borrowers or a referrer whose borrower lacks "Ref Referrer" (the referrer's own page then shows that group's summary until the record is filled; the next poll's subject-digest change prunes it). 
