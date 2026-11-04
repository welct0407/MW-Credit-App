# Change notes — DEV sync on open: refused receipts and header progress, 4 November 2026

## Purpose
The owner reported a long sync on every open in DEV and asked on 4 November 2026 (Asia/Bangkok) for an investigation and a client fix ("Go ahead"). This batch rides the Open release R120: it is PWA Hosting only, and the workflow keeps one Open release for product work. No new release number.

## Changes
Findings (read-only; DEV logs 28 October to 4 November and the DEV change log read as `codex-cloud-read`):
- Cold starts are ruled out; the monitor keeps the services warm.
- Every receipt request from the owner's phone in DEV (5,678 in 7 days) returned 422 `receipt_reference_unsupported`, because DEV references are not in a DEV-readable format. The client remembered failures only in memory, so 120 to 165 receipts were re-requested on each open and the header bar stayed up through the data check.
- Most opens also walked a full dataset: test clients (node about 69%, test browsers 12%, curl) delete rows or touch more than 8 borrowers between opens and trip the delta fallbacks; the first open of a Bangkok day takes the day-change re-read; management walks on hourly analytics (xmin hashing); notifications has no unchanged answer. The change log is healthy (no gaps or truncates, never near 2,000 rows).
- Server-side fixes are not in this batch; the owner decides.

Fix (PWA client only; no SQL, server or infrastructure change):
- `apps/pwa/src/offline-dataset.ts`: a receipt refused with HTTP 422 `receipt_reference_unsupported` is remembered per receipt version and not asked for again on open, poll or focus for 24 hours (`RECEIPT_REFUSAL_MAX_AGE_MS`; a marker dated ahead of now counts as expired), so a refused receipt is requested at most once a day; the marker read is retried if the first read fails; a changed receipt downloads normally; Full sync clears the markers and retries once. Any other failure (503, timeouts, network, auth) keeps the normal retry, so PROD behaviour for temporary failures is unchanged. The progress follows the data domains only (the 80/20 receipt share is removed) and the preparation state carries `dataReady`. A receipt time that does not parse counts as version 0.
- `apps/pwa/src/owner-offline.ts`: IndexedDB kind `dataset-media-refused` with read, save, remove and clear helpers, swept with offline read data after 7 days and removed by a purge.
- `apps/pwa/src/SyncStatus.tsx`: the first-download bar ends with the data domains (UX-HOLD-07).
- The on-screen receipt view still asks the network.
- Tests: `tests/unit/offline-dataset-receipts.test.mjs` (new), `tests/unit/offline-dataset-coordinator.test.mjs`, `tests/e2e/back-consumers-independent.spec.ts` (Byte).
- Documents: Release Tracker and Development Changes (R120 rows), PWA Data Model Overview (offline preparation paragraph), Data Dictionary `systems/pwa/application.yaml` (coverage and progress text). Offline tag and schema digest are unchanged by this batch.

Noted, not changed: `services/payment-command/handler.mjs` line 5 lists known error codes without `receipt_reference_unsupported`, so request logs show `command_unavailable` for these refusals.

## Checks
| Command | Result |
| --- | --- |
| `npm run check:docs` (Dewey, working tree before the push) | Pass |
| Unit `offline-dataset-receipts` (10) and coordinator (28) (Byte) | 38 pass |
| Typecheck and lint (Byte) | Clean |
| `npm test` (Byte, earlier tree) | 1146 pass |
| `payment-command.spec` "Full app preparation…" (Byte, after the update) | 2 pass |
| Targeted e2e back-consumers, refresh-hold, full-sync (Chase) | 118 pass |
| Targeted e2e offline-delta and own-receipt-seed (Chase) | 50 pass |
| CI `Development checks` | Comes with the pull request |

## Not run
- Live receipt behaviour on the owner's phone: not exercised before the push.
- PROD: nothing run; Hosting for PROD follows the owner's promotion instruction for R120.

## Recovery
Revert the commit of this batch (Git baseline) and redeploy the prior Hosting version. Stored `dataset-media-refused` rows are harmless to the older client and are swept after 7 days. No database or server state changed.

## Open questions
- Whether to fix the server-side causes of the full walks (delta fallbacks, the Bangkok day-change re-read, management hourly analytics, notifications without an unchanged answer) and the DEV receipt reference format.

## Remaining work
- Push with Byte's check evidence; deploy to DEV with R120's Hosting; the owner decides the server-side items; PROD follows the R120 promotion instruction.
