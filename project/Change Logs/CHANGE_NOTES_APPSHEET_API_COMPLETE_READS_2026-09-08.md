# Complete collection API reads — 2026-09-08

## Authorization and status

User accepted the initial shared API reader and requested continuation. This extension implements complete-board reads, linked payment readback, retained charge dependencies, explicit live inbox merge and exception provenance. Implementation/read tests complete; awaiting user verification before scheduled read deployment. Existing scheduler, financial writes and messaging remain unchanged.

## Rollback point and affected files

Before edits, copied source directory and API_READS.md to ignored `mw-ai-collection/local/before-api-complete-20260908/`. Modified appsheet_api.mjs, api_read_runner.mjs, exception_engine.mjs and API_READS.md; added api_workflow.mjs and test/api_workflow.test.mjs. Local probe/options/output files are private and ignored. No AppSheet configuration/schema, dashboard or ledger changes; no app version rollback or data-model documentation update applies.

## Behavior and dependencies

- Exact allowlisted selector reads the existing Todays Collection Board slice, rereads it to detect changes, retains disabled rows for accurate manifest coverage and resolves effective bank references in one batch. Blank opt-in cells authorize neither collection nor penalties.
- Borrower mode supports omitting payment histories when not needed; receipt completeness guard rejects such snapshots. Whole-baht fields and references are validated. Future-date balances are excluded according to the documented AppSheet collection definition.
- Read-only SQLite dependency extraction includes active fixed penalty charges and before-payment charge IDs of unresolved receipts, retaining settled rows that disappear from the board.
- Payment mode reads all related allocation snapshots and repayments, checks positive allocation links, principal/interest amounts, uniqueness and full payment totals, and rereads stable payment evidence. Dynamic eligibility calculations are excluded from that stability comparison. Zero allocation rows are valid planned snapshots and do not imply a repayment.
- Fresh Instagram merge copies only identity/review/hold fields after validation; cannot replace API balances/timestamps or invent inbox review. Case source validation now supports the existing opt-in API gate.
- No API writes or automatic transport retries; no messages sent. Existing financial engines and guards remain authoritative.

## Checks

- Live schema inspection of Lisa's known allocation and repayment confirmed field names before mapping.
- Board API: HTTP success, 18 rows, one AI-enabled; 8.826 seconds including board reread.
- Payment API: 4 charges, 5 payments, four allocation snapshots of which one positive, one actual repayment; verified the existing synthetic 300 payment. Successful run 17.108 seconds; allocation/repayment reads subsequently parallelized and covered by tests.
- 44 automated tests passed with zero failures, including master/receipt/batch source-validator integration on temporary databases. Existing workflow tests continue to pass.
- Standalone production board opened directly, not builder preview. Initial rendered viewport contains 10 rows; full GUI roster comparison is not claimed. API selector follows the live configured slice.

## Manual checks and next step

Review Lisa's posted 300 payment and remaining balance, and the complete-board count (18 at read time; later activity may change it). After acceptance, deploy the read switch and hourly instructions, then verify the first live cycle and 11:00 batch. Financial API writes remain separate builds. No full hourly runtime or token saving is claimed at this stage.

## Rollback

Keep apiReads disabled (current state). Restore only extension-modified files from the recorded backup if needed and remove new extension files only when abandoning the build. Preserve subsequent edits, all live ledger/audit history and the credential file. No production data restoration is required.

## Subsequent status — 8 September 2026

User authorized proceeding through all remaining read/write changes and self-validation without intermediate review. Full cutover is complete; the scheduler remains paused by explicit user choice. See CHANGE_NOTES_APPSHEET_API_CUTOVER_2026-09-08.md.
