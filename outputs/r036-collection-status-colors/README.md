# R036 — Collection Monitor status colors

The canonical [8 · Collection Monitor](https://reports.mw-credit.com/dashboard/3?tab=19) now follows the OLTP borrower collection format rules:

| Payment status | Cue | Row highlight |
| --- | --- | --- |
| Not Paid | 🔴 red | `#FEE4E2` |
| Partially Paid | 🟠 orange | `#FFF1D6` |
| Overdue | 🟣 purple | `#EDE9FE` |
| Fully Paid | 🟢 green | `#ECFDF3` |

The four lane count/list titles and list row highlights were updated, along with the full detail table's four status highlights. The source OLTP rules use the corresponding named text colors red, orange, purple and green. The Metabase dark/pale hex values are presentation choices for its light theme. The order, status definitions, counts, financial queries, filters and dashboard placements were unchanged.

The private rollback snapshot of dashboard 3 and the nine affected question definitions is at `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-colors/before.json`. Restore only the nine prior names/visualization settings if reverting, after checking for later edits. Starting repository commit: `a7eb42fabf6eae9671e4bc19147d8cbfb6c9e903`.

[Saved-state verification](verification.json) passed four scoped checks: nine definitions have the requested titles/colors; all nine queries are unchanged; dashboard tabs, filters and placements are unchanged; and each detail-table status has its matching color. A Chrome reload in the Metabase Gmail profile confirmed all eight lane labels and the four colored table lanes. No database, AppSheet, permission or schedule changes. R036 remains Open for other development; this authorized dashboard color change is live.
