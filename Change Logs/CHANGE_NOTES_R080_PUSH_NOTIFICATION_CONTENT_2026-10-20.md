# Change notes — push notification content (R080), 20 October 2026

## Purpose
Push notifications said only "An update is available." The root cause was a fixed generic body in the original implementation. They now show the event in the recipient's language, sized for an iPhone banner. The owner explicitly accepted borrower name and amount on the lock screen. Status: Frozen 2026-10-20T12:59Z at main `4a7e199` (PR #98); Released 20 October 2026 (applied and verified in DEV and PROD; owner acceptance is the owner's production instruction; no real-device push seen yet).

## Changes
- Migration V99 `public.pwa_notify_content_v1(delivery uuid, generation bigint)`: `SECURITY DEFINER`, notify dispatch role only, column SELECT grants (no Partner Name grant for the notify owner), no new tables or columns; it returns no actor name (Byte).
- `services/notifications/content.mjs`: templates, grapheme budgets 30 (title) and 80 (body); only the borrower name is truncated. Owner change 20 October 2026: no actor in the text. Language from Partners "Language Preference": 'ไทย' gives Thai, anything else English. Titles: `Payment received ฿5,000` / `รับชำระแล้ว ฿5,000`, `New loan ฿20,000` / `สินเชื่อใหม่ ฿20,000`, `Loan closed ฿20,000` / `ปิดสินเชื่อแล้ว ฿20,000`. Body: the borrower name only.
- Dispatcher reads the content between prepare and start; a failed read sends the generic "New activity".
- Web Push payload v2 `{v, eventId, title, body, url, tag}`; `sw.js` renders the payload text and falls back for v1 or malformed payloads.
- `Notifications.tsx` labels "Open activity" and "Activity unavailable".
- Echo codes PUSH-UX-01..08 and 10 adopted; PUSH-UX-09 (deep link to the record) deferred.
- Documents: `database/README.md` (V99 paragraph), `project/Documents/Solution_Design.md` (push text), `project/Documents/PWA_Data_Model_Overview.md` (derived at send time), Data Dictionary: `systems/pwa/notifications-jobs.yaml` (contracts, `push_content`), new routine entry `pwa_notify_content_v1` and `index.json` (rebuilt and validated with the helper). The routine entry's source is the V99 file; its commit SHA and the PROD catalogue facts are pending until the commit and DEV migration exist.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte; base c822a66, uncommitted tree) |
| `npm run typecheck` | Pass (Byte; same tree) |
| Six focused unit test files | 26/26 pass (Byte; same tree) |
| `Run-Phase8.ps1 -R053` | 21/21 pass (Byte; same tree) |
| `Run-R053OperatorIndependent.ps1 -LedgerOwner` | 1/1 pass (Byte; same tree) |
| `mw-db-ci -Group migrations` | 5/5 routes pass; `database/current/public-functions.sql` matches the rebuild (Byte; same tree) |
| `npm run check:docs` | Pass, 0 failures (Dewey) |
| `npm test` | Pass, exit 0, 748/748, 0 skipped (Chase; base c822a66, uncommitted tree) |
| `mw-db-ci -Group migrations` | Pass, exit 0: both routes sql passed, second_run 0, checksum tampering rejected; `Test-NotifyContent.sql` included via `Test-StatementBatch.sql:168` (Chase; same tree) |
| Adversarial diff review | No blocking defects (Chase) |
| Pull request #98 CI (head e5a9163) | Pass: `Development checks` run 39424932817, `Database migrations` run 39424924160; merged as main `4a7e199`, tree identical to the tested head |
| CI tracker-row fix `9d3a8a9` | Included in the PR #98 runs (the Open row stays parseable for the DEV build label) |
| Byte, promotion tooling `e5a9163` | `npm test` 756/756, 90/90 focused, lint, typecheck and `check:docs` pass; Chase review: no blocking defects |
| DEV promotion (Forge) | Backup restore-tested, dump sha256 `177a8ff4…`, `gs://mw-credit-operator-private-737787224638/dev-backups/dev-v99-9fa60671a91b4ec7b0189aa025f15089/`. Owner authority for notify, jobs and journal opened then restored. V99 installed 12:44:13Z (99 rows). Reconciliation first failed (permission denied on `pwa_track_row_change`, owned by `mw_changes_owner_dev`); rerun alone with `mw_changes_owner_dev` opened: 501 statements, 0 violations, all four owners restored, `flyway validate` ok. Terraform 0/4/0 image apply. Hosting R080 deployed. Smoke: health 200, session 401, bundle `4de3fae` with R080, no ERROR logs, function owner and ACL verified |
| PROD promotion, 20 October 2026 (Forge) | Backup `prod-promotion-028bb33ec00d4f2388a6ccf9266e5364` (dump sha256 `9e6b64f2…`) restore-tested (33 tables, fingerprints matched). CONNECT preflight `connect-preflight-2026-10-20T130208Z.json` (sha256 `05d16dea…`, 0 DEV sessions) pinned in manifest `release-r080-v99-4a7e199.json` (sha256 `4a86b34a…`). Check showed only V99 pending; grouped apply 13:04:41Z to 13:05:59Z, V99 installed 13:05:22Z (99 rows, 0 failed). Owner window `mw_notify_owner_prod` opened (record `702d3974-516d-4680-8b2e-807994fe244e`) and restored; `mw_changes_owner_prod` not needed. Cloud Build SUCCESS 13:07:15Z; Terraform plan 0/4/0 image only, applied 13:08:26Z to 13:09:01Z, fresh plan No changes. Hosting `d6082d278b41e979` deployed with `--check` then `--apply` and operator proof. Smoke: health 200, session 401, CORS `lm.mw-credit.com`, bundle `4a7e199` with R080, recognizer unchanged, no ERROR logs 13:04Z to 13:11:34Z, function owner, definer, search_path, EXECUTE and column grants verified. No notification sent, no job run, no financial change. Pins and private references are in the inventory |

