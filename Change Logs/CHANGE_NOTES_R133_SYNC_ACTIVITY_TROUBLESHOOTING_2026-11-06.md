# Change notes — R133 header sync activity and troubleshooting file, 6 November 2026

## Purpose
Two items: (a) show the ongoing sync or load activity in the header last-update area while the refresh icon spins; (b) enhance the client-side encrypted troubleshooting file with what recent investigations needed.

Owner scope, 6 November 2026: "When the app is loading/syncing data, or whenever the sync icon is spinning, I want the ongoing activity to be reflected in the area where it shows last update time when it's not spinning, so I know why it's spinning. I also want you to review the troubleshooting file at client side and enhance it to include information helpful for troubleshooting based on recent troubleshooting experience. Engage the team to work on this in the next release".

Status: In development, not deployed; no DEV or PROD deploy is authorized. No production approval has been given. Expected delivery: PWA Hosting only, no SQL, images, Terraform or VM change.

Team: Archie, Byte, Chase, Dewey, Echo. Forge is not applicable: no infrastructure change.

## Changes
Code commits `b27202a` (Byte), `8a77234` (SYNC-ACT-UX-16 fix), `2f3dd51` (Chase, spec lint) and `9dfd7c6` (Chase's Shoulds), local, not pushed.

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
| CI `Development checks` | Pending: no pull request is open; that run is the broad run |

## Not run
- Real-device iPhone run.
- The real "Updated HH:MM" return in the spec (its fixture never completes the dataset).
- Connecting, Signing and Saving labels were not visually rendered by Echo.
- The Connecting… e2e case and the mobile-webkit project run in Chromium with phone emulation, not the WebKit engine.

## Recovery
Git baseline: R132 `ede185f` (PROD package). Nothing is deployed for R133 yet; before release, revert the code commit(s) of this release.

## Open questions
None yet. Owner approval is needed before any PROD promotion.

## Remaining work
Pending checks above, push, DEV deployment and owner review.
