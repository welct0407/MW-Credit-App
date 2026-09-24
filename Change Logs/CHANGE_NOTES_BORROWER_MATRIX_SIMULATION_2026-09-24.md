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

## Proposal refinement — borrower payment-health summary

On 24 September 2026, the owner requested inclusion of the discussed borrower payment-health summary in the proposed changes. Updated section 6 and the opening recommendation of the existing methodology report with its business-field contract, compact future OLTP presentation, shared read-only SQL integration, freshness/visibility rules and later acceptance checks. Current arrears, payment history, confidence and default context remain distinct; the simulated weights and distributions are unchanged.

The owner then clarified that the handover must contain a detailed design, not just ideas. Added [IMPLEMENTATION_HANDOVER.md](../outputs/borrower-matrix-simulation-20260924/IMPLEMENTATION_HANDOVER.md): proposed versioned SQL providers and typed field contracts, signed component/settlement algorithms, matrix and rating rules, explicit unresolved-default/data-quality behavior, AppSheet tables/Refs/types/actions/layout/access/freshness, synthetic expected outcomes, implementation sequence and rollback. Unclassified score suppression and unresolved-default-history Data review are labeled implementation policies requiring review and further tests, not newly proven simulation results. The simulator's recent-default delay-score override is explicitly recorded for parity.

This batch changes this log, `outputs/borrower-matrix-simulation-20260924/README.md` and the new detailed handover in that folder. Starting commit: `36bba476c8655a0dcbd5a38e0587c0e750363ee0`. The two pre-existing paused Risks draft paths remain untracked and untouched. Verified the saved proposal and scoped diff, including whitespace and local-link checks; no executable change requires rerunning the simulation. Rollback is a targeted revert of this documentation batch. The summary is proposed, not implemented or runtime-tested; no model dictionary, release status, database, app or dashboard definition changes are claimed.
