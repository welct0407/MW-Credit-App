# OLTP validation remediation change notes — 2026-08-30

## Scope

- AppSheet app: `Loan Manager ผู้จัดการสินเชื่อ`
- App ID: `93844270-6aa5-420b-a960-bcdf08abd357`
- Approved findings: H5, M2, M3, M4, and the H6 Transfer Fee validation message.
- H3 is accepted without a configuration change because the scheduled bot creates fixed-term Charges at 00:05.

## Rollback point

- AppSheet version before editing: `2.200072`
- AppSheet version after editing: `2.200073`
- Restore path: Manage > Versions > select version `2.200072` > Restore.

## Planned changes

- Prevent direct user editing of `Loan Status`, `Defaulted`, and `Default Loss Amount` while preserving action and bot updates.
- Optimize `Return on Active Principal` to reuse existing borrower aggregate virtual columns.
- Optimize `Daily Collection Status` to reuse `Todays Collection Charges` and reduce repeated Charges scans.
- Guard `Profit Coverage of Outstanding Principal` against a zero outstanding balance.
- Change the display label of `[Payment Date]` to `วันที่ชำระครบ / Paid in Full Date` without changing its internal name or formula.
- Correct the `Transfer Fee` invalid-value message to state that zero is allowed.

## Implemented changes

### Borrowers

- Replaced `Return on Active Principal` with:

  ```appsheet
  IF([Total Outstanding Principal] > 0, [Active Loan Interest Earned] / [Total Outstanding Principal], 0)
  ```

- Preserved `Total Outstanding Principal` as `SUM([Related Loans][Outstanding Principal])`.
- Replaced `Daily Collection Status` with the approved expression that reuses `[Todays Collection Charges][Payment Status]` and retains only one `SELECT()` for the overdue test.

### Statistics

- Replaced `Profit Coverage of Outstanding Principal` with:

  ```appsheet
  IF([Outstanding Principal] > 0, [Total Profit of Outstanding Loans] / [Outstanding Principal], 0)
  ```

### Charges

- Changed the `[Payment Date]` display name to `วันที่ชำระครบ / Paid in Full Date`.
- Preserved its formula unchanged: `IF([Payment Status] = "ชำระแล้ว", MAX([Related Repayments][Payment Date]), "")`.

### Already present in rollback version

- `Loan Status`, `Defaulted`, and `Default Loss Amount` already had `Editable_If = FALSE`; no additional H5 edit was required.
- `Transfer Fee` already had `Valid_If = [_THIS] >= 0` and the corrected message `ค่าธรรมเนียมการโอนต้องมากกว่าหรือเท่ากับ 0`; no additional H6 edit was required.
- H3 was intentionally unchanged under the accepted dependency on the scheduled 00:05 fixed-term Charge bot.

## Verification performed

- Reloaded the editor after saving and confirmed the Save button was disabled with `No issues found`.
- Re-read all three saved formulas from their live column definitions.
- Confirmed `Total Outstanding Principal` was unchanged.
- Confirmed the internal `[Payment Date]` name and formula were unchanged while its display name was updated.
- Confirmed the three protected Loan fields still have `Editable_If = FALSE`.
- Confirmed the Transfer Fee validation expression and error message remained correct.
- Confirmed the saved app version is `2.200073`.

## Manual testing required

- Sync a client to version `2.200073` and confirm active-principal return values match the previous app for representative borrowers.
- Verify collection-status output for no-charge, overdue, fully-paid, mixed paid/unpaid, and partially-paid borrowers.
- Verify Profit Coverage displays `0%` when Outstanding Principal is zero and remains correct for a positive balance.
- Confirm the Charges UI displays `วันที่ชำระครบ / Paid in Full Date` and that partial payments still leave the field blank.
- Confirm users cannot manually edit Loan Status, Defaulted, or Default Loss Amount, while close/default actions and bots still update them.
- Enter Transfer Fee `0` and a negative value to confirm zero is accepted and the corrected message appears for a negative value.

## Rollback

- In Manage > Versions, restore AppSheet version `2.200072`.

## Change status

- Implementation and available editor verification complete; awaiting user manual acceptance testing.
