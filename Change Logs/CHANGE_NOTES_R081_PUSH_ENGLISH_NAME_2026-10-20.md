# Change notes — push notification shows the English borrower name (R081), 20 October 2026

## Purpose
Status: Frozen 2026-10-20T16:03Z at main `b36dce9` (PR #100). After R080 a push to the owner (English preference) showed the Thai borrower name. The owner's rule of 20 October 2026: "use the English name column, not Thai name, not combined name, not anything else". The English name already exists as the borrower form's "English name" (`Borrowers."Description"`), so no new column is needed.

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
| Pull request #100 CI (head bf65532) | Pass: `Development checks` run 39451927188, `Database migrations` run 39451897199, agent tests run 39451927275; merged as main `b36dce9`, tree identical to the tested head |
| Chase verification and diff review | No blocking defects. Lows, accepted: a NBSP-only Description gives a title-only push (correct); the inherit-path preflight gap fails closed; a stale R080 service worker shows its generic fallback for an empty body |
| DEV promotion (Forge) | Backup restore-tested, dump sha256 `1da86cfd…`, `gs://mw-credit-operator-private-737787224638/dev-backups/dev-v100-11abf187092f43569dc6e744c78a8659/`. Window for the notify, jobs, journal and changes owners opened (record `3ae82d36-4990-48b1-b57d-990a851c02f0`) and restored. Migrate 15:53Z to 15:59Z, 1 migration. Reconciliation 501 statements, 0 violations (record `1a286162-567c-4ca4-8615-81ce57fbf818`); `flyway validate` ok. Terraform 0/4/0 applied 15:59:33Z to 16:00:12Z; Hosting R081 deployed. Smoke: health 200, session 401, bundle `bf65532` with R081, no ERROR logs, function owner and ACL kept, notify owner has column-level SELECT on Borrowers (Borrower Name, Description, Row ID) and no table SELECT |
| PROD promotion | pending (Forge) |

## Not run
Pending. A skipped check is not a pass. No real-device iPhone check of an English-name push has been made yet; DEV hides the notifications screen, so it happens in PROD.

## Recovery
Revert the batch commit. The migration only replaces a function body and adds one column grant, so the previous V99 body (Borrower Name for everyone) is recovered by a corrective migration, not by editing V100. Full database recovery for a promotion is the verified backup recorded in the promotion record and the [environment inventory](../project/Documents/Environment_Inventory.md).

## Open questions
None.

## Remaining work
- PROD promotion by the owner's instruction (verified backup of baseline 99 first).
- Owner's real-device check of an English-name push in PROD.
- The receipt-speed session (`claude/receipt-wake-and-poll`, agent-only, agent DB migration V7) waits until R081 is Released in PROD.
- PUSH-UX-09 (deep link to the record) stays deferred.

## Promotion record
- Authority: owner instruction of 20 October 2026, "yes, promote R081 to prod after DEV"; it covers the tested V100 migration, backups and standard temporary maintenance permissions.
- Freeze: R081 frozen 2026-10-20T16:03Z; R082 opened in the same tracker update for the receipt-speed work.
- Package: main `b36dce9` (PR #100; runs 39451927188, 39451897199 and 39451927275); SQL V100 (baseline 99), plan 0/4/0 of the four images, Hosting marker R081. Pins and references go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- Excluded: financial corrections, forced notifications, agent changes, the receipt-speed work, PUSH-UX-09 and anything merged after `b36dce9`.
