# W5 PWA UX: receiving, accessibility, borrower, cash, navigation, settings (17 October 2026)

## Purpose

Wave 5 of the independent review: 39 UX finding codes (29 reproduced, 7 partly, 1 already fixed, 2 no action) on branch `claude/review-w5-ux`, started from `main` 8063f89 and merged with `origin/main` (c3684d8). UI-only: no schema change, no new dependency, no change to what is posted, queued or synced. Every new string has English and Thai through the existing `t(en, th)`. The hand-written `sw.js` is kept.

**Release.** The owner brief named R067, but another session froze and Released R067 (tidy-ups) while this wave was in progress. R068 is now the sole Open release, so W5 is new product work for **R068** (see the [Development Changes](../project/Documents/Development_Changes.md#r068-wave-5-ux) section). The release tracker is unchanged.

Owner decisions applied: keep the zoom lock (APP-UX-A11Y-01, APP-SEC-02); APP-UX-PERF-02 is already met.

## Changes

### Receive payment (`SelectedCharges.tsx`, `online-status.ts`, `live-style.css`)

- **APP-UX-RECEIVE-01.** The Review button keeps its accessible name and shows the visible text "Review" / "ตรวจสอบ" (113.6x44 on the phone), primary style (white on `#713c00`, 8.94:1). "Clear draft" / "ล้างร่าง" shows its caption at every width; Clear allocations is the only icon-only eraser.
- **APP-UX-RECEIVE-02.** No nested scroll at 1050 px and below (phone 935 = 935); desktop two-pane unchanged.
- **APP-UX-RECEIVE-03.** Review step shows the borrower name once, with captions "Receiving account" / "บัญชีรับชำระ", "Payment date" / "วันที่รับชำระ", "Payment method" / "วิธีชำระเงิน" (Cash / เงินสด, Bank Transfer / โอนเงิน) and "Notes" / "หมายเหตุ" when non-empty.
- **APP-UX-RECEIVE-04.** New `useOnline` repaints the screen on a connection change. Offline, the review shows "Offline: this payment will be saved on this device and sent when you reconnect. Receipt upload and notifications happen after it syncs." / "ออฟไลน์: รายการรับชำระนี้จะบันทึกไว้ในอุปกรณ์และส่งเมื่อกลับมาเชื่อมต่อ การอัปโหลดหลักฐานและการแจ้งเตือนจะเกิดขึ้นหลังซิงค์", and the button reads "Save for sync" / "บันทึกไว้รอซิงค์" (online "Confirm payment" / "ยืนยันรับชำระ"). Main strip: "You are offline. Payments and changes are saved on this device and sync when you reconnect." / "ขณะนี้ออฟไลน์ รายการรับชำระและการแก้ไขจะบันทึกไว้ในอุปกรณ์นี้ และซิงค์เมื่อกลับมาเชื่อมต่อ".
- **APP-UX-RECEIVE-05.** The request reference is folded under "Request reference" / "หมายเลขอ้างอิงคำขอ" in queued, posted, busy and rejected states (always visible while sending, unknown, conflict or storage blocked), with a disclosure marker. The queued state adds "Open saved changes" / "เปิดรายการที่บันทึก" (optional `CommandAccess.openSaved`).
- **APP-UX-RECEIVE-06.** Disabled Auto-assign is `#595959` at full opacity (6.26:1) with a hint: "Enter the amount received to use Auto-assign." / "กรอกยอดรับชำระก่อน จึงจะใช้การจัดสรรอัตโนมัติได้", or offline "Auto-assign needs a connection. Allocate each charge below." / "การจัดสรรอัตโนมัติต้องเชื่อมต่ออินเทอร์เน็ต กรุณาจัดสรรแต่ละรายการด้านล่าง".

### Collection and dashboard

- **APP-UX-COLLECT-01.** Group chips read "Remaining" / "คงเหลือ" or, for fully paid, "Collected" / "รับแล้ว".
- **APP-UX-COLLECT-02.** Each tile shows its status word (existing labels), 14 px `#4a4a4a`.
- **APP-UX-COLLECT-03.** `.charge-loan-link` is 44 px tall.
- **APP-UX-COLLECT-04 (partly fixed in R064).** The bare header "0%" is gone; the first download shows the strip "Preparing offline data… {n}%" / "กำลังเตรียมข้อมูลออฟไลน์… {n}%".
- **APP-UX-A11Y-02.** KPI red `#c62828` (5.62:1) for Pending Payment Amount, Not Paid and Partially Paid.

### Borrower and loan

- **APP-UX-BORROWER-01.** Caption "Borrower name (Thai - English)" / "ชื่อผู้กู้ (ไทย - อังกฤษ)"; edit captions "Borrower name (Thai)" / "ชื่อผู้กู้ (ไทย)" and "English name" / "ชื่อภาษาอังกฤษ"; no "TE"; no dangling " - " when the English name is empty.
- **APP-UX-BORROWER-02.** Checkbox 24 px inside a 44 px tappable row.
- **APP-UX-BORROWER-03.** Referrer select named "Referrer" / "ผู้แนะนำ".
- **APP-UX-BORROWER-04.** Delete (borrower and the other `RecordAction` deletes, 7 files) uses the destructive style `#b3261e` with a 12 px gap; the confirm dialog is unchanged.
- **APP-UX-BORROWER-05 (partly).** Sticky Save/Cancel above the bottom navigation on phones (on phones `.borrower-record` and its panels are no longer scroll containers; `scroll-padding-bottom` 140 px so a focused field is not left under the bar). `autocomplete="off"` on person fields; Instagram field without auto-capitalise. "Name required" was **not reproduced** as a defect: the server accepts an empty name (`services/business/borrowers.mjs:42`), so `required` would change accepted data and was not added.
- **APP-UX-BORROWER-06.** One money format everywhere, `-฿1,200` (sign before the symbol, whole baht): new `display-money.ts` `wholeBaht` in 11 files, BigInt variant in `SelectedCharges.tsx`; the borrower summary now shows ฿. A tiny negative shows `฿0`.

### Cash

- **APP-UX-CASH-01.** Statement Date shows `08-Oct-2026` / `08-ต.ค.-2026` over the native input (accessible name still "Statement Date", via `aria-label`).
- **APP-UX-CASH-02 (partly).** On phones the Cash Dashboard card is collapsed (statement top 638 → 208 px). The note shows only when account or date differs from the saved defaults: "This account and date are not your defaults." / "บัญชีและวันที่นี้ยังไม่ใช่ค่าเริ่มต้นของคุณ".
- **APP-UX-CASH-03.** Partner withdrawal labels come from the Partners records (role A and B) via `partner-names.ts`: "{name} Withdrawn MTD" / "{name} ถอนเดือนนี้"; fallback "Partner A/B Withdrawn MTD". The SQL column names "Tommy/Lisa Withdrawn MTD" are preserved compatibility identifiers and are unchanged.

### Navigation, settings and offline

- **APP-UX-NAV-01 (partly).** Strip 14 px, 8 px gap, 44 px Retry; hidden while offline; the "Updates paused" strip is hidden after one Retry when data exists.
- **APP-UX-NAV-02.** Desktop sidebar fits 1280x800 (881 → 740); items 48 px.
- **APP-UX-NAV-03.** The Payments tab uses the history icon, not the receive icon.
- **APP-UX-SETTINGS-01.** `sign-in-failure.ts`; `role="alert"` under "Continue with Google": popup blocked/closed "The sign-in window was closed or blocked. Allow pop-ups for this site and try again." / "หน้าต่างลงชื่อเข้าใช้ถูกปิดหรือถูกบล็อก โปรดอนุญาตป๊อปอัปสำหรับเว็บไซต์นี้แล้วลองอีกครั้ง"; network "Sign-in needs a connection. Check the connection and try again." / "การลงชื่อเข้าใช้ต้องเชื่อมต่ออินเทอร์เน็ต ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง"; other "Sign-in did not complete. Try again." / "ลงชื่อเข้าใช้ไม่สำเร็จ กรุณาลองอีกครั้ง" plus the code.
- **APP-UX-SETTINGS-02.** Signed-out shell: title "MW Credit" / "MW สินเชื่อ", no disabled refresh; EN/ไทย on the sign-in card (hidden on desktop, where the sidebar shows it). The menu button stays only when it holds something (installed app with Install/Update, or before auth settles).
- **APP-UX-SETTINGS-03.** `notification-status.ts`: one state line on open without a tap ("On for this device." / "เปิดอยู่บนอุปกรณ์นี้", "On for your account, not on this device.", "Off for your account." / "ปิดสำหรับบัญชีของคุณ", "Blocked by this browser. Allow notifications in site settings." / "เบราว์เซอร์นี้บล็อกการแจ้งเตือน โปรดอนุญาตในการตั้งค่าเว็บไซต์"); "Check notification status" is hidden once the state is known.
- **APP-UX-SETTINGS-04.** `usePwa.ts`: the automatic runtime update is removed (cold-start apply and its gate unchanged). Banner "A new version is ready." / "มีเวอร์ชันใหม่พร้อมใช้" with Reload now / Later (full width wrap on phones), hidden while a form or command blocks the update; the reload waits at least 1.5 s and re-checks that it is safe; after reload the toast "App updated." / "อัปเดตแอปแล้ว". The menu "Update and reload" stays.
- **APP-UX-SETTINGS-05 and APP-OFFLINE-02 (partly).** Sync, Sign out and Review sit in their own group under a divider. Sign out is disabled while changes are unsynced (rule unchanged), looks disabled (`#f2f2f2`, 6.26:1) and carries the note "{n} saved change(s) not synced yet. Sync before signing out." / "ยังมีรายการที่บันทึกไว้ {n} รายการที่ยังไม่ซิงค์ กรุณาซิงค์ก่อนออกจากระบบ" (`aria-describedby`); visible "Sync now" / "ซิงค์ตอนนี้" (accessible name "Sync now, {n} saved change(s)").
- **APP-OFFLINE-05.** `sw.js` focuses the tab, posts `NOTIFICATION_OPEN` and waits 1.5 s for an acknowledgement before falling back to the old `navigate`. With a form open the tab stays: "A notification is waiting. Finish or leave this form to open it." / "มีการแจ้งเตือนรออยู่ ทำรายการนี้ให้เสร็จหรือออกจากหน้านี้เพื่อเปิด" with "Open notification" / "เปิดการแจ้งเตือน"; it also opens by itself once the form closes. Deviation from A: the focus happens before the message (it must happen inside the click's activation window).
- **APP-UX-A11Y-03.** No visible text under 14 px, except the 11 px numeric waiting-sync badge (the count is also in its accessible name). Thai stale sync text is "ข้อมูล ณ {time}". Header height stays 56/60 px.
- **APP-UX-I18N-01.** Pager `aria-label` "การแบ่งหน้า" in Thai; logo `alt` "MW สินเชื่อ" in Thai.
- **APP-UX-PERF-01 (partly).** The two header logos are 128 px palette PNGs (76 → 12 KB). The 192/512/apple icons are separate files and are unchanged; a maskable icon (PERF-03) was not done.
- **APP-NOTIFY-02.** `services/notifications/web-push.mjs` accepts Windows push hosts (`*.notify.windows.com`, same shape as the Apple rule); bare `notify.windows.com`, `notify.windows.com.evil.example` and `evilnotify.windows.com` are rejected. Code and unit test only (see Not run).

### Recorded without a code change in the product

- **APP-UX-A11Y-01 and APP-SEC-02: accepted design, mitigated.** Owner decision: the zoom lock (`maximum-scale=1`, `user-scalable=no`, gesture guard) stays; it is identical before and after on both viewports. Mitigations: A11Y-02, A11Y-03, BORROWER-02, COLLECT-03, NAV-01.
- **APP-UX-PERF-02: already met since R063** (W3 `2fd1817`, `scripts/hosting-headers.mjs`): `/assets/**` is `public,max-age=31536000,immutable`; `/`, SPA routes, `sw.js`, `build-version.json`, `manifest.webmanifest` and `offline.html` are `no-store`. Read back on 16 October 2026 for DEV and PROD (PROD entry asset immutable). W5 only made `firebase.json` mirror the runner rules and added a mirror test (`tests/unit/hosting-headers.test.mjs`); the deployed header configuration is unchanged and already in PROD. New builds are still detected through the `no-store` `sw.js`, `build-version.json` and `/`.
- **APP-UX-PERF-03, APP-UX-I18N-02:** no action.

## Checks

| Check | Result |
| --- | --- |
| Agent C on the W5 tree (3c92fbd): `npm run check` | exit 0, unit 545 of 545 |
| Agent C: lint | 0 errors, 771 warnings (baseline 774), 116 infos |
| Agent C: `check:evidence`, live-dev build | pass |
| Agent C: Playwright, 22 specs, both projects | 367 passed, 7 skipped, 4 failed (only `payment-command.spec.ts`, stale W4 assertions) |
| Agent B: full Playwright, both projects | 498 passed, 12 skipped, 4 failed (the same `payment-command` cases) |
| E re-check corrections C-1 to C-5, then Playwright (w5-ux, phase5-borrower, live-signout-blocked, phase5-final-ui, cash-two-workspaces, pwa-canonical, receiving-ux) | 176 passed, 2 skipped, 0 failed; `tsc` 0, lint 0 errors, live-dev build ok |
| `payment-command.spec.ts` after the orchestrator updated two assertions (c3329b1) | 28 of 28, both projects |
| `tests/integration/notifications-ui-r053.test.mjs` (updated; no CI runner calls it, run directly) | pass 1, fail 0 |
| New unit tests | `borrower-label`, `sign-in-failure` (with the notification line), `sw-notification-click`, `wns-push-endpoints`; updated `display-money`, `sign-out-guard`, `hosting-headers` |
| New e2e spec | `w5-ux-independent.spec.ts` (both projects) |
| Agent E re-check, 1280x800 and 430x932, EN and TH | every code pass or accepted; five corrections (C-1 to C-5) applied |
| Consolidated checks on the merged tree (`npm run check`, lint, full Playwright) | {{final results}} |
| `deploy-hosting.mjs --live-dev --check`, DEV Hosting deploy | {{version, release, marker, entry, files}} |
| DEV header readback, service-worker update detection, smoke | {{results}} |

Agent C review found no defects.

## E re-check results (before / after)

| Measure | Before (main 8063f89) | After |
| --- | --- | --- |
| Review payment, phone | 44x44 icon only | 113.6x44 with text (TH 125x44) |
| Clear draft, phone | 44x44 icon only, same SVG as Clear allocations | 118x44 "Clear draft" |
| `.payment-charge-scroll` phone scrollHeight / clientHeight | 926 / 371 | 935 / 935, bar sticky at 56 |
| Auto-assign disabled contrast | 4.0:1 | 6.26:1 with hint |
| Dashboard KPI red contrast | 4.00:1 | 5.62:1 |
| Visible text under 14 px (phone, listed screens) | 11-13 px on every listed screen | none, except the 11 px badge |
| Header height at 430 px with each sync text | n/a | 56 px (desktop 60) EN and TH, no overflow |
| Borrower checkbox / row | 13x13 / 22-23 px | 24x24 / 44 px |
| `.charge-loan-link` | 176.5x32 | 176.5x44 |
| Sign out spacing; blocked state | 16 px, no divider; "Sync 1 pending first" | 8 px + divider + 12 px; disabled "Sign out" with note, enabled "Sync now" |
| Desktop sidebar scrollHeight / clientHeight, 1280x800 | 881 / 740 | 740 / 740 (EN and TH) |
| Negative money | `฿-120`, `฿-200`, `-200`, `-฿200` | `-฿120`, `-฿200`, `-฿200` everywhere |
| Cash statement top (phone) | y 638 | y 208 |
| Cash date text | `10/08/2026` beside "08-Oct" | `08-Oct-2026` |
| Logo | 256x256, 76,605 B | 128x128, about 12 KB |
| Zoom lock (meta, ctrl+wheel, gesturestart, two-finger touchmove) | present and prevented | unchanged |

## Not run

| Item | Reason |
| --- | --- |
| DEV notifications worker with APP-NOTIFY-02 | Not deployed. Another session rolled all four DEV services to an image not on the W5 base; DEV notify and jobs share one Terraform image and the DEV root does not pass `image_overrides`, so a notify-only roll would drift from Terraform. It ships with the next all-services DEV roll and with promotion. |
| Push to a real Windows (WNS) subscription | Needs that runtime and a Windows browser; the unit test covers the allowlist only |
| Physical device (iPhone Home Screen, Thai layout on device) | Device check; verified at 430x932 with touch emulation |
| Click on a real system notification | Playwright cannot; covered by the unit test of the `notificationclick` handler and e2e of the in-page half |
| Real Google sign-in popup failure | Stubbed `signInWithPopup` only |
| Update banner on the canonical origin by E | Probe with the same markup; B's `phase5-final` runtime-update tests cover the behaviour |
| PROD deployment, authenticated writes | Not authorised in this task; UI-only |

## Recovery

`git revert` the W5 commits. DEV Hosting: previous version `0f181d5d61573ebf` (R066, release `1792173681752000`) unless a later release exists; re-read the DEV release before any rollback because other sessions deploy DEV. UI-only: no database dump or restore rehearsal; no runtime or Terraform change.

## Open questions

Defaults applied; the owner may change any of them.

1. Thai product name "MW สินเชื่อ" for the logo alt and signed-out title (as on the logo artwork).
2. The Cash date shows the Gregorian year ("08-ต.ค.-2026"), matching the app's CE dates.
3. Borrower name stays optional (the server accepts it empty).
4. DEV hides the Notifications view (`VITE_NOTIFICATIONS` unset in the DEV bundle). An owner push test on DEV needs it enabled in the DEV build: enable it?

## Remaining work

- Notifications worker (APP-NOTIFY-02) ships with the next all-services DEV roll and with R068 promotion.
- `preference-save.ts:27` builds its pending-sync message in the previous language, so the Thai menu can show the English "Saved on this device. Waiting to sync." (pre-existing).
- At 1280x800 with saved changes pending the sidebar scrolls (939 vs 740), so "Sync now" and "Sign out" are below the fold; "Waiting to sync" stays at the top.
- PERF-01 is partly done (icons 192/512/apple unchanged; maskable icon per PERF-03 not done).
- A missing `/assets/*` file falls through the SPA rewrite and is served as `index.html` with the immutable header (low risk, measured); a narrower rewrite would change both Hosting runners' frozen contracts: a separate item.
- DEV Hosting uses the "MW Credit Production" web app id; whether DEV should use the DEV app is a separate decision.
- W5 UI reaches PROD with the R068 promotion (headers already in PROD since R063).
