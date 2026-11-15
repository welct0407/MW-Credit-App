# Change notes — iPad WebKit check routine and iPad layout fixes, 15 November 2026

## Purpose
Owner request of 15 November 2026: include the iPad experience in CI for the iPad 11th generation and later, the iPad Air 5th generation and later (11 and 13 inches) and the iPad Pro M5 (11 and 13 inches) and later, open a pull request when ready, and engage the team. Until now no check ran on an iPad profile. The owner also approved app fixes in this pull request, for defects the new projects exposed and Echo found. R162 is Open and carries this batch.

## Changes
- `playwright.config.ts`: two WebKit projects, enabled with `PLAYWRIGHT_WEBKIT=1`, with the Mac Safari user agent that iPadOS sends by default, scale 2 and touch: `tablet-webkit-portrait` (screen 820×1180, viewport 820×1106) and `tablet-webkit-landscape` (screen 1180×820, viewport 1180×746). Portrait on every supported iPad (820 to 1032 px wide) is the 768–1050 tablet layout. Landscape on the iPad 11 and the Air 11" (1180 px) is the compact desktop layout (1051–1199 px). The Pro 11" and 13" and the Air 13" in landscape (1200 px and wider) get the desktop layout, covered by `desktop-chromium`. Playwright's built-in iPad profiles do not match these devices, so the projects are explicit.
- `.github/workflows/ci.yml`, `scripts/ci/stages.json`, `tests/unit/ci-reuse-evidence.test.mjs`: the WebKit job matrix is now device × shard: `e2e iPad portrait WebKit (shard pN of 3)` and `e2e iPad landscape WebKit (shard lN of 3)` beside the iPhone `wN` shards. The e2e stage lists 12 checks (variants `w1`–`w3`, `p1`–`p3`, `l1`–`l3`); all gate `Development checks result`.
- `tests/e2e/fixtures/test.ts`: WebKit touch profiles report `maxTouchPoints` 5 (Playwright WebKit reports 0, and the app's chat device choice tells an iPad from a Mac by touch points); shared helpers `deviceClass`, `touchDevice`, `runsOnce`, `layout`, `stacked` and `narrow`. Convention: choose the device by project, the layout by width, and run once-only integration tests on `desktop-chromium` only.
- 24 e2e spec files adapted to the convention (widths instead of project names, run-once cases pinned to `desktop-chromium`; see the diff). No test was weakened to hide an app defect.
- App fixes approved by the owner (`apps/pwa/src/live-main.tsx`, `apps/pwa/src/CollectionRecords.tsx`, `apps/pwa/src/live-style.css`, `apps/pwa/src/BorrowerRecord.tsx`):
  - Scroll: the window-versus-panel split moves from 1050 to 1200 px (the point from which the list and detail panels scroll themselves) in `resetScroll`, loans paging, and `CollectionRecords` (the reset effect, the detail scroll restore and save, and the charge-tile click save). At 1051–1199 px a reset scrolls the page to the top, so both panels start at the page top; at 1050 px and below nothing changes (`scrollIntoView`). A sticky-header scroll margin at 1051–1199 px keeps the Related loans and Upcoming sections below the header. In landscape at 1051–1199 px lists did not return to the top after a page change and the related-loans heading stayed off-screen. Unchanged on purpose: the drawer, bottom-nav and menu thresholds, the chat Enter-key and two-pane checks, `CashWorkspace`, and `ManagementCash.tsx:6` (see Open questions).
  - "Review saved changes" calls `collapseTabletNavigation`, as the workspace buttons do, so the expanded sidebar at 768–1199 px no longer overlays the page it opens.
  - IPAD-COLL-01: the Collection tile row is sized `minmax(min-content, auto)`; WebKit did not regrow long-name tiles when the pane narrowed (same result in Chromium).
  - IPAD-BORR-01: the 480 px rule that puts the borrower record actions on their own row extends to 768–1050 px, so the name is no longer squeezed beside four actions in portrait.
  - IPAD-NAV-01: at 1051–1199 px a tap or click outside the expanded sidebar collapses it (dialogs are ignored, the tap is not swallowed, no backdrop); 1200 px and wider is unchanged.
  - IPAD-NAV-02: a white field behind the sticky collapse button at 1051–1199 px.
  - IPAD-BORR-02: the payer-names empty-state hint sits on its own line at all widths.
  - New assertions in `collection-chat-summary`, `phase5-borrower-independent`, `borrower-chat-button` and `live-signout-blocked-independent`.
  - (a) The scroll code uses the 1200 px layout point where the list and detail panels scroll themselves (`live-style.css`), instead of 1050. In landscape at 1051–1199 px lists did not return to the top after a page change and the related-loans heading stayed off-screen.
  - (b) "Review saved changes" collapses the expanded sidebar at 768–1199 px, as the workspace buttons do.
  - Echo findings IPAD-COLL-01 (long-name Collection tiles overlap in WebKit landscape after the list narrows), IPAD-BORR-01 (borrower record name squeezed beside four actions in portrait), IPAD-NAV-01 (the expanded overlay sidebar closes on an outside tap at 1051–1199 px), IPAD-NAV-02 (solid background on the sticky collapse button) and IPAD-BORR-02 (the payer-names empty-state text sat on its own line, all widths).
- `.claude/agents/echo.md`, `project/Documents/Rules/PWA_Orchestration.md`, `docs/Development.md`: iPad views are reviewed in WebKit on the two projects; the supported iPads and the CI shards; the iPad Pro landscape is the desktop layout. `project/Documents/Release_Tracker.md` and `project/Documents/Development_Changes.md`: R162 scope.
- No SQL, service, image, Terraform or infrastructure change; PWA, test and CI only.

## Checks
| Command | Result |
| --- | --- |
| Development checks run 43734380959 on `f12c6c3` (dispatched) | `check`, lint, Terraform, Chromium e2e shards and the three iPhone WebKit shards passed; the iPad shards failed with 37 test failures: harness assumptions, run-once tests and the four app defects above. All were addressed in the later commits and Byte's changes |
| Echo's iPad review (WebKit portrait and landscape) | Findings IPAD-COLL-01, IPAD-BORR-01, IPAD-NAV-01, IPAD-NAV-02, IPAD-BORR-02, fixed here |
| Local Playwright, final code at `286bf3e` (Byte): `borrower-search` 15, `grouped-read` 5, `collection-read` 15, `collection-loading-shift` 10, `upcoming-read` 15, `list-return` 173 passed and 17 skipped, `collection-chat-summary`, `borrower-chat-button`, `phase5-borrower-independent` | Pass (also on `mobile-webkit`) |
| Local Playwright, final code at `286bf3e` (Byte): `live-signout-blocked-independent`, `pending-flash-independent`, `data-check`, `full-sync`, `collection-chat-seen-sync` | Pass on `desktop-chromium`, `mobile-chromium` and both iPad projects |
| `npm run typecheck` (Byte, `286bf3e`) | Pass |
| `npm run lint` (Byte, `286bf3e`) | Baseline: 1 warning and 1 info, both in files this batch does not touch |
| Chase's review | TODO |
| Echo's re-check of the fixed findings | TODO |
| Development checks on the pull request head | TODO |
| `npm run check:docs` | Pass (Dewey, working tree of 15 November 2026) |

## Not run
- Real iPad hardware: the on-screen keyboard and the Home Screen standalone mode need a physical iPad. Playwright WebKit has no native touch-scroll physics.
- Echo has not reviewed Thai text at iPad widths, the chat workspace, Referrers or Expenses.
- The broad run is the pull request's Development checks (Chromium, iPhone and iPad WebKit shards).

## Recovery
Revert the merge; tests, CI, documentation and PWA layout and scroll code only, no data or deployed service change. Hosting rolls back through the usual previous version in the [environment inventory](../project/Documents/Environment_Inventory.md) if the PWA ships and a fix misbehaves.

## Open questions
- `ManagementCash.tsx:6` still uses the 1050 px split. The cash accounts page is two columns from 768 px, so on iPad portrait it may scroll the page needlessly. Left unchanged on purpose; the owner decides whether to align it with 1200 px.

## Remaining work
- Open item: `refresh-hold-independent` line 137 is a pre-existing WebKit fake-clock flake (1 of 3 iPad portrait, 1 of 5 iPhone shards); it is not iPad specific. Investigate or tolerate it before it blocks a merge.
- Physical iPad acceptance (keyboard, Home Screen) and Echo's unreviewed areas above, at the owner's request.
- iPad Pro M5 13" and the Air 13" in landscape are 1200 px and wider; revisit the projects if Apple changes the logical widths.
