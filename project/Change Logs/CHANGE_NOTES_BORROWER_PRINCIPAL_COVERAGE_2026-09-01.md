# Borrower principal-coverage amount change notes — 2026-09-01

## Status

**Implemented, configuration-verified, and accepted by the user in production OLTP at version `2.200109`.**

- One OLTP-only Borrowers virtual column was added.
- The VC was added to `Visible Borrowers`, placed in `Visible Borrowers_Detail`, and given positive/negative format rules.
- No physical source column, production row, action, automation, security filter, OLAP object, or Looker Studio object was changed.

## Scope and purpose

| Item | Value |
| --- | --- |
| Production app | `Loan Manager ผู้จัดการสินเชื่อ` |
| App ID | `93844270-6aa5-420b-a960-bcdf08abd357` |
| Table | `Borrowers` |
| Slice | `Visible Borrowers` |
| Detail view | `Visible Borrowers_Detail` |
| Purpose | Show active-loan interest already earned after covering current outstanding principal, as a hypothetical immediate-default coverage amount |
| Change date | 1 September 2026 (Asia/Singapore) |

## Rollback point

- Production AppSheet version immediately before this change: `2.200107`.
- Production AppSheet version after the final saved correction: `2.200109`.
- Restore path: Manage > Versions > select version `2.200107` > Restore.
- App version restore reverts the VC, view order, and format rules. No data-row recovery is required because this change did not alter source records.

## Implemented objects

### Virtual column

| Property | Value |
| --- | --- |
| Internal name | `Active Profit After Principal Coverage` |
| Type | `Price` |
| Formula | `[Active Loan Interest Earned] - [Total Outstanding Principal]` |
| Show_If | `[Has Active Loan]` |
| Display name | `กำไรหลังครอบคลุมเงินต้น / Profit After Principal Coverage` |
| Precision | 0 decimals with the app's baht currency presentation |
| Description | Active-loan interest earned minus total outstanding principal; the amount retained if all current active-loan principal defaulted now. |

The metric is a prototype operational indicator. It is not an accounting-profit measure, default probability, expected-credit-loss calculation, or production risk model.

### Slice and view

- `Visible Borrowers` now includes all 32 production OLTP Borrowers columns. The new VC is slice column 32.
- `Visible Borrowers_Detail` places the field directly between:
  1. `Active Loan Interest Earned`;
  2. `Active Profit After Principal Coverage`; and
  3. `Return on Active Principal`.

### Format rules

| Rule | Condition | Target | Result |
| --- | --- | --- | --- |
| `Borrowers - Principal Coverage - Positive` | `[Active Profit After Principal Coverage] > 0` | New VC only | Green text |
| `Borrowers - Principal Coverage - Negative (Orange)` | `[Active Profit After Principal Coverage] < 0` | New VC only | Orange text |

Zero is intentionally left with the normal detail-view formatting.

## Verification performed

- Confirmed the editor save completed at version `2.200109`, Save was disabled afterward, and `No issues found` was displayed.
- Reopened the new Borrowers VC and confirmed its formula, Price type, Show_If, display name, description, and whole-baht formatting.
- Reopened `Visible Borrowers` and confirmed 32 included columns with the new VC present.
- Reopened `Visible Borrowers_Detail` and confirmed the requested three-field order.
- Reopened both format rules and confirmed the positive rule targets only the new VC in green and the negative rule targets only the new VC in orange.
- Synced the live app and inspected a redacted borrower detail. The live values were `Active Loan Interest Earned = ฿180`, `Total Outstanding Principal = ฿2,000`, and new metric `฿-1,820`, confirming the formula result and requested placement.
- Verified the rendered negative value had computed text color `rgb(218, 122, 0)`, matching the app's orange.
- Updated and reconciled `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`.

## Manual acceptance

On 1 September 2026, the user reviewed the implemented result and confirmed that everything looked good. This confirmation closes the requested manual acceptance step. Detailed observations for each individual positive, zero, no-active-loan, mobile, and performance scenario were not separately recorded.

## Downstream considerations

- The VC depends entirely on `Borrowers[Active Loan Interest Earned]`, `Borrowers[Total Outstanding Principal]`, and `Borrowers[Has Active Loan]`; changes to those definitions change this result.
- The VC is OLTP-only. OLAP and Looker Studio were not changed and should not be assumed to expose the metric.
- This is a lightweight subtraction of existing borrower aggregates, but portfolio growth should still be considered when reviewing OLTP sync performance.
- A positive result means earned active-loan interest currently exceeds outstanding principal under the prototype definitions. It does not prove future collections, accounting profitability, or risk-adjusted return.

## Rollback instructions

1. In production OLTP, open Manage > Versions.
2. Restore version `2.200107`.
3. Sync a client and confirm the VC, its detail-view field, and both principal-coverage format rules are absent.
4. Restore the pre-change documentation from version control if the live configuration is rolled back.

## Acceptance state

- AppSheet configuration: complete.
- Editor/configuration verification: complete.
- Negative runtime formula/color sample: complete.
- Data-model documentation: complete.
- User review and manual acceptance: complete on 1 September 2026.
- Accepted for ongoing prototype use: complete.
