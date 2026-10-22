# Change notes — Notifications history shows the push text (R089), 22 October 2026

## Purpose
The owner asked (22 October 2026) that each Notifications history button shows the message the device was supposed to receive (push title and body, same wording and the same V100 language and name rules), with a small "time · state" line, so a row says what happened instead of "Open activity · sent". Tapping a row still opens the detail.

## Changes
- `database/migrations/V102__notification_history_content.sql` (new, Byte): adds `public.pwa_notify_history_content_v1(actor jsonb, events uuid[])`. `SECURITY DEFINER`, owned by `mw_notify_owner_<env>`, pinned `search_path`, V88 boundary comment, `EXECUTE` only for `mw_notify_api_<env>`. At most 26 ids (one history page, otherwise `invalid_request`); returns the V100 facts (event type, recipient language, borrower name in that language, amount) only for events delivered to the calling partner. No table, column, data or trigger change, and no new grant. `database/current/public-functions.sql` is regenerated.
- `services/notifications/store.mjs` (Byte): the history list and the offline dataset items gain `title` and `body`, rendered with `services/notifications/content.mjs` from current facts, so the text can differ from a past generic push. Best effort: if the function is unavailable (for example before V102), the page shows the generic text.
- `apps/pwa/src/Notifications.tsx`, `apps/pwa/src/live-style.css` (Byte): each history row is a card with title, body and a "time · state" line; states are translated (Sent, Sending, Not confirmed, Failed, Not sent; Thai equivalents). Items cached before R089 have no text and show "MW Credit / New activity". The button still opens the detail.
- Tests: `tests/unit/notifications-rpc.test.mjs`, `scripts/database/Test-AccessMatrix.sql`, `scripts/database/Test-NotifyContent.sql` (Byte); `tests/integration/notifications-ui-r053.test.mjs`, `tests/integration/phase8-browser-independent.test.mjs` (Chase).
- Documents (Dewey): `project/Documents/Release_Tracker.md` (R089 first work), `database/README.md` (V102 paragraph), `scripts/database/R053_OPERATOR.md` (V102 notify-owner window), `project/Documents/Solution_Design.md` (history text), `project/Documents/PWA_Data_Model_Overview.md` (history text derived, not stored), Data Dictionary: new routine entry `pwa_notify_history_content_v1` (source definition, purpose, grants), `index.json`, and `systems/pwa/notifications-jobs.yaml` (V102 contract and R089 history text). `Environment_Inventory.md` is unchanged: nothing is deployed yet.
- Promotion step, not in this batch: `scripts/promotion/deploy-business-hosting.mjs` has no R089 entry (SQL 101 to 102). R080 added its entry in a separate promotion-tooling commit and R081 with its change; R089 also needs the pinned baseline release commit, the Backup-ProductionPromotion baseline 101, `scripts/promotion/README.md` and `tests/unit/business-hosting-delivery.test.mjs`, which are code and not documentation, so Forge or Byte add it when the owner starts R089 promotion.

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck` (Byte, uncommitted tree) | Pass |
| `npm run lint` (Byte, same tree) | Exit 0 |
| `npm test` (Byte, same tree) | 768/768 pass |
| `tests/unit/notifications-rpc.test.mjs` (Byte, same tree) | 6/6 pass, including the best-effort SAVEPOINT fallback |
| `Test-MigrationsCloud.py --sql-only` (Byte, same tree) | 102 migrations applied; idempotent rerun passes |
| `Test-NotifyContent.sql` section D and `Test-AccessMatrix.sql` (Byte, same tree) | Pass |
| Chase independent review | SQL authorization and the V100 rules confirmed; one UI defect (state labels for leased, cancelled and dead) fixed by Byte, so states are now Sent, Sending, Not confirmed, Failed and Not sent |
| `notifications-ui-r053` (Chase, after the fix) | Pass |
| `Run-Phase8 -R053` filter `R089\|R080 content` (Chase) | 7/7 pass; the fixture is at V89, so the V102 branch is covered by the SQL suites and the fallback branch runs on the real boundary |
| `phase8-browser-independent` (Chase) | Fails identically on unchanged HEAD `3cac5e4` (pre-existing, not run by CI); only its history assertion was updated |
| Echo UX review | NOTIF-H1 to NOTIF-H7 applied |
| Forge | Not applicable (no deployment in this batch) |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings (uncommitted tree on `claude/ecstatic-franklin-8hao58`) |
| Dictionary `index` and `validate` (Dewey) | 418 documents, 0 errors |
| Pull request `Development checks` | Pending (commit and run to be filled) |

## Not run
Pending. A skipped check is not a pass. No DEV or PROD apply of V102 and no real-device or real-history check yet; the migration has not run against a live catalogue, so the dictionary entry records the source definition only.

## Recovery
Revert the batch commit before promotion. After V102 is applied, it is forward-fix only (shared migrations are immutable): the function is read-only and unused by anything but the notification API, which falls back to generic text if it is missing or fails, so a fix is a V103 that replaces or drops it. Full database recovery for a promotion is the verified backup in the promotion record and the [environment inventory](../project/Documents/Environment_Inventory.md).

## Open questions
None.

## Remaining work
- Owner-authorized DEV and PROD promotion: PROD needs a verified backup of baseline 101 and the temporary owner-authority window on `mw_notify_owner_prod` (as V99 and V100), then the R089 entry in `deploy-business-hosting.mjs` and a new image for the API and Hosting.
- After promotion: update the dictionary entry's coverage with the applied state and the inventory pins.
