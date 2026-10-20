# Change notes — push notification shows the English borrower name (R081), 20 October 2026

## Purpose
After R080 a push to the owner (English preference) showed the Thai borrower name. The owner's rule of 20 October 2026: "use the English name column, not Thai name, not combined name, not anything else". The English name already exists as the borrower form's "English name" (`Borrowers."Description"`), so no new column is needed.

## Changes
- Migration `database/migrations/V100__notification_english_name.sql` replaces `public.pwa_notify_content_v1(uuid,bigint)` in place (same signature, result columns, owner, `SECURITY DEFINER`, pinned `search_path`, comment and ACL). `borrower_name` is "Borrower Name" for Thai recipients and the trimmed "Description" for English recipients, NULL when blank. The notify owner `mw_notify_owner_<env>` gains column SELECT on Borrowers ("Description"). No table, column or data change (Byte).
- `services/notifications/content.mjs`: an empty body (title only) when there is no name.
- `services/notifications/web-push.mjs` and `apps/pwa/pwa/sw.js`: accept title 1 to 60 and body 0 to 200 characters.
- Promotion tooling: `scripts/promotion/deploy-business-hosting.mjs` R081 kind (`schemaVersion` 23, pinned R080 release `4a7e199`, exactly V100, SQL 99 to 100); `scripts/database/Backup-ProductionPromotion.py` accepts baseline 99; `scripts/database/R053_OPERATOR.md` V100 window; `scripts/promotion/README.md` R081 section.
- Documents: `database/README.md` (V100 paragraph), `project/Documents/Solution_Design.md` (name rule), `project/Documents/Development_Changes.md` (R081 row), Data Dictionary routine entry `pwa_notify_content_v1` (definition, purpose, grants, coverage) and `systems/pwa/notifications-jobs.yaml` (V100, name rule, payload limits). The Borrowers relation entry records no notify-owner grants, so it is unchanged.
- R080 follow-ups found on 20 October 2026 (no code in this batch): a stale R079 service worker silently dropped v2 pushes until phones reopened the app; the owner force-closed both phones and confirmed it works (the owner saw "Payment received ฿1,000"). iOS adds its own "from MW Credit" line to the banner; it cannot be removed.

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass, exit 0 (Byte; base main 098a419, uncommitted tree) |
| `npm run typecheck` | Pass (Byte; same tree) |
| `npm run check:docs` | Pass, exit 0 (Byte; Dewey reruns at closeout) |
| `npm test` | Pass, 762/762 (Byte; same tree) |
| `Run-R053OperatorIndependent.ps1 -LedgerOwner` | 1/1 pass, V100 as a non-superuser runner (Byte; same tree) |
| `Run-Phase8.ps1 -R053` | 21/21 pass (Byte; same tree) |
| `mw-db-ci -Group migrations` | 5/5 pass; the rebuild matches `database/current/public-functions.sql` (Byte; same tree) |
| Chase verification and diff review | pending (Chase) |
| Pull request `Development checks` | pending (commit and run to be filled) |
| DEV promotion | pending (Forge) |
| PROD promotion | pending (Forge) |

## Not run
Pending. A skipped check is not a pass. No real-device iPhone check of an English-name push has been made yet; DEV hides the notifications screen, so it happens in PROD.

## Recovery
Revert the batch commit. The migration only replaces a function body and adds one column grant, so the previous V99 body (Borrower Name for everyone) is recovered by a corrective migration, not by editing V100. Full database recovery for a promotion is the verified backup recorded in the promotion record and the [environment inventory](../project/Documents/Environment_Inventory.md).

## Open questions
None.

## Remaining work
- DEV and PROD promotion by the owner's instruction (PROD needs a verified backup of baseline 99).
- Owner's real-device check of an English-name push in PROD.
- The receipt-speed session (`claude/receipt-wake-and-poll`, agent-only, agent DB migration V7) waits until R081 is Released in PROD.
- PUSH-UX-09 (deep link to the record) stays deferred.
