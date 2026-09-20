# Dad Withdrawal Split — 20 September 2026

## Scope and purpose

Corrected Dad's production cash withdrawal dated 19 September 2026 from one ฿8,000 TTB withdrawal to the owner-confirmed split of ฿5,000 from TTB and ฿3,000 from SCB. The destination remains Dad เงินสดในมือ. The verified target was production Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, at Flyway V26. Starting repository commit: `d04e47b8af7f636633e4dc67df7e859af7b52c33`.

## Production changes

The original manual ledger row `6XYHSPmclDN84FP81nsyR8` is posted and protected from in-place financial edits. It was therefore retained unchanged and corrected with auditable compensating entries, all dated 19 September 2026:

- `cash-withdraw-reversal-20260919`: reversed the original ฿8,000 movement from Dad TTB to Dad เงินสดในมือ by moving ฿8,000 from cash in hand back to TTB.
- `cash-withdraw-ttb-corrected-20260919`: recorded the corrected ฿5,000 withdrawal from Dad TTB to Dad เงินสดในมือ.
- `cash-withdraw-scb-corrected-20260919`: recorded the corrected ฿3,000 withdrawal from Dad SCB to Dad เงินสดในมือ.

The net effect is exactly two withdrawals totaling ฿8,000: ฿5,000 from TTB and ฿3,000 from SCB. Dad's cash in hand and total business cash are unchanged.

## Backup and rollback

Before the write, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\cash-withdrawal-split-before-20260920.dump`, SHA-256 `A8929D9E1BE08F91A628F698D31219F69C7557B55B9E35553E63184B305620A2`. The restored `public` and `assessment_lab` schemas matched the normalized production schema, including Flyway history; Cloud SQL cron extension and instance settings are outside the logical-backup scope.

Rollback should use additional reviewed compensating movements. Never restore this backup over later production activity without reconciling subsequent writes.

## Verification

- Rehearsed the complete locked and preconditioned correction under a serializable transaction and rollback before repeating it and committing.
- Verified the original protected row remained unchanged and the three deterministic correction rows were created with the expected accounts, dates, amounts and audit notes.
- Verified resulting account balances: Dad TTB ฿13,510; Dad SCB ฿2,250; Dad เงินสดในมือ ฿13,000.
- Verified Dad's initialized-account total, Business Cash Held and Current Balance all remain ฿28,760, with reimbursement or advance due ฿0.
- Synced the current production OLAP app. Cash Ledger Recent displays the original, reversal and two corrected rows, while Cash Account Summary and Cash Holder Summary display the verified balances above.

## Status

Complete and verified in production. This was an operational financial data correction; it changed no schema or AppSheet configuration.
