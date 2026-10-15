# OLAP daily-interest contribution chart change notes — 2026-09-01

## Status

**Implemented and configuration-verified in the production OLAP app at version `1.000167`; awaiting the user's manual acceptance test.**

## Scope and purpose

- App: `Loan Business Insights` (`e74dd368-654f-44d7-bccf-83cf361d1cdb`).
- Scope: OLAP AppSheet UX configuration only.
- Purpose: add a third pie chart below the existing `Loan Distribution` and `Profit Contribution 30D` charts so the Analytics dashboard shows each borrower's contribution to the Daily Interest KPI.
- No table, column, expression, slice, action, automation, source record, OLTP app, or Looker Studio object was changed.

## Rollback point

- AppSheet version confirmed before editing: `1.000166`.
- AppSheet version after the saved change: `1.000167`.
- Restore path: **Manage > Versions > Version History > version `1.000166` > Restore**.

## AppSheet objects changed

### New reference view

| Setting | Saved value |
|---|---|
| View name | `Daily Interest Contribution` |
| Display name | `สัดส่วนดอกเบี้ยรายวัน / Daily Interest Contribution` |
| Data source | `Borrowers with Outstanding Loans` |
| View type | Chart |
| Chart type | Pie |
| Chart column | `Active Daily Interest` |
| Label type | Percent |
| Legend | Shown |
| Position | Ref |

`Borrowers[Active Daily Interest]` is the existing borrower-level aggregate of the same expected-daily-interest measure used by the portfolio Daily Interest KPI. The existing read-only outstanding-loan slice was reused so no new data-model object was needed.

### Analytics dashboard

Added `Daily Interest Contribution` to the `Analytics` dashboard immediately after `Profit Contribution 30D`. The relevant order is now:

1. `Loan Distribution`
2. `Profit Contribution 30D`
3. `Daily Interest Contribution`
4. `Daily Profit`

All later dashboard entries retained their prior relative order.

## Checks performed

- Confirmed the live pre-change editor version was `1.000166` and recorded it before editing.
- Inspected the two existing pie charts and the `Analytics` dashboard entry order before making the change.
- Reused the existing `Borrowers with Outstanding Loans` slice and `Active Daily Interest` column; no schema regeneration or formula edit was performed.
- Confirmed the embedded Analytics preview showed the new bilingual chart title directly after the two existing pie charts and before `Daily Profit`.
- Opened the chart's data view and confirmed it used the borrower-level outstanding-loan population.
- Saved once and confirmed the editor had no unsaved changes, reported `No issues found`, and advanced to version `1.000167`.
- No production row was edited, added, deleted, or submitted.

## Documentation impact

- This Markdown file is the authoritative change log for the change.
- `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` were not changed because the implementation adds only a UX view and dashboard entry; it does not change the OLTP/OLAP data model or any slice definition.

## Possible downstream effects

- The Analytics dashboard is one chart taller on vertically scrolling/mobile layouts.
- The chart inherits borrower labels from the existing Borrowers configuration and is subject to the same slice population and sync freshness as the Daily Interest KPI.
- The chart is read-only and does not change operational workflows, calculations, permissions, automations, exports, or Looker Studio.

## Manual testing required

1. Sync `Loan Business Insights` and confirm the client is on version `1.000167`.
2. Open `Analytics`; confirm the new pie appears below `Loan Distribution` and `Profit Contribution 30D`, and above `Daily Profit`.
3. Confirm the title reads `สัดส่วนดอกเบี้ยรายวัน / Daily Interest Contribution`.
4. Confirm each non-zero slice and legend entry represents one borrower and that tapping a segment shows the expected borrower/value context.
5. Sum `Active Daily Interest` for the chart population and confirm it reconciles to the Daily Interest KPI at the same sync cutoff.
6. Check borrowers with multiple active loans and the daily-installment loan type to confirm their borrower-level contribution includes all applicable open-loan expected daily interest.
7. Confirm borrowers with no contributing daily interest do not create misleading pie segments.
8. Check mobile, tablet, and desktop layouts for readable percentages, legend labels, vertical scrolling, and no overlap with the following chart.
9. Confirm users with normal reporting permissions can view the chart but cannot edit borrower or loan data through it.

## Rollback instructions

1. In `Loan Business Insights`, open **Manage > Versions > Version History**.
2. Restore version `1.000166`.
3. Sync a client and confirm `Daily Interest Contribution` is absent and `Daily Profit` again follows `Profit Contribution 30D`.
4. Recheck that the original dashboard charts and KPI values are unchanged.

