# Change notes — R115 Daily Cash withdrawal, 2 November 2026

## Purpose
The owner asked for a "Daily Cash withdrawal" quick-entry page reached from the Cash Position page. It records the day's cash taken from the SCB and TTB source accounts into Dad's on-hand cash account in one confirmation. Build and test in DEV only; no PROD action in this batch.

## Changes
Outcomes:
1. Daily Cash withdrawal: from Cash Position the user opens a page with a date (default yesterday), a 10-minute time slicer (default now rounded down to 10 minutes), the available balance of each source account (SCB, TTB) as of that date and time, a withdraw amount box per source, the remaining amount, and a confirm that creates two transfers into Dad's on-hand cash account at the selected time.
2. Owner scope addition: the Collection and Borrowers pages no longer split into pages; each lists all borrowers on one page. Design detail to follow from Archie.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (tests). Forge is not applicable: no infrastructure change.

Design decisions settled for the withdrawal:
- Holder `ch:dad`; the destination defaults to Dad's cash account and can be changed.
- Migration V127 is functions-only (no new table or column): `guard_cash_ledger` honours an explicit Created At for Manual inserts under the transaction setting `r115.cash_movement_time`; new operation `cash-withdrawal.create`.
- As-of read: `GET /api/management/cash-withdrawal`.
- One atomic request with `requestId` idempotency; zero-amount lines are skipped; overdraw is hard-blocked (P5B10).
- Default date yesterday; default time now rounded down to 10 minutes.
- Echo test codes DCW-1..11.

Deviations and details recorded by Byte:
- `pwa_submit_operation_v2` also changed in V127 (closed operation list), alongside `guard_cash_ledger`, `pwa_management_financial_text_v2` and `pwa_apply_management_financial_v2`.
- A future time, or a date older than 15 days, is rejected as `invalid_date` (P5B08); an uninitialized account is `account_unavailable`.
- The page's accounts come from the as-of read.
- Chase finding 1, decided by the orchestrator (fix commit 4fd4e00): a withdrawal is refused (P5B10) above the smaller of the as-of balance and the lowest later running balance of the source account. The GET returns `availableAsOf` and `maxWithdrawable`; the page shows a "Max ฿X" note.
- V127 rebuilds the chat schema digest, so each chat thread starts a new history epoch after the chat image is redeployed.
- Withdrawal rows are ordinary Manual Cash Handovers, each editable or deletable on its own.

Accepted limitation (Chase re-review of 4fd4e00: pass): an entry with exactly the same Sort Timestamp as the withdrawal counts in the as-of balance but not in the later minimum. Statement ties order by `ledger_id`, so with an inflow at the identical minute the new row's own Balance After can show briefly negative while every later row stays at or above zero. It needs an exact timestamp collision and no stored data is wrong; the orchestrator accepted it for R115 (owner may revisit).

Outcome 2 (Collection and Borrowers): the read uses `limit=100`, the pagers are removed, a count line shows the total, a notice appears above 100 borrowers, and Borrowers restores scroll position. COL-2 is phone only.

