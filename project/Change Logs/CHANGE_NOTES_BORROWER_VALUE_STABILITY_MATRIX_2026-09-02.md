# Borrower value and stability matrix change notes — 2026-09-02

## Status

Implemented and structurally verified; manual borrower-level acceptance and refresh-performance testing are pending. No production deployment or dashboard publication action was performed.

## Scope and purpose

- Added the design-specified `Borrower Value & Stability Matrix` to page 3, `Borrowers Analysis`, of Looker Studio report `Loan Reports - Mobile`.
- Added the reusable calculation layer to the OLAP app `Loan Business Insights`, not the OLTP Operations app.
- Kept the original `Capital vs Profit Scatter Plot` and all other Borrowers page charts.
- Updated the governed data-model overview and Excel data dictionary in the same change.
- Treated `borrower-value-stability-matrix.md` as the supplied design specification, not as authorization to expand the task beyond the requested visualization.

## Rollback points

| Asset | Recorded rollback point |
| --- | --- |
| OLAP AppSheet app | `Loan Business Insights` v1.000173, app ID `e74dd368-654f-44d7-bccf-83cf361d1cdb` |
| Looker Studio report | `Loan Reports - Mobile - Backup 2026-09-02 pre-borrower-value-stability-matrix`, report ID `abe7aa2e-e887-4066-883a-c7ddb985d5cf`, created 2026-09-02 |

The final saved OLAP version is v1.000175. Version v1.000174 was an intermediate invalid save in which the history-span comparison used an incompatible duration/number comparison; v1.000175 corrected it to `TOTALHOURS(...) >= 720` and the editor then validated without errors.

## AppSheet OLAP changes

Eleven hidden virtual columns were added to `Borrowers` and appended to the read-only `Reporting Borrowers` slice, increasing that slice from 40 to 51 fields:

| Live OLAP order | Column | Type | Role |
| --- | --- | --- | --- |
| 59 | `Matrix Active Borrower Count` | Number | Active-population helper |
| 60 | `Matrix Equal Share Benchmark` | Percent | Dynamic X threshold: `1 / active borrower count` |
| 61 | `Matrix Economic Contribution` | Percent | X axis: borrower 30-day realized-profit share among active borrowers |
| 62 | `Matrix Recent Reliability Score` | Number | 30-day on-time component |
| 63 | `Matrix Historical Reliability Score` | Number | 180-day on-time component |
| 64 | `Matrix Delay Severity Score` | Number | 90-day delay-severity component |
| 65 | `Matrix Current Condition Score` | Number | Current condition, with due-today not late |
| 66 | `Matrix History Sufficient` | Yes/No | At least 3 past obligations spanning at least 30 days |
| 67 | `Matrix Stability Score` | Number | Normalized 0–100 weighted Y score |
| 68 | `Matrix Quadrant` | Text | Star, Cash Cow, Question Mark, Dog, provisional, or unclassified |
| 69 | `Matrix Bubble Label` | Text | Borrower name plus classification for Looker |

Stability weights are recent reliability 45%, historical reliability 20%, delay severity 20%, and current condition 15%. Missing historical components are excluded from the numerator and denominator so the available weights are renormalized. Exact formulas and purposes are recorded in `Documents/AppSheet_Data_Dictionary.xlsx`.

## Looker Studio changes

| Setting | Delivered configuration |
| --- | --- |
| Report / page | `Loan Reports - Mobile` / `Borrowers Analysis` |
| Chart | Scatter/bubble chart titled `Borrower Value & Stability Matrix — size = outstanding principal` |
| Dimension | `Matrix Bubble Label` |
| X metric | `Matrix Economic Contribution`, displayed as percent |
| Y metric | `Matrix Stability Score`, fixed 0–100 axis |
| Bubble size | `Total Outstanding Principal` |
| Population | Chart filter `Borrowers - Has Active Loan` |
| X reference | Average of `Matrix Economic Contribution`, labeled `Equal-share benchmark`; current observed value 6.25% |
| Y reference | Constant 80, labeled `Stability benchmark (80)` |
| Labels | Enabled; borrower name plus quadrant |
| Retained visual | Original `Capital vs Profit Scatter Plot` remains below the matrix |

Native Looker scatter charts accept only one effective breakdown dimension at this grain. Adding `Matrix Quadrant` as a color dimension aggregated the chart to one bubble per quadrant, so the delivered borrower-grain chart uses a single bubble color and carries the quadrant in the label. This preserves analytical accuracy and is a documented visual limitation.

## Checks performed

