# Borrower matrix simulation — 24 September 2026

## Scope and purpose

Owner paused Risks design to inspect/fine-tune the BCG-style borrower value/reliability foundation and requested production-data simulation before any deployment/report building. A follow-up specifically requested reviewing reliability logic and weight allocation. This task delivers a reviewed proposal and reproducible offline experiments, not live implementation.

## Findings and delivered changes

- Live read-only V39 inspection confirmed zero equal-share benchmark from integer division and quadrant classification using economic contribution for both axes. Also found history sufficiency, period, precision and timing differences from original intent.
- [Final methodology, distribution, validation and next-stage boundaries](../outputs/borrower-matrix-simulation-20260924/README.md).
- Sanitized `simulation-summary.json` and `reliability-comparison.json` in that output directory.
- Six new analysis assets plus runner README under `scripts/analysis/`: capture, field allowlist, simulator, comparator, private review renderer and synthetic tests.
- Private fixed-snapshot named HTML/CSV review, source snapshot/metadata and detailed alternative results under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/borrower-matrix-20260924/`.

Recommended 45/15/15/25 recent/older/average-delay/current weights at threshold 80, with decimal equal-share and 30 completed-day contribution. Proposed active distribution: **5 Star, 10 Cash Cow, 3 Question Mark, 4 Dog**; 10 established and 12 provisional histories. Five candidate weight/logic designs were compared without category quotas. Existing production remains 11 Star / 11 Question Mark at the captured time.

## Verification

One scoped repeatable-read read-only PROD snapshot at 2026-09-24 20:00:12 Bangkok. Fourteen snapshot invariants/reconciliations and 28 synthetic behavior tests passed. Three restated historical cross-checks and threshold/window sensitivity are reported with sample-size, correction/history and predictive-validity limits. Private HTML/CSV generation and aggregate/document consistency checked; financial records/identities are excluded from Git artifacts.

No schema, financial data, AppSheet, Metabase, Data Studio, access, automation or notification changes. No new dependency installed. No claim of long-term model validation or production readiness.

## Rollback, preservation and status

Starting commit `9a623878d11a06b119e867e291340e60066bc894`, master/upstream origin/master. Unrelated dictionary reconciliation and unpublished paused Risks draft files are excluded from this publication. Revert only the new analysis/evidence files to roll back; there is no live change. Private evidence is outside Git and not covered by repository recovery.

Simulation complete for owner review. R026 remains Open as observed; no release assignment/freeze, migration or promotion. Actual model implementation, default-history recovery policy, affected-consumer verification and later report work await the owner’s review/next scoped instruction.
