# Change notes — DEV sync on open: refused receipts and header progress, 4 November 2026

## Purpose
The owner reported a long sync on every open in DEV and asked on 4 November 2026 (Asia/Bangkok) for an investigation and a client fix ("Go ahead"). This batch is the scope of release R121 (R120 was already Released): it is PWA Hosting only. The owner then said "push all the way to prod", which covers its promotion.

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
- Documents: Release Tracker and Development Changes (R121 rows), PWA Data Model Overview (offline preparation paragraph), Data Dictionary `systems/pwa/application.yaml` (coverage and progress text). Offline tag and schema digest are unchanged by this batch.

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
- Authenticated PROD read: not made (no PROD Partner token). The owner's first use is the acceptance.
- Live receipt behaviour on the owner's phone: not exercised before the push.

## Recovery
Revert the commit of this batch (Git baseline) and redeploy the prior Hosting version. Stored `dataset-media-refused` rows are harmless to the older client and are swept after 7 days. No database or server state changed.

## Open questions
- Whether to fix the server-side causes of the full walks (delta fallbacks, the Bangkok day-change re-read, management hourly analytics, notifications without an unchanged answer) and the DEV receipt reference format.

## Remaining work
- The owner's decision on the server-side causes of the full walks (delta fallbacks, the Bangkok day-change re-read, management hourly analytics, notifications without an unchanged answer) and the DEV receipt reference format.
- Owner acceptance: the first real use on the phone, in DEV and PROD.

## DEV promotion record (Forge, 4 November 2026, UTC)
Authority: the owner's instruction of 4 November 2026, "Yes go ahead and push all the way to prod". Hosting only; no SQL, images, Terraform, notify or jobs, VM or Metabase. No backup was needed (no database change). No financial correction, forced notification or backfill. No secret value or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Package | `main` at `3f885fa` (PR #232, same tree as `c9b34f0`) |
| Hosting | Version `f321bf286e369835`, release `1793797708475000`, live 13:08:28Z; build-version R121 (`41ea4a06483985cc287f5a6b`), entry `/assets/index-DiAwDlcr.js` |
| Rollback | Previous version `d31a99056a6794ce`; redeploy it |
| CI | `Development checks` run 41833753727 (`c9b34f0`): check, lint, e2e 3/3 green |

## PROD promotion record (Forge, 4 November 2026, UTC)
Authority: the same instruction. Private records are in the operator private bucket; no path is kept in Git.

| Step | Result |
| --- | --- |
| Freeze | The pinned generic-v1 frontend-only package at about 13:18Z, built from `3f885faad9c951d5664bdca670adfde7d9df7875`; baseline R120 `a36046c`; sha256 `6a5c4865…94a2` |
| Baseline | SQL readback of `loan_manager_prod`: head 135 of 135 at 13:18:12Z |
| Hosting | `--check` passed; `--apply` 13:18:33Z to 13:19:05Z; version `f8dd8e3f2900f9cb`, release `1793798339068000`, 16 files; public version `54e83780c75529228f2437c3`, entry `/assets/index-D3TGldol.js` embeds `3f885fa` |
| Rollback | Previous version `87c1ee148b69e49e` |
| Smoke (read-only) | `lm.mw-credit.com` and the web.app origin serve R121; `sw.js` no-store; `/health` 200 on read, command and chat; no PROD ERROR logs since 13:10Z |
| Unchanged | Cloud Run revisions (read, command, chat on the R120 image; notify and jobs on R119) and Flyway 135 |
| CI receipts | Check and e2e from run 41833753727 (`c9b34f0`); terraform from 41203206026 (`cb875ea`); database guards from 41806922523 (`5f3a34b`) |

### Limitations
- PROD acceptance is pending: the owner's first real use. No authenticated PROD read was made.
- DEV receipts stay refused until the DEV reference format or the server changes; the fix only stops the repeats.
- The server-side full walks are unchanged.

### Tag record
Tag `R121` on `3f885fa` (annotated tag object `0024db8db0cbfcf9e4ddb2a7b76b55fe7eaab531`) through Release tag workflow run 41837166568; the GitHub Release was published 13:20:34Z.

### Closure and prune record
Closure pull request on branch `claude/sync-receipt-refusal`, records only: tracker (R121 Released, R122 opened, next unused number R123), Development Changes, Environment Inventory (Hosting rows; Cloud Run and Flyway stated unchanged) and this note (renamed from `CHANGE_NOTES_DEV_SYNC_RECEIPT_REFUSAL_2026-11-04.md` to the release convention).
- Deleted: `Change Logs/CHANGE_NOTES_R118_LATE_CHARGES_2026-11-03.md` and `integration-agent/Change Logs/CHANGE_NOTES_R118_LATE_CHARGES_2026-11-03.md` (R118 left the three-release window). Their inbound links in the tracker, Development Changes, the Environment Inventory and the Solution Design were first repointed to the permalink at `3f885fa`.
- Deleted: `project/outputs/dictionary-r115-20261102/` (only the deleted R118 note cited it).
- Kept: the R119 and R120 notes (inside the window); the other dictionary evidence folders, still cited by Data Dictionary entries.
