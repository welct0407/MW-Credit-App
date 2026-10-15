# PostgreSQL foreign keys

Added 13 validated PostgreSQL foreign keys matching the 13 stored Ref relationships in copied OLAP version 1.000007. Database loan_manager_prod is the future production database; existing production apps remain on Money until cutover. ON DELETE/UPDATE NO ACTION, NOT DEFERRABLE; no cascades, no new columns or indexes. Converted 1,010 empty references to NULL (Payments.Ref Target Charge 114; Repayments.Ref Payment 448; Repayments.Ref Payment Allocation 448). Eight BEFORE INSERT/UPDATE triggers and one function normalize only empty Ref text to NULL, preserving AppSheet blank semantics. Nonblank identifiers/case unchanged. All 91 rollback-only SQL checks passed, all eight affected-table normalized fingerprints unchanged, and all 11 copied-app table comparisons passed. New desktop sync and eight dashboard metrics passed. No AppSheet edits (version remains 1.000007). App write/bot/concurrent/offline workflows and original OLTP against SQL remain untested; owner acceptance pending.

## Relationships

|Constraint|Child table|Ref column|Parent table / Row ID|
|---|---|---|---|
|appsheet_ref_01|Loans|Ref Borrowers|Borrowers|
|appsheet_ref_02|Repayments|Ref Loans|Loans|
|appsheet_ref_03|Repayments|Ref Charges|Charges|
|appsheet_ref_04|Repayments|Ref Payment|Payments|
|appsheet_ref_05|Repayments|Ref Payment Allocation|Payment Allocations|
|appsheet_ref_06|Charges|Ref Loans|Loans|
|appsheet_ref_07|Loan Assessment|Ref Borrower|Borrowers|
|appsheet_ref_08|Cash Pool Contributions|Ref Partner|Partners|
|appsheet_ref_09|Settlements|Ref Partner|Partners|
|appsheet_ref_10|Payment Allocations|Ref Payment|Payments|
|appsheet_ref_11|Payment Allocations|Ref Charge|Charges|
|appsheet_ref_12|Payments|Ref Borrower|Borrowers|
|appsheet_ref_13|Payments|Ref Target Charge|Charges|

Virtual Ref columns and reverse-reference lists are not physical foreign keys. Existing Row ID primary keys are used; text keys are not converted to PostgreSQL UUID. Nullable references stay nullable; app-level required-field validation remains in AppSheet. The NULL normalizer does not trim whitespace or change nonblank values.

## Tests and limits

For each relationship: valid update, NULL update, empty-text update with NULL check, invalid update rejection, referenced-parent deletion rejection, valid insert, and invalid insert rejection. Successful probes rolled back inside exception subtransactions. Invalid writes were rejected with foreign_key_violation. Catalog read-back confirmed all 13 constraints validated. Separate normalized whole-row hashes and row counts for eight affected tables were unchanged. AppSheet comparisons exclude provider _RowNumber and compare REF_ROWS lists by membership; counts of any ordering differences are in fk-app-validation.json.

Immediate constraints require the parent to exist when the child statement finishes. AppSheet multi-step/offline/bot ordering has not been validated here. SQL-level tests do not constitute acceptance of every app workflow. The original OLTP/OLAP apps and Looker were not edited; their future SQL compatibility remains a cutover prerequisite. Copied OLAP owns partner/contribution/settlement workflows.

## Rollback and evidence

Before-state constraint catalog: fk-before.json; copied app baseline 1.000007. Execute fk-rollback.sql against loan_manager_prod to remove only the added constraints, eight normalizers and helper function in one transaction. An AppSheet version rollback alone does not remove SQL objects. The rollback retains NULLs, which represent the same missing-reference values. Exact original empty-reference row identifiers were backed up outside Git in Documents/ChatGPT/AppSheet-Loan-Project/postgresql-migration-trial-20260914/fk-empty-reference-backup.json; existing private full row snapshots also remain available. Backup coverage of this private directory is unverified.

Maintained generator: scripts/postgresql-foreign-keys.mjs. SQL apply, catalog, tests, preflight/postflight, fingerprint and rollback files accompany this report. No performance improvement is claimed and no child-column indexes were added.

Owner review: sync the copied app, inspect borrower/loan and partner relationships, and compare Analytics. Before production cutover, test parent/child creation, clearing optional references, referenced-parent deletion, payment allocation bots, and two-user/offline sync ordering in copied apps.

Owner reconsidered the policy after installation. Further database changes paused; foreign keys and normalizers remain installed. No rollback has been executed. Native AppSheet Database constraint-equivalence has not been verified.