- Confirmed the OLAP pre-change version and created the Looker report backup before editing.
- Reviewed the existing Borrowers, Loans, Charges, and Repayments dependencies before adding formulas.
- Confirmed all eleven fields exist in OLAP and in `Reporting Borrowers`.
- Confirmed OLAP v1.000175 loads and the editor reports no formula/schema error.
- Confirmed the Looker borrower data source refreshed and exposed the eleven fields.
- Confirmed the matrix is filtered to 16 active borrowers, matching the page's `Active Borrowers` KPI.
- Confirmed the observed equal-share reference is 6.25%, which equals `1 / 16`.
- Confirmed the X metric uses the same `Profit Last 30 Days` source as the existing 30-day borrower profit contribution visual. The dominant matrix point near 57% is directionally consistent with that visual's top contribution near 57.1%.
- Confirmed Y is bounded to 0–100 and the reference line is exactly 80.
- Confirmed bubble size is `Total Outstanding Principal` and all 16 active borrowers render as individual labels; the observed classifications were 13 `Star` and 3 `Question Mark`.
- Confirmed due-today charges use `Charge Date = TODAY()` branches and do not enter any late branch, all of which require `Charge Date < TODAY()`.
- Confirmed equality is assigned to the high-value/high-stability side through `>=` comparisons.
- Confirmed the original capital-versus-profit scatter remains present as a separate chart.
- Re-imported and inspected the updated Excel dictionary: 317 union column rows, 62 OLAP Borrowers VCs, 51 `Reporting Borrowers` members, all eleven matrix variance rows, and no `#REF!`, `#DIV/0!`, `#VALUE!`, or `#NAME?` text.
- Rendered all eight workbook sheets before and after editing and visually reviewed the affected README, Columns, Slice Columns, and App Variances layouts.

## Accuracy and reasonableness assessment

The delivered logic is internally consistent with the design and with the current dashboard population. The active count and equal-share line reconcile exactly, the contribution metric reuses the governed 30-day realized-profit measure, and the stability score cannot exceed its intended 0–100 range when its components remain within their defined bounds. The output is plausible for the current portfolio: one borrower supplies roughly 57% of recent profit and is the dominant high-value/low-stability bubble, while most active borrowers cluster near the 80–100 stability range.

The classification remains a prototype management aid. It is sensitive to a changing active-borrower population, a short 30-day profit window, and AppSheet refresh timing. Borrower-level component values were not exported or independently recomputed from production transaction rows in this task; the manual spot checks below are required before acceptance.

## Manual testing required

1. Sync OLAP and refresh Looker at one recorded timestamp; confirm there are still 16 active borrowers or record the new count.
2. Export the 51-field `Reporting Borrowers` feed and confirm active borrowers' `Matrix Economic Contribution` values sum to 100% when total 30-day profit is positive.
3. For one borrower in each populated quadrant, independently recompute recent reliability, historical reliability, delay severity, current condition, weighted stability, and final quadrant.
4. Verify a borrower exactly on either threshold is classified on the high side.
5. Test a due-today unpaid charge, a due-today partial payment, one-day late, two-to-three-days late, more-than-three-days late, and defaulted active loan.
6. Test borrowers with 0, 1, 2, and 3 past obligations and with history just below and at 30 days; confirm the provisional label.
7. Compare bubble-size ordering with `Total Outstanding Principal` and verify inactive borrowers never appear.
8. Check desktop and mobile readability, label overlap, tooltip values, filter interactions, and load/refresh time.
9. Confirm all pre-existing Borrowers page visuals, especially `Capital vs Profit Scatter Plot`, remain unchanged.

## Downstream effects and improvement suggestions

- The eleven cross-table OLAP VCs add calculation cost during OLAP sync/data-source refresh. Monitor refresh time as Charges and Loans grow.
- The dynamic equal-share threshold changes whenever the active population changes; this is intended but should be explained to dashboard users.
- For stronger four-quadrant color encoding without losing borrower grain, evaluate a vetted community visualization or a purpose-built pre-aggregated matrix feed. Native Looker scatter coloring should remain single-color unless that limitation changes.
- Add a small companion table beside or below the matrix with borrower, X value, Y value, outstanding principal, history sufficiency, and quadrant. This would make audit and mobile interpretation easier than relying on labels/tooltips alone.
- Consider making the 30/90/180-day windows and stability weights governed parameters only after the current fixed design is manually accepted; changing them now would reduce comparability.

## Rollback instructions

Preferred dashboard rollback: restore or repoint users to the recorded backup report. For an in-place rollback, delete only `Borrower Value & Stability Matrix` and retain `Capital vs Profit Scatter Plot`.

Preferred OLAP rollback: restore `Loan Business Insights` v1.000173. For targeted rollback, first remove the eleven matrix fields from `Reporting Borrowers`, confirm no Looker component still depends on them, then delete the eleven VCs in reverse dependency order: `Matrix Bubble Label`, `Matrix Quadrant`, `Matrix Stability Score`, `Matrix History Sufficient`, component scores, `Matrix Economic Contribution`, `Matrix Equal Share Benchmark`, and `Matrix Active Borrower Count`. Revert both data-model documents and this change log to a rollback status after the live rollback.
