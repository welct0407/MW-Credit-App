# Gift Settlement Plan — 20 September 2026

## Scope and purpose

Replaced Gift's outstanding daily-interest schedule with the owner-agreed final settlement against production Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, at Flyway V26. Starting repository commit: `eb880b6433f28b0bddb20ac996a226cf84e4e987`.

The affected borrower is `ZM07vJ13YNWGl86LbuTSWV` (`พี่กิ๊ฟ`) and the affected active loan is `YCJ9wceq5R648b00TLT7Bp`, dated 25 August 2026 with ฿4,000 principal.

## Production changes

- Set `Auto Charge Enabled` to false on the active loan, stopping future daily-interest charge generation. The resulting expected daily-interest amount is ฿0.
- Removed the two unpaid, unallocated outstanding interest charges `4kTbmIOu17qE5eUNToXm1P` dated 15 September 2026 and `cg8:22:YCJ9wceq5R648b00TLT7Bp:2026-09-18` dated 18 September 2026. Each was ฿1,080 and had no repayment rows.
- Created replacement charge `gift-settlement-20261009-YCJ9wceq5R648b00TLT7Bp`, due 9 October 2026, with ฿4,000 principal and ฿9,720 interest. The total amount due is ฿13,720.
- Preserved all seven paid charges and their seven repayments. Historical interest received remains ฿6,840, and outstanding principal remains ฿4,000 until the settlement is paid.

## Backup and rollback

Before the write, created and restore-tested `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\gift-settlement-before-20260920.dump`, SHA-256 `ABF6E32E62E4C700833346406149718AAAF3471DC272BB1A51D3BCB07DF320DC`. The restore matched the normalized `public` and `assessment_lab` schema, including Flyway history; Cloud SQL cron extension and instance settings are outside the logical-backup scope.

Any rollback requires a separately reviewed coordinated database recovery or an auditable compensating correction. Never restore this backup over later production activity without reconciling subsequent writes.

## Verification

- Rehearsed the exact locked, preconditioned change under a serializable transaction and rollback before repeating it and committing.
- Verified after commit that automatic generation is disabled, exactly one outstanding charge remains, and its date and split are 9 October 2026, ฿4,000 principal and ฿9,720 interest.
- Verified the seven paid charges and seven repayments were unchanged and that no unresolved processing or error payment existed for Gift before the correction.
- Synced the current production OLTP app. The active loan displays `Auto Charge Enabled` as `N`, eight total related charges, and the replacement charge as pending for ฿13,720. Its charge detail displays ฿4,000 principal, ฿9,720 interest and zero payment rows.

## Status

Complete and verified in production. This was an operational financial data correction; it changed no schema or AppSheet configuration.
