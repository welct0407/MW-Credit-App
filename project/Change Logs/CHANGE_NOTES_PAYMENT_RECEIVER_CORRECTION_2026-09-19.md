# Payment receiver correction — 19 September 2026

## Scope and purpose

Corrected the receiver for three Posted payments dated 18 September 2026 so the business cash is held in Lisa's default active cash account. This was an owner-authorized production data correction; no app definition, schema, automation, allocation or repayment logic changed.

Production target was verified against the environment inventory before the write: Cloud SQL host `34.21.174.215`, database `loan_manager_prod`, OLTP app `93844270-6aa5-420b-a960-bcdf08abd357` at version `3.000228`, OLAP app at version `1.100178`, and Flyway `V24`.

## Corrected records

| Borrower | Payment Row ID | Payment date | Amount | Result |
| --- | --- | --- | ---: | --- |
| Nan | `TLJLZtTrijVAlXYwOcGQvJ` | 2026-09-18 | ฿1,300 | Existing Lisa custody retained; Lisa's default cash account assigned |
| Benz | `gZMFd2e3l1DuV3A9w6VXO9` | 2026-09-18 | ฿3,000 | Receiver changed from Dad to Lisa; Lisa's default cash account assigned |
| Benz2 | `clIBvFmI5MN7sgd6sfK5la` | 2026-09-18 | ฿3,000 | Receiver changed from Dad to Lisa; Lisa's default cash account assigned |

Each payment received an appended audit note describing the owner-requested receiver correction. The corresponding system Cash Ledger row was updated by the existing database trigger. The correction assigned ฿7,300 of receipts to Lisa's account and transferred ฿6,000 of holder custody from Dad to Lisa because Nan was already held by Lisa.

## Recovery point and rollback

Before the write, a fresh custom-format production database dump was created at the private path `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\r005-20260917\payment-receiver-correction-before-20260919.dump` with SHA-256 `048DD4DDE550D017EC2616B4481C2591C542E30AAA6EBAC40FF6D3A39767283A`. The maintained restore test succeeded, including normalized schema equivalence, the `public` and `assessment_lab` schemas, and Flyway history.

If the correction must be reversed, apply a new auditable Posted-payment receiver correction through the guarded source columns and append a new reason to each payment note. Do not delete or recreate the payments. The verified dump is the disaster-recovery rollback point.

## Verification

- Rehearsed the complete update inside a rolled-back transaction before the production commit.
- Locked Payments and Cash Ledger for the production transaction and checked exact row identity, date, status, amount and Lisa's one active default account before updating.
- Verified after commit that all three Payments and their derived Cash Ledger rows reference Lisa and Lisa's default account.
- Verified allocation and repayment hashes were unchanged; payment amounts, dates, status, planned allocation and posted amounts were unchanged.
- Verified holder balances changed only by the intended custody transfer: Dad `฿23,760 → ฿17,760`; Lisa `฿72,831 → ฿78,831`.
- Verified Lisa's account received `฿7,300` Cash In. Its opening balance remains intentionally uninitialized, so its account-level Current Balance remains unset.
- Synced the current production AppSheet client and verified the Business Cash Held dashboard shows Dad `฿17,760` and Lisa `฿78,831`.
- Opened all three payment detail records in the current production app and verified Payment Date `09/18/2026`, Status `Posted`, Received By `Lisa`, Received Into `Lisa`, the unchanged amounts, and zero allocation/posting differences.

## Status

Complete and verified in production on 19 September 2026. No model-document update is applicable because this changed operational data only.
