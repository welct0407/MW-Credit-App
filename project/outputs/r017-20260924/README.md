# R017 — Capital yield on 6R

24 September 2026. Owner requested adding the original capital-yield chart if filters and operations are unaffected. Implemented and verified.

Uses existing model 74 Daily Capital Yield: Interest Received / (Outstanding Principal EOD + Principal Returned). The existing model returns zero for a non-positive denominator; preserved without reinterpretation. Daily, not annualized, gross-interest yield; not net profit. Percentage displayed to two decimals. Existing calendar 36 fills missing snapshots with nulls and excludes today/future in Bangkok time. No DB, SQL, model, financial-row, AppSheet, scheduler or permission change.

Question 232 on dashboard 3/tab 18, right half of row 44 beside question 225 (weekly average loan size); only that placement's width changes. Existing Performance period maps to output Date. Original capital-yield question 100 and original Performance page remain unchanged. No seven-day average added to this chart.

## Evidence and recovery

Starting commit 3a8b62d616062268ed498a42488bd25560c57b09. Before-images privately captured under C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r017-capital-yield (dashboard/model/permissions). Remove the new placement, restore placement 616 width to 24, and recoverably archive the new question. Preserve intervening owner edits. No DB rollback.

Builder/verifier: scripts/metabase/CapitalYieldReview.mjs. Twelve preflight checks cover source-grain/formula parity, completed-day semantics, single-date/month/early-history/today/future/prehistory/cleared filters. All 23 installed checks passed; desktop and 390px Chrome verification passed. Existing snapshot-status panel continues to show coverage/freshness.

Dependencies: deployed R016 model 74/calendar/dashboard; R016's unrelated whole-release acceptance is still pending. This release contains only the authorized capital-yield addition.

## Final status

Released report-only scope. Exact saved question/placement in plan.json; 23 checks in verification.json and Chrome evidence in browser-verification.json. All 202 existing placements are preserved except weekly card 616 width (24 → 12); its query/settings are unchanged. New placement 623 makes 203 total. Source model, every existing question, all tabs/filters and collection permissions compare unchanged against the before-images.

No operational writes or job changes occurred. One additional read-only daily-snapshot/calendar query executes when the page refreshes; tests and browser loading succeeded. No unmeasured performance guarantee is implied. No new annualization, seven-day average or ratio aggregation is introduced.

Documentation/dictionary validated and final publication uses tag R017. R018 remains the sole Open development release; R016 wider acceptance remains separate.
