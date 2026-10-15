# Nan payment dated 26 September — 27 September 2026

## Scope and result

The owner requested one ฿1,300 payment for Nan dated 26 September: ฿900 outstanding as of that date (฿500 remaining on a 25 September charge, plus ฿300 and ฿100 charges dated the 26th) and two 27 September charges of ฿300 and ฿100 paid early. The separate ฿1,050 charge dated 27 September was to remain unpaid.

In production, posted one Bank Transfer payment dated 26 September into Nan's preferred Dad TTB account, matching her recent receipts. Created five allocation/repayment pairs with their original charge dates and a 26 September payment date. The five target charges now have zero remaining; the ฿1,050 charge remains pending with zero paid. The system created one matching ฿1,300 cash-ledger receipt dated 26 September. No loan principal, charge due amount, existing payment, existing repayment, or other cash entry changed.

Because the ordinary Lump Sum engine only allocates to charges dated no later than the payment date, it could not link a 26 September receipt to 27 September charges. The controlled SQL transaction temporarily disabled only its automatic payment processor while retaining receipt, custody, child, cache, cash-ledger, and audit guards; it restored the processor before commit. Payment and child row IDs are deterministic to prevent accidental replay.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; PROD OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting Git commit: `7cb6101cba42332042f7c0ab1b24f38e7ddf65c2`.
- Pre-write private dump: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/nan-payment-20260926-before-20260927.dump`, SHA-256 `1FEB37D4D16AE9E47F16DB4D7034DEFE2A92E96F9996F1FC1DB80B2BDA1C3D04`. Local restore succeeded with normalized schema equivalence; only benign pg_dump view aliases differed. Cloud SQL instance settings are outside its scope.
- The guarded serializable write was rehearsed with rollback, then committed. Independent readback confirmed the posted payment's planned and actual totals equal ฿1,300, five allocations/repayments with payment date 26 September, one Dad TTB receipt of ฿1,300 on the same date, all five target balances zero, the separate ฿1,050 balance unchanged, and the normal payment processor enabled.
- Refreshed both daily analytics tables from 26 through 27 September through the maintained procedure. Independent portfolio reconciliation matched both dates with zero mismatches.
- Production OLTP AppSheet GUI verification passed in the signed-in work Chrome profile after sync: Nan's 26 September payment displays Posted, ฿1,300, Bank Transfer, Dad TTB, with five allocations of ฿500/฿300/฿100 to charges dated 25–26 September and ฿300/฿100 to charges dated 27 September. The separate ฿1,050 charge's unpaid state was verified by database readback.

Status: posting, derived analytics and representative AppSheet GUI check complete. Rollback should reconcile intervening writes and use a targeted, auditable reversal; restoring the full dump over later transactions would discard those transactions.
