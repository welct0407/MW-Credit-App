# R011 cash account alternative number — DEV verification, 21 September 2026

Scope: optional second receiving identifier, requested as an R011 prerequisite for future Instagram receipt summaries. Production and collection runtime were not changed.

| Check | Result |
| --- | --- |
| Target identity | DEV instance appsheet-pg-prod-20260914 / host 34.21.174.215 / database loan_manager_dev; both apps use database-3 / Cash Accounts |
| Rollback | Starting Git 43fad6e3ddd3f45fa905037fb23747643048722a, clean tree; live OLTP 1.000060 / OLAP 1.000019 before edits |
| Private backup | C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r011-account-alias-20260921/before-v29.dump; SHA256 3222fe2e4664c6982c0106946cc928c2042777182d8fbef511e13e6ffe844eb0; pg_dump and pg_restore catalogue read passed; no restore rehearsal |
| Migration chain | Test-Migrations.ps1 -TestSqlFile scripts/database/Test-R011AccountAlias.sql passed: 29 migrations on empty local PostgreSQL 18.6, second migrate 0, checksum tampering rejected |
| SQL behavior | Synthetic rollback-only test: old insert omitting alias succeeds with NULL; two identifiers preserve leading zeroes; alias update creates no Cash Ledger movement; clearing succeeds |
| DEV migration | V28 → V29, exactly one migration; Flyway validate passed, no invalid migrations or warnings |
| Shared dependencies | Existing Cash Account Balances, Cash Account Daily Summary Recent and cash_statement_account_effects queries succeed; 4 / 60 / 49 rows respectively at check. No view/trigger/Ref changes |
| App configuration | Regenerated Cash Accounts 21 → 22 columns in each app. New column Text, optional, shown, searchable, PII; no formula/default/key/label. Editable FALSE in OLTP, TRUE in OLAP. Display name: เลขบัญชีสำรอง / Alternative Account Number |
| Permissions | OLTP Cash Accounts read-only; OLAP Adds/Updates on, Deletes off. Existing holder identity, account refs/defaults and R012 views retained |
| OLAP GUI | Current desktop app: Lisa account form displays optional alias; saved synthetic 0000000000, SQL confirmed one stored occurrence. Cleared with keyboard input/blur, saved, reopened blank. SQL confirmed zero nonblank aliases. Initial fill-empty interaction did not persist; normal keyboard clear resolved it |
| OLTP GUI | Current desktop app synced; new-borrower preferred receiving account selector lists Dad SCB, Dad TTB, Dad cash and Lisa. Cancelled without creating a borrower |
| Final editors | OLTP 1.000062 / OLAP 1.000021, saved with No issues found. Both remain Deployed; no mode changes |
| Dictionary | Dev Differences A2874:E2876 added; all prior values/formulas preserved, including R012. Changed range rendered and reviewed |

No payment, loan or cash movement was created for this test. No notification was sent. Existing SQL financial logic and report definitions were not changed. Mobile/offline testing and owner acceptance remain unverified. R012 is already integrated in current DEV OLAP and must be reconciled into the eventual promotion batch; App Upgrade cannot exclude it automatically. OLTP baseline 1.000060 was observed live, ahead of the inventory's 1.000059; its prior delta was not attributed to this task.

Rollback this addition by restoring OLTP 1.000060 and OLAP 1.000019 while retaining compatible nullable V29. Do not restore the database over later financial activity without write-loss review.
