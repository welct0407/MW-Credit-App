# Oey closing payment correction — 2026-09-22

## Scope and purpose

Correct the 22 September production closing payment on Oey's 21 September loan from ฿1,210 (฿1,100 principal + ฿110 interest) to the owner-confirmed ฿1,200 (฿1,100 principal + ฿100 interest). No app definition, database schema, or workflow was changed.

## Production data changed

- Target: Cloud SQL instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database `loan_manager_prod`; affected loan `vfJ6ImtxsyAvtcQ7UaZfKv` and its 22 September closing payment.
- Updated the posted payment, its sole payment allocation and repayment, and the closing charge. The payment and repayment notes and charge note record the before/after correction. The payment source trigger recalculated its system cash ledger receipt from ฿1,210 to ฿1,200 in Lisa's existing account. The materialized loan, payment, and charge totals recalculated from the corrected components.
- The prior 21 September first-day interest payment of ฿110 was unchanged. The closed loan now shows ฿1,100 principal received and ฿210 lifetime interest received, including both days; outstanding principal remains zero.
- Database-posted row guards were disabled only for the three affected tables inside the serializable correction transaction and re-enabled before commit. Post-commit catalog readback confirmed all three guards enabled. No rows were deleted.

## Rollback and audit

- Starting Git commit: `dd187eea5f67829bea46738545d743c12388fa8e`; repository was clean.
- Private pre-write PROD custom dump: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\oey-close-before-20260922.dump`, SHA-256 `AC3C35D24795A4497F46248CD7AE17A70BF503E19641F182C796D248F0CD1589`. Full local restore succeeded and normalized schema matched. Cloud SQL cron extension/settings are outside this dump's scope.
- Private guarded correction SQL: `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\oey-close-correction-20260922.sql`. It ran successfully with a final rollback before the committed run. The verified dump and the correction notes preserve the original values. Recovery would use a reviewed inverse transaction or restore procedure, accounting for later production writes.

## Verification and status

- Post-commit SQL readback: payment received/planned/posted each ฿1,200; allocation and repayment each ฿1,100 principal + ฿100 interest; charge paid ฿1,200 with zero remaining; cash receipt ฿1,200 dated 22 September; loan closed with zero outstanding principal.
- Current PROD OLTP GUI synced successfully. Oey's loan detail showed closed status and the 22 September charge at ฿1,200; charge detail showed ฿1,100 principal due, ฿100 interest due, payment received, and one ฿1,200 repayment.
- Status: production data correction complete. No manual tests remain for this scoped transaction.
