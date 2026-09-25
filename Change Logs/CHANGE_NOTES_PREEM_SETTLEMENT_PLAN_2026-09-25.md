# Preem settlement plan — 25 September 2026

## Scope and result

The owner agreed one ฿6,350 payment on 29 September 2026: ฿2,150 of unpaid charges through 25 September, ฿300 daily interest for 26–29 September (฿1,200), and ฿3,000 outstanding principal. On Preem's sole active PROD loan, disabled `Auto Charge Enabled` and created one charge dated 29 September with ฿1,200 interest and ฿3,000 principal. Its note records the full agreement and the prior ฿2,150 balance. The original eight outstanding charge balances and all earlier payments/repayments remain intact; they and the new charge can be settled with one lump-sum receipt on 29 September. No receipt was posted in advance.

## Target, recovery and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; PROD OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting Git commit at documentation time: `33bfe6d17802adf70a1625eceb29b23af8ea3876`.
- Pre-write private dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/preem-settlement-before-20260925.dump`, SHA-256 `99C7AD98AE87DB47C3103260E90ACD9B46E1D562D2C5665FDE16DAE46846D933`. Successfully restored to a local test database with normalized schema equivalence. Cloud SQL cron extension/settings are outside its scope.
- Checked one active ฿3,000 daily-interest loan at ฿300/day, exactly eight outstanding historical charges totaling ฿2,150, no future charges and no unresolved payment. Rehearsed the locked, guarded SQL transaction with rollback, then committed it.
- Post-commit SQL showed automatic charging off, expected daily interest ฿0, one 29 September charge for ฿4,200, and total unpaid ฿6,350 (฿3,350 interest plus ฿3,000 principal). All 28 charges remain present.
- Synced the current PROD OLTP app in the signed-in work Chrome profile. The loan showed `Auto Charge Enabled` = N and the new 29 September charge; its detail showed Pending Payment, ฿1,200 interest, ฿3,000 principal and the settlement note.

Status: complete. The historical ฿2,150 retains its original charge dates, preserving partial-payment links; the agreed 29 September payment date is documented in the new charge note, not represented by redating those historical charges. No schema, AppSheet definition, notification or cash movement changed. If reversal is required, inspect intervening writes and make a targeted auditable correction; do not restore the full dump over later PROD activity.
