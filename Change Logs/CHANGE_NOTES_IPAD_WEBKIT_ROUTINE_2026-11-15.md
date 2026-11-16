# Change notes — iPad WebKit check routine and iPad layout fixes, 15 November 2026

## Purpose
Owner request of 15 November 2026: include the iPad experience in CI for the iPad 11th generation and later, the iPad Air 5th generation and later (11 and 13 inches) and the iPad Pro M5 (11 and 13 inches) and later, open a pull request when ready, and engage the team. Until now no check ran on an iPad profile. The owner also approved app fixes in this pull request, for defects the new projects exposed and Echo found. R162 is Open and carries this batch.

## Changes
- `playwright.config.ts`: two WebKit projects, enabled with `PLAYWRIGHT_WEBKIT=1`, with the Mac Safari user agent that iPadOS sends by default, scale 2 and touch: `tablet-webkit-portrait` (screen 820×1180, viewport 820×1106) and `tablet-webkit-landscape` (screen 1180×820, viewport 1180×746). Portrait on every supported iPad (820 to 1032 px wide) is the 768–1050 tablet layout. Landscape on the iPad 11 and the Air 11" (1180 px) is the compact desktop layout (1051–1199 px). The Pro 11" and 13" and the Air 13" in landscape (1200 px and wider) get the desktop layout, covered by `desktop-chromium`. Playwright's built-in iPad profiles do not match these devices, so the projects are explicit.
- `.github/workflows/ci.yml`, `scripts/ci/stages.json`, `tests/unit/ci-reuse-evidence.test.mjs`: the WebKit job matrix is now device × shard: `e2e iPad portrait WebKit (shard pN of 3)` and `e2e iPad landscape WebKit (shard lN of 3)` beside the iPhone `wN` shards. The e2e stage lists 12 checks (variants `w1`–`w3`, `p1`–`p3`, `l1`–`l3`); all gate `Development checks result`.
- `tests/e2e/fixtures/test.ts`: WebKit touch profiles report `maxTouchPoints` 5 (Playwright WebKit reports 0, and the app's chat device choice tells an iPad from a Mac by touch points); shared helpers `deviceClass`, `touchDevice`, `runsOnce`, `layout`, `stacked` and `narrow`. Convention: choose the device by project, the layout by width, and run once-only integration tests on `desktop-chromium` only.
- 24 e2e spec files adapted to the convention (widths instead of project names, run-once cases pinned to `desktop-chromium`; see the diff). No test was weakened to hide an app defect.
- App fixes approved by the owner (`apps/pwa/src/live-main.tsx`, `apps/pwa/src/ManagementCash.tsx`, `apps/pwa/src/CollectionRecords.tsx`, `apps/pwa/src/live-style.css`, `apps/pwa/src/BorrowerRecord.tsx`):
  - Scroll: the window-versus-panel split moves from 1050 to 1200 px (the point from which the list and detail panels scroll themselves) in `resetScroll`, loans paging, and `CollectionRecords` (the reset effect, the detail scroll restore and save, and the charge-tile click save). At 1051–1199 px a reset scrolls the page to the top, so both panels start at the page top; at 1050 px and below nothing changes (`scrollIntoView`). A sticky-header scroll margin at 1051–1199 px keeps the Related loans and Upcoming sections below the header. In landscape at 1051–1199 px lists did not return to the top after a page change and the related-loans heading stayed off-screen. Unchanged on purpose: the drawer, bottom-nav and menu thresholds, the chat Enter-key and two-pane checks, and `CashWorkspace`; `ManagementCash.tsx` is handled separately (Cash Position below).
  - "Review saved changes" calls `collapseTabletNavigation`, as the workspace buttons do, so the expanded sidebar at 768–1199 px no longer overlays the page it opens.
  - IPAD-COLL-01: the Collection tile row is sized `minmax(min-content, auto)`; WebKit did not regrow long-name tiles when the pane narrowed (same result in Chromium).
  - IPAD-BORR-01: the 480 px rule that puts the borrower record actions on their own row extends to 768–1050 px, so the name is no longer squeezed beside four actions in portrait.
  - IPAD-NAV-01: at 1051–1199 px a tap or click outside the expanded sidebar collapses it (dialogs are ignored, the tap is not swallowed, no backdrop); 1200 px and wider is unchanged.
  - IPAD-NAV-02: a white field behind the sticky collapse button at 1051–1199 px.
  - IPAD-BORR-02: the payer-names empty-state hint sits on its own line at all widths.
  - New assertions in `collection-chat-summary`, `phase5-borrower-independent`, `borrower-chat-button` and `live-signout-blocked-independent`.
  - IPAD-NAV-05: at 1051–1199 px the sidebar's scroll position resets to the top when it collapses (before, the rail stayed 134 px down). New landscape test in `live-signout-blocked-independent`, which failed without the fix.
  - Saved changes header (owner-approved, all devices): the header shows "Saved changes" / "รายการที่บันทึก", the existing page heading copy, no new strings. Header checks in both `live-signout-blocked` tests on all five projects.
  - Cash Position (owner: check, fix if needed): the jump to the accounts heading is needed at 820 px portrait (long holder lists) and stays; it was missing in landscape 1051–1199 px, so `ManagementCash.tsx` now uses `max-width: 1199px`, with a landscape assertion.
  - New compact-width page-scroll return test in `list-return-independent` (gap found by Chase).
  - Comments in `.github/workflows/ci.yml` and `playwright.config.ts` say that 820×1180 and 1180×820 are screen sizes and the viewports are 74 px shorter.
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
| Byte, final round at `cfe3c9c`: `live-signout-blocked` 21 passed and 4 skipped, `list-return` 174 and 16 skipped, `about` 25, `w5-ux` 21 and 4 skipped, `full-sync` 5, `offline-retention` 30, `payment-phase4` 20, `saved-change-discard` 90, `data-check` 10, `pending-flash` 10, `back-consumers` 259 passed and 1 failed, `phase5-borrower` 349 passed, 2 failed and 4 skipped | The 3 failures (`back-consumers` offline loan draft on `mobile-webkit`; `phase5-borrower` R120 Thai alert and F12 draft-count poll on iPad portrait) each passed 3 of 3 when repeated alone and touch no changed code: load flakes, see Remaining work |
| Chase's independent review | No blocking findings; desktop 1200 px and wider and phones 767 px and narrower unchanged; no test weakened; 560 tests per project (557 before); CI wiring matches `stages.json`; `ci-reuse-evidence` unit test 10 of 10; `foundation`, `dataset-replay`, `persistence`, `unified-receiving` (and independent), `error-recovery`, `live-search-timer`, `w5-ux` on all five projects: 247 passed, 15 skipped, 0 failed. Not verified: negative runs of COLL-01, NAV-01 and NAV-02 |
| Echo's re-check | IPAD-COLL-01, BORR-01, BORR-02, NAV-01, NAV-02, the scroll return and Review saved changes fixed at 820, 1180 and 1376 px; desktop 1440 and iPhone unchanged; found IPAD-NAV-05, now fixed |
| Development checks on the pull request head | TODO |
| `npm run check:docs` | Pass (Dewey, working tree of 15 November 2026) |

## Not run
- Negative runs (test fails without the fix) for IPAD-COLL-01, NAV-01 and NAV-02 were not made; NAV-05 has one.
- Real iPad hardware: the on-screen keyboard and the Home Screen standalone mode need a physical iPad. Playwright WebKit has no native touch-scroll physics.
- Echo has not reviewed Thai text at iPad widths, the chat workspace, Referrers or Expenses.
- The broad run is the pull request's Development checks (Chromium, iPhone and iPad WebKit shards).

## Recovery
Revert the merge; tests, CI, documentation and PWA layout and scroll code only, no data or deployed service change. Hosting rolls back through the usual previous version in the [environment inventory](../project/Documents/Environment_Inventory.md) if the PWA ships and a fix misbehaves.

## PROD promotion record (Forge, 16 November 2026 UTC)
Authority: the owner, 16 November 2026, after PR #335 merged: "Push to prod then close the release" (R162; Hosting only; no SQL, image, agent, notification or job change). Freeze 00:26:59Z, package `9cf191f2` (merge of PR #335), baseline R161 `07b1d48a`. `component-versions.mjs derive` at `9cf191f2`: only the PWA changed (R162); read, command and chat stay R161, notify and jobs R159, schema R154 at V149, agent R153. The other non-PWA files since R161 are CI (`.github/workflows/ci.yml`, `scripts/ci/stages.json`, `playwright.config.ts`), an agent definition and records; no runtime input. Both bundles were built from a clean export (git archive) of `9cf191f2` with its own `npm ci`.

| Step | Result |
| --- | --- |
| Baseline | Project `clever-oasis-508610-n7`, region `asia-southeast1`. PROD Hosting `d8c87e560fe08d2e` (release `1794730883591000`, R161); read `00064-xnt`, command `00069-gnv`, chat `00048-zqm` (R161 image `a68fdedc…`), notify `00031-mzf`, jobs `00031-dmq` (R159 image `56f17745…`). DEV Hosting `afa8ec1e5495e1a6` (release `1794725834818000`, R161). Flyway read-only as `codex-cloud-read` through the IAP tunnel, 00:29:05Z: `loan_manager_prod` V149, 149 rows, none failed |
| DEV | `build:live-dev` with `MW_RELEASE_NUMBER=R162`; the env file was written from `mw-credit-app-dev-firebase-web` and the settings of the live DEV bundle (read, command and chat DEV origins, `dev-owner-testing`, notifications on; the DEV web app) and deleted after the build. `deploy-hosting.mjs --live-dev --check` (17 files) then apply 00:27:50Z to 00:28:00Z: version `a2e4ba6ee02291ae`, release `1794788879980000`, build R162 `7768964b94a127f0baaf7082`. Smoke: three origins R162, index and entry 200, `sw.js` no-store, the stylesheet carries `minmax(min-content`, unauthenticated 401 |
| Hosting | The generic runner, frontend-only, from `buildProductionBusinessCandidate` (R158's pinned public config, unchanged; PROD origins and web app only). Receipts: `Development checks` run 43747953271 on `300ae4e3` (check, lint, terraform, 3 Chromium, 3 iPhone, 3 iPad portrait and 3 iPad landscape WebKit e2e); the merge `9cf191f2` has the same tree as `300ae4e3` (its first parent is `ad9841a`, the merge base; main had no other change). `Database migrations` run 43734374979 on `f12c6c3a` (guards and all four rebuild groups; no rebuild-stage input changed since; the push run on `9cf191f2` skipped rebuild). SQL readback: 00:29:05Z above. `--check` passed (18 files, services on their R161 and R159 pins); `--apply` 00:31:06Z to 00:31:42Z: version `81660e7a5fec843c`, release `1794789095371000`, build R162 `b714f94b2610b5fb8f6807ac` |
| Smoke | Three origins R162 (`lm.mw-credit.com`, `web.app`, `firebaseapp.com`), index and entry 200, `sw.js` no-store, the stylesheet carries `minmax(min-content`; unauthenticated 401; read, command and chat `/health` R161 `07b1d48a` (unchanged); Cloud Run revisions unchanged after the apply; no ERROR logs on any PROD service after 00:25Z (checked 00:31:58Z). No notification, payment or job was run |
| Tag | `R162` on `9cf191f2` (Release tag run [43780955688](https://github.com/welct0407/MW-Credit-App/actions/runs/43780955688), 00:32:15Z to 00:32:43Z; tag object `3a8b94b2…` peels to `9cf191f2`). The GitHub Release body shows the derive table twice (once in the notes, once appended by the workflow) |
| Closure | Components: PWA R162; read, command and chat R161; notify and jobs R159; schema R154 at V149; agent R153. `render --write` updated the inventory block to R162 (`render --check` ok). Drift 00:33:50Z (`--env all`; notify `/health` read with an identity token in DEV and PROD, jobs by the shared digest, Flyway 149 read live in DEV and PROD at 00:33Z): 0 drift, 3 unverified (agent, Grafana, Metabase). No dictionary capture |

Rollback: PROD Hosting `d8c87e560fe08d2e` (R161); DEV Hosting `afa8ec1e5495e1a6` (R161). No database or service step.

Limitations: the owner accepts the iPad layout on a real iPad (portrait and landscape, keyboard and Home Screen).

## Open questions
None.

## Remaining work
- Open item: `refresh-hold-independent` line 137 is a pre-existing WebKit fake-clock flake (1 of 3 iPad portrait, 1 of 5 iPhone shards); it is not iPad specific. Investigate or tolerate it before it blocks a merge.
- Open item: three load flakes seen once each and clean 3 of 3 alone: `back-consumers` offline loan draft (`mobile-webkit`), `phase5-borrower` R120 Thai alert and F12 draft-count poll (iPad portrait). Watch them with `refresh-hold-independent`.
- Physical iPad acceptance (keyboard, Home Screen) and Echo's unreviewed areas above, at the owner's request.
- iPad Pro M5 13" and the Air 13" in landscape are 1200 px and wider; revisit the projects if Apple changes the logical widths.
