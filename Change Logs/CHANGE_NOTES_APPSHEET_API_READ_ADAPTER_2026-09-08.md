# AppSheet API read adapter — 2026-09-08

## Scope, purpose and status

User accepted the prior Lisa API/UI balance comparison and requested the next build. Implemented a reusable Find-only borrower observation adapter and opt-in workflow source support. Read-tested; awaiting user verification. No deployment of API reads into the hourly schedule in this stage.

## Changes

- Added `src/appsheet_api.mjs`, `src/api_read_runner.mjs`, `src/appsheet_source.mjs` and `test/appsheet_api.test.mjs` under `mw-ai-collection/`.
- Updated only source predicates/imports in collection_settings, master_engine, receipt_engine, batch_engine and ledger. Other pre-existing work in these files is preserved.
- Added `mw-ai-collection/API_READS.md` with setup, provenance, boundaries, remaining migration work and rollback.
- Private normalized output is ignored `local/api-facts.json`; no credential or unrestricted records are tracked.

The adapter preserves text bank numbers and explicit communication names, checks exact key coverage and borrower loan ownership, normalizes dates/booleans/whole-baht money strictly, reconciles charge totals, and detects parent changes with a second read. It never fabricates live Instagram evidence. API source support requires a config switch, which remains unset/disabled.

## Rollback point

Before edits, copied source directory and hourly entry runbook to ignored `mw-ai-collection/local/before-api-read-adapter-20260908/`. No AppSheet configuration, model, dashboard, scheduler prompt, production financial row or SQLite ledger was modified. App-version backup requirements therefore do not apply to this local adapter change. No data-model inventory updates apply.

## Verification

- Live five-request read: 4 charges, 5 payments, effective bank, synthetic balance 900. Total 11.849 seconds; borrower reads 5.188 and 3.885 seconds, parallel child requests 1.629–2.759 seconds.
- Initial live check correctly stopped on charge owner representation mismatch; inspection confirmed Charges[Borrower Name] is a display name. Fixed validation to compare that name and independently require the charge's immutable loan reference in Borrowers[Related Loans]. Subsequent read passed.
- Full suite: 40 tests passed, zero failures, including new parsing, key completeness, Find-only transport, error redaction and default-disabled source tests.
- No live financial action/message tests were performed. Prior user-verified balance remained unchanged.

## Manual verification, limits and next stage

User to review adapter result and accept this staged build. The hourly job continues its prior GUI behavior. Before API read cutover, complete board roster, linked receipt allocations/repayments, fixed paid-charge retention, exception provenance and fresh inbox merge need integration validation; documented explicitly in API_READS.md. No full-cycle timing or token saving is asserted yet.

Rollback by keeping API switch disabled and restoring only this build's changed source files from the recorded local backup if needed; remove new adapter/test/docs files only if abandoning the build. Do not restore unrelated changes or remove the user's credential file.

## Subsequent status — 8 September 2026

User accepted this adapter build. Subsequent full read/write migration is complete and self-validated under explicit authorization; see CHANGE_NOTES_APPSHEET_API_CUTOVER_2026-09-08.md.
