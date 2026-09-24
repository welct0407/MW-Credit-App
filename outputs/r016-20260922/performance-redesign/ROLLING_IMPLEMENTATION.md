# 6R seven-day rolling averages

24 September 2026 · R016 · implemented and verified in Metabase.

Owner authorized the revised Metabase query-builder design. No database change or handwritten SQL is included. Existing model 74 and reporting calendar table 36 / Date field 569 supply completed Bangkok dates. The saved helper computes calendar coverage and strict trailing seven-day averages before either chart's date filter. Daily values are gross interest; cumulative values accumulate from the available snapshot origin, not the selected period.

## Installed package

- Builder: scripts/metabase/PerformanceRolling.mjs. Read-only verifier: scripts/metabase/Verify-PerformanceRolling.mjs. Legacy page installer guarded against overwriting the new layout.
- Daily question 222 replaced in place; one helper, one cumulative chart and one compact coverage table created (helper 229, cumulative 230, coverage 231). Original status question 228 retained unchanged, preserving generation times and selected-date coverage. This refines the design's suggested replacement of 228: the compact companion adds origin/readiness without losing the existing status detail.
- Two-line native presentation uses green actuals, orange dashed daily MA and blue cumulative MA; one axis, signed values, no fitted trend, no stacking or null interpolation. Daily target 10,000 only.
- User's existing tab name/order retained: 6R · Performance, immediately after original 6 · Performance. Other tab placements/questions and source model/permissions remain untouched.
- Calendar starts at available history. Before-history selections have no plotted data; existing snapshot status shows missing coverage. A complete seven-day window is required; unavailable is not zero.
- Use a continuous date range. Existing status questions reject disjoint selections; their policy is unchanged. Rolling charts themselves calculate each selected date from full history.

## Verification before publication

19 read-only checks pass: independent live arithmetic, unique/continuous daily grain, installed Bangkok timezone, outer-filter invariance including 1 September alone and September only, before-history/future emptiness; generated MBQL fixtures check first six nulls, known day-seven/day-eight values, missing-day recovery, cumulative gap protection, signed/zero inputs and correction propagation. No test financial writes or new SQL queries. See rolling-verification.json.

## Recovery and scope

Starting commit: 4bef45732eebe5109e323e57e929879e006d5576. Exact dashboard, affected cards, model and permissions before-images are private under the project credential/recovery root in r016-20260922/performance-ma7-before-20260924. Restore card 222 and tab-18 placements from these before-images, then recoverably archive new dependent questions in reverse order. Preserve any intervening owner edits. No DB rollback.

This is a scoped report enhancement; original Performance retirement and whole-R016 acceptance/key retirement/tag remain pending. AppSheet definitions, SQL versions (recorded V39), schedulers, source schemas, grants and financial rows are outside this change.

## Installed verification

41 focused automated checks pass in rolling-verification.json, including actual dashboard mappings for September, 1 September alone, leading August dates, cleared filter, today/future and readiness counts. Exact series settings, all other existing question definitions, other dashboard placements, owner tab names/order, all dashboard parameters, source model 74 and collection permissions are preserved/read back.

Chrome desktop and 390px checks pass (rolling-browser-verification.json). Native two-line charts retain visible negative values and the daily 10,000 goal. Daily MA is orange/dashed/heavier; cumulative MA blue/heavier. Mobile legends are shortened to Gross interest/Accumulated and 7-day average; exact column names remain in query/export. Cumulative title is shortened to Cumulative gross interest · MA7. The coverage table scrolls horizontally on mobile. The graphical editor opens helper 229 and exposes the Offset custom aggregation without SQL.

Dashboard 3 now has 202 placements, including 20 on tab 18. New cumulative placement 621 and coverage placement 622 accompany existing daily placement 613. Other 182 placements and all pre-existing questions except 222 are unchanged. The shared helper is outside dashboard tabs. Plan/IDs: rolling-plan.json and rolling-state.json. Existing page plan.json/verification.json remain dated evidence of the earlier page; rolling-plan.json supersedes affected definitions/layout. The old installer explicitly prevents replay over this enhancement; its verifier now recognizes the new daily helper and owner-moved tab.

The note and readiness row were expanded after mobile review to avoid clipped text. Installed styling uses the version-specific native series settings from Metabase v0.63.18.1 (line.style, line.size, line.missing and series title), including explicit null gaps. These are presentation corrections within the pinned scope. [Official series settings source](https://github.com/metabase/metabase/blob/v0.63.18.1/frontend/src/metabase/visualizations/lib/settings/series.ts).

### Limits and maintenance

- These curves remain gross interest, not profit after business expenses.
- Unknown/prehistory dates do not acquire synthetic zeros. Cumulative means since available history, not business inception.
- Choose a continuous period. Existing status questions guide/reject disjoint selections; rolling questions themselves can plot individually selected dates. They do not currently suppress those points to mirror the other status questions.
- Old corrected snapshots flow through on a fresh Metabase query, subject to normal caching. Read-only synthetic correction tests establish formula propagation; no production financial mutation or cache-setting change was made.
- No synthetic year-boundary production history exists in current coverage. Offset has no month/year reset, and the August/September crossing is verified.
- Whole R016 remains Frozen for promotion pending the previously recorded acceptance/key-retirement/closure work; R017 is Open for subsequent development. No final release tag is claimed here.
