# Change notes — push notification content (R080), 20 October 2026

## Purpose
Push notifications said only "An update is available." The root cause was a fixed generic body in the original implementation. They now show the event in the recipient's language, sized for an iPhone banner. The owner explicitly accepted borrower name and amount on the lock screen.

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

Accepted low notes (Chase):
- The `sw.js` fallback is bilingual, "New activity · มีรายการใหม่", because the language is unknown there (intended).
- The title is not truncated; this matters only for amounts above about 10^12.

## Not run
Pending. A skipped check is not a pass. No real-device iPhone banner check has been made yet. DEV has `VITE_NOTIFICATIONS` unset (the notifications screen is hidden there), so the real-device push check happens in PROD.

## Recovery
Revert the batch commit. V99 only adds a function, so it needs no data repair; dropping `public.pwa_notify_content_v1` is enough if the migration was applied. Without the function the dispatcher already falls back to "New activity". A DEV or PROD database change follows the normal backup rule at promotion.

## Open questions
None.

## Remaining work
PUSH-UX-09 (deep link from the notification to the record) is deferred.
- Cloud SQL needs owner-authority `prepare` for `mw_notify_owner_<env>` before migrating V99, then `restore`.
- `Backup-ProductionPromotion.py` does not yet accept `--expected-version 98` (promotion tooling).
- iPhone visual check of the banner in PROD after promotion (Echo); DEV cannot show it.
- PROD promotion: backup of baseline 98, guarded 98-to-99 migrate, image and Hosting R080; then closure pruning.
- Release number: the receipt hotfix shipped as R079, so this work is R080. The branch keeps its original name `claude/r079-push-notification-content` because remote branch deletion is unavailable.
- PROD runner `scripts/promotion/deploy-business-hosting.mjs` needs an R080 release kind with SQL baseline 98 to target 99, modelled on R078's SQL kind (R079 was schemaVersion 21).
- DEV `build:live-dev` Firebase config step: see `docs/Development.md`.

## Promotion record
- Authority: owner instruction of 20 October 2026, "yes, open the PR, deploy to Dev then promote to prod"; it covers the tested V99 migration, backups and standard temporary maintenance permissions.
- Freeze: R080 frozen 2026-10-20T12:59Z; R081 opened in the same tracker update.
- Package: main `4a7e199` (PR #98; runs 39424932817 and 39424924160); SQL V99 (baseline 98), plan 0/4/0 of the four images, Hosting marker R080. Pins go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- Deviation: the DEV post-migrate reconciliation also needs `mw_changes_owner_dev` in the owner-authority window (it failed without it on `pwa_track_row_change`). `scripts/database/R053_OPERATOR.md` now lists it in the DEV sequence; the PROD run has no reconciliation.
- Excluded: financial corrections, forced notifications, agent changes, PUSH-UX-09 and anything merged after `4a7e199`.
