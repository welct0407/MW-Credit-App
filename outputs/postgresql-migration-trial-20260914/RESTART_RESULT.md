# Clean restart: documented copy did not transfer data

14 September 2026. **Migration blocked; production unchanged.**

## Procedure and verified prerequisites

The owner submitted a fresh Cloud SQL instance after the confirmed cleanup. Creation and initial backup completed. The replacement appsheet-pg-prod-20260914 is Runnable: Enterprise PostgreSQL 18, db-f1-micro, Singapore, single zone, 10 GB HDD, public IP **34.21.174.215**, SSL-only.

Created loan_manager_prod; a SQL query confirmed **zero public tables before copying**. Restored the 73 approved published AppSheet /32 addresses. Updated database-2 (30884713), tested SSL connectivity and authorized the connection. Reopened its form to confirm the persisted replacement IP, database name and Require SSL setting. Credentials remain outside Git.

Copied the ORIGINAL **Loan Business Insights**, e74dd368-654f-44d7-bccf-83cf361d1cdb, version **1.100041**, directly through **My Apps > Copy**. Selected database-2 and verified both data-copy and file-copy checkboxes checked immediately before submission. The observed dialog is in restart-copy-dialog.txt. No intermediate native database copy was used.

AppSheet opened **LoanInsights PG Trial 20260914**, ID **494cd013-0d9b-482f-9559-c9d83059de91**. The copying indicator disappeared and the app acquired its own ID/version **1.000002**.

## Actual result

- SQL contains 13 tables, but **every table has zero rows**. See restart-row-counts.json.
- The copied app still uses original Money database tables and Calendar Help Table. See restart-source-bindings.json. Opening this app is not a PostgreSQL test.
- PostgreSQL logs around **21:24 Bangkok / 14:24 UTC** record requests from published AppSheet hosts using postgres in loan_manager_prod, rejected with **relation "LoanInsightsPGTrial20260914-578763613" does not exist at character 13**. See restart-postgres-errors.txt. This name matches the copied app internal name, not a created SQL table.
- The logs establish an incorrect relation reference during copying. They do not establish why AppSheet generated it. No specific SQL statement text was available in the inspected entry. No confirmed vendor bug, PostgreSQL-version incompatibility or identifier-case diagnosis is claimed.

## Isolation and stopping point

Disabled copied **Refresh Daily Analytics Daily 2**. Refresh Daily Analytics Daily was already disabled; both visible bot rows now show disabled. Saved version **1.000003**. Rollback 1.000002 would re-enable the copied schedule and should not be run against original data. The copy reports Runnable Yes, Deployable No.

No test financial writes, table renaming, per-table transfer retry, source rebinding or second app-copy attempt was performed after this failure. The empty SQL tables and copied definition are preserved for diagnosis. The original apps and data remain unchanged.

OLTP copying, complete correctness testing, performance comparison and production cutover remain **not completed**. Do not test writes in this copy while its bindings still point to original sources.

## Documentation followed

[Copy apps](https://support.google.com/appsheet/answer/12491039?hl=en) explicitly documents the My Apps route in the new GUI. [Copy an existing app to an SQL database](https://support.google.com/appsheet/answer/10107300?hl=en) describes choosing SQL and enabling both copying options. [Use data from PostgreSQL](https://support.google.com/appsheet/answer/10106598?hl=en) documents public-schema cloning, SSL and UUID-case behavior.

The general SQL-copy guide describes cloud-storage/spreadsheet sources and does not expressly guarantee this native AppSheet Database case. The actual clean test above is the evidence.

## Next diagnostic step

Provide the reproduction and copy-time error to AppSheet Support, asking why copying references the app name as a SQL relation after creating empty tables. **No support message has been sent**; owner authorization is needed to send one. Resolve the documented-copy failure before resuming migration. Do not create a fabricated app-named table to conceal the error.
