# Change notes — Daily cash withdrawal date control on iOS, 5 November 2026

## Purpose
After R124 reached PROD, the owner's iPhone screenshot (5 November 2026, Asia/Bangkok) still showed the date pill overlapping the hour select by about 3px. The 168px label holds, but iOS Safari keeps the native date control's intrinsic width (about 183px) and ignores `width:100%`. This is release R125, the completion of the R124 fix: PWA Hosting only. Authority: the owner's "Yes, push it all the way to prod" for the overlap fix, applied to this completion of the same fix (DEV first).

## Changes
- `apps/pwa/src/live-style.css`: `.dcw-when>label input[type=date]` gets `appearance:none`, fills the label and left-aligns its value; the Chromium default is styled like the selects; an iOS-only `@supports (-webkit-touch-callout:none)` block gives the pill look of the native iOS selects (Byte).
- The e2e layout test now also asserts `appearance: none` (Byte).
- Documents: Release Tracker and Development Changes (R125 scope; R124 marked as not resolving the overlap on iOS) and the R124 change note (limitations and remaining work).

## Checks
| Command | Result |
| --- | --- |
| Biome lint (Byte) | Clean |
| Spec and cash-ledger e2e (Byte) | 14/14 pass on the first revision; daily-cash-withdrawal spec 8/8 after the iOS pill and chevron override (Chromium does not apply the `@supports (-webkit-touch-callout:none)` branch) |
| `npm run check:docs` (Dewey) | Pass |
| Echo review | Pass by CSS reading (no device run); DCW-UX-7 adopted: chevron added on the iOS date pill; DCW-UX-8 already met (44px, left-aligned value) |
| Chase review | Pass (appearance:none keeps a 44px tappable box and the iOS picker; scoped to this page; valid iOS-only `@supports`; width fit estimated, about 95px text in 120px room) |
| CI `Development checks` on the pull request | Pending |
| DEV smoke after Hosting deploy | Pending |
| PROD promotion (Hosting) | Pending |

## Not run
- WebKit is not installed, so the fix is not proven on the owner's iPhone; the layout test guards the CSS contract, not the iOS rendering.
- Full `npm run check` and the wide e2e suite: the pull request's Development checks is the broad run.

## Recovery
Revert the commit of this batch (Git baseline `e55f1e0`) and redeploy the prior Hosting version. No database or server state changed.

## Open questions
None.

## Remaining work
- Byte's final check numbers, Echo and Chase reviews, CI, DEV deploy and smoke, PROD promotion.
- Owner confirmation on the iPhone after the deploy that the overlap is gone.
