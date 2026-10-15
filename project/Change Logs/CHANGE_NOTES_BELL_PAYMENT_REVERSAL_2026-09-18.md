# Bell payment reversal — 18 September 2026

Status: **Applied and verified.** The owner reported that the partner accidentally recorded a 300-baht receipt for Bell today and authorized reversing it.

## Scope and result

- Target: production PostgreSQL `loan_manager_prod` on `34.21.174.215`, consumed by production OLTP Loan Manager **3.000173** and OLAP Loan Business Insights **1.100122**.
- Reviewed source payment: `99e23W5Omos4526QOfExgy`, dated `2026-09-18`, Posted, 300 baht, Single Full, received by `ch:dad`. Its one allocation and repayment applied 300 baht of interest to charge `cg8:22:CTFksgbi3fnOLkzfQL4F3G:2026-09-18`.
- Preserved the immutable posted payment, allocation and original repayment as the audit record.
- Added repayment adjustment `reversal:99e23W5Omos4526QOfExgy`, dated `2026-09-18`, with principal `0` and interest `-300`. Its note identifies the source payment and owner-requested reversal.
- Added cash-ledger adjustment `cash-reversal:99e23W5Omos4526QOfExgy`, dated `2026-09-18`, Movement Type `Manual Correction`, 300 baht out from `ch:dad`. The existing controlled SQL adjustment guard and explanatory note were used.
- No schema, AppSheet configuration, notification, loan principal or other borrower record changed.

## Backup and recovery

- Fresh private pre-write dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/bell-payment-reversal-before-20260918.dump`.
- SHA-256: `3D3CD583CB6DCAC1905011C1575B04A4B96A7641132628BDC0CB794140AD3D41`.
- The isolated restore test passed and its normalized public/assessment_lab schema matched the source backup.
- A transaction rehearsal inserted both adjustments, forced deferred checks, verified the resulting charge and cash balance, and rolled back before the production transaction.
- If this reversal itself must later be corrected, use reviewed counter-adjustments that preserve both records. Do not delete the immutable posted receipt or restore this backup over later financial writes without a new owner-authorized recovery decision.

## Verification

- The production transaction rechecked the exact payment date, amount, status, borrower identity and receiver immediately before inserting either adjustment.
- SQL readback confirms the charge now has principal paid `0`, interest paid `0`, amount remaining `300`, status `รอชำระ`, and no payment date.
- The original 300-baht payment receipt and the 300-baht manual cash outflow net to zero for custody. Dad now has cash in **17,760 baht**, cash out **300 baht**, and current balance **17,460 baht**.
- Production OLTP synced successfully. Today's Collection visibly shows Bell with **0 baht paid** and **5,570 baht outstanding**; the dashboard visibly shows Dad business cash held of **17,460 baht**.
- Starting Git commit: `bef621c`. Unrelated in-progress R007 files were present and excluded from this change.

## Remaining checks

None for this data-only reversal. The retained Posted payment remains visible as the original source event; the repayment and cash counter-entries provide the auditable reversal.
