# Pending collection and KPI reconciliation change notes — 2026-09-01

## Status

**User implementation is configuration-verified in production OLTP at version `2.200105`; the preventive Ref control and Collection aggregate are documented. KPI formula hardening and record-level manual acceptance remain open.**

- Codex performed a read-only live verification and made no AppSheet configuration or production-data change.
- OLAP and Looker Studio were not edited.
- The current runtime totals reconcile, but `Statistics[Pending Payment Amount]` is still broader than the operational Collection population.
- Three previously identified orphan Charge rows were no longer present. No void/reversal record was visible for that cleanup.

## Scope and purpose

| Item | Value |
| --- | --- |
| Production app | `Loan Manager ผู้จัดการสินเชื่อ` |
| App ID | `93844270-6aa5-420b-a960-bcdf08abd357` |
| Source database | `Money database` |
| Affected table | `Charges` |
| Affected view | `Collection` |
| Affected KPI | `Statistics[Pending Payment Amount]` |
| Purpose | Reconcile the Pending Payment KPI to the Collection page, correct the group aggregate, and prevent normal Charge creation without a parent Loan |
| Verification date | 1 September 2026 (Asia/Singapore) |

## Rollback point

- Production AppSheet version before the user's reconciliation changes: `2.200101`.
- Production AppSheet version at verification: `2.200105`.
- Restore path for configuration: Manage > Versions > select version `2.200101` > Restore.
- Restoring the app version does not restore physically removed AppSheet Database rows. Any data restoration would require a separate, controlled source-data recovery with duplicate and downstream-dependency checks.

## Correctly implemented changes

### 1. Collection group aggregate

The live `Collection` view now uses:

```text
SUM :: Todays Amount Remaining
```

This is the correct displayed-grain aggregate for the existing `Todays Collection Board` workboard. The runtime result reconciled as follows:

| Collection component | Amount |
| --- | ---: |
| Not Paid | ฿300 |
| Overdue borrower remaining amount 1 | ฿4,300 |
| Overdue borrower remaining amount 2 | ฿4,500 |
| Overdue group total | ฿8,800 |
| Total pending shown by Collection | ฿9,100 |
| Dashboard Pending Payment KPI | ฿9,100 |

Borrower names are intentionally omitted from this record.

### 2. Required parent reference

The live OLTP definition of `Charges[Ref Loans]` is:

| Property | Verified value |
| --- | --- |
| Type | `Ref` to `Loans` |
| Show | `TRUE` |
| Editable | `TRUE` |
| Required | `TRUE` |
| Part of parent | Retained as previously documented |

All inspected Charge-creation actions explicitly populate the reference with `Ref Loans = [Row ID]`:

- `Generate Today's Charge`;
- `New Loan Payment - Create First-Day Charge`;
- `Create Final Charge`; and
- `Default - Create Final Charge`.

Making the Ref required is therefore compatible with the inspected normal creation paths and prevents a user from saving a normal Charge form without a parent Loan.

### 3. Current source cleanup result

The live Charges preview at verification contained:

- 319 total rows;
- 20 rows with `Amount Remaining > 0`;
- ฿9,100 total remaining across those rows;
- zero pending rows with blank `Ref Loans`; and
- zero remaining amount attributable to blank-Ref pending rows.

Three orphan rows that had been present before the user's changes were no longer in the source preview:

| Charge Row ID | Charge date | Amount remaining |
| --- | --- | ---: |
| `WDqilowoU07DaoOHxLpZPk` | 2026-09-01 | ฿2,180 |
| `Zp9cau15eUlcHe26oTFZlr` | 2026-09-01 | ฿1,090 |
| `D31W4x7rYB4sREZkdKwEnd` | 2026-09-01 | ฿2,180 |
| **Total** |  | **฿5,450** |

No void, reversal, or adjustment record was visible for those removals. This change log preserves the available identifiers and amounts, but it does not convert the physical deletion into an auditable correction workflow.

## Missed or incomplete item

`Statistics[Pending Payment Amount]` remains unchanged:

```appsheet
SUM(Charges[Amount Remaining])
```

This formula includes every Charge with a remaining amount, irrespective of blank `Ref Loans`, Charge Date, or membership in the operational Collection workboard. The current ฿9,100 match occurs because the source now has no pending orphan row and no observed future-scope difference at the verification cutoff. It can diverge again if an exceptional source import, legacy row, future-dated remaining amount, or other non-Collection Charge enters the table.

No formula change was made or documented as complete. A separate implementation should first define the intended KPI population and date basis, then apply the smallest governed filter and reconcile OLTP, OLAP, and any downstream reporting consumers.

