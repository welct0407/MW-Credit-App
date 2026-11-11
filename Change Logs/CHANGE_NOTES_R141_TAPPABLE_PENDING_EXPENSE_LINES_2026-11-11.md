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
- CI on `73eef152`: `Development checks` 43031154506 and `Database migrations` 43031148944 passed.
- DEV deployment (Forge, 11 November 2026 UTC): image Cloud Build `a7dfb11c-41b1-4619-8a40-19147790cce6` (digest `sha256:096e4ff23328e893904c26bd308f097bda4a4cb650897e681cc71e3899c9046d`); Terraform 0 add, 3 change, 0 destroy, applied 13:51:07Z to 13:51:44Z, settings generation `1794405110933796` (previous `1794401786919940`); revisions read `00089-6lj`, command `00106-mjj`, chat `00058-kph`; Hosting `a3d0594cc8f5511f` (build version `04f958b02c7d6ae359650028`); smoke passed. `GET /api/referrers?owed=1` returned 1 referrer, ฿15.00, equal to the cash position `rebatesPayable`; `owed=2` 400. Rollback: settings generation `1794401786919940`, Hosting `99f4e84fd8c1d515`.
- DEV test (Chase, read-only, Pixel 7 Chromium, Thai): the Cash Position line "ค่าแนะนำค้างจ่าย · 1 รายการ ฿15" opened Referrers in 0.75 s with the bar "ค้างจ่ายค่าแนะนำ | 1 ผู้แนะนำ · ฿15" and only R129 Test Referrer B listed; Clear filter listed all 16 referrers; Back returned to Cash Position; the referrer page showed the settle action (not used) and Back kept the filtered list. The Expenses payable line still opened 11 pending expenses (฿862). The owed referrer is left unsettled for the owner.

