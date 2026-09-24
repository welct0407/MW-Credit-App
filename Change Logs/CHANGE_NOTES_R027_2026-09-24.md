# R027 — borrower payment health and reliability

Owner authorized implementation of the reviewed design, then paused until the dictionary session completed. That session closed at `aa59127627a031bb279b0430b4cfe57787f7653a`; the dependency hold is released and this task resumes. R027 is the sole Open release. Earlier unpublished development and backup/parity evidence are recorded in the R026 log; implementation now belongs here.

Scope: additive V41 shared SQL charge/borrower health, corrected independent matrix axes, read-only DEV OLTP summary and drill-down. Preserve existing providers. No production promotion, report publication or resumption of R026 promotion is authorized.

Baseline on resumption: DEV/PROD SQL V40; DEV OLTP 1.000075 untouched; DEV OLAP 1.000033 with four generated Daily Analytics slice warnings reported by the prior task. PROD state remains as recorded in the R026 partial closure and is not changed here. Capture current app state before edits. Preserve paused Risks drafts and unrelated work.

Status: implementing and validating. Earlier fixed-snapshot SQL parity matched all 22 active borrower scores/value/arrears/categories. Full CI requires a corrected synthetic default fixture satisfying existing workflow preconditions. No financial guard is weakened. App work and DEV migration remain pending.

## SQL verification and DEV application

Corrected only the synthetic fixture: use an auto-enabled loan and ordinary deferred rollup constraints during default. Full maintained CI now passed, including 22 new health assertions, existing financial/concurrency tests and migration-chain checks. The V40 DEV backup was restored privately and all 26 captured table fingerprints matched. The candidate rehearsal matched all 22 fixed-snapshot borrower categories, scores, value and arrears; distribution remains 5/10/3/4.

V41 applied to verified DEV at 2026-09-24 22:32 Bangkok, one migration; Flyway validated 42 entries. Ten read-only DEV assertions passed. Current DEV data yields 2 Star / 2 Cash Cow / 6 Question Mark / 12 Dog, appropriately different from the fixed production snapshot; no quotas or live-data adjustments. Summary query measured approximately 170–202 ms including the connection's query round trip. AppSheet sync performance is not established by this measurement. Exact evidence under `outputs/r027-payment-health/`.

DEV OLTP source inspection confirms database-3 and blank Borrowers security filter (creator access). Imported borrower health as READ_ONLY, stable Row ID key and Ref Borrower relationship; app configuration remains in progress. No financial row or PROD definition has changed.

## Resumption and durable checkpoint

Owner explicitly requested completion. Browser access timed out on both existing-tab acquisition and surface inventory; no GUI mutations were possible during this resumption. Reconciled SQL model documentation, tracker, environment checkpoint, verification-tool guidance and exact five-view DEV dictionary overlays. App UI remains unfinished; no readiness, promotion or final app-version claim. Current repository baseline at this checkpoint is bd6be1375020e19bbcbb4fabd11b2b63c6cb7ebb; unrelated work is preserved. [Outstanding work and recovery](../outputs/r027-payment-health/README.md).
