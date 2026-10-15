# Pim payment charge allocation — 25 September 2026

## Scope and result

The owner requested that Pim's ฿600 payment received on 25 September settle her 24 September charges, while retaining the actual payment date of 25 September. Corrected the three PROD allocation and repayment links (฿250, ฿200 and ฿150) from the corresponding 25 September charges to the 24 September charges. Updated allocation charge-date snapshots and appended correction notes to the payment and repayments. Preserved all immutable row keys and the original ฿600 cash receipt into Dad's SCB account.

The three 24 September charges are now paid, each with payment date 25 September. The corresponding 25 September charges are outstanding for ฿250, ฿200 and ฿150. No payment, charge, allocation, repayment or cash-ledger row was created or deleted. No app definition, schema or model documentation changed.

## Target, rollback and checks

- Target: `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`; PROD OLTP app `93844270-6aa5-420b-a960-bcdf08abd357`.
- Starting Git commit: `db3e77ce3a3bff84041b4b3a61537c3316907a10`. Unrelated pre-existing work was left untouched.
- Before the write, captured private restorable dump `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r005-20260917/pim-charge-link-before-20260925.dump` (SHA-256 `94F6A82DEC65E4ECACD3F6951A8266F362C2ACC9B849182CC62ABD321EEFDE57`). Restored it successfully into a local test database and verified normalized schema equivalence; Cloud SQL-specific extension/settings were excluded from the local restore.
- Rehearsed the guarded correction in a rolled-back transaction, then committed it in a serializable transaction. The lump-sum child guards were disabled only within that transaction and confirmed enabled afterward.
- SQL readback confirmed one posted ฿600 payment dated 25 September, three 24 September allocation/repayment links, zero remaining on those charges, three outstanding 25 September charges, and unchanged 25 September cash receipt.
- Synced the PROD OLTP app in the required signed-in Chrome work profile. Its 24 September ฿250 charge showed Payment Received and a related ฿250 repayment dated 25 September.

Status: complete. No further manual tests remain. Rollback, if needed, should use the verified private dump and a targeted, auditable reversal after inspecting intervening PROD writes; a full database restore would overwrite later transactions.
