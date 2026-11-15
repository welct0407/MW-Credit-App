# Change notes — iPad WebKit check routine and iPad layout fixes, 15 November 2026

## Purpose
Owner request of 15 November 2026: include the iPad experience in CI for the iPad 11th generation and later, the iPad Air 5th generation and later (11 and 13 inches) and the iPad Pro M5 (11 and 13 inches) and later, open a pull request when ready, and engage the team. Until now no check ran on an iPad profile. The owner also approved app fixes in this pull request, for defects the new projects exposed and Echo found. R162 is Open and carries this batch.

## Changes
- `playwright.config.ts`: two WebKit projects, enabled with `PLAYWRIGHT_WEBKIT=1`, with the Mac Safari user agent that iPadOS sends by default, scale 2 and touch: `tablet-webkit-portrait` (screen 820×1180, viewport 820×1106) and `tablet-webkit-landscape` (screen 1180×820, viewport 1180×746). Portrait on every supported iPad (820 to 1032 px wide) is the 768–1050 tablet layout. Landscape on the iPad 11 and the Air 11" (1180 px) is the compact desktop layout (1051–1199 px). The Pro 11" and 13" and the Air 13" in landscape (1200 px and wider) get the desktop layout, covered by `desktop-chromium`. Playwright's built-in iPad profiles do not match these devices, so the projects are explicit.
- `.github/workflows/ci.yml`, `scripts/ci/stages.json`, `tests/unit/ci-reuse-evidence.test.mjs`: the WebKit job matrix is now device × shard: `e2e iPad portrait WebKit (shard pN of 3)` and `e2e iPad landscape WebKit (shard lN of 3)` beside the iPhone `wN` shards. The e2e stage lists 12 checks (variants `w1`–`w3`, `p1`–`p3`, `l1`–`l3`); all gate `Development checks result`.
- `tests/e2e/fixtures/test.ts`: WebKit touch profiles report `maxTouchPoints` 5 (Playwright WebKit reports 0, and the app's chat device choice tells an iPad from a Mac by touch points); shared helpers `deviceClass`, `touchDevice`, `runsOnce`, `layout`, `stacked` and `narrow`. Convention: choose the device by project, the layout by width, and run once-only integration tests on `desktop-chromium` only.
- 24 e2e spec files adapted to the convention (widths instead of project names, run-once cases pinned to `desktop-chromium`; see the diff). No test was weakened to hide an app defect.
- App fixes approved by the owner (`apps/pwa/src/CollectionRecords.tsx`, `apps/pwa/src/live-main.tsx`, `apps/pwa/src/live-style.css` where stated by the diff):
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
| Fix (a), (b): changed specs on the iPad projects and `desktop-chromium` | TODO (Byte) |
| Full iPad WebKit run after the fixes (local) | TODO (Byte) |
| Development checks on the pull request head | TODO (after the push) |
| `npm run typecheck`, `npm run lint`, `node --test tests/unit/ci-reuse-evidence.test.mjs` | TODO (Byte) |
| `npm run check:docs` | Pass (Dewey, working tree of 15 November 2026) |

## Not run
- Real iPad hardware: the on-screen keyboard and the Home Screen standalone mode need a physical iPad. Playwright WebKit has no native touch-scroll physics.
- Echo has not reviewed Thai text at iPad widths, the chat workspace, Referrers or Expenses.
- The broad run is the pull request's Development checks (Chromium, iPhone and iPad WebKit shards).

## Recovery
Revert the merge; tests, CI, documentation and PWA layout and scroll code only, no data or deployed service change. Hosting rolls back through the usual previous version in the [environment inventory](../project/Documents/Environment_Inventory.md) if the PWA ships and a fix misbehaves.

## Open questions
None.

## Remaining work
- Open item: `refresh-hold-independent` line 137 is a pre-existing WebKit fake-clock flake (1 of 3 iPad portrait, 1 of 5 iPhone shards); it is not iPad specific. Investigate or tolerate it before it blocks a merge.
- Physical iPad acceptance (keyboard, Home Screen) and Echo's unreviewed areas above, at the owner's request.
- iPad Pro M5 13" and the Air 13" in landscape are 1200 px and wider; revisit the projects if Apple changes the logical widths.
