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

## Rebates payable line (owner review in DEV, 11 Nov)
Owner on the DEV review: "rebate payable can't be clicked. expenses payable can be clicked." The owner chose (asked): tapping it opens the Referrers list filtered to referrers still owed. Byte, `73eef152`; PWA and read service only; no SQL.
- Read API: `GET /api/referrers?owed=1` lists referrers with `pwa_rebates_owed_v1` above 0 and returns the filter total (the count of referrers and the amount), which equals the Cash Position `rebatesPayable` before and after a settlement. Any other `owed` value, an unknown parameter or a repeated parameter is 400. There is no cursor (the list is not paged) and no offline filter (the offline bundle has no referrer list).
- Cash Position: the "Rebates payable" line is a 44 px button "Show referrers owed rebates" (Thai: "ดูผู้แนะนำที่ค้างจ่ายค่าแนะนำ").
- Referrers: a filter bar with the chip "Owed rebates" (Thai: "ค้างจ่ายค่าแนะนำ"), "N referrers · ฿X" and "x Clear filter"; empty state "No rebates owed." (Thai: "ไม่มีค่าแนะนำค้างจ่าย"); Back returns to Cash Position. After a settlement, Back re-reads the filtered list and the Cash Position.
- Tests (Byte): unit `rebate-settlement.test.mjs`; integration `rebate-settlement-independent` (total equals `rebatesPayable`, a settled referrer leaves the list, `owed=yes` is 400); e2e `dataset-replay-independent` (tap, filter, clear, settle, empty, Cash Position 0).
- Local checks (Byte): `npm test` 1295; typecheck, lint, builds and the receiving group pass; 8 e2e specs, 377 passed.
- CI, DEV deployment and DEV test for this addition: to be added.

## Checks
| Command | Result |
| --- | --- |
| Byte's local checks | Pass: `npm test` 1294 pass and 1 skipped; typecheck; lint; builds; the receiving group; 14 e2e specs, 561 passed |
| CI, PR #286 head `5a9c9f2f` | Pass: `Development checks` run 43022545287 (check, lint, three Chromium and three iPhone WebKit e2e shards), `Database migrations` run 43022475359 (guards and four rebuild groups); records-only `0d3a6641` also green |
| DEV deployment and test | Pass, see DEV deployment evidence |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey) |

## DEV deployment evidence
Forge, 11 November 2026 (UTC), package `5a9c9f2f`; no SQL (DEV stays V145).
- Image: Cloud Build `313f3e3b-9049-474b-bb4d-8a6298cdde38`, digest `sha256:f24b158bd3203b28953d294f940524a4f0d4478b67ae55b73291888a2b644fa0`.
- Terraform: 0 add, 3 change, 0 destroy (image only on read, command, chat), applied 12:55:44Z to 12:56:21Z, clean re-plan; settings generation `1794401786919940` (previous `1794381248339048`); revisions read `00088-6mt`, command `00105-wlr`, chat `00057-mmf`; notify and jobs unchanged.
- Hosting: version `99f4e84fd8c1d515` (build version `e2c6168b6d89aeecac7a9a4d`, labelled R141), 12:57:14Z to 12:57:22Z.
- Smoke: both origins serve R141; `/health` 200, unauthenticated 401, CORS 204; no ERROR logs. `GET /api/expense-records?payment=pending` returned 12 pending items with `filter.total` 12 / ฿907.00 (equal to the items' pending amounts); `limit=5` paged with a cursor; `payment=bogus` 400; the unfiltered list has no `filter` object.
- Rollback: settings generation `1794381248339048`, Hosting `e10fabf0d9950dd3`.
- DEV test (Chase, Pixel 7 Chromium, Thai, real UI; one write): Cash Position "ค่าใช้จ่ายค้างจ่าย" (12 / ฿907) opened the filtered list in 0.8 s with the bar "ค้างจ่าย | 12 รายการ · ฿907" and only pending tiles; Clear filter restored the full list; Back returned to Cash Position. R120 Test Referrer's "ค่าใช้จ่ายค้างจ่าย ฿45 · 1 รายการ" opened the list filtered to that payee in 0.6 s. Mark as paid on that row (request `8b8555f1-89e3-41e7-b066-c9a78cfceee4`, applied in 2.4 s), then Back: the bar read "0 รายการ · ฿0" within 1.7 s and the borrower's owed line was gone. A borrower with no pending expenses shows no line.

## Not run
No PROD action. CI and the DEV test are pending.

## Recovery
Git baseline: `main` at `cccc3b3` plus the R140 closure. Roll back the DEV images and Hosting to the previous generation recorded in the DEV deployment evidence. No SQL.

## Open questions
None.

## Remaining work
CI, the DEV deployment and test, and the owner's review in DEV; promotion only on the owner's instruction.
