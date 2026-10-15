# Performance tab redesign — implementation handoff

**Implementation update, 24 September:** the owner subsequently authorized a **new parallel review page**, preserving the original Performance page. This design is retained as the proposal; its replacement/removal instructions are superseded for the current implementation. See [implemented page, exact scope and verification](IMPLEMENTATION.md).

**Later design revision, 24 September:** the owner identified both seven-day trend averages as important. The [seven-day averages design](SEVEN_DAY_TRENDS_DESIGN.md) proposes enhancing the daily chart and restoring a cumulative chart to 6R, superseding this document's recommendation to omit cumulative results. That enhancement is **design only**, not implemented or authorized for implementation in that task.

**Latest approach revision:** use Metabase query-builder `Offset` expressions over existing snapshots, with supporting saved questions and the display filter applied after calculation. The earlier new-DB-view proposal is superseded. No new DB object, grant, handwritten SQL or live implementation is included in this design-only revision.

Date: 24 September 2026 (Asia/Bangkok). Status: **proposed design, not implemented**.

The owner requested a review/design and will use another model to implement it. This task made read-only Metabase API inspections and read-only source queries, and created documentation only. It did not change any dashboard, question, model, database object, data, permission or schedule. Starting repository commit: `308bd93a80cf31bd0ce801b0fa6adfd051f22d85`; clean tree. Continue R016 rather than reserving a new release just for this design.

