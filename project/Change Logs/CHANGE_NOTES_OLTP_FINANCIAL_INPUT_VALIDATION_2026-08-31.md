# Change Notes — OLTP Financial Input Validation — 2026-08-31

## Status

**Implemented in the isolated clone, focused regression passed, and promoted to production. Owner manual verification is pending before acceptance.**

## Purpose

Remediate only the two owner-approved scenarios from the isolated OLTP test round:

1. prevent Charges and Repayments whose principal and interest components are both zero; and
2. prevent negative principal while preserving the current default-loan workflow, including negative interest.

F-004, F-005, and F-006 remain unchanged by explicit owner decision. The owner separately implemented F-001 by hiding the Loans-table Add action.

## Scope and affected objects

- Test app: `OLTP DB TEST 20260830-221908` (`fa3882d6-993d-450e-b7fc-15c3c7545263`)
- Production app: `Loan Manager ผู้จัดการสินเชื่อ` (`93844270-6aa5-420b-a960-bcdf08abd357`)
- Tables and columns:
  - `Charges[Principal Due]`
  - `Charges[Interest Due]`
  - `Repayments[Principal Paid]` (reviewed and retested; existing expression retained)
  - `Repayments[Interest Paid]`
- No database table, physical column, virtual column, key, Ref, slice, automation, action, deployment state, OLAP object, Looker Studio object, or production transaction row was created, removed, or changed.

## Rollback points

- Test clone before change: version `1.000005`.
- Production OLTP before change: version `2.200078`.
- Test clone after save: version `1.000006`.
- Production OLTP after save: version `2.200079`.

## Implemented validation

### Charges

- `Principal Due` `Valid_If`:

  ```appsheet
  [_THIS] >= 0
  ```

- `Interest Due` `Valid_If`:

  ```appsheet
  OR([Principal Due] <> 0, [_THIS] <> 0)
  ```

The second expression blocks only a zero/zero Charge. It deliberately permits negative interest and mixed-sign rows because the owner retained the existing default-loan workflow.

### Repayments

- `Principal Paid` already contained the required nonnegative and remaining-principal guard, so its expression was not changed:

  ```appsheet
  AND(
    [_THIS] >= 0,
    [_THIS] <= (
      [Ref Charges].[Principal Due]
      - SUM(
          SELECT(
            Repayments[Principal Paid],
            AND(
              [Ref Charges] = [_THISROW].[Ref Charges],
              [Row ID] <> [_THISROW].[Row ID]
            )
          )
        )
    )
  )
  ```

- `Interest Paid` now combines its existing remaining-interest guard with the zero/zero-row rule:

  ```appsheet
  AND(
    [_THIS] <= (
      [Ref Charges].[Interest Due]
      - SUM(
          SELECT(
            Repayments[Interest Paid],
            AND(
              [Ref Charges] = [_THISROW].[Ref Charges],
              [Row ID] <> [_THISROW].[Row ID]
            )
          )
        )
    ),
    OR([Principal Paid] <> 0, [_THIS] <> 0)
  )
  ```

This preserves negative-interest entries and the pre-existing positive-overpayment control.

## Checks performed

- Read the four live clone expressions before editing and confirmed the production expressions matched the clone baseline.
- Used AppSheet's expression test action before saving each modified expression.
- Saved the clone and confirmed version `1.000006`.
- In the isolated clone, confirmed:
  - a zero-value Charge could not be saved;
  - a Charge with negative principal and nonzero interest could not be saved;
  - a Charge with zero principal and negative interest saved successfully;
  - a zero-value Repayment could not be saved;
  - a Repayment with negative principal and nonzero interest could not be saved;
  - a Repayment with zero principal and negative interest saved successfully; and
  - a positive interest payment above the remaining interest was still rejected.
- Applied the identical changed expressions to production, saved version `2.200079`, and confirmed the editor reported no issues.
- Did not create or edit production transaction data.
- Updated and checked the Markdown model overview and Excel data dictionary; the workbook formula-error scan returned no matches and all worksheets were rendered for visual review.

## Downstream effects

- Operational forms now reject empty financial transactions represented as zero/zero rows.
- Charge principal can no longer be negative.
- Repayment principal remains nonnegative and retains the remaining-balance guard.
- Negative interest continues to flow through the accepted default-loan workflow and therefore may still affect operational and reporting totals.
- OLAP and Looker Studio were not changed. Their interpretation of stored negative-interest adjustments is unchanged.

## Manual testing required before acceptance

1. In production, open a Charge add form without saving and confirm zero/zero shows invalid, negative principal shows invalid, and a normal positive Charge remains valid.
2. In production, open a partial Repayment form without saving and confirm zero/zero and negative principal show invalid while a normal within-balance payment remains valid.
3. Run one approved default-loan scenario and confirm negative interest is accepted and reconciles across the loan, charge, repayment, OLAP reporting feed, and Looker dashboard.
4. Confirm the owner-implemented F-001 behavior: the Loans view has no global Add action and `Create New Loan` from a Borrower remains available.
5. Confirm operator permissions, sync, and mobile/tablet form behavior for the changed fields.

## Rollback instructions

If rollback is required, restore production OLTP version `2.200078` in AppSheet version history and confirm the app reports no issues after restore. Restore test clone version `1.000005` only if the isolated validation prototype also needs to be reverted. After rollback, update this file and `CHANGE_NOTES_OLTP_TEST_ROUND_2026-08-30.md` with the rollback date, result, and resulting version.

## Documentation updated

- `Documents/AppSheet_Data_Model_Overview.md`
- `Documents/AppSheet_Data_Dictionary.xlsx`
- `Change Logs/CHANGE_NOTES_OLTP_TEST_ROUND_2026-08-30.md`
- `Change Logs/CHANGE_NOTES_OLTP_FINANCIAL_INPUT_VALIDATION_2026-08-31.md`
