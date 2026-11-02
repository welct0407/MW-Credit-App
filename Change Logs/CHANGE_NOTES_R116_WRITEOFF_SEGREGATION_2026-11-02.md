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

Deviations and details recorded by Byte (commit 3351c7c):
- Waterfall 204 ends at Net profit: Income, Expenses, Write-offs, then the Net profit total.
- Unsettled Profit MTD falls by the write-off as before. Business Cash Held and Cash Reconciliation are unchanged (no cash moves).
- `Test-LongOverdue.sql` and the default-loss column checks (V114, V120) are pinned to fixed column positions, because V128 appends a column to `olap_portfolio_summary`.
- The API reads "Principal Write-offs MTD" by name: omitted before V128, a non-numeric value is refused.
- The write-off column is a positive amount in all six views; Net Margin = net / gross; the view comments are unchanged.
- Dictionary: the six view definitions, appended columns and dependencies were read from a disposable PostgreSQL chain at V128, not from a PROD capture; a targeted PROD capture follows the promotion.

Images affected: read, command and chat. Hosting, notify and jobs stay as they are.

Files and objects: `database/migrations/V128__principal_writeoff_segregation.sql`; `services/business/cash.mjs`, `management-analytics.mjs`; `services/chat/assets/schema-digest.json`, `conversation-business-rules.md`; `apps/pwa/src/Dashboard.tsx`, `CashWorkspace.tsx`, `ManagementAnalytics.tsx`, `live-style.css`; `project/scripts/metabase/Refine-WriteOffSegregation.mjs`, `WriteOffSegregation.mjs`, `ProposedLoanReports.mjs`, `StatementCleanup.mjs`, `live-income-period.sql`; tests `scripts/database/Test-WriteOffSegregation.sql`, `Test-StatementBatch.sql`, `Test-LongOverdue.sql`, `tests/unit/principal-writeoffs-read.test.mjs`, `tests/integration/default-loss-independent.test.mjs`. Records: this note, `Release_Tracker.md`, `Solution_Design.md`, `PWA_Data_Model_Overview.md`, `database/README.md`, `project/scripts/metabase/README.md` and six `Data Dictionary` relation files with `index.json`.

## Checks
| Command | Result |
| --- | --- |
| `npx biome lint` | Pass at 84b516c (Byte) |
| Typecheck | Pass at 84b516c (Byte) |
| `npm test` | 1102 of 1103 pass at 84b516c, 1 skipped (needs a DB port) (Byte) |
| `Test-MigrationsCloud --sql-only` | Pass at 84b516c, including `Test-WriteOffSegregation.sql` and Chase's `Test-WriteOffSegregationEdges.sql` (now in `Test-StatementBatch`) (Byte) |
| Adversarial diff review at 38395b9 | No blocking findings; the edge SQL suite passes (Chase) |
| e2e "Page7 Dashboard source formats" and the R102/R109 Dashboard tests, desktop-chromium, at 38395b9 | Pass (Chase) |
| Local UI check at 390x844, EN and TH, present, zero and absent states, at 38395b9 | Pass; ANL-4 and DSH-6 were fixed in 84b516c (Echo) |
| `npm run check:docs` | Pass, 0 failures, 0 warnings |

## Not run
- The wide Playwright suite and the mobile project: left to the pull request's CI.
- Live Metabase (refine, rebaseline and verify runs), the DEV deploy (pending) and the PROD dictionary capture: they belong to the deploy and promotion steps.

Chase info finding: an undated `df10:` pair counts in lifetime portfolio net but not in the dated views. This is unchanged from before V128, and no such rows are known.

## Recovery
Git baseline: `main` 80fbf6b (branch `claude/r116-writeoff-segregation`). V128 is views only; a later migration restores the V127 bodies (the appended columns stay, unused). Metabase: restore the private baseline written by `Refine-WriteOffSegregation.mjs --prepare` and archive the new question.

## Open questions
None yet.

## Remaining work
DEV deploy, then PROD promotion (V128, Metabase order in the Metabase README, PROD dictionary capture) only on the owner's instruction.
