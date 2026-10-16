# Change notes: R063 Wave 1 app fixes (2026-10-15)

## Purpose

Fix the app findings from [the app review](CHANGE_NOTES_REVIEW_APP_2026-10-15.md) that can lose a saved payment, sign the owner out wrongly, or delay a committed payment. No schema, grant or migration change. Branch `claude/review-w1-app`, baseline `a029880`.

## Changes

Each behaviour change has a focused test that failed on the old code and passes now.

- **APP-OFFLINE-01** (`652da9f`): an involuntary purge (session expiry, read or command 403, auth observer null or UID switch) keeps `pending:*` rows with their receipt images. `apps/pwa/src/owner-offline.ts`, `apps/pwa/src/live-main.tsx`. Tests: `offline-purge-keeps-pending-independent.spec.ts` (involuntary purge keeps pending; plain purge still removes it) and `live-expired-session-keeps-pending.spec.ts`.
- **APP-OFFLINE-02** (`652da9f`, `ef63f85`): Sign out is disabled while any saved change exists and reads "Sync N pending first". `sign-out-guard.ts`, `WaitingToSyncButton.tsx`, `live-main.tsx`. Tests: `tests/unit/sign-out-guard.test.mjs`, `live-signout-blocked-independent.spec.ts`. Fix-round items:
  - The header affordance is renamed "Sync saved changes" / "ซิงค์รายการที่บันทึก", so it no longer shares a name with "Sync now" on the saved-changes screen.
  - A "Review saved changes" link opens that screen in every blocked state, including denied (`OfflinePayments.tsx` lists rows without a verified lease; no new way to remove attempted rows).
  - Sign-out fails closed: if the pending list cannot be read, it shows the sign-out error and does not purge (test: "sign-out fails closed when the pending list cannot be read").
  - After a keep-pending purge the repository is revoked, so the next sign-in (same UID too) gets a fresh one without a reload (test: "denied session keeps saved changes reviewable and a same-UID re-sign-in syncs them").
  - The G07 spec in `payment-command.spec.ts` is rewritten to the owner decision.
- **APP-AUTH-01** (`323095f`, `d7c9b39`): only definite Firebase token or user errors return 401 `session_invalid`; every other verifier failure returns 503 `session_check_unavailable`. New `services/api/session-check.mjs`; the four verifiers and the command, foundation, read and notification handlers. Follow-up: firebase-admin maps a public-key fetch failure to `auth/argument-error`, so that code is definite only for the library's own token-validation messages. Tests: `session-check-unavailable.test.mjs`, `session-check-key-fetch.test.mjs`.
- **APP-PAY-01** (`8906884`, `2f23fca`): a stalled body returns 503 `body_timeout` instead of 400, so the saved payment stays queued. Raw receipt bodies get 12 s, JSON stays 5 s. `ReceiptPicker` downscales PNG/JPEG to about 1600 px JPEG under 1 MiB (`receipt-image.ts`) and keeps the original if the result is not smaller. Receipt preparing state: the picker shows "Preparing receipt…" and the four receipt forms hold Review/Confirm/Save until the file is attached. Tests: `command-body-timeout.test.mjs`, `receipt-image.test.mjs`, `offline-sync-outcomes.test.mjs` (503 stays queued, 400 blocks), and the e2e "G07 receipt downscale shows a preparing state…".
- **APP-PAY-02** (`099da52`): the post-commit wake runs after the response, capped at about 1.5 s; failures stay `deferred_to_recovery` and the minute worker recovers them. `services/payment-command/store.mjs`. Tests: `notification-wakeup.test.mjs`, `postcommit-order.test.mjs`.
- **APP-PAY-04, W1 part** (`099da52`): receipt upload/retrieve and the source-image download run outside database transactions, after short authorizing transactions. `paymentImage` re-checks the row and actor afterwards. `resolveReceipt` inside submit/operation/metadata is deliberately unchanged and deferred. Test: `receipt-store-transaction.test.mjs`.
- **APP-DATE-01** (`4012558`): the receipt-time CASE is selected `::text` in three read models, ending the 7 h shift. `collection-receipts.mjs`, `offline-dataset-chunks.mjs`, `offline-dataset.mjs`. Test: `receipt-at-text.test.mjs`.

