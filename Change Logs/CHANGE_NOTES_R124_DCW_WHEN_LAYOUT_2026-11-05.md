# Change notes — Daily cash withdrawal date and time layout, 5 November 2026

## Purpose
The owner reported with an iPhone screenshot (4 to 5 November 2026, Asia/Bangkok) that the date and time fields on the Daily cash withdrawal page overlap a little. This is release R124: PWA Hosting only. Production promotion is not yet approved.

## Changes
- `apps/pwa/src/live-style.css`: in `.dcw-when` the date label is a fixed `10.5em` and the date input is `width: 100%` with border-box sizing and `min-width: 0`. The rule applies to the Daily cash withdrawal page only (Byte).
- New e2e layout test at 390 by 844 that fails without the fix (Byte).
- Documents: Release Tracker and Development Changes (R124 scope). No other document describes this layout.

## Checks
| Command | Result |
| --- | --- |
| Biome lint (Byte) | Clean |
| e2e typecheck (Byte) | Pass |
| Spec and cash-ledger e2e (Byte) | 14/14 pass |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | Pass (Chromium estimates; 168px holds the iOS pill, "30 Sep 2026" about 135px, Thai about 130–140px; one row at 390px in English and Thai, no sideways scroll); DCW-UX-6 optional: at 320px the time wraps below the date, accepted |
| Chase review | Pass (rules scoped to `.dcw-when>label`, no other page affected; 320px wraps without overflow; the e2e test guards the CSS contract, not the iOS rendering) |
| CI `Development checks` on the pull request | Pending |
| DEV smoke after Hosting deploy | Pending |
| PROD promotion (Hosting) | Pending |

## Not run
- WebKit is not installed, and Chromium did not reproduce the original overlap, so the fix is not proven on the owner's iPhone.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `919cbc9`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Echo and Chase reviews, CI, DEV deploy and smoke; PROD promotion needs the owner's approval.
- Owner confirmation on the iPhone after the deploy that the overlap is gone.
