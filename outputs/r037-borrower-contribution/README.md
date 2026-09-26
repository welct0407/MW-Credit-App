# Borrower contribution charts — R037 handover

Owner selected lifetime achieved daily interest on 26 September 2026. Scope: refine new Portfolio tab104 on Metabase dashboard3. No AppSheet, SQL schema, financial data, permission or runtime change. Detail105 and original tabs retain their definitions.

## Metric contract

- Principal pie: positive current outstanding principal / positive principal in the selected population. Top nine borrowers plus Others. Any negative or missing principal makes the pie unavailable rather than silently changing its denominator.
- Profit pie: positive borrower net interest received during the previous 30 completed Bangkok dates / total positive borrower net interest in that window. Signed receipts are netted per borrower first. One current borrower has a negative net amount; negative borrower totals are excluded from pie shares and displayed separately in the context table. Null history makes the pie unavailable. Profit means gross interest before expenses.
- Lifetime effective achieved daily interest rate: signed lifetime interest received through yesterday / sum of daily end-of-day outstanding principal across all borrower loans. Display percent per day, three decimals. This is a cash-received yield, not a contractual rate or interest accrual. Aggregate numerator and principal-days before division; never average loan rates.
- Exposure: original principal less cumulative signed principal payments as of each date, floored at zero per loan. Start on loan date, apply payments on their payment date, and stop after close date or yesterday. A same-day fully repaid loan contributes zero end-of-day exposure. Interest collected after closing remains in lifetime receipts. This uses recorded dates, not intraday timestamps or immutable historical snapshots; later corrections restate history. Missing dates/amounts, receipts before loan date, or closed loans without a close date make the rate unavailable.
- Coverage: signed interest received through today on currently active loans / current borrower outstanding principal. Preserve the existing active-loan concept; 100% reference means interest equals current principal, not principal has been repaid. Zero principal gives unavailable, not infinity.
- Both bars show top20 eligible borrowers in descending order, including signed negative rates when present within the ranking. No Others bar and no stacking of ratios. Context counts unavailable borrowers.
- All four charts ignore Activity dates. Population still applies consistently. Profit and lifetime use completed Bangkok days; current principal/coverage include today's current position.

## Implementation

Shared native Metabase model from `scripts/metabase/models/borrower-lifetime-economics.sql` uses existing V44 loan facts/directory and repayment analytics. A compact event sweep integrates exposure between payment dates; no calendar Cartesian product in production SQL. `scripts/metabase/BorrowerContributionCharts.mjs` owns scoped prepare/preflight/publish/verify operations. Never replay publish against a changed dashboard baseline.

Replace Portfolio placements285/286 with two pies at row14; retain their saved questions for recovery. Add bars at row23, context at35, method note39; shift following existing Portfolio placements19 rows. Other tabs, filters and permissions are preserved. Existing period summaries/trends/comparison continue to respond to Activity dates.

## Verification and recovery

[Data check](data-verification.json) independently expands each loan into daily end-of-day balances in one restricted read-only PROD transaction and reconciles all30 borrower results with the event sweep. Four synthetic cases cover unchanged principal, partial repayment, same-day repayment and signed reversal. [Preflight](preflight.json) compiles the model and five questions. Saved-state/filter and browser checks are pending before release closure.

Starting Git commit: `400049e92b2ae4c607c2b19c3cce0ac9d0aebee6`. Full dashboard baseline stays under private project storage in `r037-borrower-contribution/before.json` because unrelated iframe configuration contains a bearer secret. A Metabase recovery copy is created before publication and its ID is recorded in state.json. Rollback restores only tab104 placements from that baseline after checking intervening edits; retain shared/new questions until dependency checks permit archival. No database restore required.
