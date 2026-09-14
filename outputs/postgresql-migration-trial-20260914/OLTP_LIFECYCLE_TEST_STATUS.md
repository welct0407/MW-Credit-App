# OLTP PostgreSQL functional validation — in progress

Database `loan_manager_prod` on `appsheet-pg-prod-20260914` is the intended future production database. Production apps still use Money; no cutover has occurred. Owner accepted retaining the 13 foreign keys on 14 September 2026.

Copied original OLTP 3.000064 through new editor Manage > Collaborate & Publish > Copy App with data/file copy OFF, because destination already holds the migrated shared data. New app: **LoanMgr PG Test 20260914**, `65faacd8-2b0d-43bf-9e0a-58eb915dcf9b`.

- 1.000002: copied baseline; original sources. Do not use for financial testing.
- 1.000003: disabled copied daily charge schedule and three notification bots.
- 1.000004: all eight business tables use database-2; 196 business column definitions unchanged. App-managed user settings/process state stay native.
- 1.000005: temporarily exposed existing first-day and daily-charge actions for new-GUI testing. Restore their hidden positions before final delivery.

Enabled bots: Create First-Day Charge, Auto Receive First-Day Charge, Payments - Process Receipt. Disabled bots: Generate Daily Charges, Notification - New Loan Created, Notification - Loan Closed, Notification - Charge Received. No notification or external collection tests authorized.

Synthetic borrower Tommy, key QeqkhidjbnTQO7RiZHchJ7, AI Collection Enabled false. Create and immediate update verified in SQL with unchanged text key/case. Google recommends LOWER(UNIQUEID("UUID")) for PostgreSQL UUID columns. Our keys are PostgreSQL text and use UNIQUEID("PackedUUID"); no case conversion required or applied.

Initial daily-loan test accidentally cleared the preselected Y value: new-GUI boolean buttons toggle selection off when clicked again. Auto Charge Enabled therefore saved NULL; event correctly did not run. Corrected the flag through app editing and exposed existing first-day action for recovery. This is test input error, not a PostgreSQL failure. Subsequent inputs must verify selected class before saving.

## Required coverage before readiness decision

- Borrower create/edit and optional values; immutable key persistence.
- Daily-interest, fixed-date and installment loans; first-day bots and net-off.
- Daily charge creation, interval/catch-up and duplicate protection.
- Partial/full/all/lump-sum receipts; allocation and principal/interest reconciliation; retry/no duplicates.
- Loan closure and default workflow; FK interactions.
- OLAP reads and relevant partner/assessment functionality against shared SQL.
- Test-data cleanup, original snapshot integrity and final data refresh/cutover conditions.
- Restore temporary displays, final configuration comparison, documentation, rollback, owner review.

## Verified checkpoint

Daily D1 closed after receipts 60, 20, 1030: principal 1000, interest/fees 110. Installment I1 automatically charged/received 410 on first day, generated interval catch-up 800 (principal 666/interest 134), and closed after receipt: total principal 1000, interest/fees 210. Fixed-date F1 created maturity charge 1100, rejected 0, 1101 and 100.5 receipt values, accepted partial 500 (principal 400/interest 100) and final 600 principal, then closed. Seven Posted receipts, seven allocations and seven repayments reconcile in lifecycle-reconciliation.json.

Found and restored Loans.Borrower Name native lookup using SQL triggers. Existing migrated names matched; new synthetic rows were blank. Tested insert and single-parent rename updating both related loans, original OLTP save refresh, and copied OLAP explicit sync. Tommy name restored. No app schema change required. Native reference-column inventory recorded.

D2 synthetic default scenario is prepared with settled first-day charge and one unpaid charge. Default action permanently deletes that unpaid row, so execution awaits browser-policy confirmation. New daily first-day automation succeeded without the D1 input correction.

Not ready for cutover while remaining checks are incomplete. No performance gain claimed.
