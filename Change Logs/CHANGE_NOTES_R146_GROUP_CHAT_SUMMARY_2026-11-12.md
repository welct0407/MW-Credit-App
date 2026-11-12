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
- Documents (Dewey): `Release_Tracker.md` (scope), `Development_Changes.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `docs/Development_Read_Service.md`, the agent documents, and the Data Dictionary `agent-api.yaml`, `human-api.yaml` and `application.yaml` by hand; the relation and routine records wait for the PROD capture (see Remaining work).
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
| CI on the pull request, DEV migration, reader grant and deploy | Pending |

## Not run
- The wide Playwright suite locally: the pull request's `Development checks` run it.
- A live Claude call and the live Instagram message shape: the first real run happens at the PROD switch-on.
- The agent lab PostgreSQL suites and the database CI after the last corrections: those paths are untouched by them; CI runs the database groups.
- Concurrent puts under real concurrency (the advisory lock is tested serially).
- The full `mw-db-ci` migrations group on the final tree: CI runs it.
- `test_receipt_qr`: import error because `zxingcpp` is not installed in this session.
- The faketime day-change offline case: skipped without the faketime lab.
- DEV migration, the DEV reader grant, the DEV deploy and the synthetic summary rows: pending Forge.
- Every PROD step (migration, images, Hosting, agent deploy, timer install, dry run, switch-on): not authorized.

## Recovery
Revert the pull request for files; nothing is deployed to PROD; the DEV table and synthetic rows are disposable. After a PROD promotion, rollback is the agent switch (summaries age into the muted state) and a Hosting rollback for the card.

## Open questions
None.

## Remaining work
Implementation, verification, DEV deploy with synthetic summary rows, owner review, then the owner's promotion instruction. Data Dictionary: the relation and routine records for `public.pwa_group_chat_summaries` and `pwa_put_group_chat_summary_v1` are captured from PROD with the helper after the PROD migration, in the closure batch (`agent-api.yaml` and `human-api.yaml` are already updated; `application.yaml` waits for the PWA facts).
