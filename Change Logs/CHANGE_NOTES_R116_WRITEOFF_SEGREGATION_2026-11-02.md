# Change notes — R116 Principal write-off segregation, 2 November 2026

## Purpose
The owner asked to segregate principal write-offs from actual profit on the Dashboard page, show them in the income statement, exclude them from Realized MTD profit, and give Metabase the same visibility. Net profit becomes gross profit minus expenses minus write-offs. Built and tested in DEV first; promotion only under a later owner instruction.

## Changes
Outcomes (owner request, 2 November 2026):
1. Dashboard: principal write-offs are shown separately from actual profit.
2. Income statement: write-offs appear as their own line.
3. Realized MTD profit excludes write-offs.
4. Metabase: the same segregation is visible.
5. Net profit = gross profit - expenses - write-offs.

Team: Archie (design), Byte (build), Chase (verification), Dewey (records), Echo (UX and tests), Forge (infrastructure impact).

Design decisions (Archie, accepted):
- Principal write-off = sum of `"Principal Paid"` of the `df10:` loss-pair repayments, recognised on their Payment Date.
- Gross profit = sum of `"Interest Paid"` of non-`df10:` repayments. It is the same figure as today's "Operating Income MTD", which is relabelled "Gross Profit MTD".
- Net profit = gross profit - expenses - write-offs. Its value is unchanged, because a loss pair carries interest -amount and principal +amount.
- Realized, Today's, Yesterday's and Total Profit become gross (write-offs not counted). The Dashboard label is "Realized Profit MTD (before write-offs)".
- Unsettled Profit MTD, the partner shares and the cash reconciliation are unchanged.
- History restates automatically: past months' gross profit rises by the write-off and net profit is unchanged.
- The "Daily Analytics" snapshot trends are left as they are (out of scope).

Build (Byte):
- SQL V128 is views and functions only: no new table, column, view or grant. It appends write-off columns to `"Cash Dashboard"`, `olap_portfolio_summary`, `reporting_income_statement`, `reporting_income_statement_monthly`, `reporting_income_statement_daily` and `reporting_income_events`.
- Services `services/business/*.mjs`, the three PWA pages, `scripts/database/Test-WriteOffSegregation.sql`.
- Metabase models stay pass-through. A new targeted refine and verify script in `project/scripts/metabase/` adds a write-off scalar and a waterfall step; it runs only at PROD promotion.

Infrastructure (Forge): no infrastructure impact.

Files and objects: final list to follow from Byte.

## Checks
| Command | Result |
| --- | --- |

## Not run
To follow.

## Recovery
Git baseline: `main` 80fbf6b (branch `claude/r116-writeoff-segregation`). Further recovery detail to follow once the change set is known.

## Open questions
None yet.

## Remaining work
Design, build, verification and records (in progress).
