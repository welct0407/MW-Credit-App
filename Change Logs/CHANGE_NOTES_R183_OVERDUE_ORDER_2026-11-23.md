# Change notes — R183 Overdue group ordered like Long overdue, 23 November 2026

## Purpose
Owner question of 23 November 2026: "How is the overdue category list sorted? Why the people paid most recently is not on the top? Is long overdue list also sorted in the same way?" The answer given: Overdue was sorted by name, Long overdue by the days since the last payment, fewest first. Owner scope: "Align with long overdue". Promotion authority: "Push to prod when ready" (DEV first, then PROD, when verified). Built, not deployed.

The same day the owner accepted R182 in PROD: "All are fine." It is recorded in this pull request (release tracker, development changes, solution design).

## Changes
Commits `fb23f1f` and `6862ea6` on `main` `83f02c8` (R182 closed). Read service only; no PWA, SQL, Hosting or infrastructure change.
- `services/api/collection-read-contract.mjs`: within the Overdue group the board sorts by the days since the last payment, fewest first, then name, then id, as Long overdue does. A row with no usable count (its tile says plain "Overdue") takes sort key 8, the long-overdue threshold, and sorts last; a never-paid row sorts by the days since its first charge. The other groups are unchanged.
- The board's keyset cursor is version 6. A version 5 cursor is refused: the board answers 400 and the PWA reloads page 1 once. A cursor exists only when the board has more than 100 rows.
- `services/business/offline-dataset-chunks.mjs`: an offline dataset walk that holds a refused collection cursor answers `dataset_changed` (409), so the PWA restarts that domain from the first chunk. Before, it would have answered 503 and been retried until the day change. A failing read still answers 503 and is logged.
- `services/business/offline-dataset-delta.mjs`: `OFFLINE_DATASET_SHAPE` is `business-offline-v14` (server only; R116 and R165 precedent). Each device walks every data domain once on its next sync, so it gets the new order instead of keeping the old one until the next collection or day change. Saved receipt images and queued offline writes are in separate stores and untouched.
- Test only: three stale expectations in `tests/integration/collection-postgres.test.mjs` fixed (a future charge part-paid today is fully paid since R110; items carry `prepaidPaymentDate` and `chatSummaryAt`; the fixture lacked `"Default Loss Amount"`). The file has no CI group; it runs locally through `tests/integration/Run-Collection.ps1`. This closes the R182 limitation "three pre-existing local-only failures". Unit tests updated: `tests/unit/collection-read.test.mjs`, `collection-receiving-display.test.mjs`, `offline-dataset-delta.test.mjs`, `production-business.test.mjs`, `search-query.test.mjs`.
- Deploy set at promotion: the read and command services (command imports the contract). No Hosting, so no update prompt.
- Documents updated: `project/Documents/Release_Tracker.md`, `project/Documents/Development_Changes.md`, `project/Documents/Solution_Design.md`, `docs/Development_Read_Service.md`, `project/Documents/Data Dictionary/systems/pwa/human-api.yaml` (with the index), and the R182 change note (owner acceptance).

## Checks
| Command | Result |
| --- | --- |
| `npm run lint` (Byte, `6862ea6`, clean tree) | Clean |
| `npm run typecheck` (Byte, `6862ea6`) | Exit 0 |
| `npm test` (Byte, `6862ea6`) | 1,424 pass, 1 skipped |
| `Run-UnifiedReceiving.ps1`, the CI `receiving` group (Byte, `6862ea6` content) | Exit 0 |
| `Run-Phase5.ps1 -ManagementOnly`, the CI `phase5` group (Byte, `6862ea6` content) | Exit 0 |
| `tests/integration/collection-postgres.test.mjs` (Byte, `fb23f1f` content) | 27 pass, 0 fail |
| `dictionary.py index` and `validate` (Dewey) | 0 errors across 505 documents |
| `npm run check:docs` (Dewey) | 0 failures, 0 warnings |
| Chase verification | Pending |
| Pull request `Development checks` and Database runs | Pending (no pull request is open) |
| DEV deploy and a look at the visible order on DEV | Pending |

## Not run
- The wide local browser suite (by rule). `tests/e2e/collection-read.spec.ts` mocks the server order and cannot prove the sort.
- No Echo review: no layout or copy change, the owner specified the order. Forge is not involved until the deploy.
- The time of the one-off walk of every data domain was not measured.
- No DEV or PROD action yet. A skipped check is not a pass.

## Recovery
Git baseline `main` `83f02c8` (R182). Redeploy the previous read and command image. Read from the code, not exercised: a device then holds a v14 bundle against a v13 server, whose shape stamp it does not match, so it walks every data domain once more and gets the name order back; an online board page 2 request holding a version 6 cursor is refused with 400 and the PWA reloads page 1; an offline walk caught mid-way with a version 6 cursor (only above 100 board rows) meets the old 503 until it restarts. No SQL, Hosting or data change to undo.

## Open questions
None for the owner.

## Remaining work
Chase's verification; the pull request and its CI runs; the DEV deploy and a look at the visible order on DEV; PROD under "Push to prod when ready"; closure records and owner acceptance. For Byte to confirm: the rollback behaviour described under Recovery.
