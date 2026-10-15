# Borrower Preferred Receiving Accounts — 22 September 2026

## Scope and purpose

Backfilled production `Borrowers[Ref Preferred Receiving Cash Account]` from each borrower's most recent posted, account-assigned receipt since the cash-account feature entered production. The verified target was Cloud SQL instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database `loan_manager_prod`, at Flyway V32. Starting repository commit: `e937f77ff0e249f1b7d19d2b561fa4b7e1fa34de`.

Flyway V23 installed on 19 September 2026 at 01:05 Bangkok time. The candidate set therefore used posted payments with `Payment Date >= 2026-09-19` and a nonblank receiving cash account. Six account-assigned payments dated before the cutover date were excluded.

## Production change

For each qualifying borrower, receipts were ranked by Payment Date, Processed At, Created At and immutable Payment Row ID, all descending. The preferred receiving account was set to the latest row's account. Eighteen borrowers qualified, and all eighteen preferences were blank before the change:

| Preferred account | Borrowers updated |
| --- | ---: |
| Dad TTB | 8 |
| Dad SCB | 5 |
| Lisa | 5 |
| **Total** | **18** |

One new posted Lisa receipt arrived after the first 17-borrower rehearsal. The commit precondition rejected that stale candidate set before any mutation. The candidate set and backup were refreshed to include the eighteenth borrower before the successful rehearsal and commit.

No payment, repayment, allocation, charge, cash-ledger row, cash balance, borrower balance or non-preference borrower field changed.

## Backup and rollback

The authoritative fresh pre-write backup is `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/borrower-preferred-account-backfill-before-20260921-r2.dump`, SHA-256 `EE5E45024A15F21EC6024835F9D56FA05696DA3717157A80A81F364474E4E726`. It restored successfully in isolation and matched the normalized `public` and `assessment_lab` schemas, including Flyway history. Cloud SQL cron extension and instance settings are outside the logical-backup scope.

Rollback should use a locked, reviewed correction that restores these eighteen preference fields to their blank before-image only after confirming no later intentional preference edit. Never restore the complete dump over later production activity without reconciling subsequent writes.

## Verification

- Rehearsed the refreshed 18-borrower update under a serializable transaction and rollback, with `Payments`, `Borrowers` and `Cash Accounts` locked.
- Verified all source accounts exist and are active, all eighteen resulting preferences equal their latest qualifying receipt account, and fingerprints of every other borrower field are unchanged.
- Synced production OLTP 3.000245. The Receive All confirmation form visibly defaulted representative borrowers to Dad TTB, Dad SCB and Lisa as expected; each form was cancelled without saving a payment.

## Status

Complete and verified in production. This was an operational master-data backfill using the existing model; it changed no schema, AppSheet configuration, notification or report definition. No manual test remains.
