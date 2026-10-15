# OLTP audit and integrity review — 2026-09-10

## Scope and purpose

Read the six AppSheet alerts, correlate original operations and retries in audit history, and check current OLTP data against the native AppSheet database for resulting integrity problems.

## Files and objects

- Added `outputs/oltp-integrity-review-2026-09-10/OLTP_INTEGRITY_REVIEW_2026-09-10.md` with sanitized findings, coverage, limitations, and follow-up.
- Added this change log.
- No AppSheet, database, Looker Studio, automation, or financial-record changes. No data-model changes; overview and dictionary updates are not applicable.

## Baseline and rollback

- Observed OLTP version: **3.000044**; alert operations: **3.000042**.
- Repository baseline before documentation: `aea2c92446b6960c63395b95b3544d002040eaae`.
- No live edit was performed, so no live rollback or dashboard backup is required for this review. The observed app version is a baseline, not a database backup.
- To roll back documentation, revert the commit adding these two files. Do not restore app versions or financial records on the basis of this report.

## Checks and result

Reviewed targeted audit windows and individual operation details. Checked 1,509 rows across ten OLTP tables, including independent native key-set comparisons for all 1,503 core financial rows. Checked selected native financial values, keys, references, payment/allocation/repayment consistency, loan/charge rollups, outstanding principal, duplicate screens, and collection-bank references. All integrity comparisons passed within the stated scope.

Both affected payments posted once and retries returned cached successes. The borrower deletion succeeded on retry, with no remaining references to the deleted records found. One separate incomplete Instagram mapping requires manual verification. Detailed evidence and limitations are in the report; unrestricted data and credentials were not saved.

Documentation verification: checked the staged changes and whitespace before commit. No code tests apply to these Markdown-only additions.

## Status, manual follow-up, and effects

Read-only review complete; no corrective implementation or deployment performed. No runtime downstream effects. Verify the flagged Instagram mapping in the app before relying on that route. Optionally compare the affected 200- and 300-baht payments with their source receipts for external confirmation. No live replay, financial mutation, or automated collection test is required by these findings. User acceptance of any future correction remains separate.
