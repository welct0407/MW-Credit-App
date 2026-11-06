# Change notes — iPhone WebKit check routine, 6 November 2026

## Purpose
Owner request of 6 November 2026: make Playwright WebKit with an iPhone profile part of the development routine, on iPhone 16/17/18 Pro Max class phones rather than iPhone 13. Until now every run, including Echo's iPhone views, used Chromium; the `mobile-webkit` project existed but nothing enabled it.

## Changes
- `playwright.config.ts`: `mobile-webkit` uses `devices["iPhone 17 Pro Max"]` (WebKit by default) instead of iPhone 13 Pro Max. Playwright 1.63.0 ships iPhone 16 Pro Max and 17 Pro Max profiles with identical viewport (440×763, screen 440×956, scale 3) and user agent, so one project covers both; it has no iPhone 18 profile yet. Still enabled only with `PLAYWRIGHT_WEBKIT=1`.
- `.github/workflows/ci.yml`: new advisory job `e2e iPhone WebKit (shard N of 3)`, running every spec on `mobile-webkit` whenever the e2e stage runs. It is `continue-on-error` and outside `Development checks result`, so WebKit-only failures are visible but do not block a merge or the e2e evidence reuse. WebKit browser cache key `playwright-webkit-…`.
- `.claude/agents/echo.md`, `project/Documents/Rules/PWA_Orchestration.md`: iPhone views are reviewed in WebKit on the iPhone 17 Pro Max profile, not Chromium at a phone width.

## Checks
| Command | Result |
| --- | --- |
| `PLAYWRIGHT_WEBKIT=1 npx playwright test --project=mobile-webkit` (local, WebKit 2359, 4 workers) | 369 passed, 37 failed, 13 skipped of 419 |
| `node --test` on the six unit tests that read `ci.yml` or the Playwright config | Pass, 170 of 170 |
| `npm run typecheck`, `biome lint playwright.config.ts`, `npm run check:docs` | Pass (docs: 0 failures) |

Known WebKit failures (37), by cause:
- Test harness only (Chromium-only APIs): `newCDPSession` (3, payment-command swipe, upcoming-read), `grantPermissions('clipboard-write')` (2, about), full-page screenshots over 32767 px (3, payment-command).
- IndexedDB writes rejected, "Offline storage unavailable" or a null `page.evaluate` error (about 19: offline-retention, offline-purge, offline-delta, own-receipt-seed, back-consumers, payment-offline, payment-command 138, about 116). Likely Playwright WebKit's ephemeral contexts refusing Blob values in IndexedDB rather than iPhone Safari behavior; needs confirming before any product change.
- `window.emitUser` test hook missing (3, pending-flash, data-check).
- Other assertions to triage (7): pay-forward 95, phase5-borrower 79/94, refresh-hold 137, unified-receiving 100 (iPhone width overflow or sticky summary), w5-ux 81, back-consumers 220/290, payment-command 287.

## Not run
The pull request's Development checks are the broad run, including the first CI WebKit shards.

## Recovery
Revert this commit; test configuration, CI and documentation only.

## Open questions
None.

## Remaining work
Triage the 37 WebKit failures (harness adaptations versus real Safari defects); once the advisory shards are green, decide whether to make them gating.
