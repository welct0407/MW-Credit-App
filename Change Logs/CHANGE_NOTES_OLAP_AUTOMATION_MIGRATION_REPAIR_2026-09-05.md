# Change Notes — OLAP Automation Migration Repair

## Change summary

- **Date:** 2026-09-05
- **Scope:** AppSheet OLAP app `Loan Business Insights`, scheduled Daily Analytics refresh, and reconciliation of September 2026 Daily Analytics snapshots.
- **Purpose:** Restore the scheduled Daily Analytics refresh after the app moved from the personal account to the Workspace account, then reconcile the OLAP daily-profit snapshot with posted Repayments.
- **Status:** Repair, approved snapshot rebuild, scheduler execution check, and OLTP/OLAP reconciliation completed. User acceptance after normal-cadence observation remains pending.

## Rollback point

- **Affected app ID:** `e74dd368-654f-44d7-bccf-83cf361d1cdb`
- **Pre-change AppSheet version:** `1.100001`
- **Pre-change saved at:** 2026-09-03 17:25:39 UTC
- Restore version `1.100001` to return the app definition to its exact pre-repair state.

## Diagnosis

- The OLTP `Realized Profit MTD` value of `THB 30,414` reconciled to 119 posted Repayments dated 2026-09-01 through 2026-09-05.
- Reconciled daily interest totals were: Sep 1 `THB 5,366`; Sep 2 `THB 9,666`; Sep 3 `THB 8,526`; Sep 4 `THB 6,556`; Sep 5 `THB 300`.
- The OLAP Daily Analytics snapshot contained Sep 1 `THB 5,366`, Sep 2 `THB 9,666`, and Sep 3 `THB 5,526`, with Sep 4 and Sep 5 absent. The OLAP subtotal was therefore `THB 20,558`, understated by `THB 9,856`.
- The last successful scheduled execution was 2026-09-03 16:00:11 UTC. App ownership transferred at 16:00:58 UTC, 47 seconds later.
- Version history recorded `HasValidPlan = False` and `OwnerInPremiumPlan = False` after transfer, followed by `IsRunnable = False`. The Workspace plan and runnable status subsequently recovered, but no later scheduled execution appeared in the audit history.
- This sequence identifies the migration-time entitlement transition and stale scheduler registration as the reason the enabled bot stopped running.

## Implemented repair

- Disabled bot `Refresh Daily Analytics Daily` and saved AppSheet version `1.100002` at 2026-09-05 00:02:06 UTC.
- Re-enabled the same bot and saved AppSheet version `1.100003` at 2026-09-05 00:02:27 UTC.
- Temporarily extended the Calendar-row selection from yesterday/today to the prior two days through today, and used a short-lived test minute to validate execution (`1.100004` through `1.100006`).
- Created a fresh replacement bot, `Refresh Daily Analytics Daily 2`, using the existing governed process; disabled the stale original registration so that only one hourly bot remains active (`1.100007` through `1.100009`).
- Rebuilt the affected Sep 3 through Sep 5 Daily Analytics snapshots from the current governed source records. The run deleted and recreated snapshot rows only.
- Restored the replacement bot to the normal hourly minute `0` schedule and the original condition `AND([Date] >= TODAY() - 1, [Date] <= TODAY())` in current AppSheet version `1.100010`.
- The active replacement retains the same timezone, process, grouped delete/create action, and formulas. The original bot remains disabled to prevent duplicate runs.
- No OLTP transaction, Repayment, Loan, Charge, borrower, or other operational record was changed.

## Checks performed

- Confirmed the Workspace owner has a valid Enterprise Plus entitlement and that the app is runnable.
- Confirmed AppSheet is running the latest `Loan Business Insights` definition, version `1.100010`; no stable version is assigned, so users receive the latest definition.
- Confirmed the replacement bot is enabled and the original registration is disabled after the final save.
- Confirmed the final hourly schedule, GMT+7 timezone, yesterday/today row-processing condition, grouped delete/create action, and Interest Received aggregation expression match the pre-repair business logic.
- Automation Monitor recorded successful process and action execution for the original registration at 2026-09-05 00:14 UTC and for the replacement at 00:16 UTC. All recorded delete/add snapshot activities completed successfully under the Workspace owner.
- The replacement bot also executed on its temporary scheduled minute at 00:20 UTC; rebuilt snapshot rows show `Generated At` values of approximately 2026-09-05 07:20 GMT+7.
- Read the OLAP Daily Profit chart's underlying data after rebuild and confirmed exactly one Sep 1 through Sep 5 row with Interest Received of `THB 5,366`, `THB 9,666`, `THB 8,526`, `THB 6,556`, and `THB 300`, respectively. These sum to `THB 30,414`, matching OLTP.
- Confirmed no file under `sources/` was modified.
- No table, column, virtual column, relationship, slice, or schema was changed, so `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx` do not require an update for this repair.

## Completed data reconciliation

- The approved one-time backfill rebuilt Sep 3 through Sep 5 using the existing grouped action, which deletes each selected snapshot row and immediately recreates it from governed source data.
- Final OLAP Interest Received values are Sep 1 `THB 5,366`, Sep 2 `THB 9,666`, Sep 3 `THB 8,526`, Sep 4 `THB 6,556`, and Sep 5 `THB 300`.
- September OLAP Daily Profit totals `THB 30,414` at the verified cutoff and reconciles exactly with OLTP `Realized Profit MTD`.

## Manual testing required

1. After the next normal minute-0 hourly cycle, confirm `Refresh Daily Analytics Daily 2` appears in Automation Monitor without errors.
2. Confirm the OLAP Daily Profit chart remains at Sep 1 `THB 5,366`, Sep 2 `THB 9,666`, Sep 3 `THB 8,526`, Sep 4 `THB 6,556`, and Sep 5 `THB 300` when no additional Repayments have been posted.
3. Refresh Looker Studio after its configured connector freshness window and confirm September totals `THB 30,414` under matching filters and cutoff.
4. Confirm expected user roles can view the reporting data and cannot invoke unintended operational edits from OLAP.

## Downstream effects

- A fresh OLAP scheduler registration is active under the Workspace owner; the stale pre-migration registration is disabled.
- The scheduled bot can continue to replace yesterday/today snapshot rows with recalculated values on its hourly cadence.
- Looker Studio uses the OLAP Daily Analytics feed and may retain prior values until its data-source freshness window expires or the report is refreshed.

## Rollback instructions

- To roll back the app definition, restore AppSheet version `1.100001`.
- If a rebuilt snapshot must be reversed, rerun the same governed rebuild after correcting or restoring the source Repayment data; do not manually edit financial totals in the snapshot.
- Restoring `1.100001` removes the replacement and reintroduces the stale scheduler registration. If rollback is required, verify that exactly one bot is enabled and confirm a subsequent scheduled execution in Automation Monitor.
