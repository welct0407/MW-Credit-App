# Change notes — Collection sync quiet retry and receipts business date (R163), 16 November 2026

## Purpose
Owner request of 16 November 2026: "yes start it, include the receipts date issue". The header showed "Collection not updated" after one-off failures that recovered on the next cycle, and the desktop app asked for Collection receipts with yesterday's business date after midnight. The owner approved one immediate quiet retry of a failed data-domain check, and a current business date for receipts.

## Changes
Problem 1, header "Collection not updated" from one-off failures (evidence):
- 15 November 2026, 23:19:22Z: the PROD command service answered 503 `command_unavailable`; the cause was SQL 57014 (statement timeout, 8 s command budget) while Cloud SQL `db-g1-small` CPU reached 92% during three devices' simultaneous full syncs. It recovered 40 seconds later.
- 16 November 2026, 06:05:03Z: the Windows desktop PWA (R162) rejected a 200 Collection answer client-side after a manifest and need round trip (`dataset-failed collection "200 client 8671ms"`, from the owner's encrypted troubleshooting file, decrypted with `scripts/troubleshooting/decrypt.mjs`; the decrypted copy was deleted after reading). The next cycle at 06:05:18Z succeeded.
- Collection checks are routinely 2 to 5 seconds, the slowest domain, so the window for a one-off failure is the widest there.
- Owner-approved fix: one immediate quiet retry of a failed data-domain check before the header shows a failure, and the `dataset-failed` troubleshooting event records which client check failed.

Problem 2, receipts business date:
- 16 November 2026, 03:45:29Z: the desktop app called collection-receipts with `businessDate` of the previous day and the server answered 409 `business_date_changed`; the app was likely open since before midnight.
- Fix: use the current business date, and refresh after the day change.

Scope: PWA only; no SQL, API, image or infrastructure change. Forge is not involved (no infrastructure).

Team: Archie (design and test plan), Byte (code), Chase (verification), Dewey (records), Echo (UX review).

Design (Archie, settled; PWA only; no SQL, API, image or infrastructure change):
1. Quiet retry (`apps/pwa/src/offline-dataset.ts`). A data-domain check that fails transiently is re-queued once at the front with a 3 s hold (`DATASET_QUIET_RETRY_MS`). Transient means a network failure or timeout (status 0), a server error (500 or above), or the app rejecting an OK answer for any reason except `not_authorized` or `no_revision`. The domain is not marked failed during the hold, so the header, the progress bar, `lastChecked` and the announcements do not change. One retry per domain per success. 401/403, 400, 409 and 429 are handled as before. A tap or a read invalidation clears the hold. Offline, the existing pause applies. A new client event `dataset-retry` records the first failure. Only a failed retry leads to `fail()`: one `dataset-failed` event and the header warning.
2. Reason codes. The untagged client rejections in `run()` get fixed codes: `no_revision`, `not_authorized`, `token_failed`, `invalid_json`, `invalid_unchanged`, `save_refused`, `invalid_manifest`, `invalid_reference`, `manifest_changed` and `generation_changed`, `invalid_content`, `missing_content`, `unsupported_protocol`, `invalid_segment`, `invalid_delta`, `cursor_not_advanced`, `progress_refused`, `base_changed`; fallback `client`; an abort stays `timeout`. They appear in the `dataset-failed` and `dataset-retry` events and in the domain diagnostics `lastCode` of the troubleshooting file.
3. Receipts date. Root cause: `CollectionReceipts` took its date from `CollectionRecords` page state, which can hold yesterday from the saved offline bundle (`read-cache` falls back to `readOfflineDataset`, whose envelope carries the bundle's business date) or from board state set before midnight; the early `/upcoming` fetch in the cached callback used the same stale date. Fix: receipts always ask with the Bangkok date of today. On a 409 `business_date_changed` they retry once silently. "Retry receipts" uses today. A change of date alone keeps the receipts shown, and the section reloads quietly when the app becomes visible on a new Bangkok day. The early `/upcoming` fetch runs only when the cached date is today. Archie's optional relaxation of the board's date guard was not adopted (orchestrator decision: keep the change small); the "The business date has changed" screen stays the only message (Echo R163-UX-09).
4. Echo R163-UX-01 to UX-10 are adopted; UX-08 and UX-10 are covered by item 3. The device check is iPhone WebKit only.
5. Roles. Byte owns `offline-dataset.ts`, `client-events.ts`, `CollectionReceipts.tsx` and `CollectionRecords.tsx`. Chase owns `tests/unit/offline-dataset-coordinator.test.mjs`, `tests/unit/troubleshooting.test.mjs` and `tests/e2e/collection-read.spec.ts`. Forge is not applicable.

Files:
- Code (Byte): `apps/pwa/src/offline-dataset.ts`, `apps/pwa/src/client-events.ts`, `apps/pwa/src/CollectionReceipts.tsx`, `apps/pwa/src/CollectionRecords.tsx`.
- Tests (Chase): `tests/unit/offline-dataset-coordinator.test.mjs`, `tests/unit/troubleshooting.test.mjs`, `tests/e2e/collection-read.spec.ts`.
- Documents (Dewey): this note, `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `project/Documents/PWA_Data_Model_Overview.md`. The data dictionary is unchanged (no column, constraint or routine change).

Data rules: no borrower data, account identifiers, addresses or secrets are recorded here; tests use invented data only.

## Checks
| Command | Result |
| --- | --- |
| to be filled after verification | pending |

## Not run
To be filled after verification.

## Recovery
Git baseline `main` `2d8dc0f`. A PWA-only release is undone by redeploying the previous Hosting version recorded in the [environment inventory](../project/Documents/Environment_Inventory.md); no backup is expected.

## Open questions
None so far.

## Remaining work
Design, code, review, checks, DEV deployment record and closure.
