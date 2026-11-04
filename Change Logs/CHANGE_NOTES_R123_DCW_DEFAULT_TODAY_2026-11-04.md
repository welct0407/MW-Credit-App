# Change notes — Daily cash withdrawal default date and time, 4 November 2026

## Purpose
The owner asked on 4 November 2026 (Asia/Bangkok) to change the Daily cash withdrawal page so the date defaults to today and the time to the current time ("Let the team work on it"), then "Test it and push all the way to prod." This is release R123: PWA Hosting only.

## Changes
Design (Archie, with Echo's review; Echo DCW-UX-1 and DCW-UX-3 adopted):
- The page takes date and time from one Bangkok clock reading at page open: the date defaults to today (R115 used yesterday) and the time to now rounded down to 10 minutes. The 10-minute steps are unchanged because the API requires 10-minute slots.
- The date maximum is the later of the business date and Bangkok today.
- Defaults the person has not edited refresh when the app returns to the foreground; after the person edits the date or the time, the values stay as edited.
- DCW-UX-2 (step the time back when the device clock is ahead) is deferred: the existing "can no longer be used" alert already handles it. DCW-UX-4: no copy change.

Implementation (PWA client only; no SQL, server or infrastructure change):
- `apps/pwa/src/bangkok-clock.ts` (new; `bangkokClock` replaces `bangkokTimeNow`) and `apps/pwa/src/DailyCashWithdrawal.tsx` (Byte): defaults from one clock reading, date maximum = later of business date and Bangkok date, visibility refresh of untouched defaults. Chase found one defect, fixed: the refresh is a no-op while the confirm step is open, and the confirm summary shows the command's own date and time.
- Tests: `tests/unit/daily-cash-withdrawal.test.mjs`, Playwright `daily-cash-withdrawal-independent` and `cash-ledger-counterparty-independent` (the new step fails without the fix).
- Documents: Release Tracker and Development Changes (R123 scope), Solution Design (Daily Cash withdrawal paragraph). The Data Dictionary, PWA Data Model Overview and database README need no change (no schema, behavior of data or access change).

## Checks
All on base 673504d, uncommitted working tree.

| Command | Result |
| --- | --- |
| Biome lint, 4 files (Byte) | Clean |
| `npm run typecheck` (Byte) | 0 errors |
| `node --test tests/unit/daily-cash-withdrawal.test.mjs` (Byte) | 6/6 pass |
| Playwright daily-cash-withdrawal-independent and cash-ledger-counterparty-independent, desktop and mobile (Byte) | 12/12 pass |
| Chase adversarial review | One defect (confirm summary drift on refresh) fixed and re-reviewed: pass |
| Echo iPhone 13 viewport (Chromium), English and Thai, 12:07 and 00:03 with stale business date | Correct defaults, no alerts, no horizontal scroll |
| `npm run check:docs` (Dewey) | Pass |
| CI `Development checks` on the pull request | Pending |
| DEV smoke after Hosting deploy | Pending |
| PROD promotion (Hosting) | Pending |

## Not run
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.
- Real iOS Safari (Echo used Chromium, no WebKit).
- Not fixed, noted: the basis refetch on offline to online during review is pre-R123 behavior; after Back from confirm, untouched defaults stay until the next foreground event; DCW-UX-5 (Thai as-of month shown in English) is pre-existing and out of scope.

## Recovery
Revert the commit of this batch (Git baseline 673504d) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Fill the Checks table, then DEV and PROD promotion records and the closure pull request (R123 Released, R124 opened).
- Owner acceptance: first real use of the page in PROD.
