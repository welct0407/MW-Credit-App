# Change notes — R132 fast saved-workspace startup, 6 November 2026

## Purpose
Owner report, 6 November 2026: "Why is the app loading slow again when I open it? Is the offline mechanism having issues again?" with an encrypted PROD troubleshooting file, then "blank white screen (header is there) and spinner, several seconds… I designed the app that … show offline copy immediately". Status: Open; PWA Hosting only; owner instruction of 6 November 2026, "Yes, go ahead go and do it, push all the way to prod" (scoped PROD approval for this fix).

## Changes
Diagnosis:
- The decrypted report shows PROD R131 `39fe430` on an iPhone in standalone mode: startup ready, no errors, all five offline domains complete, 285 receipts, preparation 290/291 refreshing (normal), no failed or queued saves, two public caches (current plus the retained previous one, by design).
- PROD Cloud Run logs: no requests from 12:40 to 12:56:01Z, then all 200 with reads of 0.1 to 0.5 s and two background offline-dataset calls of about 2 s. The servers were not slow.
- Root cause: `live-main.tsx` renders an empty main area while `status` is `initializing` or `loading`. Firebase 12.19 `initializeCurrentUser` runs `reloadAndSetCurrentUserOrClear` and `_reloadWithoutSaving` (a `getIdToken` refresh after more than one hour, plus `accounts:lookup`) before `onAuthStateChanged` fires, so the R083 saved-workspace path did not start until two Google round trips finished. The offline mechanism was healthy; R083 removed the version-check wait but not this one.

Design (Archie):
- A provisional session is built from the persisted Firebase identity (localStorage key `firebase:authUser:<apiKey>:[DEFAULT]`; uid and email only, never token fields) and a facade user (`provisionalUser`, narrow `SessionUser` type: uid, email, `getIdToken`) in the new `apps/pwa/src/provisional-session.ts` (`persistedSessionIdentity`, `provisionalUser`).
- The fast path needs local persistence, an owner offline lease (`syncAuthorized`) verified within 24 hours (`apps/pwa/src/owner-offline.ts`, `expiry=24*60*60*1000`; the 7-day retention is separate) and a valid epoch. With no lease the facade is still created, but only the workspace waits and shows "Connecting…" until confirm. It is not used for an in-memory sign-in or after a revoked epoch.
- All network reads and writes wait in `awaitStartup` until Firebase confirms. The same uid confirms the session; null, another uid or an error takes the existing sign-out path (purge, keeping pending saves). Sign-out and the auth error callback reject the provisional session.
- Byte's deviations from the design: a re-render counter on confirm (user, status and `authRevision` unchanged, so no remount or second load); offline preparation and saved-request sync start only after confirm; the "Connecting…" card shows only while unconfirmed (initializing, or loading before confirm), so a confirmed first load keeps the header spinner only and `persistence.spec.ts` is unchanged; the UX-6 hint is skipped because writes wait at the gate; tests hold the account lookup until released instead of a fixed 6 s.
- Startup UX (Echo STARTUP-UX-1..7): the header shows "Connecting…" while confirming; with no saved copy a "Connecting…" card appears after about 300 ms; no flash on sign-out.
- Files: `apps/pwa/src/provisional-session.ts` (new), `apps/pwa/src/live-main.tsx`, `apps/pwa/src/owner-offline.ts` (comment only), `tests/unit/provisional-session.test.mjs`, `tests/e2e/startup-session-independent.spec.ts`. Code commit `4fefb6b` on `claude/startup-saved-session`.
- Deploy plan: PWA Hosting only, DEV then PROD. No SQL, images, Terraform or VM change; no backup needed.

## Checks
| Command | Result |
| --- | --- |
| biome on the 4 changed files (Byte, tree identical to `4fefb6b`) | Clean |
| `npm run typecheck` | Exit 0 |
| `npm test` | 1214 tests, 1213 pass, 1 skipped |
| New unit `tests/unit/provisional-session.test.mjs` | 4 of 4 pass |
| Playwright (desktop and mobile Chromium): new spec, `startup-generations-independent`, `startup-back-independent`, `live-expired-session-keeps-pending`, `offline-purge-keeps-pending-independent`, `persistence.spec` | 32 passed, 2 skipped; the four new browser tests fail on the old `live-main.tsx` |
| Chase adversarial review on `4fefb6b` | No must-fix; scratch variants (e) account lookup aborted after hold: "Connecting…", then exactly one `/api/dashboard` read, no sign-in; (f) sign-out while provisional: no reads, lease cleared, Firebase key removed; 2 of 2 pass |
| Echo UX pass | P1 to P4, no must-fix |
| PR `Development checks` run | Pending |
| `npm run check:docs` (Dewey) | Pending final run |

## Not run
The wide Playwright suite locally (the pull request CI is the broad run); the new spec on mobile-webkit (Chromium launch harness; the PR's WebKit shards skip it); real iPhone timing (the owner's check after deploy). A skipped check is not a pass.

## Recovery
Git baseline `cf73390` (R131 closure). The previous Hosting version stays available in the [Environment Inventory](../project/Documents/Environment_Inventory.md) (pins recorded at deployment). No SQL, so nothing else to undo; rolling back restores the slow startup after more than an hour away.

## Open questions
None.

## Remaining work
- Pending: PR and CI, DEV deploy and smoke, owner-authorized PROD promotion, closure pull request, tag `R132`, owner acceptance on the phone (open after more than an hour: saved copy at once, "Connecting…" in the header).
- Echo later items: STARTUP-UX-L1 (account switch or post-login first load still blank with the header spinner), L2 (expired wording), L3 (Save waits silently while confirming; a hint), L4 (offline-at-launch WebKit check).
- Chase item 3: forms start a 15 s timeout before awaiting the token, so a confirm slower than 15 s shows "unavailable"; it fails safe and is the same as during the version check.
