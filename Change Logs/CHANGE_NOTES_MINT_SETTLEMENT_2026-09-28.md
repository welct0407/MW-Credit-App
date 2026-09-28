# Mint settlement plan — 28 September 2026

## Scope and result

The owner directed replacement of Mint's current outstanding charges with a settlement plan totaling ฿10,100: 30 September ฿3,840 (฿500 principal, ฿3,340 interest); 5 October ฿3,130 (฿1,500 principal, ฿1,630 interest); and 12 October ฿3,130 (฿1,500 principal, ฿1,630 interest). The plan totals ฿3,500 principal and ฿6,600 interest.

Production has two active Mint loans with ฿1,000 and ฿2,500 outstanding principal. Twenty-four unpaid daily charges dated 17–28 September totaled ฿5,580; none had linked repayments, allocations or target payments. Both loans now have Auto Charge Enabled false. The 24 unreferenced unpaid charges were removed under the existing audit trigger. Six settlement charges, one per loan on each agreed date, reproduce the three exact payment totals and principal/interest splits. Each installment was allocated between loans in proportion to their principal with whole-baht rounding; the per-loan principal totals remain ฿1,000 and ฿2,500. Previously paid charges and all posted payments were preserved; neither loan was marked closed before settlement receipt.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; production OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting repository checkpoint: `5d8ae524db6ae4a1073a78edc44fad69e13eac61`. No app definition, model, schema or migration was changed.
- Private pre-write backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/mint-settlement-20260928-before.dump`, SHA-256 `D62088B486F36C18C8B2ED3C78943BC3EC399F55D0082B458B4644E9996C1E05`. Local restore and normalized schema comparison passed. Cloud SQL instance settings are outside this logical backup.
- Private guarded SQL: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/mint-settlement-20260928.sql`. A serializable transaction with exact borrower, loan, charge, payment and reference preconditions was rehearsed with rollback, then committed. Transaction postconditions confirmed the three exact installment totals and both auto-charge flags off.
- Independent production readback confirmed no earlier unpaid charges, three pending charges per active loan, ฿3,500 principal still outstanding, and ten existing posted payments totaling ฿3,400 unchanged. Both daily analytics tables were refreshed for 17–28 September (12 dates) with the maintained production procedure.
- Production AppSheet GUI verification is pending because the required work Chrome profile is not currently open; the owner has been asked to open it. No alternate browser/profile was used.

Status: production data and directly affected analytics updated and verified; app GUI check pending. For rollback, reconcile any intervening financial writes and use a targeted auditable correction; restoring the full backup over later transactions would discard those transactions.
