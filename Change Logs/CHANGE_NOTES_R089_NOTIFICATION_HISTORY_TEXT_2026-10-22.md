# Change notes — Notifications history shows the push text (R089), 22 October 2026

## Purpose
The owner asked (22 October 2026) that each Notifications history button shows the message the device was supposed to receive (push title and body, same wording and the same V100 language and name rules), with a small "time · state" line, so a row says what happened instead of "Open activity · sent". Tapping a row still opens the detail.

## Changes
- `database/migrations/V103__notification_history_content.sql` (new, Byte): adds `public.pwa_notify_history_content_v1(actor jsonb, events uuid[])`. `SECURITY DEFINER`, owned by `mw_notify_owner_<env>`, pinned `search_path`, V88 boundary comment, `EXECUTE` only for `mw_notify_api_<env>`. At most 26 ids (one history page, otherwise `invalid_request`); returns the V100 facts (event type, recipient language, borrower name in that language, amount) only for events delivered to the calling partner. No table, column, data or trigger change, and no new grant. `database/current/public-functions.sql` is regenerated.
- `services/notifications/store.mjs` (Byte): the history list and the offline dataset items gain `title` and `body`, rendered with `services/notifications/content.mjs` from current facts, so the text can differ from a past generic push. Best effort: if the function is unavailable (for example before V103), the page shows the generic text.
- `apps/pwa/src/Notifications.tsx`, `apps/pwa/src/live-style.css` (Byte): each history row is a card with title, body and a "time · state" line; states are translated (Sent, Sending, Not confirmed, Failed, Not sent; Thai equivalents). Items cached before R089 have no text and show "MW Credit / New activity". The button still opens the detail.
- Tests: `tests/unit/notifications-rpc.test.mjs`, `scripts/database/Test-AccessMatrix.sql`, `scripts/database/Test-NotifyContent.sql` (Byte); `tests/integration/notifications-ui-r053.test.mjs`, `tests/integration/phase8-browser-independent.test.mjs` (Chase).
- Documents (Dewey): `project/Documents/Release_Tracker.md` (R089 first work), `project/Documents/Development_Changes.md` (R089 row), `database/README.md` (V103 paragraph), `scripts/database/R053_OPERATOR.md` (V103 notify-owner window), `project/Documents/Solution_Design.md` (history text), `project/Documents/PWA_Data_Model_Overview.md` (history text derived, not stored), Data Dictionary: new routine entry `pwa_notify_history_content_v1` (source definition, purpose, grants), `index.json`, and `systems/pwa/notifications-jobs.yaml` (V103 contract and R089 history text). `Environment_Inventory.md` is unchanged: nothing is deployed yet.
- Promotion contract (Byte, same PR, by the owner's 22 October 2026 request to deploy R089 to DEV and PROD): the R089 entry in `scripts/promotion/deploy-business-hosting.mjs` (SQL 102 to 103), `scripts/promotion/README.md` and the `Backup-ProductionPromotion.py` baseline 102 ride this PR with the change, as for R081, instead of waiting for promotion start.

- Migration number clash (22 October 2026): the Grafana revamp, also R089 (branch `claude/vigilant-allen-kfzogm`, not yet on main), applied `V102__monitoring_ops_health.sql` to DEV and PROD first, so this migration was renumbered from V102 to `V103__notification_history_content.sql` (Byte). Both batches belong to R089, the sole Open release. Every V103 reference here and in the documents above is the renumbered one; the schema baseline for V103 is 102.

- DEV deploy (22 October 2026, PR #121 head): V103, the API image and Hosting are deployed to DEV; the pins and the smoke result are in the [Environment Inventory](../project/Documents/Environment_Inventory.md). DEV notification delivery was switched on for the review on the owner's instruction of 22 October 2026; the inventory has the details and the quick pause. PROD is not deployed.

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
| `Run-Phase8 -R053` filter `R089\|R080 content` (Chase) | 7/7 pass; the fixture is at V89, so the V103 branch is covered by the SQL suites and the fallback branch runs on the real boundary |
| `phase8-browser-independent` (Chase) | Fails identically on unchanged HEAD `3cac5e4` (pre-existing, not run by CI); only its history assertion was updated |
| Echo UX review | NOTIF-H1 to NOTIF-H7 applied |
| Forge | Not applicable (no deployment in this batch) |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings (uncommitted tree on `claude/ecstatic-franklin-8hao58`) |
| Dictionary `index` and `validate` (Dewey) | 418 documents, 0 errors |
| Pull request `Development checks` | Pending (commit and run to be filled) |

## Not run
Pending. A skipped check is not a pass. No DEV or PROD apply of V103 and no real-device or real-history check yet; the migration has not run against a live catalogue, so the dictionary entry records the source definition only.

## Recovery
Before PROD, the batch could be reverted by Git. In PROD, V103 is forward-fix only (shared migrations are immutable): the function is read-only and used only by the notification API, which shows generic text if it is missing or fails, so a fix is a V104 that replaces or drops it. Roll back runtime and Hosting first: restore the prior PROD activation (generation recorded in the [inventory](../project/Documents/Environment_Inventory.md)), plan, apply and publish, and set Hosting back to the previous version. Restore `loan_manager_prod` from the promotion backup recorded in the inventory only for data damage, which V103 does not cause (no table, column, data or trigger change).

## Open questions
None.

## Remaining work
- The owner's real-device check of the history rows in PROD, on the next real activity.
- The DEV test event `9c430c9e-…` (owner-approved option 2) stays on DEV; cleanup SQL is available. DEV delivery stays on for the review until the owner says otherwise.

## Promotion record
- Authority: the owner's instruction of 22 October 2026, "got it. looks good. promote to prod.", approving PROD promotion of R089 including V103, backups and the standard temporary maintenance windows ([Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion)).
- Freeze: R089 Frozen 2026-10-22T18:14Z in the [tracker](../project/Documents/Release_Tracker.md#releases-requiring-action); R090 opened and the counter advanced to R091 in the same update. The freeze covers both R089 pieces of work: this batch and the Grafana revamp, which is already live in PROD (its own records are unchanged).
- Package: main `99758c71` (PR #121 on top of the Grafana PR #123 merge `0a93c0ab`). DEV was deployed and reviewed from the PR head before the merge (see the [Environment Inventory](../project/Documents/Environment_Inventory.md)).
- Result: applied and verified in DEV and PROD on 22 October 2026. Pins, backups, owner windows, revisions and Hosting are in the [Environment Inventory](../project/Documents/Environment_Inventory.md); the release tag `R089` is on `99758c71` (Release tag workflow started by the orchestrator).
- First PROD attempt failed safely: the V103 self-check refused and the transaction rolled back fully at 18:24:26Z; the owner window was restored at 18:24:40Z and no schema change remained. The retry (window opened 18:29:04Z, restored 18:30:40Z) succeeded after the owner-approved pause of the PROD default privilege that grants new functions to `mw_integration_agent` (revoked 18:29:13Z, re-granted 18:30:34Z, `pg_default_acl` rows byte-equal afterwards, same 42 functions kept).
- PROD smoke: bundle carries `99758c7` and `R089`, `/health` 200, `/api/session` 401, CORS 204, no ERROR logs, only the API role can execute the new function.
- Exclusions: no notification, job or financial write was forced in PROD; no agent change; no PROD scheduler or delivery setting change. DEV received a test event `9c430c9e-…` (owner-approved option 2, kept on DEV, cleanup SQL available).
- CI cited by the package: `guards` from run 39829528145 on `99758c71`; the other jobs from the stage-hash evidence of runs 39822265758, 39785077301, 39820936908 and 39822254364.

### Closure pruning (release workflow, 22 October 2026)
- Inbound links repointed first to the commit permalink of `5a41f8cf` (the last commit where the target exists): `database/README.md`, `integration-agent/docs/PARTNER_CONVERSATIONS.md`, `integration-agent/Change Logs/CHANGE_NOTES_RECOGNIZER_RESTART_2026-10-21.md`, `project/Documents/Development_Changes.md` and the tracker's R086 record link.
- Change note deleted (R086 left the retention window of R089, R088 and R087): `Change Logs/CHANGE_NOTES_R086_WAKE_AND_LOAN_CLOSE_FIX_2026-10-21.md`.
- Development Changes: both R089 rows now record the release; no R089 section existed.
- Evidence deleted: none (see the `npm run check:docs` result).
