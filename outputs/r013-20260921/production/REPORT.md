# R013 production report

Released 21 September 2026 as a SQL-only promotion. The owner explicitly excluded both AppSheet apps; future app changes belong to R014.

## Result

- Production PostgreSQL advanced from Flyway V29 to V30 on `appsheet-pg-prod-20260914` / `34.21.174.215` / `loan_manager_prod`.
- V30 preserves the existing `Payments.Created At` value when the corresponding system Payment entry is inserted into `Cash Ledger.Created At`; a missing source time retains the current Bangkok-time fallback.
- No columns, backfill, payment record, notification or scheduled execution was added.
- Production apps were not copied, saved or upgraded. OLTP remains 3.000240 and OLAP remains 1.100189.

## Recovery and migration

Private pre-migration backup: `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r010-20260919/r013-production-before-20260921-131013.dump`, SHA256 `58D9E1BA0DAB2FF1419C4D3411073CE10CD8FBECB7D4CE817124481B38FC2B0D`. An isolated restore passed, its normalized schema matched the source, and V30 was successfully rehearsed on the restored V29 copy.

The runner used tested commit `aad17b642f38583f4dbaed8d9bfcfca2e482779d` and its private Flyway release manifest. One migration executed at 13:15 Bangkok in 199 ms with no warnings. Post-migration validation passed all 31 history entries. A rollback restore would lose legitimate writes made after the backup and requires a separate owner decision; normal correction should use a reviewed V31 forward migration.

## Production validation

- Target identity readback: `loan_manager_prod` on `34.21.174.215`; latest successful Flyway version 30, `payment receipt transaction time`.
- All six R013 SQL assertions passed inside one transaction and rolled back. They cover the exact existing timestamp, statement time/date, daily cutoff, retry uniqueness, legacy missing-time fallback and non-payment behavior.
- Zero synthetic R013 Payments rows remain after the test; the V30 rule is present in `guard_cash_ledger`.
- Production OLTP loaded and synced; Cash Statement loaded with existing minute-only display.
- Production OLAP loaded and synced on Analytics.

The agent remains summary-only and automatic payment creation remains disabled. Existing rows were not corrected or backfilled. A receipt posted after a past statement snapshot was sent does not reissue that historical image.
