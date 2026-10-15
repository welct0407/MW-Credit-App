# Organ payment — 19 September 2026

## Scope and purpose

Recorded the owner's authorized production payment for Organ (`ออแกรน`) as received on 18 September 2026. The ฿1,800 bank-transfer receipt was posted to Dad's active default TTB cash account using `Receive All`, covering every unpaid charge dated through 18 September while leaving the two 19 September charges unpaid.

This was an operational data write only. No schema, app definition, automation or model documentation changed. The verified production target was Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, Flyway `V24`, and OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`.

## Changed records

- Created Posted payment `d749ce4f-76f2-4ed4-a13c-a35b530744a8`, dated `2026-09-18`, for ฿1,800.
- Set payment method to `Bank Transfer`, allocation method to `Receive All`, receiver to Dad, and receiving account to `Dad TTB`.
- The existing payment processor created 10 payment allocations and 10 matching repayments totaling ฿1,800.
- The existing cash-ledger trigger created the corresponding ฿1,800 receipt into Dad TTB.
- All charge balances dated through 18 September are now zero.
- The only remaining unpaid Organ charges are ฿100 and ฿200, both dated 19 September 2026.

## Backup and rollback

Before the write, created the private production dump `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\organ-payment-before-20260919.dump`, SHA-256 `1737BF1ED462D3A3D828AC9A344DFDEC0E8713F15C05B11B1EFBC8A27435E45F`. An isolated restore succeeded with normalized schema equivalence for `public`, `assessment_lab` and Flyway history. Cloud SQL instance settings and the cron extension remain outside this logical-backup scope.

The payment is guarded as an auditable Posted financial record and cannot be deleted. If it must be reversed, use a reviewed compensating financial adjustment that restores the affected charge balances and cash custody; use the verified dump only for coordinated disaster recovery and never restore it over later production activity without explicit recovery authorization.

## Verification

- Confirmed before posting that Organ's unpaid balance through 18 September was exactly ฿1,800 and the 19 September charges were exactly ฿100 and ฿200.
- Rehearsed the complete transaction and all assertions under rollback before committing the same guarded transaction.
- Verified the payment is `Posted`, with Planned Allocation Amount and Posted Amount both ฿1,800.
- Verified 10 allocations and 10 repayments reconcile to ฿1,800, with no remaining balance before 19 September.
- Verified the two 19 September charges remain pending at ฿100 and ฿200.
- Verified the Cash Ledger points to Dad and Dad TTB. Dad's current holder balance is ฿21,780 after the receipt.
- Synced the current production AppSheet client and verified the payment detail shows 18 September, Posted, ฿1,800, Bank Transfer, Receive All, zero allocation/posting differences, and 10 related repayments.

## Status

Complete and verified in production on 19 September 2026. No manual test remains.