## Checks
| Command | Result |
| --- | --- |
| Byte's local checks | Pass: `npm test` 1294 pass and 1 skipped; typecheck; lint; builds; the receiving group; 14 e2e specs, 561 passed |
| CI, PR #286 head `5a9c9f2f` | Pass: `Development checks` run 43022545287 (check, lint, three Chromium and three iPhone WebKit e2e shards), `Database migrations` run 43022475359 (guards and four rebuild groups); records-only `0d3a6641` also green |
| DEV deployment and test | Pass, see DEV deployment evidence |
| `npm run check:docs` | Pass, 0 failures, 0 warnings (Dewey, closure) |
| PROD promotion | Pass, see the PROD promotion record below |
| Release tag | `R141` on `c983e68a66835069ad7ff4683e78a3b57382071a`, Release tag run [43036520116](https://github.com/welct0407/MW-Credit-App/actions/runs/43036520116) (succeeded at 14:14:33Z; GitHub Release published) |

## DEV deployment evidence
Forge, 11 November 2026 (UTC), package `5a9c9f2f`; no SQL (DEV stays V145).
- Image: Cloud Build `313f3e3b-9049-474b-bb4d-8a6298cdde38`, digest `sha256:f24b158bd3203b28953d294f940524a4f0d4478b67ae55b73291888a2b644fa0`.
- Terraform: 0 add, 3 change, 0 destroy (image only on read, command, chat), applied 12:55:44Z to 12:56:21Z, clean re-plan; settings generation `1794401786919940` (previous `1794381248339048`); revisions read `00088-6mt`, command `00105-wlr`, chat `00057-mmf`; notify and jobs unchanged.
- Hosting: version `99f4e84fd8c1d515` (build version `e2c6168b6d89aeecac7a9a4d`, labelled R141), 12:57:14Z to 12:57:22Z.
- Smoke: both origins serve R141; `/health` 200, unauthenticated 401, CORS 204; no ERROR logs. `GET /api/expense-records?payment=pending` returned 12 pending items with `filter.total` 12 / ฿907.00 (equal to the items' pending amounts); `limit=5` paged with a cursor; `payment=bogus` 400; the unfiltered list has no `filter` object.
- Rollback: settings generation `1794381248339048`, Hosting `e10fabf0d9950dd3`.
- DEV test (Chase, Pixel 7 Chromium, Thai, real UI; one write): Cash Position "ค่าใช้จ่ายค้างจ่าย" (12 / ฿907) opened the filtered list in 0.8 s with the bar "ค้างจ่าย | 12 รายการ · ฿907" and only pending tiles; Clear filter restored the full list; Back returned to Cash Position. R120 Test Referrer's "ค่าใช้จ่ายค้างจ่าย ฿45 · 1 รายการ" opened the list filtered to that payee in 0.6 s. Mark as paid on that row (request `8b8555f1-89e3-41e7-b066-c9a78cfceee4`, applied in 2.4 s), then Back: the bar read "0 รายการ · ฿0" within 1.7 s and the borrower's owed line was gone. A borrower with no pending expenses shows no line.

## Not run
No authenticated PROD read, financial write, notification or job (see the PROD promotion record).

## Recovery
Git baseline: `cccc3b3` plus the R140 closure; PROD baseline R140 `91f79ef7`. PROD: services settings generation `1794397099475916`, then Hosting `544eee09024fe6b2`; no SQL. DEV: the rollbacks are in the DEV deployment evidence.

## Open questions
None.

## Remaining work
- Owner acceptance in PROD: done. The owner confirmed on 11 November 2026, "it works in prod, close it".
- Release closure prune (11 November 2026): deleted `Change Logs/CHANGE_NOTES_R138_CHAT_CONFIRM_AND_GROUP_100_2026-11-10.md` (outside the retention window R139, R140, R141); its inbound links in the release tracker, the environment inventory and the database README now point to commit `30546958`.

## PROD promotion record (Forge, 11 November 2026 UTC)
Authority: the owner's instruction of 11 November 2026, "move R141 to production", relayed by the orchestrator as the scoped PROD approval for R141: the changed images, the settings apply, Hosting and the technical records. No SQL, so no backup and no owner window. No payment, notification or job was forced, and no financial correction or other data write was made; the smoke is read-only. No secret value, token or borrower data appears here. Pins are in the [environment inventory](../project/Documents/Environment_Inventory.md).

| Step | Result |
| --- | --- |
| Freeze | 14:07:34Z; package `c983e68a66835069ad7ff4683e78a3b57382071a` (PR #286 head), merged to `main` as `30546958`. Baseline R140 `91f79ef7`. Roles read, command, chat; notify and jobs unchanged; no SQL and no infrastructure change. Next unused number R143 (R142 opened by the closure pull request) |
| Target | Project `clever-oasis-508610-n7`, instance `mw-credit-pg-20261017`, database `loan_manager_prod`, services `mw-credit-app-*-prod`, Hosting site `mw-credit-prod-737787224638`, registry `mw-credit-app-prod` |
| Baseline capture | Revisions read `00054-psb`, command `00059-kpf`, chat `00038-ztc` on `dee20b50...`; notify `00029-2nb`, jobs `00029-9dp` on `f8cb243b...`; settings generation `1794397099475916`; Hosting `544eee09024fe6b2` (R140); Flyway 145 `verify` at 14:08:50Z (nothing pending) |
| Image | Cloud Build `984dd1f3-3e23-452d-aa52-a21d606f028c` (14:08:59Z to 14:09:32Z), digest `sha256:848b26b9bc12b0cef148c6a2794125d5c09497ff8bc9f1cd5338ea3a78d70e18` |
| SQL | None; PROD stays at Flyway 145 (no migration, so no backup) |
| Terraform | Plan 0 add, 3 change, 0 destroy (image only), applied 14:10:21Z to 14:10:57Z, settings generation `1794406264137132` (previous `1794397099475916`), re-plan clean. Revisions read `00055-sq2`, command `00060-mtz`, chat `00039-9px`; notify and jobs unchanged |
| Hosting | Generic runner as `mw-credit-unattended-admin`, `--apply` 14:12:23Z to 14:13:07Z: version `83ca72cd9ec80625`, release `1794406380802000`, build-version R141 `649988a6519dbf68c9ae2f09`, entry `/assets/index-CjTQb4h8.js`, 18 files, package sha256 `7545f803...`; PROD origins only |
| CI receipts | `Development checks` run 43031154506 and `Database migrations` run 43031148944 on `73eef152`; Terraform evidence run 42763518963 on `456a6c9`; `c983e68a` run 43033447438 success |
| Smoke (read-only) | Both origins serve R141; the root is `no-store`; the entry and `sw.js` return 200; `/health` 200, unauthenticated 401, CORS 204; unauthenticated `GET /api/expense-records?payment=pending` and `GET /api/referrers?owed=1` return 401 (the routes exist and need sign-in); no ERROR logs 14:07Z to 14:13:33Z |
| Rollback | Services settings generation `1794397099475916`, then Hosting `544eee09024fe6b2`; no SQL. Private records in `gs://mw-credit-operator-private-737787224638/promotion-packages/r141/` and `promotion-receipts/R141-HOSTING-RECEIPT.json` |
| Tag | `R141` on `c983e68a66835069ad7ff4683e78a3b57382071a`, created by the Release tag workflow run [43036520116](https://github.com/welct0407/MW-Credit-App/actions/runs/43036520116) (succeeded at 14:14:33Z; GitHub Release published) |

### Deviations
- None recorded.

### Limitations
- No authenticated PROD read (there is no sanctioned PROD token route), financial write, notification or job. The owner accepted R141 in PROD on 11 November 2026 ("it works in prod, close it"). The tag record is part of this closure pull request.