Files and objects: `apps/pwa/src/DailyCashWithdrawal.tsx`, `ManagementPosition.tsx`, `CollectionRecords.tsx`, `borrower-count.ts`, `live-main.tsx`, `live-style.css`; `services/business/management-position.mjs`, `services/payment-command/*`, `services/chat/assets/schema-digest.json`; `database/migrations/V127__daily_cash_withdrawal.sql`, `database/current/public-functions.sql`; `scripts/database/Test-DailyCashWithdrawal.sql`; unit and Playwright specs. Local commits e25d96e (withdrawal), f19c5c5 (Collection and Borrowers), a09bd34 (type check).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` | Pass at 4fd4e00 |
| `npm run build` | Pass at 4fd4e00 |
| `npm test` | 1094 of 1096 pass at a09bd34; the two failures were the tracker label test rejecting "R115 — Open, in development" (fixed by restoring the `**R115 — Open**` form; `production-build-environment.test.mjs` re-run: 9 of 9 pass) |
| `npm test` at 4fd4e00 | 1097 of 1098 pass, 0 fail; new unit tests cover GET validation and the non-owner 403 |
| `scripts/database/Test-DailyCashWithdrawal.sql` on a disposable PostgreSQL chain to V127, at 4fd4e00 | Pass |
| Withdrawal Playwright spec at 4fd4e00 | 4 of 4 pass |
| Manual concurrency check on disposable PostgreSQL (two requests of 600 against 1000) | One applied, one `insufficient_funds`, one row; not part of the harness |
| Echo visual check (DCW-12/13/14, COLL-3 fixed) | Pass at 390 and 1280 px, EN and TH, Chromium |
| Focused Playwright specs (withdrawal, Collection, Borrowers) | Pass |
| PR #213 run 41477483620, e2e shard 3 | Failed at `rebate-offset-independent.spec.ts:109`: a timing flake that already fails on `main` 42e2677 (24 of 40 runs at 6 workers). Cause: the fixture `/api/preferences` returned no version, so the Thai save failed and the app reverted to English before the assertion |
| `rebate-offset-independent.spec.ts` after the fix in ed04e75 (fixture returns a versioned preference row; assertion unchanged) | 40 of 40 pass at 6 workers; whole spec 26 of 26; e2e lint and type check pass |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

DEV deploy evidence: see the [DEV deployment record](#dev-deployment-record) below; the [Environment inventory](../project/Documents/Environment_Inventory.md) DEV rows are not yet updated.

## DEV deployment record

Forge, 2 November 2026, UTC. Owner instruction: build and test in DEV. DEV only: no PROD action, the agent VM not touched.

| Item | Result |
| --- | --- |
| Source | `4acea34` (PR #213 head, branch `claude/r115-daily-cash-withdrawal`). Development checks run 41481163177 passed. Deploy inputs are identical to `9ad4081`, apart from the records and `tests/e2e/rebate-offset-independent.spec.ts` (ed04e75). Clean checkout for the migration and Hosting; the image from a `git archive` of the same commit |
| Target check | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, `loan_manager_dev` at head 126 (126 rows, 0 failed), no active sessions; services `mw-credit-app-{read,command,chat,notify,jobs}-dev` on R114 revisions `00061-v27`, `00078-jgz`, `00030-nhq`, `00027-2xq` and `00027-x99`. Owners before the migration: `guard_cash_ledger`, `pwa_management_financial_text_v2` and `pwa_apply_management_financial_v2` are owned by `postgres` (the runner), `pwa_submit_operation_v2` by `mw_app_dev_journal_owner`, so no sixth owner was needed |
| Backup at V126, observed 16:35:06Z | Dump sha256 `b96b6ca4c5be56f02a69268d2e190f754c17124cc098152e3f61a2b7755978c1`; archive listing and restore passed; 38 table fingerprints match; `gs://mw-credit-operator-private-737787224638/dev-backups/dev-refresh-ad5b1efb240d420ba3491e62693f6b2f/` |
| Owner window | 5 owners (`mw_chat_owner_dev`, `mw_notify_owner_dev`, `mw_jobs_owner_dev`, `mw_changes_owner_dev`, `mw_app_dev_journal_owner`), 20 statements, opened 16:37:59Z, restored 16:45:46Z (state `owner-authority-dev-prepare-51f0953b-e777-4b07-9fea-1c6f249ddb82`); readback: inherit, set and admin false and no CREATE on `public` for all five |
| V127 | `Invoke-Flyway.ps1 -Environment development -Command migrate`: installed 16:38:28Z (4.0 s, checksum 2087688833, self-check passed), head 127 (127 rows, 0 failed); post-migrate role reconcile 540 statements, 0 violations |
| Readback | The four functions keep their owners, SECURITY DEFINER flags and ACLs exactly as before, and each body carries the V127 change |
| Image | Cloud Build `bdac7c75-f0dc-4261-8c25-ec58583bdf26` (`cloudbuild-command.yaml`) as `mw-credit-app-build`, SUCCESS 16:46:26Z to 16:46:53Z, `api@sha256:867451f2bca46fd6be087f9a1ebe57b5cb293aa82b46581ff6d4c0a378661707`. The generic runner derives read, command and chat (every changed `services/` file is reached only from those entry points) |
| Terraform DEV | Plan 0 add, 3 change, 0 destroy (only the container image of `mw-credit-app-{read,command,chat}-dev`), plan sha256 `6dfbddbe…619c`; applied 16:48:39Z to 16:49:16Z; re-plan no changes; settings generation `1793638174711177` (previous `1793627707990461`); read `00062-lz7`, command `00079-vwg`, chat `00031-5h5`, 100% traffic; notify `00027-2xq` and jobs `00027-x99` stay on `87bfaa6f…` (R113). V127 rebuilds the chat schema digest, so each chat thread starts a new history epoch on its next turn |
| Hosting | `npm run build:live-dev` with `MW_RELEASE_NUMBER` unset (labelled R115 from the tracker); the nine bundle settings are identical to the R114 bundle; env file deleted; `--check` passed; deployed 16:51:28Z to 16:51:36Z; version `a1808fdee4245541`, release `1793638295567000`; build-version R115 `444cd917bce7f506ffbe6911`, entry `/assets/index-1rryC85o.js` embeds `4acea34`, on both origins |
| Smoke | `/health` 200 on read, command and chat; unauthenticated `/api/collection` and `/api/management/cash-withdrawal` 401; preflight 204; no ERROR logs on read, command or chat from 16:48Z |
| (a) Withdrawal, `claude-dev-test` through the command API | `GET /api/management/cash-withdrawal?date=2026-11-01&time=14:30`: holder `ch:dad`, Dad SCB 23,600.00, Dad TTB 3,019.00, Dad cash on hand 11,800.00 (available and max equal). An overdraw (SCB 100 + TTB 3,020) was refused as `insufficient_funds` (422, recorded rejected, no row). SCB 100 + TTB 50 into the cash-on-hand account: applied; a replay of the same request returned the same recorded outcome. Two Manual Cash Handover rows, `<targetId>` and `wd115:<targetId>:2`, both Movement Date 2026-11-01 and Created At 2026-11-01 14:30:00. As of 14:30 the balances read 23,500 / 2,969 / 11,950. As of 14:20 the available balances are unchanged, but maxWithdrawable reads 23,500 and 2,969, because the later minimum counts the new rows. Each row was then deleted with `cash-movement.delete` (applied). Ledger rows 560 before, 562 during, 560 after; the three account totals and the as-of read are back to the values before the test |
| (b) Borrower lists | `GET /api/collection?limit=100`: 51 items, no cursor; `GET /api/borrowers?limit=100`: 75 items, no cursor (76 borrowers, 1 hidden). Both equal the full paged sets at the default limit of 25 |
| Credentials | Temporary admin, read and test-token files deleted; no secret value printed |
| Rollback | Settings generation `1793627707990461` (read, command and chat back to `6ee162f2…`, R114) with Hosting `c375e3ecf74fd8a3` (release `1793627775286000`). Database: V127 is functions only and can stay under a service rollback, or restore the V126 backup above |

DEV left in place: one rejected and three applied operation journal entries from the smoke (the withdrawal and the two deletes); no smoke row remains in "Cash Ledger".

## Not run
WebKit and Home Screen (iPhone) rendering of the new pages: not checked.
PROD deployment and any live PROD write: out of scope for this batch. The Data Dictionary routine entries for the four V127 routines are not updated: the helper reconciles from a PROD capture after the migration reaches PROD, so they follow in the promotion.

## Recovery
Git baseline is the tip of `main` before the R115 branch `claude/r115-daily-cash-withdrawal`. DEV test transfers are synthetic and disposable. V127 is functions only; the prior function bodies are in the V126 baseline.

## Open questions
None yet.

## Remaining work
DEV deploy and evidence, owner review, then promotion on request (Data Dictionary routine entries at that point).
