# Borrower communication names — 2026-09-08

User authorized populating Communication Name from Borrower Name, removing trailing numeric suffixes. Scope: existing 29 production Borrowers rows; no schema, original name, key, flag, mapping or financial change. Last verified OLTP version: 3.000024; this data-only edit does not change app version. Existing native backup: Money Collection Backup 20260908. Exact pre-edit row-keyed communication values saved locally in `mw-ai-collection/local/communication-names-before-20260908.json` before writes: 28 blank, Lisa already populated.

Status: in progress. Two trailing-number names identified; preserve Thai spelling and honorifics. No permanent automatic suffix-removal rule is introduced.

Rollback: restore only Communication Name by original Row ID from the local snapshot, checking intervening user edits first. App-version restoration does not restore data. No data-model documentation change required: existing field only. Manual verification: review names in borrower forms, especially the two suffix cases. Names may be shared; immutable borrower keys remain distinct.

## Completion

Populated28 blank Communication Name values; Lisa already matched and was left unchanged. Removed numeric suffixes in exactly two records, preserving all other spelling and honorifics. Verified all29 row-keyed names against the requested transformation; zero mismatches. A selected-cell display duplicated the first extracted source text during initial entry; caught by full verification and corrected before completion. Original Borrower Name values and stable keys verified unchanged. No automatic enrollment, messaging or financial changes were made. Status: implemented, awaiting user review of the two suffix cases. This is a one-time population; future messages continue using the explicit saved Communication Name.
Fresh independent database session readback, including virtualized final rows: all29 persisted values verified with zero mismatches.