Accepted low notes (Chase):
- The `sw.js` fallback is bilingual, "New activity · มีรายการใหม่", because the language is unknown there (intended).
- The title is not truncated; this matters only for amounts above about 10^12.

## Not run
Pending. A skipped check is not a pass. No real-device iPhone banner check has been made yet. DEV has `VITE_NOTIFICATIONS` unset (the notifications screen is hidden there), so the real-device push check happens in PROD.

## Recovery
Revert the batch commit. V99 only adds a function, so it needs no data repair; dropping `public.pwa_notify_content_v1` is enough if the migration was applied. Without the function the dispatcher already falls back to "New activity". Full recovery: restore `loan_manager_prod` from backup `prod-promotion-028bb33ec00d4f2388a6ccf9266e5364` (private `prod-backups/`), set the four Cloud Run services back to the previous revisions and Hosting back to the previous version, all recorded as rollback in the [environment inventory](../project/Documents/Environment_Inventory.md). Rolling back the code alone is safe with V99 in place; the worker then falls back as described above.

## Open questions
None.

## Remaining work
PUSH-UX-09 (deep link from the notification to the record) is deferred (Echo).
- iPhone visual check of the banner in PROD after promotion (Echo); DEV cannot show it.
- The owner's next real activity is the first real-device iPhone check in PROD; until then no push has been seen.
- Release number: the receipt hotfix shipped as R079, so this work is R080. The branch keeps its original name `claude/r079-push-notification-content` because remote branch deletion is unavailable.
- DEV `build:live-dev` Firebase config step: see `docs/Development.md`.

## Promotion record
- Authority: owner instruction of 20 October 2026, "yes, open the PR, deploy to Dev then promote to prod"; it covers the tested V99 migration, backups and standard temporary maintenance permissions.
- Freeze: R080 frozen 2026-10-20T12:59Z; R081 opened in the same tracker update.
- Package: main `4a7e199` (PR #98; runs 39424932817 and 39424924160); SQL V99 (baseline 98), plan 0/4/0 of the four images, Hosting marker R080. Pins go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- Deviation: the DEV post-migrate reconciliation also needs `mw_changes_owner_dev` in the owner-authority window (it failed without it on `pwa_track_row_change`). `scripts/database/R053_OPERATOR.md` now lists it in the DEV sequence; the PROD run has no reconciliation.
- Result: applied and verified in DEV and PROD on 20 October 2026; pins and references are in the inventory.
- Excluded: financial corrections, forced notifications, agent changes, PUSH-UX-09 and anything merged after `4a7e199`.

### Closure pruning (release workflow, 20 October 2026)
- Inbound link repointed first to the commit permalink of `4b0adbc4` (the last commit where the target exists): the tracker's R077 record link.
- Development Changes: R080 had no section; one outstanding row added for the real-device push check.
- Change note deleted (R077 left the retention window of R080, R079 and R078): `Change Logs/CHANGE_NOTES_R077_RECOGNITION_TIMEOUTS_2026-10-19.md`.
- Evidence deleted: none (see the `npm run check:docs` result).
