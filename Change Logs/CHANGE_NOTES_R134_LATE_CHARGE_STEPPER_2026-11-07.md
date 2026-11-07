# Change notes — R134 late charge stepper shows the saved amount, 7 November 2026

## Purpose
Fix the late charge −50 / +50 control so that repeated presses on the same charge always show the amount and total charge that were actually saved.

Owner scope, 7 November 2026: "When I add late charge continuously several times on the same charge, there's a chance the latest late charge and total charge is not reflected in the app but already updated; I clicked add late 50, nothing happened, and clicking again resulted in adding 100. Engage the team to check it and fix the issue, test in dev, and let me review."

Status: Open. Authority: fix, deploy to DEV, test in DEV, then owner review. No production approval has been given.

Team: Archie (root cause), Byte (fix), Chase, Dewey, Echo. Forge for the DEV deploy.

## Changes
- Root cause (Archie): offline-sync resolves `queued` after a dispatched POST whose answer was lost (15 s abort, pagehide or offline, dropped response) although the server applied it. The stepper held the charge, toasted "Saved on this device", and on the later synced outcome only cleared held and pending without refreshing the screen. The next tap live-read the server's 50 and applied 100.
- Fix (Byte, `dabbec6`, `691962d`), `apps/pwa/src/LateChargeStepper.tsx` only; no API or SQL change:
  - Stale-base guard: nothing is sent, "Not changed: late charge is already ฿X", and the screen refreshes.
  - Lost-answer re-check under the same request id ("Checking late charge…").
  - A held step that is released refreshes the screen and toasts the server's read-back; " · Checking…" shows while online; the re-read has its own timeout.
  - Known limitation: leaving the screen while a step is held gives no refresh on release; safe because of the version check (`source_conflict`).
- Review: Chase adversarial review, no blocking defects; Echo UX review LC-SYNC-1 to 6, wording applied. Forge not applicable until the DEV deploy.
- Documents updated: `project/Documents/Release_Tracker.md` (R134 scope), `project/Documents/Solution_Design.md` (R118 stepper paragraph), `project/Documents/Development_Changes.md` (R134 row).

## Checks
| Command | Result |
| --- | --- |
| lint, typecheck (Byte, `691962d`) | Pass |
| unit tests (Byte, `691962d`) | Pass, 24/24 |
| late-charge e2e spec, desktop and mobile Chromium (Byte, `691962d`) | Pass, 28/28 |
| `Test-MigrationsCloud.py --sql-only` on a fresh V137 cluster (Chase) | 14 PASS: same-request-id replay returns the recorded outcome with one apply; stale `expectedVersion` gives `source_conflict`; one change-log row per step |
| LC-SYNC-6 e2e (Chase) | Pass 2/2, and fails on the pre-fix stepper |
| `npm run check:docs` | Pass |

DEV evidence: placeholder until the deploy. Pins live only in the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments); the DEV smoke (repeated presses on one charge, amount and total after each) goes here.

## Not run
- WebKit e2e: left to the pull request's `Development checks`.
- DEV deploy and DEV smoke: pending.

## Recovery
Revert the R134 commits; redeploy the previous DEV Hosting version listed as rollback in the Environment Inventory. No SQL change is expected.

## Open questions
None. Owner review of DEV is pending.

## Remaining work
Push, CI, DEV deploy and smoke, owner review.
