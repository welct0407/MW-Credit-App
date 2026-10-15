# Change Notes — Looker Studio Page 8 Profit Forecast

## Change summary

- **Date:** 2026-09-02
- **Scope:** Looker Studio report `Loan Reports - Mobile`
- **Purpose:** Add a mobile reporting page for the current-month profit forecast, borrower contribution, partner allocation outlook, and supporting forecast detail.
- **Status:** Implemented; pending user manual testing and acceptance.

## Rollback point

- **Backup report:** `Loan Reports - Mobile - Backup 2026-09-02 pre-page-8-profit-forecast`
- **Backup report ID:** `1540fead-b4c1-46fa-96b6-3a959f7291dc`
- **Source report ID:** `c62727aa-a0fc-4c2a-9295-b46ebe1f82fc`
- The backup was created and named before Page 8 was implemented.

## Objects changed

- Added Page 8, `Profit Forecast & Partner Outlook`, to the end of the report navigation.
- Added report data source `Loan Business Insights: Partners` for partner allocation reporting.
- Added page controls for forecast date range, borrower, and loan type.
- Added KPI scorecards for:
  - Realized Profit MTD;
  - Remaining Forecast Profit;
  - Estimated Monthly Profit; and
  - Forecast Realization %.
- Added a realized-versus-remaining forecast composition chart.
- Added a realized interest time series using Repayments `Payment Date` and `Interest Paid`.
- Added a future forecast chart by loan type using Loans `Expected Interest This Month`.
- Added borrower contribution pie charts using:
  - Loans `Current Daily Interest` for daily interest contribution; and
  - Loans `Expected Interest This Month` for the borrower-level monthly forecast basis.
- Added partner outlook by `Partner Name` using `Current Pool Share` as the current allocation basis.
- Added borrower forecast detail with `Borrower Name`, `Current Daily Interest`, `Expected Interest This Month`, and `Outstanding Principal`.
- Created a report blend named `Borrower Profit Forecast` during implementation. Direct governed sources were used for the delivered charts after viewer-mode verification showed connector errors on blended chart bindings.

## Calculation and interpretation notes

- The headline `Estimated Monthly Profit` uses the governed Statistics source field `Projected Monthly Profit`.
- `Remaining Forecast Profit` is calculated as `Projected Monthly Profit - Realized Profit MTD`.
- `Forecast Realization %` is calculated as `Realized Profit MTD / Projected Monthly Profit`.
- The borrower monthly contribution pie uses the loan-level `Expected Interest This Month` field. It is the available governed borrower-grain forecast basis and is not presented as an independently reconciled decomposition of the Statistics-level KPI.
- Partner outlook uses the current pool share; it does not assume a fixed partner split.
- No AppSheet schema, table, physical column, virtual column, slice, expression, or relationship was changed. Therefore `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` were not changed as part of this Looker-only task.

## Checks performed

- Confirmed the new page is Page 8 of 8 and appears at the end of report navigation.
- Confirmed Page 8 opens in viewer mode with its controls, KPI scorecards, chart headings, partner section, borrower detail table, and realized-interest time series.
- Removed charts that retained invalid blended field bindings and re-created the delivered borrower visuals from direct reporting sources.
- Confirmed no remaining `System Error` component is present in the Page 8 viewer-mode DOM.
- Confirmed the backup report remains separately available under the recorded backup name.
- Confirmed no files under `sources/` were modified.

## Manual testing required

1. Open Page 8 on the intended mobile and desktop layouts and confirm every chart is legible and interactive.
2. Change the forecast date range, borrower, and loan-type controls and confirm the intended components respond without blank or stale results.
3. Reconcile Realized Profit MTD, Remaining Forecast Profit, Estimated Monthly Profit, and Forecast Realization % to the Statistics source for the same refresh cutoff.
4. Spot-check daily interest and monthly forecast contribution for several borrowers against the Loans source.
5. Confirm partner current pool shares total to the expected allocation and agree with the Partners source.
6. Confirm the borrower detail table exposure and forecast fields agree with the selected borrower and loan-type filters.
7. Confirm users with viewer permissions can access Page 8 without gaining edit access or seeing restricted borrower information.

## Possible downstream effects

- The added Partners data source is available to the report and may be reused by future charts.
- Page-level controls can change chart populations; reconciliation must use the same filter state and data refresh cutoff.
- No operational AppSheet workflow, financial record, automation, or Looker publishing setting was changed.

## Rollback instructions

Preferred rollback: use the recorded backup report as the pre-change reference or replacement. For an in-place rollback, delete Page 8 and remove only the `Borrower Profit Forecast` blend and the newly added Partners report data source after confirming that no other report component uses them.
