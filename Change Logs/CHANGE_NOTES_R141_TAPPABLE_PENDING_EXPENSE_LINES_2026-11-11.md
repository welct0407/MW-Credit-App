# Change notes — tappable pending expense lines (R141), 11 November 2026

## Purpose
After R140 the owner asked on 11 November 2026, "make both lines tappable in R141", then "test it in Dev and let me review." The Cash Position "Expenses payable" line and the borrower page "Expenses owed" line open the pending expenses behind the number. PWA and read service only; no SQL.

## Changes
- Read API (Byte, draft PR #286, head `5a9c9f2f`): `/api/expense-records` takes optional `payment=pending` and `payeeBorrowerId`. The pending rule is `expensePendingSql`. A bad, unknown or repeated parameter is 400. A filtered cursor is bound to its filter and is refused with 400 under another filter. The first filtered page returns the count and the amount.
- Offline list (`offline-dataset.ts`): applies the same filter, order and total.
- Cash Position: the "Expenses payable" line is a button "Show pending expenses" (Thai: "ดูค่าใช้จ่ายค้างจ่าย") that opens Expenses filtered to pending.
- Borrower page: the "Expenses owed" line is a button "Show pending expenses owed to <name>" (Thai: "ดูค่าใช้จ่ายค้างจ่ายให้ <name>") that opens Expenses filtered to pending and that payee.
- Filter bar: a chip, the payee name in the viewer's language, the count and amount, and "x Clear filter". Empty state: "No pending expenses." (Thai: "ไม่มีค่าใช้จ่ายค้างจ่าย"). Back returns to the line and re-reads the totals after a write.
- Tests (Byte): unit `expense-display-read` and the new `expense-list-filter-local`; integration `pending-expense-independent` (filters, paging, totals equal to the Cash Position and the borrower page, cursor misuse 400); e2e `dataset-replay-independent` and `phase5-borrower-independent`.
- Records (Dewey): this note, `Release_Tracker.md`, `Development_Changes.md`. No other document lists the expense list parameters. The R140 integration test `tests/integration/expense-offline-dataset-independent.test.mjs` (`8132d84`) is recorded in the R140 change note.

## Checks
| Command | Result |
| --- | --- |
| Byte's local checks | Pass: `npm test` 1294 pass and 1 skipped; typecheck; lint; builds; the receiving group; 14 e2e specs, 561 passed |
| CI, PR #286 head | To be added |
| DEV deployment and test | To be added, see DEV deployment evidence |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## DEV deployment evidence
To be added by Forge (image, Terraform, Hosting, smoke) and Chase's DEV test.

## Not run
No PROD action. CI and the DEV test are pending.

## Recovery
Git baseline: `main` at `cccc3b3` plus the R140 closure. Roll back the DEV images and Hosting to the previous generation recorded in the DEV deployment evidence. No SQL.

## Open questions
None.

## Remaining work
CI, the DEV deployment and test, and the owner's review in DEV; promotion only on the owner's instruction.
