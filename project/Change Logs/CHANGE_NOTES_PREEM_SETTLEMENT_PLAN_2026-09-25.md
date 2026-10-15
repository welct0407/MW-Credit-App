# Preem settlement plan — 25 September 2026

## Final scope and result

The owner agreed one ฿6,350 payment on 29 September 2026: ฿2,150 of unpaid charges through 25 September, ฿300 daily interest for 26–29 September (฿1,200), and ฿3,000 outstanding principal. The owner clarified that no earlier balance should remain overdue. On Preem's sole active PROD loan, `Auto Charge Enabled` is false and one pending charge dated 29 September now carries ฿3,350 interest and ฿3,000 principal. No payment was posted in advance.

The first write had preserved the eight old outstanding charge balances and put only ฿4,200 on 29 September. The clarification superseded that presentation. In the corrective write, five partially paid historical charges were reduced to their already received amounts, closing their remaining ฿750 while preserving all payment and repayment rows and links. Three wholly unpaid charges totaling ฿1,400 were removed. A zero-value legacy allocation attached to one of those charges was removed; it represented no receipt and had no repayment. The 29 September charge was increased by the transferred ฿2,150 to ฿6,350. Correction notes on the five retained charges and the consolidated charge record the original amounts and transfer. No cash movement changed.

## Target, recovery and verification

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; PROD OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Initial documentation commit: `904ff816cb84aff0d10df0c7a5eccf3ff42c9209`.
- Before the corrective write, captured private dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/preem-short-close-before-20260925.dump`, SHA-256 `9124E6615A4CA6EA07D9289297E69AE21DEB720C8F08B83133D8F5DEB95960D3`. A local restore succeeded and its normalized schema matched. The earlier write has its separate restore-tested dump `preem-settlement-before-20260925.dump` (SHA-256 `99C7AD98AE87DB47C3103260E90ACD9B46E1D562D2C5665FDE16DAE46846D933`). Cloud SQL cron extension/settings are outside these logical backups.
- Confirmed exact old charge balances, payment/repayment links, the single zero-value allocation, unchanged ฿3,000 principal, no newer payment, and the initial 29 September charge. Rehearsed the locked, preconditioned corrective transaction with rollback, then committed it.
- Post-commit SQL showed 25 total charges, no unpaid or non-paid-status charge before 29 September, and only one outstanding balance: ฿6,350 on 29 September. Both OLAP borrower analytics and the borrower payment-health view showed zero overdue amount and zero overdue charges. The loan still has automatic charging off and expected daily interest ฿0. Eighteen posted payments totaling ฿5,950 remain.
- Synced PROD OLTP in the signed-in work Chrome profile. Preem's loan displayed all earlier related charges paid and the 29 September charge pending for ฿6,350; the charge detail displayed ฿3,350 interest and ฿3,000 principal.

Status: complete. No schema, AppSheet definition or notification changed. Any reversal should inspect intervening PROD writes and use a targeted auditable correction; restoring the full dump over later activity would discard those transactions.
