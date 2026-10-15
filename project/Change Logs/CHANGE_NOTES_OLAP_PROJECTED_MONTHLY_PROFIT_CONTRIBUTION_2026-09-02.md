# OLAP projected-monthly-profit contribution chart change notes — 2026-09-02

## Status

**Accepted by the user after visual review on 2026-09-02. Implemented and configuration-verified in the production OLAP app at version `1.000171`.**

The user confirmed that the chart looks good. This acceptance covers the rendered chart and placement; the same-cutoff numerical reconciliation and edge-case checks below remain recommended operational verification.

## Scope and purpose

- App: `Loan Business Insights`
- App ID: `e74dd368-654f-44d7-bccf-83cf361d1cdb`
- Scope: one OLAP-only Borrowers virtual column, one reference pie-chart view, and one Analytics dashboard entry.
- Purpose: show each borrower's contribution to the existing `Projected Monthly Profit` KPI using the same presentation concept as the preceding borrower-contribution chart.
- Excluded: no physical database field, production financial row, slice, action, automation, security filter, OLTP object, Looker Studio object, or deployment state was changed.

## Rollback point

| App | Version | Role |
| --- | --- | --- |
| Loan Business Insights | `1.000167` | Confirmed current OLAP version before editing; restore this version to remove the entire change |
| Loan Business Insights | `1.000171` | Saved version containing the completed VC, chart, and dashboard placement |

## Data-model change

Added `Borrowers[Projected Monthly Profit Contribution]` in OLAP:

| Setting | Value |
| --- | --- |
| Kind / type | Virtual column / Price |
| Availability | OLAP only |
| Show | Yes; required so the field is available to the chart selector |
| Decimal digits | 0 |
| Display name | `ส่วนแบ่งกำไรคาดการณ์สิ้นเดือน / Projected Monthly Profit Contribution` |
| Population | Full `Borrowers` base table |

Expression:

```appsheet
SUM(
  SELECT(
    Repayments[Interest Paid],
    AND(
      [Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID],
      MONTH([Payment Date]) = MONTH(TODAY()),
      YEAR([Payment Date]) = YEAR(TODAY())
    )
  )
)
+ SUM(
    SELECT(
      Charges[Interest Remaining],
      [Ref Loans].[Ref Borrowers] = [_THISROW].[Row ID]
    )
  )
+ SUM(
    SELECT(
      Loans[Expected Interest This Month],
      [Ref Borrowers] = [_THISROW].[Row ID]
    )
  )
```

The three terms mirror the current KPI definition:

`Statistics[Projected Monthly Profit] = [Realized Profit MTD] + [Today's Outstanding Interest] + [Forecast Remaining Interest]`

The full Borrowers table is intentional. Restricting the chart to borrowers with outstanding principal could omit realized current-month interest from a borrower whose loan closed after contributing profit.

## UX change

Created reference view `Projected Monthly Profit Contribution`:

| Setting | Value |
| --- | --- |
| Display name | `ส่วนแบ่งกำไรคาดการณ์สิ้นเดือน / Projected Monthly Profit Contribution` |
| Data source | `Borrowers` |
| View type | Chart / PieChart |
| Chart column | `Projected Monthly Profit Contribution` |
| Label type | Percent |
| Legend | Shown |
| Position | Ref |

Added the chart to `Analytics` immediately after `Daily Interest Contribution`. The relevant order is now:

1. `Profit Contribution 30D`
2. `Daily Interest Contribution`
3. `Projected Monthly Profit Contribution`
4. `Daily Profit`

## Pre-existing schema observation

The current OLAP Borrowers schema loads the physical `Hidden Flag` field, although the prior reference still documented it as OLTP-only. This task did not add, edit, or use the field in any OLAP filter. The data dictionary and model overview were corrected to show that the field is loaded in both apps and filters only the OLTP primary Borrowers view.

## Checks performed

- Confirmed rollback version `1.000167` before editing.
- Confirmed the saved OLAP editor reports `No issues found` at version `1.000171` and has no unsaved changes.
- Reopened the chart after save and verified source `Borrowers`, type `PieChart`, metric `Projected Monthly Profit Contribution`, percent labels, bilingual title, and legend setting.
- Reopened `Analytics` after save and verified the dashboard-entry order places the new chart between `Daily Interest Contribution` and `Daily Profit`.
- Verified the embedded Analytics preview renders the new bilingual chart region in that order.
- Confirmed the borrower formula uses the same date basis and three source components as the existing portfolio KPI.
- Updated `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` together.
- Re-imported and inspected the updated workbook, verified 306 unioned column rows, confirmed the new Borrowers row and OLAP-only variance, and found no spreadsheet formula-error tokens.
- Rendered the updated Columns sheet and visually checked that the inserted row preserves the workbook's existing style and row order.

## Manual testing required

1. Sync `Loan Business Insights` on desktop and mobile.
2. Open Analytics and confirm the fourth pie chart appears immediately after `Daily Interest Contribution` and before `Daily Profit`.
3. Confirm the bilingual title, percent labels, borrower legend, and tap/drill behavior are readable for the intended role.
4. At one recorded sync cutoff, sum all borrower `Projected Monthly Profit Contribution` values and confirm the total equals the displayed `Projected Monthly Profit` KPI.
5. Spot-check at least one borrower against each component: current-month `Repayments[Interest Paid]`, matching `Charges[Interest Remaining]`, and matching `Loans[Expected Interest This Month]`.
6. Include a borrower whose loan closed during the current month and confirm realized interest remains represented.
7. Check borrowers with zero and, if present, negative contributions; confirm the pie chart remains interpretable and no borrower is silently excluded by a slice or `Hidden Flag`.
8. Sync again and observe whether the additional borrower-level SELECT calculations create a material OLAP sync or chart-loading regression.
9. Confirm users with the intended reporting permissions can view the chart and cannot perform unintended operational edits.

## Downstream considerations

- The chart is an allocation of an existing KPI, not a new profit measure.
- `Today's Outstanding Interest` remains the existing broad sum of open-charge interest without a Charge Date filter, so the borrower allocation inherits the same assumption.
- The virtual column performs three borrower-level SELECT aggregations. This is appropriate in OLAP, but portfolio growth may increase sync cost.
- Looker Studio and curated reporting slices were not changed. If this allocation is later required downstream, review the governed feed grain and cutoff before adding it.

## Rollback instructions

Preferred full rollback:

1. In AppSheet Manage > Versions, restore `Loan Business Insights` version `1.000167`.
2. Sync a client and confirm the projected-monthly-profit contribution chart and VC are absent and `Daily Profit` again follows `Daily Interest Contribution`.
3. Revert the corresponding entries in `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`.
4. Update this change log with the rollback date, reason, result, and restored version.

Targeted rollback, if version restore is unsuitable, must remove the Analytics dashboard entry first, then delete the reference chart, then delete `Borrowers[Projected Monthly Profit Contribution]`; verify dependencies before each deletion.
