# Native database copy and app source migration

14 September 2026. **Trial source migration completed; owner review pending.**

LoanInsights PG Trial 20260914 (494cd013-0d9b-482f-9559-c9d83059de91), version **1.000007**, now reads all 12 native Money tables from PostgreSQL through database-2. Calendar remains on its original read-only Google Sheets source. Production OLTP, OLAP, Money database and Looker configuration are unchanged.

## Copied data

| Table | Verified SQL rows | Physical columns |
|---|---:|---:|
| Borrowers | 29 | 11 |
| Loans | 62 | 20 |
| Partners | 2 | 7 |
| Cash Pool Contributions | 5 | 6 |
| Charges | 745 | 6 |
| Daily Analytics | 41 | 16 |
| Loan Assessment | 1 | 5 |
| Payment Allocations | 263 | 13 |
| Payments | 140 | 13 |
| Repayments | 644 | 10 |
| Settlements | 2 | 7 |
| Statistics (previous task) | 1 | 2 |
| **Total** | **1,935** | **116** |

The current task copied 1,934 rows; Statistics was already copied and verified. Destination: loan_manager_prod, public schema, instance appsheet-pg-prod-20260914. The unused SQL Calendar table is still empty.

## Procedure and exact configuration changes

1. Recorded rollback **1.000004** and full rendered configuration. With the owner's specific confirmation, enabled the trial API and created its access key; saved **1.000005**. Original app API settings were not changed.
2. Used the documented AppSheet API **Find** action, without a selector, to extract all 11 remaining native tables. The maintained script fixes the trial app ID, permits only named tables and only Find requests, passes credentials in a header, and refuses to overwrite frozen snapshots. No AppSheet write API calls were made.
3. Compared PostgreSQL metadata with the app's physical-column definitions. All matched. Virtual columns and _RowNumber were excluded from SQL inserts. No database schema changes were needed.
4. Preserved text, keys, reference values and case exactly. Converted en-US dates to ISO, Y/N to booleans, and blank non-text values to SQL NULL. Numeric strings were cast to existing SQL types; money values were checked for precision beyond two decimals. Existing text blanks remain empty strings.
5. Inserted through SQL Studio using one guarded transaction per table. Each transaction checked the database, locked the destination, rejected a nonempty table, and compared all columns in both directions before committing. No deletion, truncation or upsert was used. The destination had no user triggers or foreign-key constraints.
6. Independently read back all committed rows in key-ordered batches of at most 250 and compared every physical field with the normalized extraction. This avoids SQL Studio's large-cell display truncation.
7. In the **new editor**, used Data > table > Table settings > Storage > Source Path > browse for more data > database-2 > Schemas > public > Tables > matching table. Borrowers, Loans and Partners saved as **1.000006**. The owner then authorized switching the remaining eight native tables; saved **1.000007**, with **1.000006** as that step's rollback.

For every switched table T, Data Source is `database-2`, Source Path is T, and Source ID is `Table=public.T__T`. The source picker removed the old native Worksheet Name/Qualifier and table-level en-US Data locale entry. Existing column-level settings, keys, Refs, formulas and permissions remain unchanged. No schema regeneration was performed.

## Verification results

- **SQL read-back:** 18,427 physical field values matched across 1,934 newly copied rows. All row counts and unique keys matched. All 13 nonblank reference relationships resolved to copied keys, with zero unmatched references.
- **Master-only stage:** all 5,342 compared AppSheet field values matched across 29 borrowers, 62 loans and 2 partners, excluding provider _RowNumber.
- **Final all-native stage:** 46,283 AppSheet business/calculated field comparisons matched in value or, for the four lists below, related-record membership. No missing rows or changed business values were detected.
- **Configuration:** all 374 rendered column definitions remained identical. Rendered views, slices and actions were unchanged; only version and the intended table source properties changed. Existing table permissions were preserved.
- **New desktop GUI:** explicit sync completed without a visible error. Borrowers, Loans, Partners, Loan Assessment and Daily Analytics Validation views opened without visible errors. Borrower detail and linked loan navigation were checked during the master stage.
- **Dashboard:** Total Profit, Daily Interest, Realized Profit MTD, Forecast Remaining Interest, Projected Monthly Profit, Forecast Monthly Return on ADO, Peak Cash Pool 30D and Peak Cash Pool Date 30D matched the original app after the full switch.

### Observed ordering differences

_RowNumber changed for **201 Charges** and **144 Repayments**. Three Loans' Related Charges lists and one Loan's Related Repayments list returned the same keys in a different order. No column expressions in the compared OLAP snapshot directly referenced `[_RowNumber]`.

This is a real migration difference, not a data-loss finding. PostgreSQL row order and unsorted REF_ROWS list order must not be treated as stable. Validate any OLTP allocation tie-breaking or row-number-based behavior separately before its migration and production cutover. No ordering logic was changed in this task.

## Dependencies and practical limits

The trial is OLAP-owned. Partner management, contributions and settlements remain OLAP workflows; Borrowers, Loans, Charges, Payments, allocations and Repayments retain their existing OLAP read-only permissions. Production OLTP still consumes original Money tables and has not been migrated or tested against this SQL source. No Looker source was changed; downstream report checks remain pending for a later cutover.

The copy is a set of sequentially read snapshots, not a continuous replication process or atomic database-wide snapshot. New production changes after extraction are not automatically copied. Source reads, calculation comparisons and UI smoke checks passed, but create/update/delete workflows, bot execution, concurrency and performance benchmarks were not run. Copied schedules remain disabled. The Operations App shortcut still opens the original OLTP app; it was not used for testing.

The API remains enabled as authorized. Its key can authorize more than reads; **the extraction script** is restricted to Find. Credentials, raw extracts, SQL containing private data, and raw app configuration are outside Git under `C:\Users\MWCredit\Documents\ChatGPT\AppSheet-Loan-Project\postgresql-migration-trial-20260914`. Their backup coverage has not been verified. Repository evidence contains counts and comparison results, not financial or personal values.

Cloud SQL Studio displayed `function parse_statements(unknown) does not exist` while also returning successful query results. This was not treated as proof of insert success: committed read-back and independent comparisons established the copied data. No compatibility workaround or helper function was installed.

## Rollback and owner review

- Restore trial **1.000006** to undo only the final eight source switches.
- Restore **1.000004** to return to Statistics-only SQL bindings and the pre-API app configuration. Check the Integrations toggle explicitly after a rollback; access-key lifecycle is not assumed to follow app-version restoration.
- Leave SQL rows intact for recovery. No production rollback is needed. Do not restore **1.000002**, which re-enables a copied schedule.
- Owner review: sync the trial, compare Analytics, open a borrower and its loans, inspect partner balances and their related records, and review Loan Assessment and Daily Analytics. Report any unexpected ordering or values. Financial write-workflow tests and production cutover require a separate verified step.

## Evidence and documentation

`bulk-copy-plan.json`, `bulk-copy-executed.json`, `bulk-readback-verification.json`, `bulk-app-verification.json`, `bulk-ui-validation.json`, `full-app-verification.json`, and `full-ui-validation.json` record the checks. The project data-model overview, data dictionary and migration change log reflect the final trial state.

Official references: [Read records from a table](https://support.google.com/appsheet/answer/10105770?hl=en), [Invoke the API and use an access-key header](https://support.google.com/appsheet/answer/10105398?hl=en), and [Use PostgreSQL data](https://support.google.com/appsheet/answer/10106598?hl=en).
