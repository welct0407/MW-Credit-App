# R017 — Capital yield on 6R

24 September 2026. Owner requested adding the original capital-yield chart if filters and operations are unaffected. Preflight passed; publication pending.

Uses existing model 74 Daily Capital Yield: Interest Received / (Outstanding Principal EOD + Principal Returned). The existing model returns zero for a non-positive denominator; preserved without reinterpretation. Daily, not annualized, gross-interest yield; not net profit. Percentage displayed to two decimals. Existing calendar 36 fills missing snapshots with nulls and excludes today/future in Bangkok time. No DB, SQL, model, financial-row, AppSheet, scheduler or permission change.

New question on dashboard 3/tab 18, right half of row 44 beside question 225 (weekly average loan size); only that placement's width changes. Existing Performance period maps to output Date. Original capital-yield question 100 and original Performance page remain unchanged. No seven-day average added to this chart.

## Evidence and recovery

Starting commit 3a8b62d616062268ed498a42488bd25560c57b09. Before-images privately captured under C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r017-capital-yield (dashboard/model/permissions). Remove the new placement, restore placement 616 width to 24, and recoverably archive the new question. Preserve intervening owner edits. No DB rollback.

Builder/verifier: scripts/metabase/CapitalYieldReview.mjs. Twelve preflight checks cover source-grain/formula parity, completed-day semantics, single-date/month/early-history/today/future/prehistory/cleared filters. Saved dashboard checks and Chrome verification pending. Existing snapshot-status panel continues to show coverage/freshness.

Dependencies: deployed R016 model 74/calendar/dashboard; R016's unrelated whole-release acceptance is still pending. This release contains only the authorized capital-yield addition.
