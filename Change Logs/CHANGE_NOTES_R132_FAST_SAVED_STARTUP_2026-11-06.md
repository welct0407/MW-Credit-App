# Change notes — R132 fast saved-workspace startup, 6 November 2026

## Purpose
Owner report, 6 November 2026: "Why is the app loading slow again when I open it? Is the offline mechanism having issues again?" with an encrypted PROD troubleshooting file, then "blank white screen (header is there) and spinner, several seconds… I designed the app that … show offline copy immediately". Status: Open; PWA Hosting only; owner instruction of 6 November 2026, "Yes, go ahead go and do it, push all the way to prod" (scoped PROD approval for this fix).

## Changes
Diagnosis:
- The decrypted report shows PROD R131 `39fe430` on an iPhone in standalone mode: startup ready, no errors, all five offline domains complete, 285 receipts, preparation 290/291 refreshing (normal), no failed or queued saves, two public caches (current plus the retained previous one, by design).
- PROD Cloud Run logs: no requests from 12:40 to 12:56:01Z, then all 200 with reads of 0.1 to 0.5 s and two background offline-dataset calls of about 2 s. The servers were not slow.
- Root cause: `live-main.tsx` renders an empty main area while `status` is `initializing` or `loading`. Firebase 12.19 `initializeCurrentUser` runs `reloadAndSetCurrentUserOrClear` and `_reloadWithoutSaving` (a `getIdToken` refresh after more than one hour, plus `accounts:lookup`) before `onAuthStateChanged` fires, so the R083 saved-workspace path did not start until two Google round trips finished. The offline mechanism was healthy; R083 removed the version-check wait but not this one.

Design (Archie):
- A provisional session is built from the persisted Firebase identity (localStorage key `firebase:authUser:<apiKey>:[DEFAULT]`; uid and email only, never token fields) plus the owner offline lease (`syncAuthorized`) and a facade user.
- All network reads and writes wait in `awaitStartup` until Firebase confirms. The same uid confirms the session; null, another uid or an error takes the existing sign-out path (purge, keeping pending saves).
- Not used for an in-memory sign-in, with no lease, or after a revoked epoch. The fast path needs a lease verified within its expiry, which `apps/pwa/src/owner-offline.ts` sets to 24 hours (`expiry=24*60*60*1000`; the 7-day retention is separate).
- Startup UX (Echo STARTUP-UX-1..7): the header shows "Connecting…" while confirming; with no saved copy a "Connecting…" card appears after about 300 ms; no flash on sign-out.
- Files: pending, from Byte's diff (`apps/pwa/src/` startup and auth files and their tests).
- Deploy plan: PWA Hosting only, DEV then PROD. No SQL, images, Terraform or VM change; no backup needed.

## Checks
| Command | Result |
| --- | --- |
| All checks | Pending (Chase and Byte results to be filled in) |
| `npm run check:docs` (Dewey) | Pending final run |

## Not run
Pending; filled in with the verified results. A skipped check is not a pass.

## Recovery
Git baseline `cf73390` (R131 closure). The previous Hosting version stays available in the [Environment Inventory](../project/Documents/Environment_Inventory.md) (pins recorded at deployment). No SQL, so nothing else to undo; rolling back restores the slow startup after more than an hour away.

## Open questions
None.

## Remaining work
- Pending: DEV deploy and smoke, owner-authorized PROD promotion, closure pull request, tag `R132`, owner acceptance on the phone (open after more than an hour: saved copy at once, "Connecting…" in the header).
