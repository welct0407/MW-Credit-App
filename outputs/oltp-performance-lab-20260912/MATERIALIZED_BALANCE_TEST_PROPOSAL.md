# Materialized-balance experiment — approved plan and observed outcome

Status: owner approved on 13 September 2026: “approve, and make whatever change you want to test.” Authorization applies to the isolated testing environment; production remains unchanged and testing remains UI-only. No columns created at the pre-experiment checkpoint and no speed claim. Pre-schema rollback app version: 1.000022, restored from the complete 1.000018 definition.

The expression and sync experiments so far show modest or inconclusive reductions. A stronger hypothesis is to stop rebuilding each charge's paid components from its full related repayment history every time the app evaluates the charge. The existing source expressions are `Charges[Principal Paid] = SUM([Related Repayments][Principal Paid])` and `Charges[Interest Paid] = SUM([Related Repayments][Interest Paid])`. These feed Total Paid, remaining components, payment eligibility, snapshots and loan/borrower aggregates.

## Proposed schema change

Add exactly two numeric stored columns to **Charges** in **Money Perf TEST 20260912**, database `aWCGib003O4AyK85Q4_KZc`:

| Proposed new column | App type | Meaning |
|---|---|---|
| Perf Cached Principal Paid | Price | Sum of valid source repayment Principal Paid for the charge |
| Perf Cached Interest Paid | Price | Sum of valid source repayment Interest Paid for the charge |

The names above were proposed at this planning checkpoint and were subsequently created in the copy; see the observed outcome below. No table, production column, key or Ref relationship would change. No credentials or API access are needed; all configuration and data tests use the UI. The owner approved these columns and further necessary isolated testing changes.

## Dependency and consistency design

- The existing repayment ledger remains authoritative. Cache refresh recomputes SUM from ledger rows; it never increments blindly, so a repeated refresh is idempotent.
- Backfill the copied Charges rows once through a test-only action. Verify both cached components against source sums before enabling cached reads. No borrower data is exported into Git evidence.
- Change only the two paid-component VCs to read populated cache fields, falling back to original sums when blank. Preserve existing remaining, allocation, component and reconciliation rules.
- Refresh affected positive-allocation charges after posting repayments and before final receipt completion. Explicitly test retry after an interrupted refresh; a stale cache must not silently permit further allocation.
- Direct repayment edits, adjustments and other writers can invalidate caches. Inventory those paths and either refresh them in the lab or treat them as unsupported by this prototype and fail the candidate's production acceptance gate. A successful happy-path benchmark alone cannot justify deployment.
- All consumers of these paid components, including OLAP if connected later, require a defined refresh owner. The production OLAP app will not be connected to the test database.

## Measurement and acceptance

Use fresh reversal controls and the same single-charge and six-charge synthetic workloads. Record server Add duration, confirmed Posted state, number/order of allocations, repayment uniqueness, principal/interest totals, remaining balances and differences. Include full and partial allocation, repeated refresh, retry, stale-cache detection and direct-source-change checks. Measure refresh overhead as part of the complete receipt path. Do not report the read-time saving without its maintenance cost.

Accept only an end-to-end improvement with correct recovery and source reconciliation. Reject if the maintenance steps cost more than the read savings, if any source mutation can leave accepted stale balances, or if benefits disappear under controls. No assumed percentage improvement.

## Rollback and limits

Before changes, record the then-current app version and exact original expressions. Restore that app definition to stop reading the new fields; keep synthetic ledger evidence. The two unused copied-database columns can remain for audit until the owner decides to retire the lab. App version restoration does not remove physical columns or reverse database records.

This is an AppSheet-native materialization experiment. A separate transactional SQL posting service would need a provisioned test backend, an authorized integration and a much broader source-of-truth design; none is currently available or benchmarked. UI-only AppSheet tests cannot substantiate a SQL latency percentage.

## Observed outcome — 13 September 2026

The approved columns were created only in the copied database. Initialization eventually reconciled in the new GUI. The first maintained-cache variant (1.000034) left balances one payment behind and was rejected. The corrected direct-table refresh (1.000035) reconciled in the tested path but had median Save-to-visible-Posted time 26.350 seconds versus 23.102 seconds before and 21.801 seconds after rollback. No performance benefit was demonstrated.

At final test version 1.000038 the original ledger readers and receipt sequence are restored. The initializer is disabled and hidden, Statistics ID is MAIN, and the two physical fields plus hidden helper actions remain as unused experiment evidence. Their values are no longer current balances. See PERFORMANCE_TEST_REPORT.md and new-gui-receipt-timings.csv. No production change, API enablement or production acceptance occurred.
