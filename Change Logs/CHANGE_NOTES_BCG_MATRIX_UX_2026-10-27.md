# Change notes — BCG borrower matrix chart UX, 27 October 2026

## Purpose
Echo reviewed the custom borrower matrix (the Debian-hosted chart in the Borrower Health Review iframe). The owner chose items 1 to 4, 6 and 7 and said "go ahead and deploy". This batch changes the chart's front end and deploys it to `vm-mw-credit-agent`; it is separate from the Loan Reports proposed dashboard build.

## Changes
- `project/scripts/metabase/chart_service/chart.js`, `chart.css`, `index.html`, `preview.py`, `test_app.py` (`app.py` and `query.sql` unchanged), commit "Matrix chart: detail target, quadrant labels, compact mode, contrast, pinned tooltip":
  1. Whitelisted fragment parameter `detail=<dashboard>:<tab>`, default `3:105` (dashboard 3 behaves as before and uses the filters `bd_borrower` and `bd_activity`; any other dashboard uses `borrower` and `period`).
  2. Quadrant names and subtitles at the outer corners, outside the data area; "Score 80" and "1× equal share" labels; axis titles replace the footer. The bottom axis wording differs from the review's because higher scores are on the left.
  3. Compact mode for frames up to 480 px tall: eyebrow, subtitle, search, note and the not-plotted list hidden, the plot fills the frame, names off, details in a bottom sheet.
  4. AA contrast: Question Mark text `#8C5E12` (5.23:1 on its fill), greys `#5f6b7c` (5.41:1), minimum 11 px.
  6. Click, tap or Enter pins the tooltip with a 44 px "Open Borrower Detail" button; Esc or an outside click unpins.
  7. Tooltip and focus are kept across the 60-second refresh and resize.
  The visual contract is kept: four equal quadrants, exact SQL positions, dot radius 5.5, tooltip name and badge.
- `project/scripts/metabase/ProposedLoanReports.mjs`: dashboard 32's copied matrix iframe gets `&detail=32:382` (Borrower Detail tab). Refined with `--refine --only=health`; dashboard 3's iframe is unchanged.
- Deployed on 27 October 2026 to `vm-mw-credit-agent` over IAP SSH as `codex-cloud`. Before the deploy the live files differed from main only by CRLF line endings. Installed root:root 0644: `chart.js` sha256 `d8e2ec21f2d6ecd95b01561644b9126998c9ebf69852565342ad9cef9db0bcef`, `chart.css` `3f0f10c27ab1acde57e96883725526acef6968791b4ed6ddd3cf90f1a8c1d229`, `index.html` `a16b6b3430e4bc1a67ab4d8fbe3e092241d98ae6720b10dbe1eafcf520c2b0fc`. No restart: `app.py` reads the static files per request; the service stays active.
- Records: `project/outputs/r030-custom-matrix/README.md` (visual contract and operating notes), `project/Documents/Environment_Inventory.md` (deployed hashes and recovery folder), `project/scripts/metabase/README.md`, `project/Documents/Development_Changes.md`.

## Checks
| Command | Result |
| --- | --- |
| `python3 -m unittest test_app` in `chart_service/` | Pass, 10 backend tests |
| `node --check chart.js` and `node --check ProposedLoanReports.mjs` | Pass |
| Synthetic preview (`preview.py`) at 1440×900, 1046×912, 390×844 and 362×290 | Renders; pin, refresh and bottom-sheet interactions work |
| Live verification after deploy | Served files match the three hashes; wrong key 401, valid key 200 with 26 rows; dashboard 3 links go to dashboard 3 tab 105 (`bd_borrower`), dashboard 32 links to dashboard 32 tab 382 (`borrower`, `period`); phone-card tap shows the sheet with the correct link; the fragment is cleared from the address bar |
| `ProposedLoanReports.mjs --verify` after the `health` refine | Pass, 27 of 27; `saved.json` shows `#key=<private>&detail=32:382` |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
No database or PROD data change was involved. Real-device phone testing of the pinned tooltip was not done; the owner's next phone use is the check.

## Recovery
Copy the three files back from `/opt/mw-report-charts/recovery-bcg-20261027/` on the VM (sha256 `chart.js` 884481fb…, `chart.css` 5f38cfbf…, `index.html` ae57f5fa…); no restart is needed. Re-run `--refine --only=health` without the detail parameter, or leave it, because the old chart ignores it. Git baseline is the parent of the chart commit.

## Open questions
None. Echo's items 5 and later were not chosen by the owner and stay unapplied.

## Remaining work
The owner's next real use on desktop and phone.
