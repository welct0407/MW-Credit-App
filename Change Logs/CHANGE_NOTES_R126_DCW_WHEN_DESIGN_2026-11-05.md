# Change notes — Daily cash withdrawal date and time design, 5 November 2026

## Purpose
On R125's iPhone screenshot the owner said (5 November 2026, Asia/Bangkok): "It looks very ugly. Fix it in dev properly, let echo review it. I'll review in dev before any further prod promotion." This is release R126: PWA Hosting only. Scope is DEV only. Production needs the owner's explicit approval after their DEV review; the approval given for R125 does not carry over.

## Changes
Design (Echo DCW-UX-9 to DCW-UX-13):
- The date uses the Cash Statement Date pattern (`.cash-date-picker`): visible date text with the year (`displayDateWithYear`), a calendar icon and a transparent native date input; 164px wide, 8px gap, 20px #565656 icon.
- The hour and minute selects sit in matching 44px boxes: appearance none, 1px #767676 border, 4px radius, white background, chevron.
- Labels stay on one line.
- All R124 and R125 date rules are removed.

Implementation (PWA client only; no SQL, server or infrastructure change):
- `apps/pwa/src/live-style.css` and `apps/pwa/src/DailyCashWithdrawal.tsx` (Byte), with the layout test.
- Documents: Release Tracker and Development Changes (R126 scope; R125 visual outcome rejected) and the R125 change note (limitations and remaining work).

## Checks
| Command | Result |
| --- | --- |
| Biome lint, typecheck (Byte) | Clean |
| Spec and cash-ledger e2e (Byte) | 14/14 pass on the first R126 build; daily-cash-withdrawal spec 8/8 after DCW-UX-12/13 |
| Cash Statement Date e2e (Byte) | 6/6 pass |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | First build: DCW-UX-12 (date 164px, 8px gap before the icon) and DCW-UX-13 (20px #565656 icon) raised and applied; the 390px close-ups in English and Thai then show one aligned row of matching 44px boxes |
| Chase review | Pass (R123 default, refresh and confirm logic intact; aria-hidden text with labelled, focusable input; shared `.cash-date-picker` CSS unchanged; no R124/R125 date rules left; iOS picker behaviour follows the Cash page pattern, not device-tested) |
| CI `Development checks` on the pull request | Pending |
| DEV smoke after Hosting deploy | Pending |
| PROD promotion | Awaiting the owner's DEV review and explicit approval |

## Not run
- WebKit is not installed; the owner's iPhone is the check of the iOS look.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `db79f44`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
- Whether the owner accepts the DEV look; PROD promotion needs their explicit approval after that review.

## Remaining work
- Echo and Chase reviews, CI, DEV deploy and smoke.
- The owner's DEV review, then the decision on PROD promotion.
