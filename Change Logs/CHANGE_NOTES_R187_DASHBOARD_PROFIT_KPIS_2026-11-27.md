# Change notes — R187 Dashboard profit KPIs, 27 November 2026

## Purpose
Owner request of 27 November 2026 (verbatim), with a screenshot of the desktop Dashboard KPI row: "replace the two numbers on the right with Realized Profit MTD (before write-offs) and last month Realized Profit (before write-offs)", followed by "push all the way to prod", and a second request the same day (verbatim): "Add the all time numbers (profit and write off) in another section of Dashboard, below month forecast". The Dashboard KPI row changes from Today's Profit, Yesterday's Profit, Net Profit and Principal Loss Recognized to Today's Profit, Yesterday's Profit, Realized Profit MTD (before write-offs) and Last month Realized Profit (before write-offs). The last-month figure is new. The Dashboard also gets a new "All time" / "ยอดสะสมทั้งหมด" sub-section directly after Monthly forecast; it shows Net Profit and Principal Loss Recognized, the lifetime figures that leave the KPI row, and Principal Loss shows ฿0 rather than being hidden, so both lifetime figures stay on the Dashboard. The Thai heading is a draft and needs the owner's or Lisa's check. Status: Open, not yet implemented.

Production instruction: the owner, 27 November 2026: "push all the way to prod". Under the [Release workflow](../project/Documents/Rules/Release_Workflow.md#promotion) it covers the pull request and its merge, the DEV deploy and then the PROD promotion, the tag and the closure pull request. It does not cover financial writes, forced notifications or unrelated changes. The deploy set is still open: PWA Hosting, and probably the business service image if the dashboard read changes; SQL only if Archie finds it unavoidable (it would then need the owner's authority for any new column and the canonical migration procedure).

Team: Archie (the definition of the last-month figure and where it is computed), Byte (implementation), Chase (verification, including real SQL), Echo (a quick visual check), Dewey (records), Forge (deployment).

## Changes
Baseline `ad890b9c` (`main`, R186 closed). Scope, to be completed from Byte's diff:
- Dashboard KPI row: the two right-hand figures are replaced by "Realized Profit MTD (before write-offs)" and "Last month Realized Profit (before write-offs)"; Today's Profit and Yesterday's Profit stay.
- New "All time" sub-section (owner request, second change): directly after Monthly forecast, with Net Profit and Principal Loss Recognized (lifetime); Principal Loss shows ฿0 when there is none.
- The last-month figure: definition and source to be decided by Archie (the previous Bangkok calendar month, gross of write-offs like the MTD figure).
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Command | Result |
| --- | --- |
| (to be filled by Byte, Chase and Echo, each check once, with the commit or CI run) | – |

## Not run
Nothing has been run for this batch yet.

## Recovery
Git baseline `ad890b9c` (R186 closed). A revert restores the previous KPI row; the images and Hosting pins will be in the Environment inventory at promotion. SQL, if Archie needs any, is forward-only.

## Open questions
- Archie's definition of "Last month Realized Profit (before write-offs)" and whether it needs SQL.
- The deploy set (Hosting only, or Hosting plus the business service image).

- Thai wording: the "ยอดสะสมทั้งหมด" heading is a draft for the owner's or Lisa's check.

## Remaining work
Archie's design, implementation (Byte), verification (Chase), Echo's visual check, the documentation pass (Dewey); then the pull request, DEV, PROD, the tag and the closure under the owner's instruction.
