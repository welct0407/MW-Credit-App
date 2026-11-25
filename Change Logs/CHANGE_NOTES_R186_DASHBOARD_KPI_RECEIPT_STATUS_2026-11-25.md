# Change notes — R186 Dashboard KPIs and receipt status text, 25 November 2026

## Purpose
Owner request of 25 November 2026 (verbatim, as typed): "Make following new changes: 1. In Dashboard KPIs, remove the first number "Pending Payment Amount", just keep the remaining 4 2. When automatically processing uploaded receipts for payment or close, make the status text more prominent. Let Echo review these changes, so me how to be look like". Three PWA changes: the Dashboard KPI group loses its first figure, "Pending Payment Amount", and keeps the other four; and the status text shown while an uploaded receipt is processed automatically for a payment or a loan close becomes more prominent. and, in a third request the same day with a PROD iPhone screenshot of the Dashboard (verbatim): "Also move "Available Cash Pool" next to total cash pool in iPhone's view". The owner thereby overrides the R185 UXR-DASH-01 choice, which kept "Total Cash Pool" and "Available Cash Pool" on full-width rows on phones: on iPhone the two now share one row. Tablet and desktop are unchanged. Echo reviews the changes and shows the owner a before and after. Status: Open, not yet implemented; promotion is not authorized yet.

Authority: a frontend batch; no new table or column and no financial write is planned. The database column `"Pending Payment Amount"` of the OLAP summary and the chat's business rules are not part of this request and stay as they are.

Team: Byte (implementation), Echo (visual review, before and after for the owner), Chase (verification), Dewey (records). Archie: not applicable (no design question beyond Echo's review). Forge: not applicable (no deployment requested yet).

## Changes
Baseline `c75f3148` (`main`, R185 closed) on branch `claude/jolly-brahmagupta-csy64t`. Planned scope, to be completed from Byte's diff:
- Dashboard: remove "Pending Payment Amount" from the first KPI group; the remaining four KPIs keep their order and layout (check the R185 two-column phone and four-column desktop rules).
- Dashboard on iPhone (owner override of R185 UXR-DASH-01): "Total Cash Pool" and "Available Cash Pool" share one row on phones; tablet (768 px and wider) and desktop keep their current layout.
- Receipt processing: a more prominent status text on the automatic receipt flow for a payment or a loan close (wording and style to be shown by Echo and approved by the owner).
- Records (Dewey): [Release tracker](../project/Documents/Release_Tracker.md) and [Development Changes](../project/Documents/Development_Changes.md) entries; the documentation pass against the final diff.

## Checks
| Command | Result |
| --- | --- |
| (to be filled by Byte, Chase and Echo, each check once, with the commit or CI run) | – |

## Not run
Nothing has been run for this batch yet.

## Recovery
Git baseline `c75f3148` (R185 closed). A frontend-only revert restores the previous behaviour. No SQL, no backup.

## Open questions
- Echo's before and after for the owner: the owner decides the look of the receipt status text.
- Promotion is not authorized yet. The owner has not given a production instruction for R186.

## Remaining work
Implementation (Byte), Echo's review and the owner's look decision, verification (Chase), the documentation pass (Dewey); then a production instruction from the owner before any deployment.
