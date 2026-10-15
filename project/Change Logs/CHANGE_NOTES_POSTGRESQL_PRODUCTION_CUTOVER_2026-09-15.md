# PostgreSQL production cutover — completed 15 September 2026

The owner authorized OLAP followed by OLTP and confirmed data entry had stopped before testing. Both original apps now use loan_manager_prod on appsheet-pg-prod-20260914, source database-2. Money is retained for rollback.

| App | Rollback | Schedule paused | SQL binding save | Final |
| --- | --- | --- | --- | --- |
| Loan Business Insights | 1.100041 | 1.100042 | 1.100043 | 1.100044 |
| Loan Manager ผู้จัดการสินเชื่อ | 3.000064 | 3.000065 | 3.000066 | 3.000067 |

Original IDs remain e74dd368-654f-44d7-bccf-83cf361d1cdb (OLAP) and 93844270-6aa5-420b-a960-bcdf08abd357 (OLTP). Private before-definitions were recorded before changes.

## Implementation

Changed sources using the current editor Table settings / Storage / Cloud Database / database-2 / public / Tables picker. No regeneration. OLAP's 12 business tables were saved and checked before OLTP's eight. OLTP tables: Borrowers, Loans, Repayments, Statistics, Charges, Partners, Payment Allocations, Payments. OLAP additionally uses Loan Assessment, Cash Pool Contributions, Settlements, Daily Analytics. Calendar remains Calendar Help Table / Sheet1 on Google Sheets. App folders and all business settings are preserved. Native Data locale and Worksheet Name/Qualifier metadata no longer appears for SQL tables.

Partner management remains owned by OLAP. No new table, column, foreign key or trigger was added during cutover. Existing 13 validated NO ACTION foreign keys and 10 user triggers remain. Row ID is PostgreSQL text with original case and values; AppSheet PackedUUID initial values are unchanged. Eight triggers normalize blank references and two restore Loans.Borrower Name lookup/propagation.

The copied OLAP was temporarily restored from 1.000007 to its source-reading definition 1.000005, producing 1.000009. Existing authorized API access was used for Find only. After extraction it was restored to SQL, producing 1.000011; all 12 SQL sources were verified and its schedules remain disabled. Copied OLTP stays 1.000006. No test app was promoted to production.

## Data reconciliation

Two source extractions were identical. Complete typed SQL comparison found 11 matching tables and two obsolete Daily Analytics keys versus three current source rows. The owner approved replacing September 13–14 derived snapshots and adding September 15. Before-images were preserved privately. The replacement ran atomically with exact EXCEPT ALL validation inside the transaction. Daily Analytics then had 42 rows and zero differences. Transactional baseline rows were unchanged.

Pre-catch-up counts: Borrowers 29, Loans 62, Repayments 644, Statistics 1, Charges 745, Loan Assessment 1, Cash Pool Contributions 5, Partners 2, Settlements 2, Daily Analytics 42, Payment Allocations 263, Payments 140: **1,936 rows**. Every scalar field and relationship membership matched. Forty-two reverse-reference lists differed only in ordering; callers must not assume implicit list ordering. Statistics was already SQL in the read app, so its native Money key and MAIN label were independently checked in the new database UI.

## Scheduled work and catch-up

Generate Daily Charges was disabled before its 00:05 Bangkok run during migration. OLAP Refresh Daily Analytics Daily 2 was paused too. Both were re-enabled on SQL. Refresh Daily Analytics Daily was already disabled and remains disabled. Other original bots were not edited.

The existing Generate All Today's Charges action was reviewed for auto-charge, open-loan, interval, date and no-existing-charge guards. SQL had zero September 15 charges. Twenty-eight daily-interest loans satisfied the conditions. The action was invoked once in the new production desktop interface. Sync completed and the action disappeared when no eligible rows remained.

SQL contains **28 September 15 charges, principal 0, interest 8,040**. Expected-versus-actual comparison by loan and amounts returned zero missing/wrong rows, zero unexpected/wrong rows and zero duplicate loan/date rows. The generated rows are preserved privately. This verifies the production charge write path; no live receipt, transfer or disbursement was created. Retained Money lacks these new SQL writes.

## Checks and limitations

- Final documentation object inventories match. All 431 OLAP and 580 OLTP documented columns, including generated automation columns, match exactly. Business column counts remain 374 and 196. All 56 OLAP and 72 OLTP actions match. Views, slices and permissions match. Only source metadata and version fields differ.
- Both new production desktop apps loaded and synced without observed errors. OLAP overview, analytics and partners were checked. OLTP overview, collection and receipts were checked. A receipt form was opened and cancelled without saving. OLAP synced after charge writes.
- Earlier copied-app lifecycle tests covered six allocation paths, default, borrower lookup propagation and text keys. See the prior OLTP_SQL_VALIDATION_REPORT.md in outputs/postgresql-migration-trial-20260914.
- Future scheduled execution, live notification delivery, concurrent/offline devices and export/Looker refresh were not newly verified. No quantified performance improvement is claimed. A direct external Money reader remains stale until separately migrated. Looker was not edited.
- Deployment was explicitly authorized. User acceptance on their own devices remains a follow-up.

## Documentation and recovery

Updated Documents/AppSheet_Data_Model_Overview.md and Documents/AppSheet_Data_Dictionary.xlsx together. SQL Production is the current workbook sheet; older trial sheets are historical. The workbook was rendered, exported and re-imported; original sheet values were preserved. Scripts are maintained in scripts/. Sanitized evidence is in outputs/postgresql-production-cutover-20260915/.

Private definitions, rows, obsolete analytics before-images, SQL and generated charges are in C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/postgresql-cutover-20260914. Credentials and personal/financial row data are excluded from Git. Independent private backup coverage is unverified.

Rollback: pause users and writers, preserve every post-cutover SQL write, reconcile it back to Money with exact keys, then restore OLAP 1.100041 and OLTP 3.000064 and their original schedules. **Version rollback alone does not copy SQL data back.** Do not delete either database as routine rollback.

Owner checks: reopen and sync both apps; inspect a known borrower and today's charges; verify the next normal receipt and balances; review partner/report totals after sync. Report sync errors before retrying financial actions. Downstream export/Looker freshness needs separate verification.
