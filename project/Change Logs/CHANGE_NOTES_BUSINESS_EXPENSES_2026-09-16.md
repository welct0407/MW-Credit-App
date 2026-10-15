# Business expenses and referral rebates — 16 September 2026

Status: implemented and checked in DEV; owner acceptance pending. Production and Looker Studio unchanged.

## Scope and authorization

Owner requested implementation of the final revised Design expense process conversation in development using Chrome, and supplied sections 24–31 directly. Preserve gross income, calculate whole-baht referral rebates at 10% capped at 1,000, allocate by historical contribution at expense/loan-close date, recalculate on contribution corrections, and preserve partner report presentation while substituting net values. No historical referral backfill. Looker phase follows AppSheet/SQL acceptance.

## Rollback and inspected dependencies

Chrome current editor confirmed OLTP 1.000061 and OLAP 1.000064 before edits. DEV Flyway info confirms V14 and no pending migrations. Both apps use database-3 on the separate development instance 34.158.38.171. OLTP owns borrower maintenance and manual expenses; OLAP owns Partners, Cash Pool Contributions and Settlements. Both consume Borrowers/Loans/Repayments/Statistics; OLAP additionally consumes Daily Analytics. Existing gross partner calculation sums Repayments Partner A/B Profit; contribution history is authoritative. Existing settlement-created total sums all related settlements, including Pending. Existing Partner card uses summary fields; detail lists gross profit and available settlement alongside completed/pending amounts. Update those presentation references, preserving gross calculations. Existing export bot is disabled; no Looker edit is authorized before app acceptance.

Private rollback: Documents/ChatGPT/AppSheet-Loan-Project/business-expenses-20260916/development-before.dump. Restored locally: all 14 business-table fingerprints and normalized schema match. Evidence: outputs/business-expenses-20260916/backup-verification.json. Credentials/private backup are outside Git; their independent backup coverage is not established by Git push.

## Implementation and final versions

Applied immutable Flyway V15 (expense ledger, borrower referrer, deferred atomic rebate creation, dynamic historical expense allocations, net settlement enforcement and daily net analytics) and V16 (match existing per-repayment partner rounding). Final DEV apps: OLTP 1.000081; OLAP 1.000084. Both saved definitions are Runnable/Deployable, use database-3 and retain DEV companion links.

OLTP has the standalone seven-field manual expense form and referrer maintenance. Automated expenses cannot be edited or deleted. OLAP reads expenses, reports referrer earnings, retains the existing partner layout with net values, validates net settlement availability, and adds net Statistics/Daily Analytics fields. Existing gross calculations remain intact. Negative manual corrections require notes; financial history is retained. No historical referral backfill ran.

All nine development bots and their tasks/destinations were reviewed. Only DEV daily-charge generation and hourly Recent analytics refresh remain enabled. Four notification bots are disabled under the current task's isolation rule; superseded processing and export bots remain disabled. The temporary per-loan test action visibility was restored to Hide.

## Checks and evidence

- Restored backup matched all 14 business-table fingerprints and normalized schema.
- Isolated PostgreSQL tests passed referral eligibility/cap/idempotency, immutable identity, contribution corrections, zero-pool rejection, rounding/conservation, manual adjustments, net settlement limits and concurrent reservation protection. Existing payment/closure/default/analytics regressions passed. Migration no-op and checksum-tamper rejection passed; DEV validation succeeded.
- Chrome current GUI saved a 500 manual expense with 300/200 allocation, rejected zero, and saved a documented -500 offset. A synthetic 10000 principal/6600 interest loan was repaid and closed through the current GUI, creating exactly one 660 rebate allocated 396/264. OLAP displayed the same row and referrer earnings; automatic expense detail exposed no edit/delete action.
- Final partner cards show net A124317/B167101 and available A93357/B82591, matching SQL. Their layout is preserved.
- Full rebuild requested through current DEV GUI; all 43 dates reconciled against independent gross and expense/net calculations.
- Saved schema/formula/slice comparison preserved existing settings except the intended net presentation/validation substitutions. All affected slice filters/update modes remain unchanged.
- Dictionary updated with 445 changes; all sheets round-trip matched, rendered sample inspected and spreadsheet error scan returned zero matches. Production inventory retained.

Detailed scope, evidence, retained synthetic rows, limitations and acceptance checklist: `outputs/business-expenses-20260916/REPORT.md`. Synthetic test loan and rebate remain in DEV (+5940 net test effect); manual test and offset net to zero. No production financial write occurred.

Final source syntax checks passed. Regression log trailing whitespace was normalized for Git. The only remaining diff-check notice is V15's terminal blank line; the already-applied migration is deliberately immutable, including whitespace.

Cap/default/no-referrer/retry and contribution-correction cases passed isolated SQL tests but were not all replayed through the Cloud DEV GUI. The existing contribution form showed no Amount input during inspection and was cancelled without a write. Owner acceptance, mobile/offline behavior and downstream Looker display remain unverified. Daily reporting retains its existing aggregate gross grain; partner settlement retains per-repayment rounding.

## Files and documentation

Updated both `Documents/AppSheet_Data_Model_Overview.md` and `Documents/AppSheet_Data_Dictionary.xlsx`, environment inventory, development changes/preparation guide and database README. Added V15/V16, expense regression/concurrency/backup/acceptance scripts, dictionary maintenance script and sanitized evidence under outputs. Updated the analytics test fixture and migration test runner. Task files are to be committed and normally pushed to the configured upstream after final diff checks; private dump and credentials remain outside Git.

## Manual acceptance

Review manual expense entry/adjustment and synthetic referral earnings in DEV; verify the unchanged partner presentation with net availability. Exercise controlled cap/default/retry and historical contribution corrections, then net settlement limits and Full Rebuild Daily Analytics. Provide owner feedback before acceptance, Looker changes or separately approved production promotion.

## Recovery

Before release, discard un-applied task files if needed. Once SQL is applied, use a reviewed higher forward migration or coordinated database/app restore to the above points. Never restore only an app over incompatible SQL, erase financial history, or replay synthetic fixtures against production. Database restore loses subsequent DEV writes and requires reconciliation.
