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

DEV deploy evidence (pins live only in the [Environment inventory](../project/Documents/Environment_Inventory.md)): pending, no DEV deploy yet.

## Not run
WebKit and Home Screen (iPhone) rendering of the new pages: not checked.
PROD deployment and any live PROD write: out of scope for this batch. The Data Dictionary routine entries for the four V127 routines are not updated: the helper reconciles from a PROD capture after the migration reaches PROD, so they follow in the promotion.

## Recovery
Git baseline is the tip of `main` before the R115 branch `claude/r115-daily-cash-withdrawal`. DEV test transfers are synthetic and disposable. V127 is functions only; the prior function bodies are in the V126 baseline.

## Open questions
None yet.

## Remaining work
DEV deploy and evidence, owner review, then promotion on request (Data Dictionary routine entries at that point).
