# R026 — dictionary findings follow-up and coordinated development

## Scope and authority

24 September 2026: owner instructed implementation of the [detailed design](../outputs/borrower-matrix-simulation-20260924/IMPLEMENTATION_HANDOVER.md). Implement additive shared SQL, corrected matrix provider and read-only OLTP health surfaces in DEV. Existing providers remain. No production promotion or report publication is authorized in this batch.

## Baseline and rollback

Starting Git commit `b641a6c356ac2301aaa02affbcb2904c480522eb`. Untracked paused Risks draft paths are preserved. Verified DEV `appsheet-pg-prod-20260914 / 34.21.174.215 / loan_manager_dev`, Flyway V39. DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` version `1.000075`, current editor No issues found. DB recovery evidence and post-change versions will be recorded with validation.

## Implementation in progress

- Candidate V41 adds versioned charge/borrower health, matrix v2 and AppSheet adapter views; no physical financial columns, postings, triggers or legacy view definitions changed. V40 is reserved by the concurrent dictionary-fixes task.
- Accepted design's unresolved-default-history policy suppresses ratings with Data review while retaining debt/default facts. Current source money precision is cents; no fractional-cent dues found in DEV.
- Synthetic SQL fixtures added to the existing CI batch; verification pending. No completion/readiness claim yet.

## Dictionary findings follow-up — separate authorized scope

Owner requested correction of audit matters 2/3 and retirement of unused pg_cron. Starting commit `36bba476c8655a0dcbd5a38e0587c0e750363ee0`; unrelated work preserved. Scope: explicit en-US PROD business-table locales through normal App Upgrade, environment-aware shared export-template identity, and guarded V40 pg_cron retirement. No export activation or financial writes.

The payment-health task reserved V41 (its earlier V40 reference above is superseded), has no live edits and is paused by its owner while this scope proceeds. Its unfinished files/tests must not enter the dictionary-fix package. Preserve its development record at the actual release handoff.

Template D2/E2 now use `<<_APPNAME>>` / `<<_APPID>>`. Uploaded in place to the existing Drive ID on 24 September at 13:58:30 UTC; downloaded SHA256 matches the checked candidate. Every other ZIP member and cell/style is unchanged. Singapore remains correct for the disabled export schedule. No export was run. Original private XLSX is retained for rollback; public candidate and verification are under `outputs/r026-dictionary-fixes/template/`.

V40 checks exact known inactive job metadata and refuses any active/unreviewed job, then drops only pg_cron with RESTRICT. Full disposable migration CI passed; 11 exact predicate tests passed with session-local synthetic rows rolled back. No live migration yet. Fresh PROD catalog fingerprint matches the prior audit. Cloud SQL on-demand backup `1790257810992` succeeded at 13:51:42 UTC. Disabling the shared instance pg_cron flag requires a restart and remains separately coordinated.

## Payment-health pause checkpoint — owner instruction

Owner explicitly paused this task until the other Codex session completes. No DEV/PROD database migrations, AppSheet edits or report mutations were performed by this task. Local candidate V41 and tools remain unpublished work in progress. DEV backup and disposable restore fingerprints passed (`outputs/r026-payment-health/development-backup.json`). SQL fixed-snapshot parity passed for all 22 active borrowers: scores, values, arrears and categories match 5 Star / 10 Cash Cow / 3 Question Mark / 4 Dog (`sql-simulation-parity.json` in that folder).

Full CI is not passing yet: the new synthetic default fixture must satisfy the existing auto-enabled-loan precondition before `post_loan_default`; do not weaken that guard. Other targeted assertions reached before the fixture passed. The candidate's initial SQL alias syntax failure was corrected before parity rehearsal. `Test-StatementBatch.sql` locally includes the unfinished `Test-PaymentHealth.sql`; the other session was notified to exclude this unfinished addition from its scoped validation while preserving it. Resume with shared-state/version checks and coordination before any DEV mutation. No production authorization exists for payment health.