`1b65876` only fixes a mobile drawer timing step in the sign-out spec.

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck, build, units | `npm run check` | `tests 459, pass 459, fail 0` |
| Local e2e (24 specs, desktop and mobile Chromium) | Playwright, runnable specs only | `340 passed, 5 skipped, 1 failed`. The failure was a mobile drawer timing issue in the new sign-out spec. Fixed in `1b65876`; re-run twice on both projects, 12/12 |
| CI run 253 on `652da9f` | `workflow_dispatch` | 438 passed, 11 skipped, 9 failed. 8 regressions, all fixed in the fix round. P6 T9 also fails on `main` run 251 |
| Old-code confirmations (Agent C) | Each focused test above run against `a029880` source | Each failed on the old code and passes now |
| Independent re-test after fix round (Agent C) | `npm run check`; 24 runnable specs, both projects; key-fetch and 12-token allowlist probes against real firebase-admin 14.5.0 | `tests 459, pass 459`; `341 passed, 5 skipped`, 0 failed; key-fetch outage gives 503 `session_check_unavailable`; all 12 bad tokens give 401 |
| CI run 254 on `1b65876` (fix round) | `ci.yml` `workflow_dispatch`, run id 38812793799 | Success: every step passed, including `test:e2e` (canonical-server specs included) and the Terraform `fmt`/`init`/`validate` steps |
| DEV deploy | Cloud Build `938d2cfc-f0e1-4c54-abc0-95d865da490e` (`cloudbuild-command.yaml`, smoke step passed) from clean `9c5a95f` (docs-only diff from tested `1b65876`); `Invoke-Terraform.ps1 -Stack dev` saved plan (0 add, 2 change image-only, 0 destroy), apply, `-PublishActivation`; `node scripts/deploy-hosting.mjs --live-dev` | Image `api@sha256:abe733302ac10be410511254e9b7b81649b1fc3bcb03b10d320972092aaa1b5e`; command `mw-credit-app-command-dev-00028-8tf` and read `mw-credit-app-read-dev-00021-cdz` Ready, 100% traffic; Hosting version `6dafe1d0cf4926ac`, release `1792102167263000`, build `3a744a3681827bdb023b51c2`, entry `index-B-W-6qX6.js`; activation publish matched |
| DEV bounded smoke (unauthenticated) | `/health` both services; command `/api/preferences`, `/api/offline-dataset`, `/api/management/cash-position` and read `/api/borrowers` without and with an invalid token; `OPTIONS` from `dev-lm` and a foreign origin; `build-version.json`, entry, `index.html`, `sw.js`; Cloud Logging errors since deploy | 200 / 200; 401 `sign_in_required` and 401 `session_invalid`; 204 with DEV origin, 403 foreign; new build and entry served, `sw.js` new version `no-store`; no ERROR entries |
| CI run 255 on `6030ed6` (owner-decision commit) | `ci.yml` `workflow_dispatch`, run id 38842458379, attempts 1 and 2 | Attempt 1: 458 passed, 11 skipped, 1 failed (F1 desktop, `phase5-borrower-independent:59`, "Sync now" detached during a re-render; passed 8/8 locally and in run 254). Attempt 2 (failed-job rerun): F1 passed; 458 passed, 11 skipped, 1 failed: P6 T9 desktop (`phase5-final-ui-independent:257`), which fails identically on `main` run 251 (pre-existing, ALL-CI-01). No failure attributable to this branch |
| DEV Hosting update for `6030ed6` | fresh worktree; `npm run build:live-dev`; `node scripts/deploy-hosting.mjs --live-dev` (check, then release); image and Terraform unchanged | Version `edf06b9da5841b1d`, release `1792120937117000`, build `5f48bad14204b77c843d0474`, entry `index-DJ9BQL4y.js`; `build-version.json`, entry, `index.html` 200 and new; `sw.js` new version `no-store`. Rollback: `6dafe1d0cf4926ac` |

## Not run

| Item | Reason |
| --- | --- |
| Canonical-server e2e specs here (APP-TEST-01) | Chromium tunnels through the sandbox proxy and loads the real DEV site. They ran in CI instead |
| WebKit / iPhone | Not installed |
| Authenticated DEV smoke | No DEV test identity; both DEV services accept only the owner account |
| `tests/integration` against PostgreSQL | No SQL change except `::text` casts, covered by unit SQL assertions |
| PROD | Not authorized |

## Recovery

Git baseline `a029880`; revert the wave commits. UI and API only, no database change. DEV rollback pins (see `Environment_Inventory.md` DEV rows):

- Command image `api@sha256:ec92f1dd7cdb0285626ddb99f81a3e6dc7a6ee30aee61a88df1d66beff9a1494`, revision `mw-credit-app-command-dev-00027-8sb`.
- Read image `api@sha256:60c9f6c7cfe701264a5add48de2934fa18db8b418652e5622b054a2a40eb0958`, revision `mw-credit-app-read-dev-00020-m9t`.
- Hosting version `8b12e5b06d79592a`.

## Open questions

None open. Owner decisions, 16 October 2026:

1. Yes: a blocked saved change that was already sent, with no recorded rejection, may be removed after a stronger confirmation that it may or may not have been applied. Implemented in `6030ed6` (`apps/pwa/src/OfflinePayments.tsx`): "Remove saved change" shows for every blocked row (never queued or syncing); rejected and unsent rows keep the old text; the read-only screen after a 403 hides the button and shows the lock text. Test `tests/e2e/saved-change-discard-independent.spec.ts` (3 tests, both projects) failed on the old code and passes now.
2. PROD notify minute recovery checked read-only on 16 October 2026: Cloud Scheduler `mw-credit-app-prod-notifications` is `ENABLED`, `* * * * *` Asia/Bangkok, last attempt 02:42 UTC finished HTTP 200, no ERROR attempts in the last 24 hours. APP-PAY-02 can rely on it.

## Remaining work

- APP-PAY-04: `resolveReceipt` inside submit/operation/metadata (W2/W3).
- UX recommendations from Agent E, for W5; they do not authorize implementation:
  - W1-UX-SIGNOUT-01: the disabled button looks enabled.
  - W1-UX-SIGNOUT-02: the desktop label is below the fold.
  - W1-UX-SIGNOUT-03: separator from the language switch when nothing is pending.
  - W1-UX-SIGNOUT-04: collapsed-nav badge.
  - W1-UX-EXPIRED-01: mention that saved changes are kept.
  - W1-UX-AUTH-01: outage wording.
- Minor: the notifications handler does not guard a null principal. `cpu_idle=true` on DEV/PROD command may delay the background wake; minute recovery covers it.
- Re-test leftovers (Agent C, low): on a device where IndexedDB cannot open, sign-out fails closed every time and only clearing site data exits (`live-main.tsx` ~:341); allow sign-out after an explicit confirmation when storage cannot open. The read-only denied-screen remove issue is fixed in `6030ed6`.
- Authenticated DEV check by the owner on a device: offline queue through a session expiry, sign-out guard, receipt downscale, and a payment write.
- PROD promotion with R063.
