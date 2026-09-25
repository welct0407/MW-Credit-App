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

## Scope freeze and handoff

2026-09-24T14:03:59.883143+00:00: promotion starts for the dictionary-fix scope at pinned commit `8a76733761bb666dd96a08aa45282c1cde2c01a6`. DEV V40 validated and private manifest pinned. R026 Frozen; R027 becomes the sole Open release, R028 next. Unapplied V41/payment-health development transfers to R027; original record above preserved. Both DEV apps remain unchanged and paused until RC capture. Shared template correction occurred before this formal handoff; this sequencing deviation is recorded in P51.

## Owner revision — export retirement

Owner no longer needs the export and requested its removal from Google Drive. Exact shared template ID was moved to Trash and verified there; no permanent deletion or export execution. The earlier correction is retained as dated evidence but superseded. Disabled app definitions remain; retirement is an external-asset correction within the existing export scope.

PROD V40 applied successfully at 14:07 UTC from the clean pinned checkout; subsequent Flyway validate passed (41 entries including baseline). Catalog comparison verifies all non-cron business definitions unchanged, zero jobs, one fewer extension and only cron-owned objects removed. Instance flag remains on pending restart coordination.

## Saved candidate checkpoint and authentication interruption

Both RC1 definitions were copied with data and file-data copying OFF. All 19 OLAP and 18 OLTP sources were rebound to PROD database-2, then explicitly reset to en-US because source selection clears Data locale. Each source/locale pair was read back before saving. Production branding, durable logos, companion links and API Enable were restored in the candidates. No keys were generated. Final guard/diagnostic checks, initial deployment and App Upgrade remain pending; no PROD app mutation occurred.

The browser session expired. An incorrect personal Google account was selected and its AppSheet Drive/Sheets consent approved; that account displayed FREE with no apps and was signed out. No app membership or license assignment was changed; billing impact is unverified, and the Google consent has not been revoked. The owner prohibits personal-account access. Further work uses only the Workspace project identity. Workspace sign-in now requires the owner to enter their password directly; no password was requested in chat. Preserve saved candidates while access is restored.

Current dictionary updates remove 24 retired cron canonical/DEV-overlay files and record the export lifecycle. SQL verification and recovery evidence are linked in the release checklist. These are a checked partial checkpoint, not release completion. Unrelated V41/payment-health files remain excluded.

## Owner-directed closure

Owner instructed keeping apps as-is and wrapping up R026. Further app changes, upgrade attempts, RC cleanup and instance restart stopped. R026 closed with partial deployment, not Released. PROD OLAP 1.100198 was applied with RC1 display name/folder; PROD OLTP unchanged. DEV OLAP regenerated to 1.000033 with generated slice warnings still observed. Corrected RC2 definitions retained, not promoted. Exact actual state, recovery and dictionary limitations: [closure](../outputs/r026-dictionary-fixes/closure.md). R027 remains Open and R026 imposes no development hold. Original task files remain preserved.


## Owner-directed RC cleanup — 25 September 2026

Owner explicitly requested deletion of R026 RCs after partial closure. Starting Git commit `8951d5f05165c2e4d36b87720faaf74dfc1b6f78`; unrelated drafts preserved. Deleted only the four OLTP/OLAP RC1/RC2 AppSheet definitions using the verified Workspace Chrome account. Each selected row was matched to its exact UUID/internal name before deletion, including production-looking RC2 names and the misleading RC1 display name on PROD OLAP. Captured the previously missing OLTP RC2 UUID in the manifest.

All four exact working editor URLs now return 404 / Home/NotFound; inventory retains the two DEV and two PROD apps. The remaining RC1-looking row was verified as canonical PROD OLAP and preserved. No database/file/logo deletion, app upgrade, DEV/PROD edit, job execution or access grant occurred. Evidence: [rc-cleanup.json](../outputs/r026-dictionary-fixes/rc-cleanup.json). Updated manifest, closure, continuation, P49, tracker and environment/development records. R026 remains closed with partial deployment; no final release tag or completed-validation claim.

Recovery: paid-account AppSheet definitions can be restored through AppSheet Support up to 32 days after deletion per the linked product help; existing PROD rollback versions and evidence remain unchanged. Validation: exact live deletion checks, JSON parsing and Git whitespace/diff review. No model definitions changed, so dictionary regeneration or business regression tests are not applicable. No cleanup work remains.


## Owner-requested production name correction — 25 September 2026

Starting commit `65c721c51631d0de401d0d9492b93f27993d5942`. Owner explicitly requested correcting PROD OLAP name. Directly set Settings > Information > Short Name to `Loan Business Insights` in existing PROD UUID `e74dd368-654f-44d7-bccf-83cf361d1cdb`; saved version 1.100201. Initial saves 1.100199/1.100200 failed persistence readback; committing the authoritative Short Name with Enter before Save persisted 1.100201. Baseline restorable version 1.100198 recorded before editing. No app promotion, RC creation, data/source/schema/job/access changes. Canonical default folder was observed already correct and not edited. Editor reports No issues found. Updated exact name/version dictionary evidence and release/environment records, preserving unrelated drafts. Evidence: [prod-name-correction.json](../outputs/r026-dictionary-fixes/prod-name-correction.json). This narrow owner-authorized correction does not resume or declare the overall partial release verified.

Verification: independent refreshed My Apps list shows Loan Business Insights / Deployed; saved editor version 1.100201 has No issues found. Dictionary validation passed for 1169 documents with zero structural errors; Git whitespace check passed.
