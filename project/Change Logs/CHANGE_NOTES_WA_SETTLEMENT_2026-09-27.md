# Wa 5 October settlement — 27 September 2026

## Scope and result

The owner directed consolidation of Wa's outstanding charges into a 5 October 2026 settlement of ฿2,000 covering principal and interest. Production had two active daily-interest loans with ฿500 and ฿1,000 outstanding principal. Twelve unpaid charges dated 21 and 23–27 September totaled ฿900 interest and had no repayments, allocations or target payments. The existing paid charges and posted payments were left intact.

Both active loans now have Auto Charge Enabled false. The twelve unreferenced unpaid daily charges were removed under the existing audit trigger, and one charge per loan was created for 5 October: ฿500 principal + ฿166.67 interest (฿666.67) and ฿1,000 principal + ฿333.33 interest (฿1,333.33). Interest was allocated in proportion to outstanding principal. The agreed total is ฿1,500 principal + ฿500 interest = ฿2,000, reducing the prior unpaid interest by ฿400. The charges record the agreement in their notes. No payment was created or moved, and no loan was marked closed before receipt.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; production OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting repository checkpoint: `e587eeaf438aab925e5a7145d40593b24cdb1d5f`. No app definition, model, schema or migration was changed.
- Private pre-write backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/wa-settlement-20260927-before.dump`, SHA-256 `EFECD97426A8E93CBAA587CCB511E437F30242B7ED7D31C70C47937DB1913BCC`. A local restore and normalized schema comparison passed. Cloud SQL instance settings are outside this backup.
- Private guarded SQL: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/wa-settlement-20261005.sql`. A serializable transaction was first rehearsed with rollback, then committed with exact borrower, loan, charge, payment and reference preconditions. Its postconditions confirmed two 5 October unpaid charges totaling ฿2,000 and both auto-charge flags off.
- Independent production readback confirmed no earlier unpaid charges, exactly one pending charge per active loan, ฿1,500 principal still outstanding, and ten existing posted payments totaling ฿1,050 unchanged. Both loan details in the production AppSheet GUI show their 5 October charges and Auto Charge Enabled `N`. The app rounds the card amounts to whole baht; SQL readback confirms the exact cents.
- Refreshed both daily analytics tables for 21–27 September with the maintained production procedure; seven dates refreshed. No daily charge generation was run.

Status: production data and directly affected analytics updated and verified. For rollback, reconcile any intervening financial writes and use a targeted auditable correction; restoring the full backup over later transactions would discard those transactions.
