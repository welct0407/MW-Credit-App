# Seven-day averages for Performance — design only

24 September 2026 · Revised design: Metabase query-builder rolling averages · R016 remains Open.

**Latest owner instruction: update the design only.** The proposed database view and the later suggestion of handwritten Metabase SQL are superseded. This revision specifies Metabase graphical query-builder expressions over existing sources. No implementation is performed or requested in this turn.

## Recommendation

Restore the pair of charts in the owner's screenshot to **6R · Performance Review**: daily results with a trailing seven-day average, and cumulative results with a trailing seven-day average of the cumulative values. The cumulative chart serves an owner-valued purpose; this recommendation supersedes the earlier proposal to omit it from the review page.

Metabase can display both calculated series. Its documented custom-expression `Offset` supports rolling averages, and combo charts support area/line combinations. For this project, calculate both averages in Metabase saved questions using the graphical query builder’s Summarize expressions, over the existing daily snapshot model. This changes question definitions in a future implementation; it is not a visual-only switch. No PostgreSQL object, stored field, grant or handwritten SQL is required by this design. Metabase generates the underlying read query itself. The generic **Show trend line** option fits a trend automatically and does not establish the explicit seven-calendar-day definition required here. [Metabase rolling averages](https://www.metabase.com/docs/latest/questions/query-builder/expressions/offset), [combo charts](https://www.metabase.com/docs/latest/questions/visualizations/combo-chart), [chart settings](https://www.metabase.com/docs/latest/questions/visualizations/line-bar-and-area-charts).

Recommended scope is the review page only. Preserve original **6 · Performance** until the owner decides its future. No live API inspection or change was made for this design: current IDs and definitions below are based on the maintained implementation evidence and repository at this revision’s starting commit `4b4a660245f16dbf3bc64476fb3ba6fb79fe6a3d`. Reconfirm affected live definitions when implementation starts. The screenshot establishes the requested visual pattern, not the old chart's exact moving-window, partial-window or filter configuration.

## 1. Metric meaning

The maintained Daily Performance model 74 maps `Profit` to **Interest Received** and calculates `Cumulative Profit` by accumulating that interest. Those are gross-interest measures. Preserve this basis initially so the new curves remain comparable to existing Performance results; display **Gross interest** explicitly rather than silently changing the formula under a Profit label.

Existing `public.reporting_daily_snapshot` also exposes **Business Expenses** and **Net Profit**, where the snapshot engine defines net profit as Interest Received minus Business Expenses. If the owner later wants the same pair to show profitability after expenses, use that stored Net Profit consistently in both daily and cumulative series, update their titles and reconsider the 10,000 daily target. That would be an explicit metric revision. Do not add an unrequested metric selector, four additional charts or an automatic gross/net switch in this implementation.

The daily seven-day average is the primary indicator of the recent earning rate. The cumulative average smooths the accumulated level and lags it; even a rising cumulative curve can coexist with falling daily earnings. Neither curve measures a percentage return on capital. Signed corrections can make either curve fall.

## 2. Two-chart design

| Property | Daily chart | Cumulative chart |
| --- | --- | --- |
| Title | **Daily gross interest & 7-day average** | **Cumulative gross interest & 7-day average** |
| Actual series | Green line, light area fill if readable | Green line with light area fill |
| Average series | Orange dashed line, visibly heavier than actual | Blue solid line, visibly heavier than actual |
| Average legend | **7-day average · daily** | **7-day average · cumulative** |
| Vertical scale | Baht/day; one shared axis | Baht accumulated; one shared axis |
| Target | Retain the screenshot's **10,000/day** reference for the gross-interest basis | None; do not turn the daily target into a cumulative target |
| Time axis | Bangkok date, ascending, daily points | Same displayed date range and daily points |
| Hover | Date, actual, average; unavailable where history is incomplete | Date, cumulative, cumulative average; history-start context |

Use native series styling and a combo chart for area plus line. Disable stacking and automatic split Y-axis. Leave Metabase's fitted trend-line option off. Use straight segments; the calculation supplies the smoothing. Preserve negative values and an automatically expanding scale that includes the target and all data. Never force a zero minimum that hides a negative correction. Turn off dense point labels by default; exact values remain accessible through hover and detail/export. If a style setting differs on the installed Metabase build, a two-line chart with distinct colors is an acceptable visual fallback; never approximate the numerical average with a fitted curve.

Place these charts side by side as the first chart row below snapshot coverage on desktop. Stack daily first, then cumulative on mobile. Move **Principal issued & returned** to the next row beside **Loans issued**; retain weekly average loan size below them, then EOD activity and daily detail. This adds one data visual to the current ten, without changing live KPI tiles or the lending metrics. Keep legends and short explanations visible at phone width; no tiny-font attempt to reproduce every label in the screenshot.

Short visible note: **“7 completed days per average. Cumulative starts at available history, not the filter start.”** Show the actual history-start date in the coverage/context panel.

## 3. Exact numerical contract

Let:

- `T` = current Bangkok business date from `public.olap_reporting_date()`.
- `H` = earliest available stored snapshot date before T. It is the start of the recorded snapshot series, not an unverified claim of business inception.
- `x(d)` = stored Interest Received for calendar date d, with its sign retained.
- `C(d)` = sum of x from H through d, inclusive, provided that every expected date in that range has a valid value.

**Daily moving average:**

`Daily MA7(d) = [x(d−6) + x(d−5) + … + x(d)] / 7`

**Cumulative moving average:**

`Cumulative MA7(d) = [C(d−6) + C(d−5) + … + C(d)] / 7`

The cumulative average is the average of seven accumulated balances. It is not the seven-day sum of daily earnings, an average daily earning rate, or a cumulative sum of the daily moving averages. Reuse model 74’s existing `Cumulative Profit` field; it already supplies the accumulated values before the rolling-average stage. Apply a separate seven-term `Offset` expression to that field. Do not attempt `Offset(CumulativeSum(...))` in a single aggregation or calculate cumulative profit from the filtered display period.

Require seven complete calendar dates for each average. Do not use partial windows, future values, centered averages, weekly buckets, rounding before averaging or the previous seven transaction rows. Preserve the actual daily/cumulative series during the first six dates of available history; show the average as blank until seven valid dates exist. The screenshot alone does not prove whether its earliest averages used partial windows; strict seven-day averages are the proposed rule.

## 4. Date selection and coverage

Continue using the review page's independent `review-performance` period control, defaulting to the previous 30 completed days. Apply its visible date selection **after** calculating the series:

1. Read the stored calendar history needed for calculation, excluding today/future.
2. In query-builder stages, align existing calendar dates with snapshots and carry completeness information; see section 5.
3. In a reusable, unfiltered saved question, calculate both averages with `Offset`.
4. Use that saved question as the source of the two displayed chart questions, applying the dashboard date filter only in these outer questions.

For a chart beginning on 1 September, its first daily average needs 26 August–1 September. Changing the filter must not change the value plotted for 1 September. Calculating the average after filtering would incorrectly erase or distort the first six visible points. Cumulative values additionally need the complete baseline from H, not just six extra daily values. Do not reset cumulative totals at the filter start or at a month/year boundary. The selected period is a viewing window into the accumulated history; the two charts should share it even though the screenshot shows different date spans.

| Case | Required result |
| --- | --- |
| Actual stored zero | Include it as a real zero in the seven-day average. |
| Missing snapshot or null interest | Daily value blank; every seven-day window containing it blank. Never substitute zero or skip it. |
| Fewer than seven dates since H | Actual available; average blank. No partial denominator. |
| Internal gap before a cumulative point | Cumulative value and its average unavailable from that gap onward until repaired; do not let SQL SUM silently bridge it. |
| Seven complete daily inputs after an old gap | Daily MA recovers once the gap leaves its window; cumulative remains unavailable until the old gap is rebuilt. |
| Negative correction | Keep the negative amount in actuals, averages and cumulative total. |
| Today-only or future-only | No completed-day chart points. Live summary follows its existing rules; do not append a provisional zero or fall back to yesterday. |
| Range including today | Display completed dates only, through T−1. |
| Selection before H | Mark history unavailable; do not infer prehistory zeros. |
| Cleared filter | Display all available completed history; preserve the same MA and cumulative definitions. |
| Discontinuous selection | Retain the review page's continuous-period guidance; no invisible date filling across a disjoint user selection. |

A missing earliest snapshot cannot be detected just by taking the minimum stored date. At implementation acceptance, compare H with the approved reconstruction coverage using the existing `analytics_history_start()` definition and retained backfill evidence. Investigate a mismatch rather than claiming a lifetime total. Label cumulative amounts **“Since available history: H”** regardless. If source coverage moves earlier after an authorized history rebuild, the baseline can legitimately change; include this in source context.

Extend the existing snapshot context to distinguish selected-date coverage from calculation-input coverage. A selected range may contain no gaps but its first averages can still depend on missing preceding dates. Expose counts of daily-MA-ready and cumulative-MA-ready selected points, H, and a short reason when values are unavailable. Keep snapshot Generated At truthful: averages depend on up to seven snapshots, and cumulative results depend on all snapshots since H. Do not present the newest refresh time as proof that every historical input was recently rebuilt.

## 5. Metabase-only calculation design

**No DB change and no new handwritten SQL.** Reuse Daily Performance model **74** unchanged. It already exposes `Date`, `Profit`, `Cumulative Profit`, `Snapshot ID` and `Generated At`. Its existing SQL stays as it is. The hourly yesterday/today job and historical rebuild continue to own the underlying facts. The owner's explicit Metabase-only choice supersedes the earlier SQL-view proposal for this feature; it does not change broader project computation ownership.

### 5.1 Source and completeness stages

Create a reusable **Performance trend inputs** saved question in the graphical query builder, with these logical stages. Suggested question names are not reserved object IDs.

1. Use existing calendar source `public.reporting_statement_calendar`, limited to the earliest available snapshot date H through yesterday, and left-join model 74 by date. The helper must have exactly one row per calendar date. H can come from a one-row question summarizing the minimum snapshot date; reuse that summary within the source stages. Any helper questions needed for this must be ordinary Metabase questions, not database objects.
2. Retain `Profit` and `Cumulative Profit` from the snapshot model, preserving zero, negative and null values. Do not substitute zero for a missing joined row. Add a numeric missing-input flag for a missing Snapshot ID or null Profit.
3. Use a separate Summarize stage with `CumulativeSum` of that flag, grouped by Date at **day** grain. Carry the one-per-day amounts through with `Max`, and carry daily input presence separately. In a subsequent custom-column stage, expose cumulative input only where the cumulative missing-input count is zero. This guards the existing model's cumulative sum, which otherwise ignores missing dates. Do not remove bad rows before running totals or offsets: they must remain in the calendar.
4. Exclude today and future dates using the existing Bangkok reporting-timezone convention. Do not apply `review-performance`, the model's `In Last 30 Days` field, any user date range, or a row limit at this stage.

Metabase documents cumulative aggregations in its query builder. The staged construction above is the proposed application to this dataset, not a claim that its full UI configuration has already been tested. [Cumulative functions](https://www.metabase.com/docs/latest/questions/query-builder/expressions/cumulative).

At implementation time verify that the existing calendar and model are selectable under the current reporting connection and that the installed editor exposes the required date summary, joins and downstream custom-column stages. Do not create a DB object, widen grants, or replace the approach with handwritten SQL to work around a limitation without discussing it. If a supporting UI operation is unavailable, report the precise limitation and a revised Metabase-only option; do not silently weaken the completeness rules.

For current complete snapshot history, the guarded cumulative input equals model 74's `Cumulative Profit`. The extra stages protect that meaning when an internal snapshot is missing. The calendar also prevents `Offset` from skipping over absent dates. No transactions are joined or reconstructed here.

### 5.2 Exact rolling-average expressions

Create a second reusable saved question, **Performance rolling averages**, sourced from the completed input question. In **Summarize**, group only by **Date → Day**. Keep Date as the first and only breakout and order ascending. Use four output measures: actual daily input, daily MA7, actual guarded cumulative input, and cumulative MA7.

The following expressions use the proposed input names `Gross Interest` and `Valid Cumulative Gross Interest`. Map them to the exact returned fields when building the questions. `Max` selects the single daily value; it does not mean a maximum over seven days. Enforce one row per date before using it.

**Actual daily series:** `Max([Gross Interest])`

**Daily seven-day average:**

```text
(
  Max([Gross Interest])
  + Offset(Max([Gross Interest]), -1)
  + Offset(Max([Gross Interest]), -2)
  + Offset(Max([Gross Interest]), -3)
  + Offset(Max([Gross Interest]), -4)
  + Offset(Max([Gross Interest]), -5)
  + Offset(Max([Gross Interest]), -6)
) / 7
```

**Actual cumulative series:** `Max([Valid Cumulative Gross Interest])`

**Cumulative seven-day average:**

```text
(
  Max([Valid Cumulative Gross Interest])
  + Offset(Max([Valid Cumulative Gross Interest]), -1)
  + Offset(Max([Valid Cumulative Gross Interest]), -2)
  + Offset(Max([Valid Cumulative Gross Interest]), -3)
  + Offset(Max([Valid Cumulative Gross Interest]), -4)
  + Offset(Max([Valid Cumulative Gross Interest]), -5)
  + Offset(Max([Valid Cumulative Gross Interest]), -6)
) / 7
```

These are custom aggregation expressions in **Summarize**, not custom columns or chart-style options. The seven terms cover the current completed date and its six predecessors. A missing term must leave the result null; never wrap the terms in a zero-producing `coalesce`, and verify null propagation on the installed version. Full source history supplies the leading six days even when the displayed range is shorter.

Add readiness/coverage measures as needed in the same question or a subsequent stage, without changing the four-series definitions. Do not round input values; format displayed money separately. Offset works on query rows, so source grain and calendar continuity are required. [Metabase Offset reference and rolling-average example](https://www.metabase.com/docs/latest/questions/query-builder/expressions/offset).

### 5.3 Display questions and filter placement

Use **Performance rolling averages** as the source of each chart question. Select Date and the appropriate actual/average pair, with no further summarization. Connect `review-performance` to the **output Date of these outer questions**, not to the input model or the helper’s calculation dates. Keep the default previous 30 completed days.

Do not reuse current native-SQL template-tag mappings unchanged after switching to query-builder questions. Inspect the final dashboard mappings and generated read query to verify the date restriction occurs after the offset stage. Saving a helper question by itself does not prove filter order: the single-date and overlapping-range tests below must pass.

The review context must also distinguish no eligible completed dates from missing input history and retain the current continuous-selection behavior. Keep context changes within Metabase query-builder questions. A filter-mapping or guard limitation is an implementation finding to resolve explicitly, not permission to silently change date semantics or introduce SQL.

Reusing a question is a reuse of its definition, not a new persisted dataset or a guaranteed cache. Metabase executes generated queries against the existing source. No performance improvement is claimed before measurement.

The tradeoffs are additional saved-question dependencies to maintain, careful mapping of the final date filter, and calculation over more snapshot dates than are displayed. For example, selecting 1–30 September still needs August inputs for the first six averages. Applying the filter too early would make those six averages blank under the strict seven-day formula. The staged design prevents that result; verify it on the installed questions rather than assuming every dashboard mapping preserves stage order. The inputs are daily snapshots, so this is not a repeat reconstruction of transaction history.

## 6. Change map for a future implementer

| Asset | Proposed change |
| --- | --- |
| Dashboard 3 / review tab 18 | Enhance the daily chart, restore the cumulative chart, and rearrange only affected review-page placements. |
| Question 222 | Replace its current native chart query with a graphical query-builder question over the rolling helper; retain its question ID if supported and safe after checking dependencies. Otherwise create a replacement question and retain the old one for rollback. |
| New cumulative question | Query the same rolling helper’s cumulative pair. Allocate its ID only when created; do not repurpose original question 99. |
| Metabase helper questions | Shared complete input/coverage stages and shared four-series rolling calculation; a one-row history-start summary if needed. Keep them in the governed report collection, outside dashboard tabs. No helper IDs allocated now. |
| Question 228 / review context | Show history origin, selected coverage and rolling readiness using Metabase questions. Preserve actual snapshot generation information. |
| Source model 74 and calendar | Reuse their existing definitions, fields and access. No new model or model SQL edit. |
| Original tab 7 / questions 98 and 99 | Preserve for the owner's comparison. |
| Other review questions | Preserve calculations; reposition affected charts only. Keep daily detail at its current width; chart questions can provide the plotted-series export. |
| PostgreSQL and AppSheet | **No changes:** no table, view, column, function, grant, migration, backfill or automation change. |
| Maintained files on implementation | Update the report builder/verifier, saved plan/IDs/evidence, owning Metabase YAML and release log after actual changes. No database source files to create. |

Before a future implementation, re-read the current Open release, verify affected live question definitions/consumers and capture dashboard/questions for rollback. This latest request is **design only**, superseding the earlier interrupted implementation instruction. Do not resume implementation based on the older approval. No database migration, production database backup, release freeze or successor reservation is triggered by this document update.

After an old snapshot is corrected through the existing rebuild process, Metabase recomputes the expressions on a fresh query, subject to its cache policy. The daily average changes for that date and the following six dates; the existing model's cumulative amount and its rolling average change thereafter. No derived averages are written into Daily Analytics. Underlying balance corrections may still require later EOD snapshot rebuilds under existing rules; this proposal does not alter them.

## 7. Acceptance checks for implementation

Use local synthetic arithmetic checks and temporary Metabase questions over synthetic read-only inputs if needed, followed by targeted reconciliation of installed questions. No production financial test writes are required. The UI/staging checks below are acceptance criteria, not already verified capabilities of this specific saved configuration.

1. **Known arithmetic:** daily values 10,20,30,40,50,60,70 give day-seven daily MA **40**, cumulative **280**, cumulative MA **120**. The first six averages are blank. On day eight with value 80, daily MA is **50**, cumulative **360**, cumulative MA **170**.
2. **Filter invariance:** the same date's four values match when displayed in a seven-day, thirty-day or all-history window. Selecting one historical date still computes its full trailing window and full cumulative baseline.
3. **Calendar behavior:** an explicit zero is counted; a missing/null date makes the affected average blank. Daily MA recovers when seven valid days follow the gap; cumulative remains unavailable until the gap is repaired.
4. **Signed values:** negative corrections remain signed. Cumulative may fall and axes must show it.
5. **Date boundaries:** yesterday is eligible; today/future are absent; clearing follows existing review semantics; prehistory is unavailable; disjoint periods produce guidance. Test month/year boundaries without resetting cumulative.
6. **Coverage and baseline:** unique snapshot date grain, verified expected H, complete calendar alignment, guarded cumulative input, input completeness outside the visible range, correct generation timestamps and no invented prehistory zeros.
7. **Refresh:** demonstrate using a synthetic source that changing one old daily amount updates the proper MA windows and all later cumulative values. Retain the existing refresh/rebuild ownership; test cache invalidation/refresh behavior rather than promising instant updates.
8. **Presentation:** two series per chart, 10,000 goal only on the gross daily chart, no stacking, one Y-axis per chart, no automatic fitted line or null interpolation; desktop and 390px checks of legends, gaps, signs and units.
9. **Metabase construction and compatibility:** verify both exact Offset expressions save in Summarize; helper-to-chart references preserve calculation order; date mappings target the outer result; original Performance questions, other tabs, live cards, existing source models, permissions and schedules remain unchanged. Database schema and migration files must be untouched.
10. **Long periods/export:** verify row counts and query limits, including helper sources; retain daily grain. Do not silently downsample, truncate or sum the moving-average fields when selecting a longer period.
11. **Recovery:** remove new placements/helper dependencies in reverse order or restore affected Metabase definitions from backup. No DB rollback is involved.

## 8. Evidence and task status

Repository sources reviewed: [implemented review page](IMPLEMENTATION.md), [original redesign](DESIGN.md), [model 74 SQL](../../../scripts/metabase/models/daily.sql), [daily snapshot projection](../../../scripts/metabase/models/daily-cash-snapshot.sql), [snapshot engine V37](../../../database/migrations/V37__unified_daily_cash_snapshots.sql), and [solution ownership rules](../../../Documents/Solution_Design.md). Official Metabase documentation checked for this revision confirms the Offset/Summarize approach and query-builder stages. Exact helper joins, null behavior, outer-filter mapping and style controls still require validation on the installed build during implementation. No live feasibility test was performed for this revision.

This revision updates design documentation only; the former SQL-view algorithm and deployment steps have been removed. No report, question, model, SQL object, financial row, grant, scheduler, AppSheet app or runtime setting was changed. No migration was created. Local synthetic arithmetic and document checks do not establish live numerical or UI validation. Documentation rollback is to revert this document/log batch. Original Performance replacement and this proposed enhancement both await a later owner instruction.
