# Change notes — R187 Dashboard profit KPIs, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim), with a screenshot of the desktop Dashboard KPI row: "replace the two numbers on the right with Realized Profit MTD (before write-offs) and last month Realized Profit (before write-offs)", followed by "push all the way to prod", and a second request the same day (verbatim): "Add the all time numbers (profit and write off) in another section of Dashboard, below month forecast". The Dashboard KPI row changes from Today's Profit, Yesterday's Profit, Net Profit and Principal Loss Recognized to Today's Profit, Yesterday's Profit, Realized Profit MTD (before write-offs) and Last month Realized Profit (before write-offs). The last-month figure is new. The Dashboard also gets a new "All time" / "ยอดสะสมทั้งหมด" sub-section directly after Monthly forecast; it shows Net Profit and Principal Loss Recognized, the lifetime figures that leave the KPI row, and Principal Loss shows ฿0 rather than being hidden, so both lifetime figures stay on the Dashboard. The Thai heading is a draft and needs the owner's or Lisa's check. Status: Open, implemented and verified locally; promotion authorized, nothing deployed yet.

Production instruction: the owner, 27 November 2026: "push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. Deploy set: PWA Hosting plus the rebuilt shared business service image (read, command, chat); no SQL, no backup.

Team: Archie (the definition of the last-month figure and where it is computed), Byte (implementation), Chase (verification, including real SQL), Echo (a quick visual check), Dewey (records), Forge (deployment).

## Changes
Baseline `ad890b9c` (`main`, R186 closed). Scope:
- Dashboard KPI row: the two right-hand figures are replaced by "Realized Profit MTD (before write-offs)" and "Last month Realized Profit (before write-offs)"; Today's Profit and Yesterday's Profit stay.
- New "All time" sub-section (owner request, second change): directly after Monthly forecast, with Net Profit and Principal Loss Recognized (lifetime); Principal Loss shows ฿0 when there is none.
- The last-month figure (Archie): `lastMonthRealizedProfit` in `GET /api/dashboard`, the V132 realized-profit rule (interest plus late charge paid, write-off loss pairs excluded) over the previous Bangkok month of `olap_reporting_date()`; read-only inline SQL under a savepoint, gated on the V130 predicate and the late-charge column, omitted on failure; no migration.
- Files: `services/business/dashboard.mjs` (`lastMonthRealizedProfit`, gated, under a savepoint); `apps/pwa/src/Dashboard.tsx` (KPI row and the All time section); `apps/pwa/src/live-style.css` (KPI figure alignment at every width); new `scripts/database/Test-LastMonthRealizedProfit.sql`; unit tests (`tests/unit/dashboard-read.test.mjs`, 5 new) and the Dashboard specs.
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Who | Command | Result | Commit |
| --- | --- | --- | --- |
| Byte | lint, type check, live-dev build | Pass | `e6a17bcf` |
| Byte | `npm test` | 1,447 passed, 1 skipped, including 5 new Dashboard unit tests | `e6a17bcf` |
| Byte | specs: desktop 7; mobile-chromium 320 px 7; mobile-webkit 3 passed, 4 skipped | Pass | `e6a17bcf` |
| Byte | real SQL, `scripts/database/Test-LastMonthRealizedProfit.sql` on a disposable cluster at V155: the month boundary, the Bangkok 00:30 on the 1st edge, January to December, loss pairs excluded, and equality with the view under a shifted clock | 8/8 assertions pass | `e6a17bcf` |
| Chase | adversarial review: the inline SQL matches the V132 `rr`/`loss_pair` definition line by line; the savepoint is released on success and rolled back on failure, so the rest of `/api/dashboard` stays intact | Pass, no defects | `e6a17bcf` |
| Chase | real-SQL rerun with the canonical `Test-MigrationsCloud.py --sql ... --sql-only` as postgres, including the checksum-tamper step | 8/8 pass; tamper step passes | `e6a17bcf` |
| Echo | local-build visual check: iPhone and iPad, English and Thai, and the older API case (three KPIs) | OK; UXR187-DASH-01 (desktop label wrap misaligned the figures) fixed in `f0a86399`; UXR187-COPY-01 declined, the label is the owner's wording | `e6a17bcf` |
| Byte | after the alignment fix: lint, build; Dashboard specs desktop 4/4, mobile-chromium 320 px 4/4, mobile-webkit F11; typography test on desktop and tablet-webkit-portrait | Pass | `f0a86399` |
| CI | pull request `Development checks` | Pending | – |

## Not run
- The dashboard role's column grants on Repayments and Charges are not visible in the repository, so the DEV smoke must confirm that `lastMonthRealizedProfit` is present in a real `GET /api/dashboard` answer (Chase's open point).
- Real iPhone and the iPhone Home Screen app; the PROD Dashboard is seen only after deployment (no authenticated PROD read is planned).
- Database migration groups: no migration or schema change.

## Recovery
Git baseline `ad890b9c` (R186 closed). A revert restores the previous KPI row; the image and Hosting pins will be in the Environment inventory at promotion. No SQL, no backup. An older service answers without the new field and the page then shows three KPIs.

## Open questions
- None on authority: promotion is authorized (see Purpose).

- Thai wording: the "ยอดสะสมทั้งหมด" heading is a draft for the owner's or Lisa's check.

## Remaining work
The pull request and its Development checks, the merge, the DEV deploy (confirm `lastMonthRealizedProfit` in a real answer), the PROD promotion (Hosting plus the shared business service image), the R187 tag and the closure pull request.
