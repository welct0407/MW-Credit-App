# Seven-day averages for Performance — design only

24 September 2026 · R016 remains Open · No report or database implementation authorized in this task.

## Recommendation

Restore the pair of charts in the owner's screenshot to **6R · Performance Review**: daily results with a trailing seven-day average, and cumulative results with a trailing seven-day average of the cumulative values. The cumulative chart serves an owner-valued purpose; this recommendation supersedes the earlier proposal to omit it from the review page.

Metabase can display both calculated series. Its documented custom-expression `Offset` supports rolling averages, and combo charts support area/line combinations. For this project, calculate the series centrally over stored daily snapshots, then let Metabase render them. The generic **Show trend line** option fits a trend automatically and does not establish the explicit seven-calendar-day definition required here. [Metabase rolling averages](https://www.metabase.com/docs/latest/questions/query-builder/expressions/offset), [combo charts](https://www.metabase.com/docs/latest/questions/visualizations/combo-chart), [chart settings](https://www.metabase.com/docs/latest/questions/visualizations/line-bar-and-area-charts).

Recommended scope is the review page only. Preserve original **6 · Performance** until the owner decides its future. No live API inspection or change was made for this design: current IDs and definitions below are based on the maintained implementation evidence and repository at starting commit `7efbe7dff03ea3a040349f9ea788c2c25ede1546`. Reconfirm affected live definitions when implementation starts. The screenshot establishes the requested visual pattern, not the old chart's exact moving-window, partial-window or filter configuration.

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

The cumulative average is the average of seven accumulated balances. It is not the seven-day sum of daily earnings, an average daily earning rate, or a cumulative sum of the daily moving averages. Use two calculation stages so the cumulative values exist before averaging them. Explicit ordered SQL window frames support this calculation. [PostgreSQL window functions](https://www.postgresql.org/docs/current/tutorial-window.html).

Require seven complete calendar dates for each average. Do not use partial windows, future values, centered averages, weekly buckets, rounding before averaging or the previous seven transaction rows. Preserve the actual daily/cumulative series during the first six dates of available history; show the average as blank until seven valid dates exist. The screenshot alone does not prove whether its earliest averages used partial windows; strict seven-day averages are the proposed rule.

## 4. Date selection and coverage

Continue using the review page's independent `review-performance` period control, defaulting to the previous 30 completed days. Apply its visible date selection **after** calculating the series:

1. Read the stored calendar history needed for calculation, excluding today/future.
2. Build one row per calendar date; left-join snapshots, retaining gaps.
3. Calculate daily/cumulative values and both averages.
4. Limit the output to the selected completed dates.

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

## 5. Data and computation architecture

Use existing stored portfolio/date snapshots. No new physical analytics table, persisted rolling-average column, cumulative-balance column, materialized view, scheduled job or AppSheet field is needed. The current hourly yesterday/today refresh and unified historical rebuild remain unchanged.

Recommended implementation: add one narrowly scoped **read-only PostgreSQL reporting view**, with proposed name `public.reporting_performance_trends` (not yet created or reserved). It should calculate the four series and coverage metadata from `public.reporting_daily_snapshot`. This follows the project's ownership rule for reusable running calculations while keeping financial reconstruction in the existing snapshot engine. It does not rescan loan/repayment transaction history for every chart.

Expose the view through two thin native Metabase questions. A new Metabase model is unnecessary for these two consumers. Preserve models 70, 71, 74, 205 and their existing fields/semantics. Do not globally fix or repurpose model 74's existing cumulative field: its other consumers are outside this change.

Suggested view output contract (names are proposed):

| Field | Meaning |
| --- | --- |
| Date | Unique Bangkok snapshot date; one row per calendar day H…T−1 |
| History Start | H; allows accurate cumulative labeling |
| Gross Interest | Nullable daily stored Interest Received |
| Gross Interest MA7 | Nullable exact seven-calendar-day mean |
| Cumulative Gross Interest | Nullable complete running sum since H |
| Cumulative Gross Interest MA7 | Nullable mean of seven valid cumulative values |
| Daily Window Valid Days | 0…7 nonnull daily inputs in the window |
| Cumulative Missing Days | Missing/null daily inputs in H…d |
| Cumulative Window Valid Days | 0…7 valid cumulative values in the window |
| Generated At | Actual generation time for d's snapshot, nullable |
| MA Input Oldest / Latest Generation | Timestamp range of the seven-day daily inputs; validity still comes from counts |
| Cumulative Input Oldest / Latest Generation | Timestamp range since H; no blanket age-based stale classification |

Ordinary views compute on query. Reusing snapshots avoids rebuilding transactions, but a view alone is not a performance cache. Measure realistic history ranges before claiming speed gains; do not introduce materialization preemptively.

### SQL algorithm sketch — documentation, not a migration

This illustrates the gross-interest calculations only. Production code must add the output metadata above, source/grain checks and the outer selected-date join/guard. It has not been executed against the database in this design task.

```sql
WITH source AS (
  SELECT "Snapshot Date" AS d,
         "Interest Received"::numeric AS x
  FROM public.reporting_daily_snapshot
  WHERE "Snapshot Date" < public.olap_reporting_date()
), origin AS (
  SELECT min(d) AS h FROM source
), calendar AS (
  SELECT h, generate_series(
    h, public.olap_reporting_date() - 1, interval '1 day'
  )::date AS d
  FROM origin WHERE h IS NOT NULL
), daily AS (
  SELECT c.h, c.d, s.x
  FROM calendar c LEFT JOIN source s ON s.d = c.d
), accumulated AS (
  SELECT *,
    CASE WHEN count(x) OVER prefix = count(*) OVER prefix
         THEN sum(x) OVER prefix END AS cumulative,
    CASE WHEN count(x) OVER seven = 7
         THEN sum(x) OVER seven / 7::numeric END AS daily_ma7
  FROM daily
  WINDOW prefix AS (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
         seven AS (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
), curves AS (
  SELECT *,
    CASE WHEN count(cumulative) OVER seven = 7
         THEN sum(cumulative) OVER seven / 7::numeric END AS cumulative_ma7
  FROM accumulated
  WINDOW seven AS (ORDER BY d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
)
SELECT h, d, x, daily_ma7, cumulative, cumulative_ma7
FROM curves
-- Apply the dashboard's validated visible-date selection outside these windows.
ORDER BY d;
```

The calendar is essential: a seven-row frame represents seven days only when one unique row exists for every calendar date. PostgreSQL averages otherwise ignore null inputs, so explicit counts are required. Metabase's Offset documentation also warns about missing rows; using it alone over a filtered set of existing snapshots would not satisfy this contract. [Offset and missing dates](https://www.metabase.com/docs/latest/questions/query-builder/expressions/offset).

## 6. Change map for a future implementer

| Asset | Proposed change |
| --- | --- |
| Dashboard 3 / review tab 18 | Enhance the daily chart, add the cumulative chart and rearrange only affected review-page placements. |
| Question 222 | Read Date, Gross Interest and Gross Interest MA7 from the new provider; retain its existing dashboard filter identity. Check current consumers first. |
| New cumulative question | Read Date, Cumulative Gross Interest and its MA7. Allocate its ID only when created; do not repurpose original question 99. |
| Question 228 / review context | Add history origin and calculation-window completeness, keeping actual snapshot freshness. |
| Original tab 7, questions 98/99 | Preserve; still available for owner comparison. |
| Other review questions | Preserve calculations. Reposition affected charts only. An export/detail for the four plotted series can be provided via the questions; do not widen the existing daily table by default. |
| PostgreSQL | One new compatible read-only reporting view plus the minimum SELECT grant for the existing reporting reader. Use the next available immutable migration at implementation time; no version reservation in this design. |
| Maintained files | Update PerformanceReview builder/verifier, saved plan/IDs/evidence, owning YAML objects and release log after actual implementation. |

Before implementation, re-read the single Open release in the tracker, verify DEV/PROD identities and affected consumers, and capture affected dashboard/questions for rollback. Test the database addition in DEV through the established migration procedure. Any PROD SQL/report publication must have scoped owner authorization; this request explicitly authorizes design only. Do not infer implementation approval from this handoff. No new release number or tracker freeze is needed for the present document task.

Historical corrections do not require rebuilding all future snapshot rows merely to recompute these derived curves. When an underlying daily flow x(d) is corrected and its source snapshot rebuilt, its daily MA influence spans d…d+6; its cumulative influence spans d onward. The ordinary view derives both on the next query, subject to Metabase query caching. This does not override the existing engine's need to rebuild later EOD snapshots if the underlying correction also affects balances or other stored state. Do not write rolling values back into Daily Analytics.

## 7. Acceptance checks for implementation

Use synthetic fixtures for arithmetic, then targeted read-only reconciliation on the installed questions. No production financial test writes are required.

1. **Known arithmetic:** daily values 10,20,30,40,50,60,70 give day-seven daily MA **40**, cumulative **280**, cumulative MA **120**. The first six averages are blank. On day eight with value 80, daily MA is **50**, cumulative **360**, cumulative MA **170**.
2. **Filter invariance:** the same date's four values match when displayed in a seven-day, thirty-day or all-history window. Selecting one historical date still computes its full trailing window and full cumulative baseline.
3. **Calendar behavior:** an explicit zero is counted; a missing/null date makes the affected average blank. Daily MA recovers when seven valid days follow the gap; cumulative remains unavailable until the gap is repaired.
4. **Signed values:** negative corrections remain signed. Cumulative may fall and axes must show it.
5. **Date boundaries:** yesterday is eligible; today/future are absent; clearing follows existing review semantics; prehistory is unavailable; disjoint periods produce guidance. Test month/year boundaries without resetting cumulative.
6. **Coverage and baseline:** unique snapshot date grain, verified expected H, input completeness outside the visible range, correct generation timestamps and no invented prehistory zeros.
7. **Refresh:** demonstrate using a synthetic source that changing one old daily amount updates the proper MA windows and all later cumulative values. Retain the existing refresh/rebuild ownership; test cache invalidation/refresh behavior rather than promising instant updates.
8. **Presentation:** two series per chart, 10,000 goal only on the gross daily chart, no stacking, one Y-axis per chart, no automatic fitted line or null interpolation; desktop and 390px checks of legends, gaps, signs and units.
9. **Compatibility:** original Performance questions, all other tabs, live cards, shared models, permissions and schedules remain unchanged except the specifically approved read-only view grant. Use targeted saved-definition comparisons.
10. **Long periods/export:** verify row counts and query limits; retain daily grain. Do not silently downsample, truncate or sum the moving-average fields when selecting a longer period.

## 8. Evidence and task status

Repository sources reviewed: [implemented review page](IMPLEMENTATION.md), [original redesign](DESIGN.md), [model 74 SQL](../../../scripts/metabase/models/daily.sql), [daily snapshot projection](../../../scripts/metabase/models/daily-cash-snapshot.sql), [snapshot engine V37](../../../database/migrations/V37__unified_daily_cash_snapshots.sql), and [solution ownership rules](../../../Documents/Solution_Design.md). Official Metabase documentation checked on 24 September 2026 describes v0.63 capabilities; exact style controls must still be checked against the installed build during implementation.

This task creates design documentation only. No report, question, model, SQL object, financial row, grant, scheduler, AppSheet app or runtime setting was changed. No migration was created and no numerical/live validation is claimed. Documentation rollback is to revert this document/log batch. Original Performance replacement and this proposed enhancement both await a later owner instruction.
