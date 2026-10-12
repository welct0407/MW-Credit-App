# Canceled consolidated checkpoint failure inventory

Run38104661233, source4cbb9695f97557e9484fe16c73acfd82ca166b6e. Root observed concrete repeated failures in the live GitHub job and authorized cancellation; D canceled it. npm check/build/audit passed; E2E did not pass. The complete job log records the following failed executions before cancellation. Detailed Playwright assertion/trace blocks were not emitted before termination, and this workflow does not upload browser artifacts; those details require affected local reproduction. No claim is made about tests not reached or cancellation-interrupted executions. Do not hide failures, broaden timeouts or rerun CI per selector fix.

```text
2026-10-11T02:18:32.9243244Z   ✘    9 [desktop-chromium] › tests/e2e/cash-two-workspaces-independent.spec.ts:4:1 › Cash tree preserves source metrics and ledger whole rows support mouse Enter Space and page Back (5.4s)
2026-10-11T02:18:38.9670609Z   ✘   10 [desktop-chromium] › tests/e2e/cash-two-workspaces-independent.spec.ts:5:1 › desktop Cash captions fit their buttons after scoped sizing correction (5.5s)
2026-10-11T02:18:52.1893236Z   ✘    5 [desktop-chromium] › tests/e2e/back-consumers-independent.spec.ts:5:1 › selected assessment held read and analytics cash list children return immediately without stale overwrite (30.0s)
2026-10-11T02:18:58.4218553Z   ✘   21 [desktop-chromium] › tests/e2e/grouped-read.spec.ts:16:1 › grouped multi-page presentation and independent detail scrolling (1.8s)
2026-10-11T02:19:38.2175995Z   ✘   35 [desktop-chromium] › tests/e2e/loan-read.spec.ts:16:1 › nested loans synthetic list detail pagination errors and stale logout (30.0s)
2026-10-11T02:20:06.0584069Z   ✘   45 [desktop-chromium] › tests/e2e/persistence.spec.ts:27:1 › mocked restored observer fresh read invalidation network retry and signout failure (5.7s)
2026-10-11T02:20:11.0351568Z   ✘   36 [desktop-chromium] › tests/e2e/payment-command.spec.ts:30:1 › G06 bounded list preserves notes, total, scroll and bilingual review at 320/390/desktop (1.0m)
2026-10-11T02:20:29.4713066Z   ✘   55 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:38:1 › F12 static Close retains CAS until explicit adoption then fresh review freezes request receipt and money (6.3s)
2026-10-11T02:20:50.5105871Z   ✘   50 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:38:35 › F2 borrower ordered fields/read-only metadata and compact geometry 320px (40.0s)
2026-10-11T02:21:31.6768222Z   ✘   63 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:38:35 › F2 borrower ordered fields/read-only metadata and compact geometry 390px (40.0s)
2026-10-11T02:21:32.5723482Z   ✘   62 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:58:1 › F12 static Collection receipts preserve exact page scope older date manual priority and stable128px geometry (45.0s)
2026-10-11T02:22:26.2033018Z   ✘   74 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:69:1 › F4 UI three loan types preserve conditional source fields and strict320 EN/Thai input geometry (40.0s)
2026-10-11T02:22:34.6006832Z   ✘   78 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:86:1 › F6 action held-options double click cannot change confirmation label or payload; only header announces activity (1.3s)
2026-10-11T02:22:56.4689029Z   ✘   71 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:63:1 › F12 final320 correction Close preference form geometry and bilingual visual parity (45.0s)
2026-10-11T02:23:18.4637166Z   ✘   80 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:91:1 › F6 close UI preview is read-only/header-only and exact choices freeze before persistent dispatch (40.0s)
2026-10-11T02:23:59.6381507Z   ✘   82 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:93:1 › F7 charge UI preserves exact signed decimals and multiline notes behind explicit confirmation (40.0s)
2026-10-11T02:24:14.9944547Z   ✘   81 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:71:1 › F13 static four root routes and retained related-loan contract preserve responsive order header busy query page Back and delete refresh (45.0s)
2026-10-11T02:24:25.1176774Z   ✘   84 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:90:1 › Page7 Dashboard source formats and collapsed Payments remain readable and accessible (6.4s)
2026-10-11T02:24:40.8340016Z   ✘   83 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:103:1 › F10 UI 10.00 source amount roundtrips through Notes-only edit with all8 fields and strict320 EN/Thai (40.0s)
2026-10-11T02:25:08.2924410Z   ✘   97 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:124:1 › F11 UI Dashboard exact groups zero-status suppression header busy and strict320 EN Thai (1.1s)
2026-10-11T02:25:18.0835648Z   ✘   87 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:151:1 › P6 T9 ordered management forms preserve flags and strict320 bilingual geometry without creating commands (45.0s)
2026-10-11T02:25:49.4462892Z   ✘   98 [desktop-chromium] › tests/e2e/phase5-borrower-independent.spec.ts:128:1 › F11 UI standalone Upcoming date groups exact detail scope global refresh errors and strict320 (40.0s)
2026-10-11T02:26:02.4236479Z   ✘  101 [desktop-chromium] › tests/e2e/phase5-offline-sdk-independent.spec.ts:8:1 › F12 actual Firebase SDK mixed-domain drafts and pending survive offline boot reconnect worker update then signout purges (12.5s)
2026-10-11T02:26:09.8803327Z   ✘  100 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:153:1 › P6 T9 financial form source order and payment-state choices remain distinct from explicit confirmation (45.0s)
2026-10-11T02:26:32.9472799Z   ✘  102 [desktop-chromium] › tests/e2e/pwa-canonical.spec.ts:4:1 › built canonical menu uses real waiting worker and only initiating tab reloads (30.0s)
2026-10-11T02:27:28.5073849Z   ✘  103 [desktop-chromium] › tests/e2e/phase5-final-ui-independent.spec.ts:154:1 › P6 T7 assessment hidden window stays readonly and stale recommendation is not presented as current (45.0s)
2026-10-11T02:27:35.9484605Z   ✘  110 [desktop-chromium] › tests/e2e/responsive-gaps.spec.ts:18:1 › tablet touch keyboard and narrow effective-viewport reflow gaps (1.1s)
2026-10-11T02:27:42.9470067Z   ✘  108 [desktop-chromium] › tests/e2e/receiving-ux-independent.spec.ts:34:35 › UX1 compact receiving screenshot and accessible controls 390px (1.0m)
2026-10-11T02:27:46.3901581Z   ✘  112 [desktop-chromium] › tests/e2e/startup-back-independent.spec.ts:40:1 › saved Close uses only global Back and active form disables waiting update without changing draft pending UUID (5.6s)
2026-10-11T02:28:01.7421964Z   ✘  114 [desktop-chromium] › tests/e2e/startup-generations-independent.spec.ts:40:1 › real startup gates reads across held metadata failed asset retry and three builds without forcing old edited tab (6.2s)
```

Historical503 cause remains unproven. No runtime apply, financial writes or PROD changes. B/C own coherent failure diagnosis and affected checks; final corrected consolidated proof remains pending.
