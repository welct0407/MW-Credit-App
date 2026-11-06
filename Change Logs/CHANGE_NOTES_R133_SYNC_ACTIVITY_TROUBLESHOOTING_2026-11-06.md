# Change notes — R133 header sync activity and troubleshooting file, 6 November 2026

## Purpose
Two items: (a) show the ongoing sync or load activity in the header last-update area while the refresh icon spins; (b) enhance the client-side encrypted troubleshooting file with what recent investigations needed.

Owner scope, 6 November 2026: "When the app is loading/syncing data, or whenever the sync icon is spinning, I want the ongoing activity to be reflected in the area where it shows last update time when it's not spinning, so I know why it's spinning. I also want you to review the troubleshooting file at client side and enhance it to include information helpful for troubleshooting based on recent troubleshooting experience. Engage the team to work on this in the next release".

Status: In development, not deployed. No production approval has been given. Expected delivery: PWA Hosting only, no SQL, images, Terraform or VM change.

Team: Archie, Byte, Chase, Dewey, Echo. Forge is not applicable: no infrastructure change.

## Changes
Item (a), header sync activity label:
- To be filled by Archie and Byte (design, files and behavior).

Item (b), troubleshooting file:
- To be filled by Archie and Byte (new fields, based on the R121, R130 and R132 diagnoses).

Echo findings (SYNC-ACT-UX-1 to 15, priority in brackets):
- 1 (Must): the label follows exactly the spin state, from one shared value.
- 2 (Must): precedence is connecting or sign-in, first download bar, sending queued changes, checking a section, refresh check of all sections, receipts, failure, saved-from, updated; running activity replaces the failure text while it runs.
- 3 (Should): quiet automatic checks are labelled only if they spin the icon.
- 4 (Must): short verb plus object labels in English and Thai: Connecting… / กำลังเชื่อมต่อ…, Signing in…, Signing out…, Sending N changes… / กำลังส่ง N รายการ…, Checking Cash… / กำลังตรวจ เงินสด…, Checking data…, Loading… / กำลังโหลด…, Receipts 12/40 / ใบเสร็จ 12/40.
- 5 (Should): receipts show a count, not a bar.
- 6 (Should): no duplicate of the app-version "Checking app…" text.
- 7 (Must): keep the 88px two-line cell; fall back to the generic label when the text does not fit.
- 8 (Must): the first download keeps the percentage over its bar and gets no label.
- 9 (Could): the refresh check shows bar plus label only if it fits.
- 10 (Must): anti-flicker: 400 ms show delay, 800 ms minimum display, 600 ms swap between labels, and no "Done" text.
- 11 (Should): normal colour; the stale or failed style is dropped while activity is shown.
- 12 (Must): the label is text, not a control.
- 13 (Must): the live region keeps its two announcements only; the refresh button hidden text matches the label.
- 14 (Should): `aria-busy` is kept and nothing is announced twice.
- 15 (Could): the troubleshooting activity history uses the same labels.

## Checks
| Command | Result |
| --- | --- |
| To be filled | Pending |

## Not run
To be filled.

## Recovery
Git baseline: R132 `ede185f` (PROD package). Nothing is deployed for R133 yet; before release, revert the code commit(s) of this release.

## Open questions
To be filled.

## Remaining work
To be filled: documentation updates, checks, DEV deployment and owner review.
