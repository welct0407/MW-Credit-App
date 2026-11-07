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
| lint, typecheck (Byte, `e1f39a5`) | Pass |
| unit tests (Byte, `e1f39a5`) | Pass, 24/24 |
| late-charge spec plus `back-consumers-independent.spec.ts:158`, desktop and mobile Chromium (Byte, `e1f39a5`) | 34 passed |
| `npm run check:docs` | Pass |

CI: PR #263 `Development checks` run 42354581503 on `10bd08f` is green after one re-run. iPhone WebKit shard w1 first failed on `tests/e2e/back-consumers-independent.spec.ts:158`, a pre-existing race (a one-shot pending-list read), not R134 code; it passed on re-run, and `e1f39a5` makes it poll.

## DEV promotion record (Forge, 7 November 2026, UTC)
- Scope: PWA Hosting only; no SQL, image or Terraform change. Target: project `clever-oasis-508610-n7`; Hosting site `mw-credit-app-dev-737787224638` (`dev-lm.mw-credit.com`); DEV web app appId `...b98872168121353cfbe76f`; the bundle holds only DEV origins. Pins are in the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments).
- Build: `npm run build:live-dev` from `10bd08f`, release R134, build-version `ef863647fe8a59f9b39037c4`, entry `/assets/index-D89oN_L4.js`; `.env.live-dev` deleted after the build.
- Deploy: `deploy-hosting --live-dev --check` passed (17 files); deployed as `codex-cloud`: Hosting version `b0c8e9cabe1c6ab6`, release `1794040457082000`, live 08:34:17Z. Rollback target `98ccf8104d2e516c` (R133).
- Smoke: three origins 200, no-store, R134; `sw.js` no-store; `/health` 200 on read, command and chat; requests without a token 401; CORS 204; no DEV ERROR logs.

## DEV feature pass (Chase)
Test Partner, Chromium with the iPhone 17 Pro Max profile (WebKit not installed locally); one synthetic charge, ฿0 at the start and restored to ฿0.
- Three quick +50 taps: PASS on Collection and Details.
- Stale screen: PASS on Collection. On Details, a low defect: a remembered record with an old version and the same figure sent one POST; the server refused it (`source_conflict`) and the refusal text showed. Nothing was double-applied. Fixed in `e1f39a5`: on `source_conflict` it reads once and shows "Not changed: late charge is already ฿X", with a new e2e on Details and on Collection.
- Lost answer: "Checking…", then the server figure; one POST plus one status GET under the same request id: PASS.
- −50 back down: PASS.

## Echo DEV review
Clean. Follow-ups outside R134 scope, recorded and not fixed: LC-SYNC-7, the bottom toast covers the next row's +50 button while saving (that button is disabled); LC-SYNC-8, the header busy state shows "Saving…" inconsistently.

## DEV redeploy of `e1f39a5` and re-check
- CI: PR #263 `Development checks` run 42358685942 on `36ca7bc` is green on the first attempt; all 3 Chromium and 3 iPhone WebKit shards pass.
- Redeploy (Forge, 7 November 2026, UTC) from `36ca7bc`, to the verified DEV target (project `clever-oasis-508610-n7`, site `mw-credit-app-dev-737787224638`, DEV appId, DEV-only origins). Build-version R134 `708a5d4089e75f74de0b6a19`; the entry embeds `36ca7bc`. `.env.live-dev` written with 9 settings and deleted after the build. `--check` passed (17 files). Hosting version `5d0c076529cad602`, release `1794043543153000`, live 09:25:43Z. Rollback target `b0c8e9cabe1c6ab6`. Smoke as before: all pass, no DEV ERROR logs since 08:34Z.
- Re-check (Chase, Test Partner, Chromium iPhone 17 Pro Max profile, same synthetic charge, restored to ฿0, version `57d40645`): Details with a stale remembered record and the same figure sent one POST, refused, toast "Not changed: late charge is already ฿250", screen and server ฿250: PASS. Captured: "Checking late charge…"; held "Saved on this device. Still checking…" with "฿200 → ฿250 · Checking…"; "Not changed…" on Collection and Details; the confirmation "+฿50 · now ฿X" on Collection and Details. The held run was a stale-version send: server ฿300 at version `491ff228` before and after, nothing applied; the screen settled on ฿300 on release. That request id's journal status was not read.
- Status: awaiting owner review on DEV. PROD not touched.

## Not run
- WebKit e2e: left to the pull request's `Development checks`.
- DEV redeploy of `e1f39a5` and re-check: pending. done, see above.

## Recovery
Revert the R134 commits; redeploy the previous DEV Hosting version listed as rollback in the Environment Inventory. No SQL change is expected.

## Open questions
None. Owner review of DEV is pending.

## Remaining work
Push, CI, DEV deploy and smoke, owner review.
