# AppSheet API full cutover — 2026-09-08

Status: implemented and self-validated under user authorization, without intermediate acceptance gates. Both API config switches and master prompt/runbooks are updated. The hourly master remains PAUSED as explicitly requested; no scheduled cycle or Instagram send was triggered.

Rollback point: live OLTP version **3.000030**, inspected in editor Manage > Versions > Version History before record edits. No app-definition changes planned. Source/config/runbooks/automation TOML and a consistent SQLite backup saved under ignored `mw-ai-collection/local/before-api-cutover-20260908/`. Preserve unrelated working-tree changes and all later financial/operation history.

Live write validation is limited to Lisa synthetic records: a no-op Edit preserving the fixed charge's Interest Due and Notes, followed by one clearly labelled 1 THB synthetic payment through Payments Add and the existing receipt bot. No real transfer, no Instagram send. Test payment is retained as auditable test data; do not delete or repost it. Operation attempts are recorded durably in SQLite api_dispatches before sending.

The standalone production app is the GUI validation surface. The editor is inspected read-only for current version and schema/defaults, not used for preview or app changes. Live Payments defaults verified: Status Processing and Allocation Method Lump Sum, both not editable; omitted from API Add so the app initializes them. No direct Payment Allocations/Repayments writes.

## Implementation

- Added api_dispatch.mjs, api_actions.mjs, api_write_runner.mjs and api_connection.mjs; extended appsheet_api.mjs with strictly shaped Charges Edit and Payments Add. Updated api_read_runner.mjs to load a local key-file pointer.
- Added an api_dispatches table in the existing SQLite operational ledger: unique operation_key, kind, private payload/digest, status, timestamp and result. This is a local integration/audit structure, not an AppSheet model change. Durable reservation precedes network submission; existing attempt always blocks resend. SUBMITTING/RESPONDED/UNKNOWN require readback; VERIFIED closes only an exactly checked outcome.
- Fee coordinator requires a reserved pending fee, current settings/eligible day, stable fixed charge, exact before-values, source/inbox freshness and no holds. It writes absolute Interest Due and Notes only and verifies through the master engine.
- Payment coordinator reuses receipt assessment/approval and POSTING reservation, supplies explicit Bangkok date, Adds one Payments row, and verifies the AppSheet-generated allocations/repayments and balance movement before POSTED. No direct repayments or fabricated bank verification. Acknowledgement remains the existing separately reserved Instagram step.
- Pending API dispatches block master financial/message planning, receipt reservation, daily-batch sends and quiet-hour skipping. API/inbox timestamps and provenance remain separate. Source failures do not trigger GUI write fallback.
- Added API_CYCLE.md as authoritative AppSheet execution instructions, updated API_READS.md and README, and added superseding references to HOURLY_ENTRY, MASTER_CYCLE, BUILDs 4/6/7, RECEIPT_POLICY and COLLECTION_SETTINGS. Historical business rules remain preserved.
- Config apiReads.enabled and apiWrites.enabled are true. Existing automation id/name/target/cadence preserved; prompt updated through automation_update; status explicitly PAUSED. Local api-connection.json stores only the credential file path, is ignored, and credentials are loaded without printing.

## Validation results

1. Safe live Charges Edit completed: fixed Lisa charge Interest Due and Notes unchanged; balance remained 900. This validates the live Edit transport/permissions/readback, not a newly imposed live late penalty. Actual cumulative fee logic and absolute mutation were exercised with mocked transport in local tests.
2. One production synthetic test payment of **1 THB** was Added via API. GUI confirms Payment Method Bank Transfer, Allocation Method Lump Sum, status Posted, one related repayment, planned/posted amounts 1, both differences 0. Created 17:44:12 and processed 17:44:25 Bangkok. AppSheet generated the allocation and repayment normally.
3. API verifies every per-charge movement, total 900 → **899**, and one positive linked allocation. Standalone production collection board independently shows Lisa collected today 301 and remaining **899**. Test payment remains clearly labelled and auditable; no real transfer and no Instagram acknowledgement were sent.
4. Both validation dispatches are VERIFIED. Final preflight has no pending API writes, operations, receipts, cases or legacy holds. No old receipt was reposted.
5. **49 automated tests passed, zero failures**, covering read normalization/ownership, future balances, retained paid charges, complete board/disabled flags, API provenance and live-inbox merge, cumulative fee workflow, positive/zero allocations, exact repayment linkage, posting once, duplicate dispatch, and an accepted payment with a lost response subsequently verified without resubmission. Tests used synthetic fixtures/temporary SQLite; no production records were altered by the unit suite.
6. Live board API check returned 18 rows, one AI-enabled. GUI viewport is virtualized; full row-by-row roster GUI comparison is not claimed. Lisa's payment/charge/balance paths were checked directly in the standalone app, not preview.
7. Prior measured read durations: board 8.826 s; full payment readback 17.108 s before parallelizing allocation/repayment reads. These are not full-cycle or token-savings benchmarks. GUI timestamp shows the validation payment bot processed within 13 seconds.

## Limits and downstream effects

The hourly job is intentionally paused, so next actual cycle and next 11:00 batch are not execution-tested after cutover. Instagram still uses browser tools and has not been migrated. API read/compare/write is not an atomic server-side compare-and-swap: concurrent manual financial edits can cause a mismatch and require review. No app schema, formulas, bots, view or dashboard was changed, so model overview/workbook updates do not apply. The synthetic payment changes Lisa's test outstanding by 1 THB and is visible to existing payment reporting/notifications.

## Rollback and review

User may review Lisa's 1 THB labelled test payment and 899 balance, and confirm the master remains paused. No additional approval is required to consider this authorized migration implementation complete. Future resumption requires a user instruction.

For rollback, keep the master paused and restore only changed source/config/runbooks from the recorded backup; restore the previous prompt through automation_update if desired. Preserve the current SQLite ledger, api_dispatches and all post-backup financial/send history. Do not restore the older SQLite over newer operations. App version rollback is unnecessary and cannot undo financial rows. The test payment is retained; any financial correction must be a separately authorized auditable adjustment, not deletion/reposting. Credentials and unrelated working-tree changes remain untouched.
