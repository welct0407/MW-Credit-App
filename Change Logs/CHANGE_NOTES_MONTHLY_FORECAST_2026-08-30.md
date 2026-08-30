# Monthly forecast accrual change notes — 2026-08-30

## Scope

- AppSheet app: `Loan Manager ผู้จัดการสินเชื่อ`
- App ID: `93844270-6aa5-420b-a960-bcdf08abd357`
- Component: `Loans[Expected Interest This Month]`
- Documentation: `AppSheet_Data_Model_Reference.docx`
- Approved items: include accrued but uncharged daily interest in the monthly forecast and document the forecast assumptions.
- Explicit exclusions: no column or display-name changes, no bot/action changes, and no database/schema changes.

## Rollback point

- AppSheet version before editing: `2.200074`
- AppSheet version after editing: `2.200075`.
- Restore path: Manage > Versions > select version `2.200074` > Restore.

## Planned AppSheet change

- For open daily-interest loans, add existing `[Accrued Interest]` (guarded at zero) to the interest forecast for the remaining days after today.
- Preserve the fixed-term loan branch unchanged.
- Preserve `Statistics[Forecast Remaining Interest]` and `Statistics[Projected Monthly Profit]` formulas unchanged.

## Forecast assumptions to document

- Projected Monthly Profit combines interest posted this month, all remaining interest on open Charges, accrued but uncharged daily interest, and forecast interest through month-end.
- The projection assumes all outstanding interest is collectible and may include arrears originating before the current month.
- `Today's Outstanding Interest` is not date-filtered; it represents remaining interest across all open Charges.
- Transfer fees recorded through first-day Charge interest and negative default adjustments recorded through `Interest Paid` flow into the projection under the current accounting classification.
- Daily-interest accuracy assumes `Current Daily Interest` is maintained in accordance with the loan contract, including after any principal changes.

## Implemented AppSheet change

- Replaced `Loans[Expected Interest This Month]` with:

  ```appsheet
  IF(
    [Loan Status] = "ปิดยอดแล้ว",
    0,
    IFS(
      [Loan Type] = "ดอกเบี้ยรายวัน",
        MAX(LIST([Current Daily Interest] * 0, [Accrued Interest]))
        +
        (
          [Current Daily Interest]
          * (DAY(EOMONTH(TODAY(), 0)) - DAY(TODAY()))
        ),
      [Loan Type] = "กำหนดวันชำระ",
        IF(
          AND(
            [Due Date] > TODAY(),
            MONTH([Due Date]) = MONTH(TODAY()),
            YEAR([Due Date]) = YEAR(TODAY())
          ),
          [Fixed Interest],
          0
        )
    )
  )
  ```

- The zero guard uses `[Current Daily Interest] * 0` so both `LIST()` elements have the Price type required by AppSheet.
- Preserved the fixed-term branch unchanged.
- Preserved all internal and display names unchanged.
- Preserved `Statistics[Forecast Remaining Interest]` as `SUM(Loans[Expected Interest This Month])`.
- Preserved `Statistics[Projected Monthly Profit]` as `[Realized Profit MTD]+[Today's Outstanding Interest]+[Forecast Remaining Interest]`.

## Data model documentation update

- Updated the governed formula and purpose for `Loans[Expected Interest This Month]`.
- Clarified the existing Statistics dependencies for `Projected Monthly Profit`, `Forecast Remaining Interest`, and `Today's Outstanding Interest` without renaming them.
- Added section `6.11.1 Monthly forecast assumptions`, covering component composition, collectibility, prior-period arrears, transfer-fee/default classification, stored daily-interest maintenance, and the fixed-term 00:05 bot dependency.
- Updated the document control date and recorded the AppSheet rollback/saved versions.

## Verification performed

- AppSheet Expression Assistant accepted the saved expression without errors.
- Re-read the persisted formula from the live column definition after saving.
- Confirmed AppSheet reports `No issues found`, Save is disabled, and the saved version is `2.200075`.
- Reopened the DOCX with the bundled document runtime and confirmed the updated formula, Statistics descriptions, assumptions heading, and seven assumptions are present.
- Confirmed the DOCX package remains readable and no table/column or field name was changed.
- DOCX visual rendering could not be completed because LibreOffice/`soffice` is not installed or available in this environment; this limitation must be disclosed until the document is opened in Word for visual confirmation.

## Manual testing required

- Sync a client to AppSheet version `2.200075`.
- For a daily-interest loan with interval `1`, confirm the projected total does not double count when today's amount moves from accrued interest to a Charge and then to a Repayment.
- For a daily-interest loan with interval greater than `1`, confirm Forecast Remaining Interest includes the uncharged accrued days and does not jump upward when the scheduled Charge is created.
- Test an existing partially paid Charge together with new uncharged accrual and confirm only the remaining Charge interest plus the new accrual are included.
- Confirm a closed loan contributes zero through `Expected Interest This Month`.
- Confirm fixed-term forecast behavior remains unchanged before the due date and after the 00:05 due-date Charge bot runs.
- Open `AppSheet_Data_Model_Reference.docx` in Word and visually confirm the updated Loans/Statistics table rows and section `6.11.1` render cleanly.

## Rollback

- In Manage > Versions, restore AppSheet version `2.200074`.
- If only the documentation must be reverted, restore the prior local/OneDrive version of `AppSheet_Data_Model_Reference.docx`.

## Change status

- Implementation and available editor/structural verification complete; awaiting user manual testing and document visual confirmation.
