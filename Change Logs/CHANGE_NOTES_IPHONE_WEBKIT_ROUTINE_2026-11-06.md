# Change notes — iPhone WebKit check routine, 6 November 2026

## Purpose
Owner requests of 6 November 2026: make Playwright WebKit with an iPhone profile part of the development routine, on iPhone 16/17/18 Pro Max class phones rather than iPhone 13, then make it development ready (every WebKit failure cleared, app changes only with the owner's say-so) and merge it. Until now every run, including Echo's iPhone views, used Chromium; the `mobile-webkit` project existed but nothing enabled it.

## Changes
- `playwright.config.ts`: `mobile-webkit` uses `devices["iPhone 17 Pro Max"]` (WebKit by default) instead of iPhone 13 Pro Max. Playwright 1.63.0 ships iPhone 16 Pro Max and 17 Pro Max profiles with identical viewport (440×763, screen 440×956, scale 3) and user agent, so one project covers both; it has no iPhone 18 profile yet. Still enabled only with `PLAYWRIGHT_WEBKIT=1`.
- `.github/workflows/ci.yml`: new job `e2e iPhone WebKit (shard wN of 3)`, running every spec on `mobile-webkit` whenever the e2e stage runs. It gates `Development checks result` like the Chromium shards, leaves the checkout clean, and uploads e2e stage evidence; `scripts/ci/stages.json` lists the three WebKit checks in the e2e stage (variants `w1`–`w3`, so their evidence names differ from the Chromium shards'), and `tests/unit/ci-reuse-evidence.test.mjs` covers six shards. WebKit browser cache key `playwright-webkit-…`. The WebKit job maps the generic `sans-serif` (and Helvetica) to the Helvetica-metric Liberation Sans through a user fontconfig file: the app's stack (Inter, Segoe UI, Tahoma, sans-serif) ends in the generic family, which is Helvetica on an iPhone, while the runner's default DejaVu Sans is about 18% wider and clipped the two-line sync status cell (bold 13 px "Notifications": DejaVu 93 px, Liberation 79 px, cell 88 px).
- `tests/e2e/fixtures/test.ts` (new): every spec imports `test`/`expect` from it instead of `@playwright/test` (re-exported unchanged for Chromium). In WebKit only:
  - each test gets a fresh persistent context in an ASCII temporary profile. Playwright's ephemeral WebKit contexts behave like private browsing and abort IndexedDB transactions that store a Blob, which an iPhone Home Screen app does not; WebKit also rejects a profile path with Thai or dash characters.
  - `context.setOffline` is emulated (requests abort as disconnected, `navigator.onLine` false, offline/online events). WebKit's own offline mode makes every Blob and File read fail with `NotReadableError`, which an iPhone in airplane mode does not.
  - full-page screenshots default to CSS pixels: at 3× a long page passes WebKit's 32767-pixel limit.
  - helpers `touchSession` (CDP touch in Chromium, dispatched touch events in WebKit, which has no CDP), `grantClipboard` (WebKit has no `clipboard-write` permission) and `emitSyntheticUser` (waits until the synthetic auth module is imported before signing in; WebKit can import it after the load event).
- Spec adaptations: `payment-command` and `upcoming-read` use `touchSession`; `about-independent` uses `grantClipboard`; the receipt downscale case in `payment-command` reads the upload body from a page-side copy when WebKit does not report Blob request bodies; `w5-ux-independent` stands in a `Notification` object, which iPhone WebKit exposes only to a Home Screen app; six auth-harness specs use `emitSyntheticUser`.
- `chat`, `phase5-final-ui-independent`, `startup-back-independent` and `startup-generations-independent` launch Chromium themselves (the live-dev static fixture relies on Chromium's `--host-resolver-rules`), so they skip in the WebKit project instead of repeating a Chromium run there; the WebKit CI job has no Chromium. Locally they had appeared to pass in WebKit only because Chromium was installed.
- Two Chromium races that the first CI run on this branch exposed: `phase5-final-ui-independent` R102 cases register their preference routes before the first load (the start-up read could return the default account), and `chat.spec.ts` R122 waits until the held translation request reaches the route before releasing it.
- `.claude/agents/echo.md`, `project/Documents/Rules/PWA_Orchestration.md`, `docs/Development.md`: iPhone views are reviewed in WebKit on the iPhone 17 Pro Max profile; CI description.
- No application code changed. Unlike the first local run suggested, none of the 37 initial WebKit failures was an app defect: the iPhone-width receiving layout case passes once the harness issues are handled.

## Checks
| Command | Result |
| --- | --- |
| First full WebKit run, before the fixture (local, WebKit 2359) | 369 passed, 37 failed, 13 skipped |
| Development checks run 42172924829 (first push) | WebKit shards red as expected; Chromium shard 1: R102 race (fails twice) and R122 flaky, both fixed here |
| Full WebKit run after the fixes (local, 3 workers) | 405 passed, 1 failed (receipt downscale upload poll timed out under load; poll raised to 15 s, then 4 of 4 repeats pass), 13 skipped (Chromium-only cases) |
| Development checks run 42179121251 (second push) | WebKit shard w3: the self-launching Chromium specs found no Chromium; now skipped in WebKit |
| Development checks run 42180032898 (third push) | WebKit shard w2: sync status "Notifications not updated" clipped with DejaVu Sans; fixed by the font mapping above. `offline-delta` receipt window case flaky (passed on retry; 12 of 12 local repeats pass) |
| Changed specs in `desktop-chromium` and `mobile-chromium` (about, payment-command, upcoming-read, w5-ux, pending-flash, data-check, persistence, live-signout-blocked, live-expired-session, full-sync, chat R122, phase5 R102) | 90 passed, 2 skipped |
| `node --test tests/unit/ci-reuse-evidence.test.mjs` and the CI/config unit tests | Pass |
| `npm run typecheck`, `npm run lint`, `npm run check:docs` | Pass |

## Not run
The broad run is the pull request's Development checks (Chromium and WebKit shards).

## Recovery
Revert the merge; test harness, CI and documentation only.

## Open questions
None.

## Remaining work
None. Playwright adds an iPhone 18 Pro Max profile in a later release; switch `mobile-webkit` to it then if its screen differs.
