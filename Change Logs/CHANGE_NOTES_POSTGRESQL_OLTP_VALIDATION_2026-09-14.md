# PostgreSQL OLTP validation — in progress

Scope: copied OLTP LoanMgr PG Test 20260914, copied OLAP LoanInsights PG Trial 20260914, future production database loan_manager_prod. Original apps and Money remain unchanged.

Rollback: original OLTP 3.000064; copied OLTP 1.000002 before isolation, 1.000004 before temporary action visibility, current 1.000005; copied OLAP 1.000007. Private configuration and data snapshots are outside Git under Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914. Credentials backup coverage is unverified.

All eight OLTP business sources switched to database-2. 196 business column definitions preserved. Three live notification bots and the copied daily schedule disabled. Two existing charge actions temporarily prominent for new-GUI testing.

Tommy borrower create/immediate edit and daily-interest closure passed. Installment first-day automation passed; remaining lifecycle checks pending. See outputs/postgresql-migration-trial-20260914/OLTP_LIFECYCLE_TEST_STATUS.md.

Found missing native database lookup: Loans.Borrower Name is Lookup on Borrowers.Borrower Name, whereas SQL copy created a plain text column. All existing migrated rows match; two new synthetic loans are null. Proposed SQL triggers restore insert/update lookup and parent rename propagation; no new columns. Consumers: OLTP loan labels, calculations and forms; OLAP loan labels/reporting. Direct downstream reports not yet verified. Application formulas and permissions unchanged.

Repair SQL and rollback SQL recorded under outputs/postgresql-migration-trial-20260914/loan-name-lookup*.sql. Installed two triggers/functions; catalog count 2, name mismatches 0. Insert and parent rename verified through new OLTP GUI, PostgreSQL readback, original save refresh, and copied OLAP explicit sync. Tommy name restored after rename test.

Three completed scenarios reconcile independently: daily principal 1000/interest 110, installment 1000/210, fixed-date 1000/100. Seven receipts Posted; one repayment per allocation, unique keys, fully settled charge splits. Zero, overbalance and fractional amounts rejected. Default scenario prepared, awaiting browser-policy deletion confirmation. Full readiness still pending.

Updated data model overview and dictionary SQL Migration Trial sheet together. Existing workbook sheet values preserved and rendered changed rows reviewed. Synthetic snapshots redact operator emails. Not ready for cutover or accepted; production deployment awaits owner testing feedback.
