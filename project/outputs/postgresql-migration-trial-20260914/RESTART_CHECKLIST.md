# Fresh migration attempt — 14 September 2026

Status: fresh Cloud SQL creation submitted by owner, currently provisioning. Original OLAP rollback baseline reread at 21:00 Bangkok: 1.100041, Runnable and Deployable Yes. Original app remains unchanged.

1. Confirm new instance creation completed; record its new public IP. Create an empty loan_manager_prod database and verify no business tables exist.
2. Reconfigure the existing approved AppSheet connection for the replacement instance over public IP with SSL. Test connection before copying. Never use the previous instance IP.
3. Copy the ORIGINAL Loan Business Insights app to that PostgreSQL destination. Verify both data and file copy checkboxes enabled immediately before submission. It contains all 12 shared native business tables plus the Calendar helper. No intermediate native app/database clone for this attempt.
4. Capture copy completion or exact failure. Confirm actual SQL connections and populated row counts before any source rebinding or table modification. A created table is not evidence of transferred data.
5. Record the new copied app version and disable copied scheduled/outbound automation before test writes. Reconcile exact-case text keys/Refs, counts, types, nulls, values, totals, files and app column/configuration properties. Do not introduce UUID casts or case normalization.
6. Copy original OLTP definition and files and connect only the copy to the same verified SQL tables using the documented existing-table source-selection workflow. Confirm original app versions and copied version rollback points. Never produce a second independent SQL data set for OLTP.
7. Verify both apps through the new GUI with synthetic workflows; record failures, exact cutover deltas and measured timings. Production remains unchanged.

## Documentation consulted
- https://support.google.com/appsheet/answer/10107300?hl=en — Copy an existing app to an SQL database.
- https://support.google.com/appsheet/answer/10106598?hl=en — PostgreSQL connection, public schema, key-case and file-storage behavior.
- https://support.google.com/appsheet/answer/10106310?hl=en — Existing destination table compatibility and source selection.

The general copy article describes cloud-storage/spreadsheet sources, and does not explicitly establish native AppSheet Database transfer success for this app. The clean attempt must verify actual results. If it fails, preserve the exact evidence and diagnose against the documented route; do not claim a product defect or improvise a different migration based only on assumptions.


Execution result: prerequisites and direct documented copy performed; transfer failed (13 empty tables and original bindings). New GUI route independently confirmed by https://support.google.com/appsheet/answer/12491039?hl=en. See RESTART_RESULT.md. Remaining steps are blocked, not passed.
