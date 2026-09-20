# R010 DEV zero initialization — 20 September 2026

Completed after the owner explicitly approved zero initialization and the two required holder adjustments. DEV only: instance `appsheet-pg-dev-20260915`, host `34.158.38.171`, database `loan_manager_prod`. PROD was untouched. Starting Git: `498331854ceb4c01823dcf9f769ebefc57062a62`.

Two traceable Manual Correction outflows reduced Dad by 19,828 and Lisa by 26,234, using their existing default accounts. The existing `initialize_cash_accounts` function then initialized all five accounts with opening amounts of zero, capturing existing account flows. All five current balances were zero at completion. Earlier statement balances are calculated from retained history and need not be zero.

## Recovery and execution

- Fresh private backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r010-20260919/zero-account-openings-before.dump`.
- SHA256: `191e911f173f1be06e197d2a30b4f1e3ccf09a3a8702f1cef7ca1937b7b5f08b`.
- Actual isolated restore, normalized schema comparison and candidate transaction rehearsal passed. Scope: public and assessment_lab including Flyway history; Cloud SQL cron/settings excluded.
- Maintained runner: `scripts/database/Initialize-R010DevZero.ps1 -Apply`, with host/instance pinning and external credentials. Its SQL runs atomically, refuses initialized/drifted state and must not be replayed or promoted.
- Recovery requires reviewed compensating entries or restoration of the verified backup after assessing subsequent DEV writes. App version restoration cannot undo this data change. Do not delete immutable cutovers or prior financial history.

## Verification

- Transaction assertions passed: five initialized accounts, five zero openings/current balances; holder/account reconciliation; today's closing balances zero; no NULL statement balance; existing ledger fingerprints preserved and exactly two additional ledger rows.
- Post-commit state: 57 statement rows, 75 summary rows; zero unknown transaction types, duplicate keys, out-of-window rows, daily/current/last-line reconciliation errors or incorrect unknown balances.
- Current DEV OLTP GUI synced successfully. DEV Lisa Account 2 on 18 September displayed row balances 90, -10 and 0, with opening 190, in 10, out 200 and closing 0. Selecting 20 September displayed opening/in/out/closing all zero and no transactions.
- No app configuration, schema, financial source records or notification routes changed. SQL remains V27; existing app versions and migration hashes remain applicable. Model dictionary update is unnecessary for operational data alone.

This DEV fixture change is excluded from production promotion. Existing broader R010 acceptance and promotion requirements remain pending.
