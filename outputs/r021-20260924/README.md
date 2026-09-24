# R021 — Two live Performance summary metrics

Owner authorized adding both Net Principal Deployed and Loan-Cohort Return. Preserve all three existing cards and show five across (widths 5,5,4,5,5 of 24 columns). Dashboard 3, tab 18, reporting source 2. No DB, source model, AppSheet, permission or scheduled job changes.

Net Principal Deployed = principal issued on selected loan dates minus principal received on selected payment dates, from all loans including older cohorts. Positive = net lending; negative = net recovery; not profit or cash balance. Empty eligible period = zero; no eligible dates/unknown inputs = unavailable.

Loan-Cohort Return = interest received during the selected period from loans issued in that period / their original principal counted once. Same per-loan attribution as chart 233; ratio of totals, never average of weekly ratios. Unpaid loans remain; zero denominator/unknown inputs unavailable. Recent cohorts have less earning time. Both are live on refresh, Bangkok business dates, future excluded, sharing Performance period.

Seven preflight cases reconciled to independent loan/payment aggregation: default previous30days, month, partialweek, today, future, empty historic date and cleared. No source data saved in Git.

Starting Git commit a456e8452c2b5c582e7937bbd478633cd394cfc5. Private rollback: C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r021-summary/dashboard.json. Restore affected first-row placements and remove newly added placements/questions identified in state.json, preserving intervening changes. Existing questions unchanged; no DB rollback.

Maintained script: scripts/metabase/PerformanceSummaryMetrics.mjs. specs.json and plan.json pin intended definitions; state.json records created IDs. Publication/visual verification pending.
