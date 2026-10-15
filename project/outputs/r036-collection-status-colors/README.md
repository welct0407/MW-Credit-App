# R036 — Collection Monitor status colors

The canonical [8 · Collection Monitor](https://reports.mw-credit.com/dashboard/3?tab=19) now follows the OLTP borrower collection format rules:

| Payment status | Cue | Row highlight |
| --- | --- | --- |
| Not Paid | 🔴 red | `#FEE4E2` |
| Partially Paid | 🟠 orange | `#FFF1D6` |
| Overdue | 🟣 purple | `#EDE9FE` |
| Fully Paid | 🟢 green | `#ECFDF3` |

The four lane count/list titles and list row highlights were updated, along with the full detail table's four status highlights. The source OLTP rules use the corresponding named text colors red, orange, purple and green. The Metabase dark/pale hex values are presentation choices for its light theme. The columns and detail status choices now follow the table order, left to right. Status definitions, counts, financial queries and other dashboard placements are unchanged.

The private rollback snapshot of dashboard 3 and the nine affected question definitions is at `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-colors/before.json`. Restore only the nine prior names/visualization settings if reverting, after checking for later edits. Starting repository commit: `a7eb42fabf6eae9671e4bc19147d8cbfb6c9e903`.

[Saved-state verification](verification.json) passed four scoped checks: nine definitions have the requested titles/colors; all nine queries are unchanged; dashboard tabs, filters and placements are unchanged; and each detail-table status has its matching color. A Chrome reload in the Metabase Gmail profile confirmed all eight lane labels and the four colored table lanes. No database, AppSheet, permission or schedule changes. R036 remains Open for other development; this authorized dashboard color change is live.

## Owner-requested lane order

The count row, borrower-list row and detail status selector now read **Not Paid → Partially Paid → Overdue → Fully Paid**. Existing question and placement IDs are retained. Count cards are `242 / 244 / 240 / 246`; lists are `243 / 245 / 241 / 247`. The detail table's color rules follow the same order without changing its amount-based row sort or query.

[Order verification](order-verification.json) passed four saved-state checks: exact two-row order, unchanged other placements/tabs/filters, matching detail selector and color-rule order, and unchanged detail query. Chrome reload showed the four colored columns in that order, and the selector showed its choices in the same order. A separate private pre-reorder dashboard/question snapshot is under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r036-collection-status-order/before.json`. Restore the captured placement columns, parameter value order and detail formatting order if reversing this refinement, after checking for later edits. Starting commit for this refinement: `e5b24679c0c04bd7774c5e646601d8df58877f0e`.