Target: [Loan Reports](https://reports.mw-credit.com/dashboard/3), **visible tab 6 · Performance**, internal dashboard tab ID **7**. Visible tab numbers are not internal IDs. Income Statement is now tab 3; Cashflow Statement is tab 4. Preserve the other tabs, including the separately added Tab 11.

## 1. Recommendation

Make Performance the page for **lending activity, gross interest and portfolio activity**, with two clearly labeled sections:

1. **Selected-period results · live on report refresh**: three large KPI cards and the interest-by-loan-type breakdown.
2. **Completed-day history · stored daily snapshots**: five charts and one daily detail table, with date coverage and actual snapshot generation times.

This reduces **14 data visuals to 10**, excluding headings and source/status information. It keeps expense/net-profit analysis on Income Statement and custody/cash movements on Cashflow. “Principal returned” here means the posted loan-principal component; it is not total cash inflow.

No new daily table, stored financial field, account snapshot, refresh bot or historical backfill is needed for this design. Reuse the existing **Daily Performance model 74** and the existing daily snapshot engine. Simple sums and ratios over stored daily rows are appropriate report calculations; storing every chart-specific ratio or running sum would add needless state.

## 2. What is actually there now

Inspection used the current saved dashboard 3 and questions/models, not just old generated plans. There are 14 data placements: four scalars, nine charts and one daily table. The current `performance-date` parameter has no saved default. Most visuals follow that parameter; question 56 does not.

**Five charts and the detail table already use Daily Analytics**, through model 74. This is therefore a targeted cleanup and completion of snapshot use, not a wholesale migration of raw-history charts.

| Current question / placement | Current visual and source | Proposed disposition |
| --- | --- | --- |
| 94 / 212 | Gross interest; sum of Interest Paid from Repayment Ledger 71, filtered by Payment Date | Keep live KPI; title **Gross interest · live**. |
| 56 / 361 | 7-Day Profit Growth %, from Portfolio Overview 73; ignores Performance period | Remove **this placement only**. Question 56 is also on Overview, placement 48: preserve it and its fixed seven-day calculation. |
| 96 / 214 | Loans issued; count of Loan Book 70, filtered by Loan Date | Keep live KPI; title **Loans issued · live**. |
| 97 / 215 | Principal issued; sum of Principal Amount from model 70, filtered by Loan Date | Keep live KPI; title **Principal issued · live**. |
| 98 / 217 | Daily gross interest; model 74 `Profit` | Keep snapshot chart; exclude today, use full selected history range, label the metric Gross interest. |
| 99 / 218 | Cumulative gross interest; model 74 `Cumulative Profit` | Remove from this tab. Its running total begins at the first stored snapshot, not the chosen period's start, and adds little to the daily pattern/detail. |
| 103 / 219 | Principal issued over time; raw loan-date aggregation from model 70 | Switch to model 74. Enhance to **Principal issued & returned**, grouped bars in the same unit and scale. |
| 104 / 220 | Loans issued over time; raw loan-date count from model 70 | Switch to model 74 `Loans Issued`; retain a separate count chart. |
| 100 / 221 | Daily capital yield; model 74 ratio | Remove from this tab. Its denominator is closing principal plus principal returned, and zero/nonpositive denominators currently become 0. This is not an established period ROI measure. Do not silently substitute a new return formula. |
| 105 / 222 | Interest by loan type; model 71, filtered by Payment Date | Keep horizontal bars in the **live section**. Daily portfolio snapshots do not contain a loan-type breakdown. |
| 106 / 223 | Average loan size · weekly; average loan Principal Amount from model 70 | Switch to snapshot ratio **sum(Principal Issued) / sum(Loans Issued)** per selected week. |
| 101 / 225 | Active loans · past 30 days; model 74 plus an internal 30-day flag | Reuse for **Active loans & borrowers · day end**, two lines on one count axis. Remove the internal 30-day flag. |
| 102 / 226 | Active borrowers · past 30 days; model 74 plus internal 30-day flag | Remove the redundant placement after its series is added to question 101. |
| 107 / 227 | Period performance · daily; model 74 | Keep and expand the snapshot detail columns described below. |

Do not immediately archive questions 99, 100 or 102. First remove their placements, then inspect current dashboard/question/snippet/subscription dependencies. Archive only if genuinely unused. Never archive question 56, and do not repurpose it into a different Performance metric.

### Observed problems to correct

- Model 74 exposes today's provisional snapshot. The current Performance historical questions generally do not exclude it or label it as provisional.
- Questions 101/102 intersect the page date filter with their own `In Last 30 Days = true` restriction. Selecting older history can therefore hide valid stored dates.
- The unfiltered fixed-window growth KPI sits beside period-filtered KPIs and is still named Profit even though the basis is gross interest.
- The cumulative chart's period filter limits displayed points but does not reset the running total.
- Live and stored results lack a clear visual source boundary, making correction/refresh differences look like inconsistent arithmetic.
- Summing daily percentages or daily closing counts across broader date buckets would produce invalid period metrics. The new definitions must make aggregation rules explicit.

## 3. Sources and what to reuse

| Existing object | Relevant contract | Use in this design |
| --- | --- | --- |
| `public."Daily Analytics"` | One row per Snapshot Date, stored by the existing rebuild engine | Authoritative stored historical values; no new columns required. |
| `public.reporting_daily_snapshot` | Existing governed projection of Daily Analytics, including freshness/provisional context | Available for read-only source validation; do not create a duplicate daily store. |
| Metabase model **74**, Daily Performance | Thin daily snapshot projection plus existing inexpensive derived fields; exposes Generated At and Model Version | Reuse for all six proposed historical data visuals. Keep its existing fields and contracts for other consumers. |
| Metabase model **70**, Loan Book | One row per loan; Loan Date, Principal Amount and loan type | Live issuance KPIs. |
| Metabase model **71**, Repayment Ledger | One posted repayment row; Payment Date, Interest Paid, Principal Paid and current loan-type label | Live gross-interest KPI and type breakdown. |
| Metabase model **73**, Portfolio Overview | Shared live overview metrics including the fixed seven-day growth | Leave untouched; Performance no longer needs its growth placement. |
| `public.reporting_statement_calendar` | Existing statement date-selection infrastructure | Reuse the proven date-filter/calendar pattern where suitable; inspect its bounds before relying on it to detect requested dates outside coverage. |

**Do not globally change model 74 to exclude today or impose the Performance date range.** Other retained consumers include questions 62 (Daily Outstanding Principal), 63 (Daily Profit) and 64 (Daily Overdue Charges). Question 62's restored fixed 120,000 reference is outside this task. Apply Performance's date rules in the affected questions only.

Model 74 currently aliases stored Interest Received as `Profit`. Display **Gross interest** in Performance titles, legends and table headers without renaming/removing this shared model field. Its existing cumulative/yield fields can remain for compatibility; this task does not require calculating them in new charts, rebuilding history for them, or dropping them.

Do not repurpose Daily Cash Snapshots model 205 or account snapshots 206 merely because they are newer. Model 74 already exposes the lending fields needed here. There is no need for another Metabase model containing the same daily lending rows.

### Snapshot fields and semantics

| Model 74 field | Stored source | Rule |
| --- | --- | --- |
| Date | Snapshot Date | Bangkok business date. |
| Profit | Interest Received | Posted gross interest for that date; retain signed adjustments. |
| Principal Issued | Principal Issued | Sum of loan principal dated that date. |
| Principal Returned | Principal Returned | Sum of posted repayment principal dated that date. |
| Loans Issued | Loans Issued | Number of loan records dated that date. |
| Active Loans EOD | Active Loans EOD | Existing engine counts loans with Loan Date <= date and Close Date absent or after date. It is a date/closure definition, not a newly inferred positive-balance count. |
| Active Borrowers EOD | Active Borrowers EOD | Distinct borrowers among those active loans; preserve existing engine semantics. Never sum this across dates. |
| Generated At / Model Version | Corresponding stored fields | Explain generation time and compatibility; do not manufacture an as-of timestamp at query time. |

The current loan/repayment questions do not apply a hidden-borrower exclusion. Keep the existing all-portfolio population. Do not add a hidden-borrower, loan-type, partner or cash-account filter to portfolio-level snapshots that cannot support that dimension.

## 4. Date and freshness contract

Use one selector named **Performance period**, retaining parameter ID `performance-date`. Default to the **last 30 completed Bangkok dates**: today minus 30 through yesterday, inclusive. Verify the saved relative-date option actually gives these dates rather than assuming the label's semantics.

- **Live section:** apply the selected dates to Payment Date or Loan Date, as appropriate. Bound future selections at Bangkok today. If today is selected, its activity is live at query refresh.
- **History section:** apply the same selection to snapshot Date, with an additional `Date < public.olap_reporting_date()` guard. Never append an hourly snapshot for today to a chart labeled completed-day history.
- **Today only:** live cards/breakdown show today's activity; history says **No completed dates in this selection**. No fallback to yesterday.
- **Future only:** no eligible dates; show unavailable/no dates rather than a misleading zero-profit period.
- **Cleared selector:** explicitly support all available history through today for live queries and through yesterday for snapshot queries; label the effective dates. The normal default remains 30 completed days.
- Support continuous date presets/ranges. For disjoint advanced selections, display guidance to choose a continuous period rather than replacing the selected set with MIN/MAX and silently filling excluded dates.
- For an empty-activity but valid covered period, live totals and stored daily flow/count values are zero. For an absent snapshot or null required field, retain unavailable values/gaps.
- A range crossing today is intentionally live-through-today at the top and stored-through-yesterday below; state both effective ranges. Do not imply the two sections necessarily reconcile over different dates.

**No automatic whole-page today/live-versus-past/snapshot switching.** The role of each visual determines its source. A past selected period's summary still reflects current corrected transaction records, while its stored history reflects the last rebuild of those dates. This preserves the source policy used by Income Statement and Cashflow.

Show a small live context block: selected/effective period, **Live on report refresh**, and actual query time in Bangkok. “Live” does not mean push updates between report refreshes.

For history, show completed effective period, available/missing dates, and oldest/latest Generated At among selected stored rows. Use a compact two-column status table or equivalent readable presentation. The heading should say **Stored daily history** and the note should say **Refresh job runs hourly for today/yesterday; older corrections require a rebuild.**

Do not mark an old historical row stale solely because Generated At is older than one hour. Historical rows are intentionally retained. A missing yesterday row or overdue generation for dates the Recent job should cover is a different condition; any overdue threshold must follow the existing documented monitoring policy, not an invented chart rule.

### Missing dates and partial weeks

Build the selected completed-date spine before joining snapshots, and retain one row per requested eligible date. Determine requested bounds independently of the minimum stored date so pre-coverage dates are reported unavailable rather than silently discarded. Inspect the existing calendar's bounds; supplement with a bounded generated date series if needed. This is calendar generation, not financial-history reconstruction.

Do not `COALESCE` missing snapshots to zero, connect a line through missing values, carry a previous closing value forward, or show a partially populated week as complete. A week with any missing required selected daily input has an unavailable weekly average and a coverage warning. A boundary week containing only part of the chosen period is allowed; label it **selected days only**. The daily detail and coverage status must make gaps reviewable.

## 5. Proposed visual layout

Treat these coordinates as a starting grid, then check desktop and a narrow viewport. Retain tab ID 7. Reuse existing placement IDs where a visual survives; new source/status cards may use new IDs allocated by Metabase.

| Rows / width on 24-column grid | Content |
| --- | --- |
| Heading + short context | **Lending performance**; Performance period selector; gross-interest definition. |
| One row, three equal 8-column tiles, height 3 | Gross interest (94), Principal issued (97), Loans issued (96). Consistent full-number formats and tile dimensions. |
| Next row: 16 + 8 columns | Horizontal **Gross interest by loan type · live** (105), plus live period/source/query-time context. |
| Full-width section heading + compact status | **Completed-day history · stored snapshots**, coverage and generation context. |
| 12 + 12 columns, equal height | **Daily gross interest** (98); **Principal issued & returned** (103), grouped bars. |
| 12 + 12 columns, equal height | **Loans issued** (104), integer bars; **Average loan size · weekly** (106), money bars. |
| 24 columns | **Active loans & borrowers · day end** (101), two labeled lines. |
| 24 columns | **Daily performance detail** (107), sortable table; date descending by default so recent days appear first. |

Use one y-axis for both principal monetary series and one count y-axis for active loans/borrowers; disable automatic axis splitting on those comparisons. Do not combine principal money and loan counts on a dual-axis chart. Principal returned uses its stored sign: ordinary returns above zero and signed corrections below zero. Avoid borrowing model 74's intentionally negated `Returned Chart Amount` from another visual.

Daily gross interest can remain a line; preserve gaps and signed corrections. Avoid point-value labels on dense trends. Use distinct, consistent colors for issued/returned and loans/borrowers, with explicit legends. Use whole-baht formatting on cards/tables and integer loan/borrower counts. Format weekly average loan size to whole baht; do not round inputs before division. On narrow screens, stack charts and let only the detail table scroll horizontally as needed.

## 6. Exact aggregation rules

### Live summary and breakdown

- Gross interest: sum model 71 Interest Paid over eligible selected Payment Dates; preserve signed adjustments.
- Principal issued: sum model 70 Principal Amount over eligible selected Loan Dates.
- Loans issued: count loan rows from model 70 over those dates.
- Gross interest by loan type: group the same model 71 population/date set by Loan Type. Preserve Unknown; do not omit zero/negative adjustments merely to make bars attractive. The sum must reconcile to the live gross-interest KPI for the identical selection.
- Retain the current type attribution through Loan Book. It uses current source labels; do not claim that loan-type labels are historized in daily snapshots.

### Stored trends and table

- Daily interest, principal flows and issuance count: the corresponding one-row-per-date stored fields, with no loan/repayment-history joins.
- Weekly average loan size: `SUM(Principal Issued) / NULLIF(SUM(Loans Issued), 0)` over selected, complete snapshot days in each Monday-start week. **Never average daily averages.** Zero loans produces unavailable, not zero average. Validate source principal is non-null or explicitly reconcile the average's population before rollout.
- Active loans/borrowers: use the stored values for each date; never total them over the period. If later adding weekly/monthly display buckets, use the last selected date of each bucket, not SUM and not MAX. A missing closing observation stays missing.
- Table columns: **Date, Gross interest, Principal issued, Principal returned, Loans issued, Average loan size, Active loans EOD, Active borrowers EOD**. Daily average is Principal Issued / NULLIF(Loans Issued,0). Keep Generated At and Snapshot ID available for verification but hide them in the default table; status handles freshness. Do not enable totals on average or EOD columns. Prefer no automatic total row unless individual aggregation rules can be controlled correctly.

The original `Daily Capital Yield` and `Cumulative Profit` fields do not need to change. Removing their Performance placements is not permission to change shared source semantics or add a new ROI definition. A future request for an exposure-weighted return would be a separate explicit metric design.

## 7. Refresh, history and correctness

Existing `public.refresh_daily_analytics(p_from,p_to)` remains the single engine. The existing hourly bot calls it for yesterday/today. It already stores Principal Issued, Loans Issued, Principal Returned, Interest Received and both active counts. No newly added field needs historical population for this proposal.

Do not rebuild history merely because a question changes from raw rows to stored fields. Rebuild only if coverage or reconciliation identifies missing/stale dates, using the maintained runner and the applicable authorization/recovery procedure:

```powershell
./scripts/database/Invoke-AnalyticsRebuild.ps1 -Environment development -From <earliest-affected-date>
```

Production rebuilds require the runner's scoped approval and verified-backup references. Rebuild from the earlier old/new effective date through today after a historical correction; the normal two-day job will not repair arbitrary older dates. Never create a second scheduler or a report-triggered write.

Historical snapshots are **restatable derived history**, not an immutable audit record. Active counts depend on recorded loan/close dates; historical corrections can alter them after rebuild. Keep that meaning rather than claiming historical facts the underlying records cannot reconstruct.

## 8. Evidence from this review

Read-only production inspection on 24 September found:

- Dashboard 3 internal tab 7 is `6 · Performance`; all 14 question IDs and placements above were inspected live.
- Model 74 reads `public."Daily Analytics"`; models 70/71 read the governed loan/repayment OLAP providers. Model 73 supplies the shared growth card.
- Stored coverage was **1 August–24 September 2026**, 55 daily rows, Model Version 3, including one row for today. Thus 54 completed dates were available at review time.
- A read-only grouped reconciliation checked all **54 completed dates**: **zero mismatches** for Principal Issued, Loans Issued, Interest Received and Principal Returned against their live OLAP sources. The covered loan population contained zero null principal amounts.
- These checks establish present data parity for the migration candidates. They do not prove future correction freshness, all historical data quality, GUI layout, or a measured query-speed improvement. This design review did not run a browser layout audit or a load benchmark.

Source references: [snapshot engine contract](../daily-snapshots/README.md), [current cash statement/source policy](../statement-cleanup/README.md), `database/migrations/V37__unified_daily_cash_snapshots.sql`, `scripts/metabase/models/daily.sql`, `scripts/metabase/models/loans.sql`, `scripts/metabase/models/repayments.sql`, and live Metabase GET `/api/dashboard/3`, `/api/card/{id}`. No private financial rows or amounts are included in this handoff.

## 9. Implementation sequence for the next model

1. Read project AGENTS, the current R016 tracker/log, this handoff and affected current definitions. Recheck dashboard 3/tab 7 and the source database tuple. Reuse valid prior evidence; this document is a dated inspection, not an instruction to overwrite intervening owner edits.
2. Record starting Git state. Back up the current dashboard and every question being edited before mutations; preserve question/model metadata, filters, placement settings and recoverability. No database backup/migration is required if implementing only the proposed report changes.
3. Capture affected-question dependencies across all dashboards, questions, snippets and subscriptions. Confirm the reused questions other than 56 are still exclusive to Performance before changing their saved definitions. If a question acquired another consumer, use a separate Performance variant rather than silently changing that consumer.
4. Reuse model 74 unchanged. Rewrite 98/103/104/106/101/107 to apply the completed-date and coverage rules. Move 103/104/106 off raw-history sources. Keep 94/96/97/105 live with consistent effective dates and future guards. Configure `performance-date` default and saved mappings to the right field/template tag for each question; preserve the parameter ID.
5. Remove placements 361/218/221/226 from tab 7 only. Reuse surviving placements, implement three equal KPI cards, section labels, status and table. Preserve other dashboard tabs, their question definitions, filter behavior and owner colors. Do not run an old broad installer that rebuilds unrelated tabs.
6. Run the targeted acceptance checks below; read back saved definitions and verify the actual dashboard filter mappings. Check the browser on desktop and a narrow viewport. Do not claim a page change complete from API write success alone.
7. Update the maintained Performance builder/installer path and generated definitions so a later run does not restore removed charts or old filter mappings. `scripts/metabase/Build-RemainingPages.mjs` still calls this section page 4: that is a historical builder index, whereas current visible position is 6 and stable internal tab ID is 7. Inspect the actual installer bindings before changing numeric IDs. Do not run the whole builder/installer blindly.
8. Update exact affected YAML using the dictionary helper and hash/value guards; preserve the frozen Excel evidence. Owning dashboard: `Documents/Data Dictionary/systems/metabase/dashboards/loan-reports.yaml`; model 74's YAML should remain unchanged if its definition does. Inspect how unaffected page definitions are referenced before adding Performance definitions—do not pretend that editing the cash_pages section documents this tab.
9. Update the existing R016 log and applicable report/source contract, record checks and rollback, then commit/push intended sanitized files under the standing repository rule. Keep design approval, implemented status and whole-R016 closure distinct. No AppSheet/RC/Flyway changes are inherent in this design.

### Acceptance checks

- Default resolves to exactly 30 completed Bangkok dates. Test current month, yesterday, today only, a historical range outside the former 30-day window, future-only, an empty-activity period and clear/all-history behavior.
- Live type breakdown reconciles to live gross interest. Issuance KPIs keep the same population and signed amount semantics. Historical totals reconcile to live sources **for identical completed dates after an appropriate rebuild**, not automatically for differing date ranges or unrefreshed corrections.
- Questions 103/104/106 resolve to stored daily rows and do not expand loan/repayment event history. Historical questions exclude today. No internal 30-day filter remains on active counts.
- Validate weighted weekly average on a synthetic read-only example: day A issues 1 loan totalling 100, day B issues 3 totalling 900; weekly mean is 250, not 200. A zero-loan week is unavailable. Verify partial boundary weeks use only selected dates.
- Use a read-only fixture or isolated query to omit one snapshot day. The affected daily point is missing and its weekly aggregate is unavailable; coverage reports the missing date. No production financial records need to be created for this check.
- Verify active counts are point-in-time observations, not sums across days. Reconcile using the engine's loan/close-date rule, not the current outstanding-principal heuristic.
- A negative adjustment remains visible, including in the interest/type breakdown and principal-flow chart. Do not drop negative rows to improve chart appearance.
- Source status shows actual Generated At, distinguishes absent coverage from zero activity, and does not label older unchanged history stale just because it was not regenerated this hour.
- Shared question 56 still works on Overview, model 74 is unchanged, question 62's fixed reference survives, other tab placements/filters/owner styling remain unchanged. Only unused removed questions may be archived after dependency checks.
- Browser: three readable equal KPI cards, no hidden source-switching, one axis per two-series comparison, both active-count legends visible, table details usable with horizontal scrolling on a narrow viewport.

### Rollback

Restore affected question definitions and tab-7 dashboard placements/filter mappings from the immediately preceding private backup; unarchive any questions archived by this implementation. Preserve later changes elsewhere in the shared dashboard instead of restoring an old whole-dashboard snapshot over them. Revert the corresponding repository batch. No financial-data or database rollback should be necessary for the proposed report-only implementation.
