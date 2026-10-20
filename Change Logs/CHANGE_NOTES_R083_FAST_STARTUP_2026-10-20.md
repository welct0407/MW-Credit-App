# Change notes — fast dashboard startup (R083), 20 October 2026

## Purpose
The owner reported that the landing dashboard sometimes takes several seconds to appear. The PWA startup build check in `apps/pwa/src/usePwa.ts` blocked the UI on two sequential network round trips (`/build-version.json`, then `registration.update()` re-fetching sw.js) plus a worker version message. Owner-approved fix, option B, 20 October 2026. Status: Frozen 2026-10-20T18:20Z at main `a4fc75d` (PR #104); deployed and tested on DEV.

## Changes
- `apps/pwa/src/usePwa.ts`: skip `registration.update()` when the page entry is current, no worker is waiting or installing, and the active worker reports the latest version.
- `apps/pwa/src/live-main.tsx`: a signed-in device with an authorized offline bundle shows the workspace (landing dashboard) from device-cached data while the check runs. One central startup gate makes network reads and writes wait for the check (no failure recorded) and proceed when it passes. No "Checking app" indicator while the workspace shows.
- Newer build found: today's upgrade and reload; the workspace stays rendered with "Updating app" until reload. If a form blocks the reload, the existing "A new version is ready" banner applies and writes proceed on the current build (Archie's decision, same as the existing runtime update path).
- Check fails after the workspace was shown: the workspace stays, with an inline banner and Retry. English "Couldn't check the app version. Changes are paused."; Thai "ตรวจสอบเวอร์ชันแอปไม่สำเร็จ หยุดการบันทึกไว้ก่อน".
- First launch without cache, signed-out and offline startup are unchanged. No API, SQL, infrastructure or dictionary-model change.
- UX codes STARTUP-01 to STARTUP-10 (Echo; STARTUP-10 skipped). Tests in `tests/e2e/startup-generations-independent.spec.ts` (Chase).
- Documents: `project/Documents/Data Dictionary/systems/pwa/application.yaml` (`app_updates.startup_gate`), `docs/Development_PWA_Delivery.md` (startup paragraph), `project/Documents/Development_Changes.md` (R083 row), `project/Documents/Release_Tracker.md` (R083 sentence; the Open row is unchanged).

## Checks
| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass (Byte; uncommitted tree on top of 930d5b6) |
| Unit tests: production-build-environment and sw-cache-retention | 19/19 pass (Byte; same tree) |
| Unit tests: read-cache-http-failure, business-hosting-delivery, about-details, receipt-recognition-timing | 94/94 pass (Byte; same tree) |
| Biome lint | No errors (Byte; same tree); live-main existing-kind dependency warnings went from 54 to 55 |
| `phase5-final-ui-independent`, desktop-chromium | 33/33 pass (Byte; same tree) |
| `startup-generations-independent`, desktop-chromium | 2/2 pass after the final fix (Byte); run 3 times, green each time (Chase) |
| `startup-generations-independent`, mobile-chromium | 1 passed, 1 skipped; the R083 test is desktop-only by design (Chase) |
| Warm-reload sw.js fetches | 0 extra on the new code against 1 on the old code (Chase) |
| Chase diff review | No defects |
| Echo UX check, local fixture build, 390 px and 1280 px, Chromium only | Warm launch passes with no layout jump; EN and TH banner render correctly; first launch unchanged. STARTUP-09 (duplicate "Showing saved data" line and red badge) was fixed by Byte in `read-cache.ts` (a gate-rejected read records no failure) with a new assertion shown to catch it |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, closeout) |
| Pull request #104 CI (head `e390b78`) | Pass: `Development checks` run 39470902145 (check, lint, 3 e2e shards, GitGuardian) |
| DEV Hosting deploy (Dewey, owner-authorized DEV only) | Clean tree at `e390b78`; `npm run build:live-dev` labelled `R083` (public client config written from Secret Manager `mw-credit-app-dev-firebase-web` into the gitignored `.env.live-dev` and deleted after the build); `node scripts/deploy-hosting.mjs --live-dev --check` pass. Target verified: project `clever-oasis-508610-n7`, site `mw-credit-app-dev-737787224638`, previous release `1792512054377000` (version `e637e034f772009c`) matching the inventory. Applied: version `0461ff407bb04030`, release `1792519858547000`; marker version `1fc484e8c0d4bf4d9210e7e2`, entry `/assets/index-BKLGsmXL.js` |
| DEV smoke | `https://dev-lm.mw-credit.com/build-version.json` 200, `no-store`, matches entry, version and `R083`; `/sw.js` 200 `no-store` and contains the version; entry bundle 200 immutable, carries `e390b78` and "Couldn't check the app version"; `/` 200 `no-store` references the entry. Read-only; no writes, notifications or secret output |

Accepted departures from Archie's design: "upgrading" parks reads and writes instead of rejecting them; a `request()` rejected by the gate with no saved data keeps the workspace; the borrower list is not reloaded after the check passes; offline preparation does not start during checking, upgrading or error; the workspace-shown flag resets when the workspace disappears; only Sync now shows "Checking the app version..."; STARTUP-10 skipped.

## Not run
A skipped check is not a pass.
- No iPhone WebKit or Home Screen check.
- No live upgrade-path check.
- No headless Chromium page load of DEV: the cloud session proxy certificate is not trusted by Chromium (`ERR_CERT_AUTHORITY_INVALID`), and TLS verification was not disabled.
- The full e2e suite is left to the pull request's `Development checks`.
- The first warm reload right after sign-in showed an empty Dashboard in the fixture, most likely because the fixture has no offline bundle; glance at it on DEV.
- A stale-build launch may show "Updating app..." rather than the workspace, depending on timing (accepted; same as today).

## Recovery
Revert the R083 commit on main (branch `claude/r083-fast-startup`). No database, API or infrastructure change. DEV rollback: redeploy the R081 build, Hosting version `e637e034f772009c` (release `1792512054377000`).

## Open questions
None.

## Remaining work
- Owner DEV and real-iPhone smoke (DEV is deployed; the signed-in warm-launch check is the owner's).
- Promotion only on owner instruction.

## Promotion record
- Authority: owner instruction of 20 October 2026, after testing on DEV: "Tested and it's good. Go for prod promotion". It covers the PWA-only Hosting deploy; no SQL, backup or infrastructure is in scope.
- Freeze: R083 frozen 2026-10-20T18:20Z; R084 opened in the same tracker update; counter R085.
- DEV result: Hosting version `0461ff407bb04030` from PR #104 head `e390b78` passed the read-only smoke above, and the owner tested it ("Tested and it's good").
- Package: main `a4fc75d` (PR #104 merge; run 39470902145), PWA-only Hosting with the marker release `R083`. Pins go to the [environment inventory](../project/Documents/Environment_Inventory.md).
- Excluded: API, SQL, infrastructure, the integration agent, financial corrections, forced notifications and anything merged after `a4fc75d`.