## Explicitly unchanged objects

- `Statistics[Pending Payment Amount]` expression was not changed.
- `Todays Collection Board` slice definition, filter, and columns were not changed.
- Charge calculation formulas, Payment Status logic, payment allocation, and repayment rows were not changed by Codex.
- No action, bot, notification, security filter, OLAP object, or Looker Studio object was changed by Codex.
- No new table, physical column, or virtual column was added.

## Verification performed

### Live runtime and editor checks

- Synced the live OLTP app and confirmed Not Paid = ฿300, Overdue = ฿8,800, and Pending Payment = ฿9,100.
- Confirmed the two displayed Overdue borrower remaining amounts are ฿4,300 and ฿4,500 and sum to the displayed ฿8,800 group total.
- Reopened the Collection view and confirmed group aggregate `SUM :: Todays Amount Remaining`.
- Reopened `Charges[Ref Loans]` and confirmed Show, Editable, and Required are enabled.
- Reopened the four relevant Charge-creation actions and confirmed each sets `Ref Loans = [Row ID]`.
- Read the live Charges preview and confirmed 319 rows, 20 pending rows, ฿9,100 pending total, and no pending blank-Ref row.
- Reopened `Statistics[Pending Payment Amount]` and confirmed the formula remains `SUM(Charges[Amount Remaining])`.
- Confirmed the editor reports `No issues found`, has no unsaved changes, and is at version `2.200105`.

### Documentation checks

- Updated `Documents/AppSheet_Data_Model_Overview.md` with the v2.200105 baseline, the OLTP-required Charges Ref, verified Collection behavior, current runtime reconciliation, and open KPI/auditability risks.
- Updated `Documents/AppSheet_Data_Dictionary.xlsx` without changing its worksheet or table topology:
  - `README`: current OLTP baseline and reconciliation scope;
  - `Columns`: OLTP Required flag and purpose for `Charges[Ref Loans]`; and
  - `Relationships`: Charges-to-Loans required-Ref note.
- Retained the unchanged KPI expression in the dictionary and documented its broad scope instead of presenting it as fixed.
- Re-imported the workbook, checked the targeted values and table inventory, scanned for common formula-error tokens, and rendered all worksheets for visual review.

## Manual testing required

1. Sync the production app and confirm it reports version `2.200105`.
2. On Collection, verify each Not Paid and Overdue group total equals the sum of its displayed `Todays Amount Remaining` rows.
3. Confirm the full Collection pending total equals the dashboard Pending Payment KPI at the same sync cutoff.
4. Create one controlled Charge through each permitted workflow and confirm `Ref Loans` is populated automatically.
5. Open a controlled direct Charge form and confirm it cannot be saved with blank `Ref Loans`.
6. Confirm existing payment, partial-payment, overdue, fully-paid, final-charge, and default flows still create/update Charges successfully.
7. Test a controlled future-dated Charge with a remaining amount and record whether business intent says it should appear in the KPI, Collection, both, or neither.
8. Test the approved reversal/adjustment workflow and confirm it remains auditable without physical deletion.

Do not treat the reconciliation as accepted until normal and edge-case Charge creation passes and the KPI population/date rule is explicitly accepted.

## Downstream considerations

- The new required Ref is an OLTP validation/configuration property on a physical column shared with OLAP. OLAP was not edited or re-verified for the Required flag.
- External source writes or imports may bypass the normal OLTP form/action guarantees and must preserve `Ref Loans` integrity.
- If the KPI formula is later filtered, review `Reporting Statistics`, OLAP comparisons, and Looker Studio metrics at the same source grain and cutoff.
- Required Ref prevents new normal-entry orphans but does not provide an audit trail for previously deleted rows.

## Rollback instructions

1. In production OLTP, open Manage > Versions.
2. Restore version `2.200101` only if the user wants to revert the Collection aggregate and Required-Ref configuration together.
3. Sync a client and confirm the restored view and column settings.
4. Do not recreate or delete Charge rows as part of configuration rollback without a separate source-data recovery plan and explicit approval.
5. If a future KPI formula change causes a mismatch, restore its immediate pre-change app version and reconcile the same Charge population and cutoff before further editing.

## Acceptance state

- User implementation: complete.
- Editor/configuration verification: complete.
- Current runtime reconciliation: complete at the 1 September 2026 cutoff.
- Documentation reconciliation: complete.
- Record-level workflow test: pending user execution and feedback.
- KPI formula hardening/business-rule decision: pending.
- Accepted for ongoing use: pending.
