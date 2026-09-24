# 6R seven-day rolling averages

24 September 2026 · R016 · tested package, publication pending.

Owner authorized the revised Metabase query-builder design. No database change or handwritten SQL is included. Existing model 74 and reporting calendar table 36 / Date field 569 supply completed Bangkok dates. The saved helper computes calendar coverage and strict trailing seven-day averages before either chart's date filter. Daily values are gross interest; cumulative values accumulate from the available snapshot origin, not the selected period.

## Prepared package

- Builder: scripts/metabase/PerformanceRolling.mjs. Read-only verifier: scripts/metabase/Verify-PerformanceRolling.mjs. Legacy page installer guarded against overwriting the new layout.
- Daily question 222 replaced in place; one helper, one cumulative chart and one compact coverage table to be created. Original status question 228 retained unchanged, preserving generation times and selected-date coverage. This refines the design's suggested replacement of 228: the compact companion adds origin/readiness without losing the existing status detail.
- Two-line native presentation is the design's allowed fallback; one axis, signed values, no fitted trend, no stacking or null interpolation. Daily target 10,000 only.
- User's existing tab name/order retained: 6R · Performance, immediately after original 6 · Performance. Other tab placements/questions and source model/permissions remain untouched.
- Calendar starts at available history. Before-history selections have no plotted data; existing snapshot status shows missing coverage. A complete seven-day window is required; unavailable is not zero.
- Use a continuous date range. Existing status questions reject disjoint selections; their policy is unchanged. Rolling charts themselves calculate each selected date from full history.

## Verification before publication

19 read-only checks pass: independent live arithmetic, unique/continuous daily grain, installed Bangkok timezone, outer-filter invariance including 1 September alone and September only, before-history/future emptiness; generated MBQL fixtures check first six nulls, known day-seven/day-eight values, missing-day recovery, cumulative gap protection, signed/zero inputs and correction propagation. No test financial writes or new SQL queries. See rolling-verification.json.

## Recovery and scope

Starting commit: 4bef45732eebe5109e323e57e929879e006d5576. Exact dashboard, affected cards, model and permissions before-images are private under the project credential/recovery root in r016-20260922/performance-ma7-before-20260924. Restore card 222 and tab-18 placements from these before-images, then recoverably archive new dependent questions in reverse order. Preserve any intervening owner edits. No DB rollback.

This is a scoped report enhancement; original Performance retirement and whole-R016 acceptance/key retirement/tag remain pending. AppSheet definitions, SQL versions (recorded V39), schedulers, source schemas, grants and financial rows are outside this change.
