# Change Notes — OLTP / OLAP App Shortcuts — 2026-08-31

## Scope and purpose

- Apps affected:
  - OLTP: `Loan Manager ผู้จัดการสินเชื่อ` (`93844270-6aa5-420b-a960-bcdf08abd357`)
  - OLAP: `Loan Business Insights` (`e74dd368-654f-44d7-bccf-83cf361d1cdb`)
- Purpose: provide a clear two-step menu path between the operational and reporting apps without adding controls to either app's dashboard.
- Looker Studio is not affected.
- No database table, physical column, virtual column, slice, relationship, or financial rule was changed.

## Rollback points

The live AppSheet version history was checked before editing on 2026-08-31 (Asia/Singapore).

| App | Rollback version | Final saved version |
| --- | ---: | ---: |
| Loan Manager ผู้จัดการสินเชื่อ | 2.200079 | 2.200082 |
| Loan Business Insights | 1.000152 | 1.000154 |

## Implemented AppSheet objects

### OLTP — Loan Manager ผู้จัดการสินเชื่อ

- Added menu detail view `Reporting App Shortcut` based on the existing single-row `Statistics` table.
- Menu display label: `รายงาน / Reporting App`.
- Menu icon: solid `analytics` icon.
- Added prominent action `Open Loan Business Insights`.
- Action display label: `เปิดรายงาน / Open Reporting App`.
- Action icon: solid `analytics` icon.
- Navigation target: `LINKTOAPP("LoanBusinessInsights-975338008")`.
- Action visibility: `CONTEXT("View") = "Reporting App Shortcut"` so the action does not appear on the OLTP dashboard or other Statistics-based views.

### OLAP — Loan Business Insights

- Added menu detail view `Operations App Shortcut` based on the existing single-row `Statistics` table.
- Menu display label: `งานสินเชื่อ / Operations App`.
- Menu icon: solid `car` icon, matching the operational app's visual identity.
- Added prominent action `Open Loan Manager`.
- Action display label: `เปิด Loan Manager / Open Operations App`.
- Action icon: solid `car` icon.
- Navigation target: `LINKTOAPP("LoanManager-975338008-26-08-07")`.
- Action visibility: `CONTEXT("View") = "Operations App Shortcut"` so the action does not appear on the OLAP analytics dashboard or other Statistics-based views.

## Checks performed

- AppSheet reported `No issues found` after the final save in both apps.
- Confirmed both menu items render with their bilingual labels and intended icons in the simulator.
- Confirmed the shortcut button is visible in each dedicated shortcut view.
- Confirmed the OLTP shortcut button is absent from the OLTP dashboard.
- Confirmed the OLAP shortcut button is absent from the OLAP Analytics dashboard.
- Exercised the navigation in both directions in the simulator:
  - OLTP to OLAP opened `Loan Business Insights`.
  - OLAP to OLTP opened `Loan Manager ผู้จัดการสินเชื่อ`.
- Confirmed no data, financial records, automations, notifications, or Looker Studio objects were changed.

## Manual testing required

Status: **Implemented; pending user acceptance and device testing.**

1. Sync both apps on a production-authorized mobile device.
2. In OLTP, open the menu and select `รายงาน / Reporting App`; confirm `เปิดรายงาน / Open Reporting App` appears and opens OLAP.
3. In OLAP, open the menu and select `งานสินเชื่อ / Operations App`; confirm `เปิด Loan Manager / Open Operations App` appears and opens OLTP.
4. Confirm neither shortcut button appears on the OLTP dashboard or OLAP Analytics dashboard.
5. Repeat the round trip in a desktop browser and confirm the expected app opens without a sign-in or authorization error.
6. Test with each intended user role; users must already have permission to access both apps.
7. Confirm normal back navigation and sync behavior remain acceptable after switching apps.

## Possible downstream effects

- The first visit to the other app may require its normal sync and may be slower on weak connections.
- A user who lacks access to the destination app will not be granted access by the shortcut and may see the standard AppSheet access error.
- No dashboard metrics, operational workflows, or reporting calculations are affected.

## Rollback instructions

If testing finds a regression:

1. In `Loan Manager ผู้จัดการสินเชื่อ`, open **Manage > Versions > Version History** and restore version `2.200079`.
2. In `Loan Business Insights`, open **Manage > Versions > Version History** and restore version `1.000152`.
3. Sync both apps and confirm the shortcut menu views and actions are removed.
4. Update this change log with the rollback date, reason, restored versions, and verification results.

