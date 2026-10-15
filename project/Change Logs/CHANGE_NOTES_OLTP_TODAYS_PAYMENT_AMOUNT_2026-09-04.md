# OLTP today-only Collection payment amount

## Change control

| Item | Value |
| --- | --- |
| Date | 2026-09-04 (Asia/Singapore) |
| Scope | OLTP `Loan Manager ผู้จัดการสินเชื่อ` only |
| App ID | `93844270-6aa5-420b-a960-bcdf08abd357` |
| Pre-change rollback point | v2.300002 |
| Saved version | v2.300003 |
| Status | Implemented, manually tested, and accepted by the user |

## Purpose

The right-side amount in the OLTP Collection view previously used `Borrowers[Todays Amount Collected] = SUM([Todays Collection Charges][Total Paid])`. Because `Total Paid` is cumulative for each included Charge, it also displayed payments posted on earlier dates. The approved change makes that amount represent only Repayments whose `Payment Date` is today while preserving the existing Charge population and operational status logic.

## Implemented configuration

### Repayments

Added OLTP-only Price virtual column `Payment Amount Today`:

```appsheet
IF([Payment Date] = TODAY(), [Amount Received], 0)
```

### Charges

Added OLTP-only Price virtual column `Payment Received Today`:

```appsheet
SUM([Related Repayments][Payment Amount Today])
```

This deliberately uses the existing `Related Repayments` reference list instead of a new table-wide `SELECT()` at Charge grain.

### Borrowers

Changed `Todays Amount Collected` to:

```appsheet
SUM([Todays Collection Charges][Payment Received Today])
```

## Explicitly unchanged

- `Borrowers[Todays Collection Charges]`, `Todays Amount Due`, `Todays Amount Remaining`, and collection-status expressions.
- Collection view, slices, grouping, ordering, actions, bots, and notification behavior.
- Physical database schema and all production financial rows.
- OLAP `Loan Business Insights` and Looker Studio. OLAP's same-name Borrowers field continues to sum `Total Paid` and is documented as an intentional formula variance.

## Verification performed

- Confirmed the pre-change OLTP editor version was v2.300002 before editing.
- Saved the configuration and confirmed the live editor advanced to v2.300003.
- Re-opened all three affected fields after save and confirmed the exact expressions persisted.
- Confirmed live affected table totals: Borrowers 32 columns, Charges 23 columns, and Repayments 14 columns.
- Confirmed the editor reported `No issues found` and had no unsaved changes.
- No production data row was created, edited, or deleted.
- The Collection emulator navigation did not complete during implementation, so no runtime-result claim is made.
- On 2026-09-04, the user confirmed the Collection result was tested and working. This records runtime acceptance without asserting unreported scenario-by-scenario evidence.

## Reconciliation boundary

This revision reconciles only the three affected OLTP fields and affected table counts. The previous documented OLTP baseline was v2.200115, while the live app was already v2.300002 before this change. Unrelated changes made between those versions were not re-audited or attributed to this revision.

## Acceptance and regression checklist

The user confirmed the implemented Collection result was tested and working on 2026-09-04. The following remains the regression checklist for future releases:

1. On an overdue Charge with one repayment before today and one repayment today, confirm the right-side Collection amount includes only today's payment.
2. Enter or identify multiple payments dated today on the same Charge and confirm they sum correctly.
3. Confirm today's payments across multiple included Charges sum correctly for the borrower.
4. Confirm a borrower whose included Charges have only prior-day payments shows ฿0 on the right side.
5. Confirm a Charge fully paid today retains today's received amount even though its current remaining amount is zero.
6. Confirm Not Paid, Partially Paid, Overdue, and Fully Paid grouping behavior is unchanged.
7. Confirm group totals based on `Todays Amount Remaining` remain unchanged.
8. Sync around the Asia/Singapore date boundary and verify `Payment Date = TODAY()` behavior, including any offline entry posted after midnight.
9. Compare OLTP sync time with v2.300002 for a material regression.
10. Confirm OLAP views and reporting values are unchanged.

## Possible downstream effects

- The Collection right-side amount may decrease for borrowers whose included Charges contain payments from prior dates. This is the intended behavior.
- The amount changes at the app's `TODAY()` boundary and after sync because the helper is date-relative.
- Any future OLAP or Looker reuse of the same business meaning must be reviewed separately; this change intentionally leaves those layers untouched.

## Rollback

Restore OLTP version v2.300002 from **Manage > Versions**. Then update this change log and both data-model documents to record the rollback state. No database-row rollback is required because this change modified configuration only.
