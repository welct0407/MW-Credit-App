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

Scope: PWA only expected; no SQL, image or infrastructure change unless the design says otherwise. Forge is not involved (no infrastructure).

Team: Archie (design and test plan), Byte (code), Chase (verification), Dewey (records), Echo (UX review).

Design: to be recorded after Archie's design is accepted.

Files: to be recorded when Byte's code is final.

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
