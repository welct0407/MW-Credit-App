# Change notes — R133 header sync activity and troubleshooting file, 6 November 2026

## Purpose
Two items: (a) show the ongoing sync or load activity in the header last-update area while the refresh icon spins; (b) enhance the client-side encrypted troubleshooting file with what recent investigations needed.

Owner scope, 6 November 2026: "When the app is loading/syncing data, or whenever the sync icon is spinning, I want the ongoing activity to be reflected in the area where it shows last update time when it's not spinning, so I know why it's spinning. I also want you to review the troubleshooting file at client side and enhance it to include information helpful for troubleshooting based on recent troubleshooting experience. Engage the team to work on this in the next release".

Status: Released to DEV and PROD (DEV on 6 November 2026 under the owner's instruction "Move to dev and test it"; PROD on 7 November 2026 under "Promote R133 to production"; package `ac64c68`, PR #261, tag `R133`). The owner accepted DEV on 7 November 2026 ("Dev is fine"); PROD acceptance pending. No production approval has been given. Expected delivery: PWA Hosting only, no SQL, images, Terraform or VM change.

Team: Archie, Byte, Chase, Dewey, Echo. Forge is not applicable: no infrastructure change.

## Changes
Code commits (PR #261, merged as `ac64c68`) `b27202a` (Byte), `8a77234` (SYNC-ACT-UX-16 fix), `2f3dd51` (Chase, spec lint), `9dfd7c6` (Chase's Shoulds), `3d44056` (Byte, CI fixes), `2c0f710` and `bc0146b` (Chase, spec guards); PR #261.

Item (a), header sync activity label:
- The cell beside the refresh icon shows the activity only while the icon spins (`headerState==='loading'`); the label is derived from the spinner's own inputs, so it cannot disagree with the spin (SYNC-ACT-UX-1). The first-download bar wins over any label (UX-8).
- Labels, English and Thai: Connecting… / กำลังเชื่อมต่อ…, Signing in… / กำลังเข้าสู่ระบบ…, Signing out… / กำลังออกจากระบบ…, Saving… / กำลังบันทึก…, Reading receipt… / กำลังอ่านใบเสร็จ…, Loading… / กำลังโหลด…. Timing: 200 ms show delay, 600 ms hold.
- Requests carry a kind (read, save, receipt) from `request-activity.ts`, tagged at the save and receipt call sites (`BorrowerRecord`, `CollectionNote`, `LateChargeStepper`, `LoanClose`, `LoanForm`, `PaymentResult`, `SelectedCharges`).
- Orchestrator decision: Echo items 3 (Sending N changes / Checking <section> labels), 5 (receipt count) and 9 (refresh check bar plus label) are not applied, because background offline work never spins the icon, so there is nothing to label. Items 10 to 14 are met by the delay and hold, text-only cell and unchanged live region.
- Files: `apps/pwa/src/header-activity.ts` (new), `request-activity.ts`, `SyncStatus.tsx`, `live-main.tsx`, `live-style.css`; tests `tests/unit/header-activity.test.mjs`, `tests/e2e/header-activity-independent.spec.ts`.

Item (b), troubleshooting file schema 2 (additive; schema 1 readers keep working). Each addition and the incident it serves:
- Per-domain last request status, code, duration, attempts and failures. Serves R130 (a 503 on the records domain was visible only in server logs) and R121 (a refused receipt showed only as repeated requests).
- `dataset-failed` events for background failures, one per domain and code (distinct failure) until a success, with eviction protecting session and startup events (Chase Should 2, `9dfd7c6`), recorded in the coordinator; the old listener is removed; with no lease the failure is `not_authorized`. Serves R130 and R121.
- `recentCycles` (up to 10) with their triggers, including `screen` and `repair` (a repair has its own trigger, Chase Should 1, `9dfd7c6`). Serves R121 (what the open, poll and focus triggers requested).
- `preparation.activity`. Serves R130 and R132 (what the preparation was doing).
- `offline.receiptCounts` (`offline.receipts` stays the schema 1 number) and `receiptSample` (the 3 newest, with unreadable blobs); `describeBlobs` keeps an unreadable blob as `readable:false`. Serves R132 item (b) (the WebKit unreadable receipt blob).
- Session and sync-outcome events, the latter from the new in-tab event `mw-offline-sync-attempt`. Serves R132 (what the queued save did).
- Startup timing marks in localStorage key `mw-credit-startup-timing` (`{current, previous}`, numbers only, `startup-timing.ts`). Serves R132 (the report had no startup timing; the cause was found from logs).
- `latestBuild` and `buildMismatch`, and device hints. Serves all three (which build and device).
- Event limit 25 to 40.
- `scripts/troubleshooting/decrypt.mjs` reads schema 1 and 2 and prints the schema, each domain's status, code and ages, and the startup marks ("unknown" for a schema 1 file).
- Files: `client-events.ts`, `offline-dataset.ts`, `offline-sync.ts`, `owner-offline.ts`, `startup-timing.ts`, `troubleshooting-collect.ts`, `troubleshooting-report.ts`, `scripts/troubleshooting/decrypt.mjs`; test `tests/unit/offline-dataset-coordinator.test.mjs`.
- Documents updated: `project/Documents/Solution_Design.md` (Startup paragraph), `docs/Development.md` (troubleshooting paragraph).
- Deploy plan: PWA Hosting only, DEV then PROD after owner approval. No SQL, images, Terraform or VM change; no backup needed.
- Known limitation: the "Connecting…" e2e case runs in Chromium with phone emulation (real Firebase needs Chromium host rules), not WebKit.

Echo findings (SYNC-ACT-UX-1 to 15, priority in brackets):
- 1 (Must): the label follows exactly the spin state, from one shared value.
- 2 (Must): precedence is connecting or sign-in, first download bar, sending queued changes, checking a section, refresh check of all sections, receipts, failure, saved-from, updated; running activity replaces the failure text while it runs.
- 3 (Should): quiet automatic checks are labelled only if they spin the icon.
- 4 (Must): short verb plus object labels in English and Thai: Connecting… / กำลังเชื่อมต่อ…, Signing in…, Signing out…, Sending N changes… / กำลังส่ง N รายการ…, Checking Cash… / กำลังตรวจ เงินสด…, Checking data…, Loading… / กำลังโหลด…, Receipts 12/40 / ใบเสร็จ 12/40.
- 5 (Should): receipts show a count, not a bar.
- 6 (Should): no duplicate of the app-version "Checking app…" text.
- 7 (Must): keep the 88px two-line cell; fall back to the generic label when the text does not fit.
- 8 (Must): the first download keeps the percentage over its bar and gets no label.
- 9 (Could): the refresh check shows bar plus label only if it fits.
- 10 (Must): anti-flicker: 400 ms show delay, 800 ms minimum display, 600 ms swap between labels, and no "Done" text.
- 11 (Should): normal colour; the stale or failed style is dropped while activity is shown.
- 12 (Must): the label is text, not a control.
- 13 (Must): the live region keeps its two announcements only; the refresh button hidden text matches the label.
- 14 (Should): `aria-busy` is kept and nothing is announced twice.
- 15 (Could): the troubleshooting activity history uses the same labels.
- 16 (found in review): the Thai object word of a label such as กำลังตรวจ เงินสด must stay on one line; fixed with `.sync-section` in `8a77234`.
- 17: at 320px the header title shrinks; pre-existing, recorded only.
- 18 (Could, pre-existing, DEV): after the Google popup is closed unanswered, Signing in… and the spinner can stay over 1.5 s (2 of 4 runs) while Firebase notices; the blank body below the header is pre-existing.

Chase review (b27202a): no Must-fix. Should 1 (repair trigger) and Should 2 (dataset-failed deduped per domain and code, eviction protects session and startup events) were applied in `9dfd7c6`. Should 3 (a label may hold up to 600 ms before the failure text shows) is accepted as designed. The item (b) incident mapping above was checked against this review, the R130 and R132 notes, and R121's recorded diagnosis (a refused receipt re-requested on open, poll and focus; its note is out of the retention window).

## Checks
| Command | Result |
| --- | --- |
| `npm test` | Pass, 1235 pass, 0 fail, 1 skip, `b27202a` (Byte) |
| `biome lint apps scripts tests/unit` | Pass, `8a77234` and `9dfd7c6` (Byte) |
| `npm run typecheck` | Pass, `8a77234` and `9dfd7c6` (Byte) |
| `npm run build` | Pass, `8a77234` and `9dfd7c6` (Byte) |
| `vite build --mode live-dev` | Pass, `8a77234` and `9dfd7c6` (Byte) |
| Focused `node --test` | 74 pass, 0 fail, `9dfd7c6` (Byte) |
| Spec lint, `header-activity-independent.spec.ts` | Lint pass; 5 of 5 on the mobile-webkit project (runs Chromium with Pixel 7 emulation, not the WebKit engine), `2f3dd51` (Chase) |
| Echo smoke, real WebKit iPhone 17 Pro Max, 440 and 320 px, EN and TH | Pass on UX-7, 11 and 13, `b27202a` (the receipt label text was injected, not triggered) |
| CI run 42280061062 on `308ba9d` | Fail, ours: the payment review POST was labelled Saving…, the about spec used schemaVersion 1, the startup-timing key stayed after sign-out; fixed in `3d44056` (Byte) and `2c0f710` (Chase, startup-session `afterAll` guard, pre-existing) |
| CI run 42283290447 on `3d44056` | All green except WebKit w1, cancelled at the 30-minute timeout in `apt install` (mirror stall); its single re-run was a real failure (the header-activity spec launched Chromium in the WebKit job), fixed in `bc0146b` (Chase: the spec skips under WebKit, `chat.spec` `afterAll` guard) |
| CI `Development checks` run 42289161377 on `bc0146b` | Pass; WebKit w3 was cancelled by an apt mirror stall and passed on its single re-run |
| DEV smoke (Chase, DEV test Partner) | Pass: Connecting… then Loading… then Updated HH:MM after a real DEV sync on mobile Chromium EN, real WebKit iPhone 17 Pro Max EN and desktop Chromium TH; cell 88x44, no role, live region empty, button text matches; troubleshooting file signed out and signed in is schema 2 with no uid, email, token or API key in plaintext; decrypted output shredded |
| DEV Echo (real WebKit iPhone 17 Pro Max, 440 and 320 px, EN and TH) | Pass on the signed-out card and Signing in… (UX-7, 11, 13); UX-16 fix confirmed; UX-18 new |

## Not run
- Real-device iPhone run.
- Reading receipt…, Saving… and Signing out… were not exercised on DEV.
- Pre-existing flakes seen, not ours: `upcoming-read.spec.ts:41` request count and `back-consumers-independent.spec.ts:195`.
- The real "Updated HH:MM" return in the spec (its fixture never completes the dataset).
- Connecting, Signing and Saving labels were not visually rendered by Echo.
- The Connecting… e2e case and the mobile-webkit project run in Chromium with phone emulation, not the WebKit engine.

## Recovery
Git baseline: R132 `ede185f` (PROD package). Git baseline R132 `ede185f`. Hosting only: redeploy the previous Hosting version, PROD `77db38bf4fcb7e80` (release `1793976536948000`, R132) or DEV `884a425a44b01c48` (release `1793976369491000`, R132); see the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments). No SQL, image or Terraform change, so there is nothing else to undo; rolling back removes the header activity label and the schema 2 troubleshooting file.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD (first real use on the iPhone): the header label while the icon spins, and an encrypted PROD troubleshooting file with schema 2.
- Echo UX-17 (320px title shrink) and UX-18 (Signing in… can stay over 1.5 s after the Google popup is closed unanswered) are recorded only.
- Observed in the owner's DEV file (not an R133 defect, for the next sync work): the first sync's records and collection failed with "0 network" after about 16 s while the DEV command service answered in about 6 s, and a refresh tap 2 s later completed all five domains in 14.5 s.

## DEV promotion record (Forge, 6 November 2026, UTC)
- Owner instruction, 6 November 2026: "Move to dev and test it" (DEV only). Executed by Forge as `codex-cloud` in project `clever-oasis-508610-n7`, Hosting site `mw-credit-app-dev-737787224638`; PR #261 head `bc0146b`. The Hosting version, release and rollback pins are in the [Environment Inventory](../project/Documents/Environment_Inventory.md#latest-verified-deployments).
- Scope: PWA Hosting only; no SQL, images, Terraform, notify, jobs, VM or Metabase. Build R133, 17 files, live 21:13:26Z; only DEV origins in the bundle.
- Read-back: three origins 200, no-store, build R133; `sw.js` no-store; `/health` 200 on read, command and chat; unauthenticated 401; CORS 204; no DEV ERROR logs.
- Owner acceptance on DEV, 7 November 2026: "Dev is fine", with an encrypted DEV troubleshooting file from the installed iPhone app (iOS 18.7): R133 `bc0146b`, schema 2, `provisionalShown` 84 ms, `sessionConfirmedMs` 399 ms, 0 failed or queued saves, 79 DEV receipts refused 422 as designed; the decrypted copy was shredded.

## PROD promotion record (Forge, 7 November 2026, UTC)
Authority: the owner's instruction of 7 November 2026, "Promote R133 to production", after the DEV acceptance "Dev is fine". PWA Hosting only: no SQL, image, Terraform, notify, jobs, VM or Metabase change, so no backup and no owner window; no authenticated PROD read, financial write, forced notification or job run. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md); private records are in `gs://mw-credit-operator-private-737787224638/promotion-packages/r133/` and the receipt in `promotion-receipts/R133-HOSTING-RECEIPT.json` of the same bucket.

| Step | Result |
| --- | --- |
| Package | `main` `ac64c6848943c1be51b3983341eaaee9e02b8cb1` (merge of PR #261, tree identical to the tested head `52e23af`); baseline R132 `ede185fa150850ee512b6bc29e83732ebe826e15`; freeze 2026-11-07T03:15:14Z |
| Database | Flyway verify as `codex-cloud-read` 03:15:14Z to 03:16:05Z: schema 137 unchanged, 0 writes |
| Hosting | Generic package schemaVersion 36 `generic-v1`, frontend-only, sha256 `c76dec160a4537112c89171009230ba3e99d0e4c8f95d93ce61a9cd7f8dd6f63`; pinned public configuration sha256 `6eea01ac…a97e92` (as R131 and R132). CI evidence cited: `check` and e2e run 42289161377 (`bc0146b`); `terraform` run 42181245109; guards and database run 42179114186 (as R132). Build-version R133 `ea547bf1e2ff6640bfffb7e8`, entry `/assets/index-D7MIp6Vm.js`, live-prod, `MW_RELEASE_NUMBER=R133`. `--apply` as `mw-credit-unattended-admin` 03:17:40Z to 03:18:14Z on site `mw-credit-prod-737787224638`: version `8865bcd2e35cb0c7`, release `1794021487660000`, live 03:18:07.660Z, 18 files (previous `77db38bf4fcb7e80`, release `1793976536948000`, R132) |
| Smoke (read-only) | 03:18:20Z to 03:19:02Z: the three origins serve R133 (200, no-store) and the entry contains `ac64c68`; `sw.js` no-store; CSP names only the PROD origins; `/health` 200 on read, command and chat; unauthenticated 401 (read and command session, chat models and threads); CORS 204; the five Cloud Run services unchanged (read `00049-jph`, command `00054-mfx`, notify `00029-2nb`, jobs `00029-9dp`, chat `00033-zwx`); no ERROR or `*_unavailable` logs since 03:10Z |
| Rollback | Redeploy PROD Hosting `77db38bf4fcb7e80` (R132) |

### Limitations
- No authenticated PROD read was made. The owner's first use on the iPhone is the acceptance. There was no real-device run beyond the owner's DEV use; Saving…, Reading receipt… and Signing out… were not exercised on DEV.

### Tag record
Tag `R133` on `ac64c6848943c1be51b3983341eaaee9e02b8cb1` through the Release tag workflow run 42333502947 (queued 03:19:53Z), which also publishes the GitHub Release.

### Prune (closure)
Deleted after repointing every inbound link to commit `ac64c68` (the last commit where it exists): `Change Logs/CHANGE_NOTES_R130_RECORDS_SYNC_HOTFIX_2026-11-05.md` (R130 left the three-release window). R133 has no section in Development Changes, so none was removed. R132, R131, R129's retained links and the non-release notes stay; no evidence directory became uncited.
