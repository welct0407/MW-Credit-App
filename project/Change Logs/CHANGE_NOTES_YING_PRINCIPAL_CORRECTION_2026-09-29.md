# Ying principal payment correction — 29 September 2026

## Scope and result

The owner identified that Ying's ฿400 payment received early on 29 September was meant to reduce principal on her ฿5,000 loan. Production had applied it to that day's ฿440 interest charge. Earlier principal receipts had already reduced the loan to ฿4,400 outstanding; applying this ฿400 correctly leaves ฿4,000 outstanding and makes the current daily interest ฿400 at 10%.

The existing posted payment, receiving account and cash-ledger receipt were preserved. Its single allocation and repayment now record ฿400 principal and zero interest against a new, fully paid principal-only charge dated 29 September. The original daily interest charge is now ฿400, with zero paid and ฿400 remaining. Notes on the payment, repayment and daily charge explain the owner correction. No duplicate receipt was created.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; production OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`. Starting repository checkpoint: `addae12a683be01806e2cc32edc0b6a2468c82d8`. No app definition, schema, migration or model configuration changed.
- Private pre-write backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/ying-principal-correction-20260929-before.dump`, SHA-256 `9C9172790A0786C7E952CDBA30FED1DACFCC847D09F9E30BF9495F4B6C5A56F0`. A local restore and normalized schema comparison passed.
- Private guarded SQL: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/ying-principal-correction-20260929.sql`. The transaction was rehearsed with rollback, then committed with exact loan, payment and charge preconditions. Only the two lump-sum child guards were temporarily disabled for the correction and were restored before commit; audit triggers remained active.
- Independent production readback confirmed ฿4,000 outstanding principal, ฿1,000 principal received, ฿2,500 interest received and ฿400 current daily interest on the loan. The daily charge is pending at ฿400; the separate principal charge is fully paid at ฿400. The original payment remains Posted for ฿400 with one principal allocation/repayment, one ฿400 cash-ledger receipt and both child guards enabled.
- The maintained analytics rebuild refreshed 29 September (one day). The production AppSheet GUI showed the loan balance, current daily interest, both charge states and the posted payment's ฿400 principal allocation into Dad TTB.

Status: production data, directly affected analytics and GUI readback verified. For rollback, reconcile any intervening financial writes and use a targeted auditable correction; restoring the full backup over later transactions would discard those transactions.
