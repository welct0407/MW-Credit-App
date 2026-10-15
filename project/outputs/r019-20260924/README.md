# R019 — Correct Loan Return to issuance cohorts

24 September 2026. Owner corrected the R018 metric: weekly return must use the loans issued in that week, and profit must be received within the selected date-filter duration. Implemented and verified.

## Corrected contract

Select loans by Loan Date within the dashboard Performance period, group them into Monday issuance weeks, and divide the interest received for those exact Loan IDs within the same selected period by their original principal counted once each. Retain loans with no matching in-period interest (numerator zero); exclude interest from other loans and outside the selected dates. Multiple repayments never duplicate principal. Closed loans remain eligible. Profit means the existing gross interest paid metric, not principal repaid, charges or net income. Zero cohort principal is unavailable; signed corrections stay signed; incomplete source inputs remain unavailable.

A September selection therefore includes September-issued loans, and their September interest even if received in a later week. It excludes August-issued loans and October receipts. Boundary weeks include only selected issue dates. Today is included when selected; future dates are excluded using Bangkok business date. Cleared filter uses the established available-calendar start through today. Existing continuous-range guidance is retained.

Question 233 is replaced in place, with the 100% reference retained. Title: Weekly loan-cohort return · live. It moves immediately below existing live summary cards, above the snapshot section. Its explanation says both loan dates and interest-payment dates use the filter, principal counts once and data is live on refresh. Remaining snapshot visuals shift down; EOD activity regains full width. Capital yield and other questions remain unchanged.

## Source and implementation

Portfolio daily snapshots cannot recover Loan ID attribution. Use existing live OLAP-backed model 70 (one row per loan) and 71 (one row per repayment); filter both on the same selected calendar days. The bounded Metabase native question first groups matching payments by Loan ID, left-joins the selected loans, then summarizes issuance weeks. It is a report-level selection/join/aggregation over existing governed sources, not a historical snapshot rebuild. No source model, DB object, migration, grant, financial row, AppSheet or scheduled job changes. Handwritten query SQL is local to this corrected metric; the existing Metabase Offset rolling-average implementation is untouched.

## Verification / recovery

Twelve preflight checks passed: unique loan/payment grains and reference integrity, independent per-loan attribution across month/week/partial-week/single-day/today/future/prehistory/cleared/default filters, and synthetic multi-payment, unpaid-loan, older-loan exclusion, outside-period exclusion, later-week interest attribution, signed corrections and zero principal. All 15 installed checks and desktop/390px Chrome verification pass.

Starting commit ce407b16b747a05d99d30477e182465c52f48c73. Exact dashboard, chart 233, source model 70/71 and permissions before-images are private under C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r019-cohort-return. Rollback restores question 233 and tab-18 layout, removing the added live explanation; preserve intervening owner changes. That restores the previous period ratio, which the owner rejected, so a forward correction is preferred. No DB rollback.

Dependencies: deployed R016 reporting sources and R018 chart. R016 wider acceptance remains separate.

## Final installed state

Question 233 keeps its identity but now selects cohort loans from model 70 and their in-period interest from model 71. The actual installed dashboard mappings reconcile to an independent per-loan oracle for all nine date selections, including today and partial weeks. All other existing questions/settings, source models and permissions are unchanged; 6R's exact layout is in plan.json. The 100% line remains visible, capital yield remains, EOD activity is full width and the snapshot section follows the explicitly live chart/note. Total placements: 205.

Maintained command: node scripts/metabase/CohortLoanReturn.mjs --publish-cohort. The unique flag avoids the imported legacy page builder's --install guard; the first publication attempt stopped before any live edit. The corrected publisher and its saved result passed the full installed verification. Source data is never written.

Released report-only correction, tag R019; R020 is the sole Open development release. R018 is retained as dated evidence of the rejected metric, not current truth. Wider R016 acceptance remains separate.
