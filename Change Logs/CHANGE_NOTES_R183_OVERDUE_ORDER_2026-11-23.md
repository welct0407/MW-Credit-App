# Change notes — R183 Overdue group ordered like Long overdue, 23 November 2026

## Purpose
Owner question of 23 November 2026: "How is the overdue category list sorted? Why the people paid most recently is not on the top? Is long overdue list also sorted in the same way?" The answer given: Overdue was sorted by name, Long overdue by the days since the last payment, fewest first. Owner scope: "Align with long overdue". Promotion authority: "Push to prod when ready" (DEV first, then PROD). Deployed to DEV and promoted to PROD on 23 November 2026 (pull request #382, merged as `main` `6e7d8b5c`); owner acceptance of R183 in PROD is pending. Promotion authority: "Push to prod when ready" (DEV first, then PROD, when verified). Built, not deployed.

The same day the owner accepted R182 in PROD: "All are fine." It is recorded in this pull request (release tracker, development changes, solution design).

## Changes
Commits `fb23f1f`, `6862ea6` and `0b76fb8` on `main` `83f02c8` (R182 closed), merged in pull request #382 as `main` `6e7d8b5c` (tree equal to the tested and DEV-deployed `0b76fb8`). Read service only; no PWA, SQL, Hosting or infrastructure change.
- `services/api/collection-read-contract.mjs`: within the Overdue group the board sorts by the days since the last payment, fewest first, then name, then id, as Long overdue does. A row with no usable count (its tile says plain "Overdue") takes sort key 8, the long-overdue threshold, and sorts last; a never-paid row sorts by the days since its first charge. The other groups are unchanged.
- The board's keyset cursor is version 6. A version 5 cursor is refused: the board answers 400 and the PWA reloads page 1 once. A cursor exists only when the board has more than 100 rows.
- `services/business/offline-dataset-chunks.mjs`: an offline dataset walk that holds a refused collection cursor answers `dataset_changed` (409), so the PWA restarts that domain from the first chunk. Before, it would have answered 503 and been retried until the day change. A failing read still answers 503 and is logged.
- `services/business/offline-dataset-delta.mjs`: `OFFLINE_DATASET_SHAPE` is `business-offline-v14` (server only; R116 and R165 precedent). Each device walks every data domain once on its next sync, so it gets the new order instead of keeping the old one until the next collection or day change. Saved receipt images and queued offline writes are in separate stores and untouched.
- Test only: three stale expectations in `tests/integration/collection-postgres.test.mjs` fixed (a future charge part-paid today is fully paid since R110; items carry `prepaidPaymentDate` and `chatSummaryAt`; the fixture lacked `"Default Loss Amount"`). The file has no CI group; it runs locally through `tests/integration/Run-Collection.ps1`. This closes the R182 limitation "three pre-existing local-only failures". Unit tests updated: `tests/unit/collection-read.test.mjs`, `collection-receiving-display.test.mjs`, `offline-dataset-delta.test.mjs`, `production-business.test.mjs`, `search-query.test.mjs`.
- `0b76fb8` (test tooling): `tests/integration/collection-postgres.test.mjs` now runs in the CI `receiving` group through `Run-UnifiedReceiving.ps1` (a second database `collection_fixture` on the disposable cluster; `Run-Collection.ps1` remains the manual route). This closes Chase's top gap: the only real-SQL proof of the keyset ran in no CI group.
- Deploy set: the read, command and chat services (the role derivation `generic-roles.mjs` gives all three: command imports the contract and chat's entry point reaches the changed files). No Hosting, so no update prompt.
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
| `collection-postgres.test.mjs` inside `Run-UnifiedReceiving.ps1` (Byte, `0b76fb8`, local) | 27 of 27 |
| Chase verification of `83f02c8..6862ea6` | Go, no defect: the keyset and the ORDER BY use the same key; the validator accepts exactly what the SQL emits; the 409 mapping is limited to the held cursor's refusal and cannot loop; the shape bump leaves `pending:*` and `dataset-media:*` untouched; the three test-expectation fixes are honest |
| `Development checks` run 45181993734 (PR #382 head `0b76fb8`) | `Development checks result` success; check and lint ran; the e2e stages reused the evidence of run 45064865698; Terraform evidence run 44874582128 |
| Database run 45181960313 (`0b76fb8`) | All four groups success |
| DEV smoke (Forge, 23 November 2026) | Pass: see the DEV deployment record |
| DEV upgrade check (Chase, 13:35Z to 13:39Z, iPhone 17 Pro Max WebKit, the read-only DEV agent route, nothing written) | Pass. Before the deploy a persistent profile held a complete v13 bundle (stamp `5a9e000d`) for collection, records, cash and management. After it: workspace at 0.3 s and board at 1.2 s from the saved bundle; one walk, the four domains complete at 42, 52, 59 and 62 s, stamp `5a9e000e` (v14); 37 dataset requests, all 200, no 409, no 503, no retry; no user-facing error; 43 tiles, totals present, the Long overdue order unchanged; `pending:*` and `dataset-media:*` still 0; a second open does not walk again; no ERROR or unavailable log entries |
| PROD verification and watch (Forge, 13:40:30Z to 13:53:30Z, read-only) | Pass: see the PROD promotion record |

## Not run
- The visible Overdue order was not seen on DEV (DEV has 43 Long overdue tiles and no plain Overdue tile) or on PROD (no authenticated read). It waits for the owner's first use.
- The first real offline walk on PROD is unobserved: no device synced in the watch window (0 `/api/offline-dataset` requests).
- No real offline walk of more than 100 board rows crossing the Overdue boundary (Chase: covered by composing proven parts).
- The wide local browser suite (by rule). `tests/e2e/collection-read.spec.ts` mocks the server order and cannot prove the sort.
- No Echo review: no layout or copy change, the owner specified the order.
- A skipped check is not a pass.

## Recovery
Git baseline `main` `83f02c8` (R182). Apply the previous activation file (image only: read, command and chat); nothing to undo for SQL or Hosting. Known gap (Chase): after a rollback to the R182 services a device mid-walk holding a version 6 cursor gets 503 until the day change. Read from the code, not exercised: a device then holds a v14 bundle against a v13 server, whose shape stamp it does not match, so it walks every data domain once more and gets the name order back; an online board page 2 request holding a version 6 cursor is refused with 400 and the PWA reloads page 1; an offline walk caught mid-way with a version 6 cursor (only above 100 board rows) meets the old 503 until it restarts. No SQL, Hosting or data change to undo.

## Open questions
None for the owner.

## Remaining work
Owner acceptance of R183, written into the next release's closure or product pull request. The owner's first use is the first check of the visible Overdue order and of a real offline walk on PROD.

## DEV deployment record (Forge, 23 November 2026 UTC)
Authority: the owner's "Push to prod when ready" (DEV first). Identifiers verified: project `clever-oasis-508610-n7`, services `mw-credit-app-{read,command,chat}-dev`, database `loan_manager_dev`. Source `0b76fb8`. Revisions and the image digest are in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Before | Flyway 154 (13:29Z), 0 failed; no migration, no backup |
| Image | Cloud Build `c0aa98d0-c193-4be1-b77e-1a043a4afc6c`, 13:30:11Z to 13:30:43Z (R183) |
| Cloud Run | Before-plan no change; plan 0 added, 3 changed (read, command, chat), 0 destroyed, image only; apply 13:32:28Z to 13:33:05Z; re-plan clean; activation file uploaded |
| Smoke | `/health` of the three on R183 `0b76fb8`; 401 without a token; notify, jobs and Hosting unchanged; Flyway 154; no ERROR logs since 13:30Z |

Rollback: the previous activation file, image only.

## PROD promotion record (Forge, 23 November 2026 UTC)
Authority: the owner, 23 November 2026: "Push to prod when ready". Scope: the read service code of R183 (derived roles: read, command, chat). No SQL, backup, Hosting, notify, jobs, agent, Grafana or infrastructure change; no authenticated read, financial write or forced notification.

Package: `main` 6e7d8b5c694c6fa67419ac0a16222f01a3ccdfb9 (PR #382, tree equal to the tested and DEV-deployed `0b76fb8`). Baseline: tag R182 `546a8bfd`. Target: project `clever-oasis-508610-n7`, services `mw-credit-app-{read,command,chat,notify,jobs}-prod`, database `loan_manager_prod` on `mw-credit-pg-20261017`, Hosting site `mw-credit-prod-737787224638`. CI evidence: see Checks. Private package `promotion-packages/r183/` (outside Git). Revisions and the image digest are in the [Environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Before | Flyway 154 (13:40Z), 0 failed; no backup (no database change) |
| Image (first live step) | PROD build `d0094ce9`, 13:40:43Z to 13:41:17Z (R183) |
| Cloud Run | Before-plan no change; plan 0 added, 3 changed (read, command, chat), 0 destroyed, image only; apply 13:42:44Z to 13:43:20Z; re-plan clean; activation file uploaded |
| Hosting | Not deployed and the Hosting runner not run (no frontend change; R181 precedent), so no update prompt; the three PROD origins stay on the R182 PWA build |
| Verified, read-only | `/health` of the three on R183 `6e7d8b5`; 401 without a token; notify and jobs unchanged on their pins; Flyway 154 after |
| Watch 13:40:30Z to 13:53:30Z, five services | 0 ERROR, 0 unavailable entries, 0 responses of 409 or higher, 0 `/api/offline-dataset` requests: no device synced in the window |

Rollback: the previous activation file, image only; nothing for SQL or Hosting.

## Tag record (Dewey, 23 November 2026)
Annotated tag `R183` (object `7f8421c4`) on `main` `6e7d8b5c694c6fa67419ac0a16222f01a3ccdfb9`, started as Release tag workflow run 45188615095; it exists on origin (`git ls-remote --tags origin R183`, read at closure).

## Closure records (Dewey)
- Environment inventory: the R183 Cloud Run rows for DEV and PROD (the R182 rows are now previous) and the component versions regenerated (`render --write`, `render --check`: R183). Hosting and Flyway rows unchanged.
- Pruned at closure (Open R184 plus the three newest Released: R183, R182, R181): `Change Logs/CHANGE_NOTES_R180_RECEIPTS_YESTERDAY_CARD_2026-11-21.md`, with its links (release tracker, environment inventory) repointed to permalinks at `6e7d8b5c`; the R180 follow-up row of the open development changes is removed (owner-accepted, nothing open). No evidence directory was deleted.
- Data Dictionary: `systems/pwa/human-api.yaml` `overdue_order` marked released; `index` and `validate`: 0 errors across 505 documents. No schema object changed.
- Drift (`component-versions.mjs drift --env all --strict`, Forge, with the R183 tag present): drift 0, unverified 3. Matched in DEV and PROD: PWA (R182), read, command and chat (R183), notify and jobs (R175), schema 154 (the Flyway heads are the earlier readbacks of the same day, not re-read). Unverified because not read: the PROD agent, the Grafana dashboards and the Metabase reports (none changed in R183).
