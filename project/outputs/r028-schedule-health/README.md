# R028 — automatic schedule-aware borrower categories

## Current state

**DEV and PROD V42 applied and validated. The existing Borrower Health Review tab 31 is live with automatic schedule-aware categories.** Production backup restored and candidate rehearsed successfully before promotion. Owner approved implementation, included the fourth settlement case, and required automatic categorization with no manual intervention.

## Exact rule

Three additive SQL views own the logic: `reporting_loan_schedule_health_v1`, `reporting_borrower_schedule_health_v1`, and `reporting_borrower_matrix_v3`. No table, operational column, manual override, review queue or name list is added.

For each active daily-interest loan, compare recorded interest and the number of interest-bearing charge dates with a counterfactual normal schedule over 30 completed Bangkok days. Use current daily interest, start, interval and anchor. Exclude first-day transfer fees. Principal and future-plan amounts remain separate. For a later explicit anchor, exclude pre-transition history and preserve the last pre-anchor charge as the accrual baseline.

An automatic restriction applies when **auto-charge is disabled**, **at least seven completed days and two expected dates are observed**, and **either interest coverage or charge-date coverage is below 80%**. Any affected active loan restricts its borrower. The date-frequency condition prevents a lump-sum catch-up from hiding deferral. This is labelled **Modified payment schedule**, not confirmed hardship.

V3 preserves the exact V41 payment score, contribution and confidence. Restricted upper categories become Question Mark for contribution >=1x, otherwise Dog. Existing lower categories and unavailable ratings retain their base classification. Unrestricted categories follow V2. The rule recalculates on query; source changes and the rolling window can remove the restriction automatically. There is no manual approval or status-clearance step.

Unsupported products, invalid sources and insufficient observation are explicitly labelled; they are not silently scored as confirmed modified schedules. All 52 currently active PROD loans were supported. Expected amounts are analytical comparisons, not new charges, losses or additional collectible debt. Original immutable term history is not established; the comparison uses current setup and supported anchor history.

## Report

The existing parallel Borrower Health Review tab 31 is refined; original Borrowers/Risks tabs remain intact. Categories display schedule status, the health table separates category reason from payment reason, and the scatter retains the measured payment score with explicit wording about the separate schedule restriction. Three additional cards provide modified-borrower count, borrower-level comparison and loan/next-plan detail. The tab now has 20 questions and seven notes; dashboard totals are 12 tabs and 211 placements. All non-review placements, tabs and parameters are preserved. Existing dashboard filters remain inapplicable to this current-portfolio review.

SQL is reusable by other visuals. Metabase only selects/aggregates/presents these governed results. No AppSheet bindings, tables, workflows or regeneration are involved.

## Evidence

- [Full SQL CI](database-ci.txt): migration-chain, existing financial/concurrency suites and new automatic-schedule tests passed.
- [DEV parity and 20 query preflight](development-verification.json): independent Python schedule parity; unchanged scores/contribution.
- [PROD restore/rehearsal](production-rehearsal.json): all 52 loans and 23 borrowers match independent calculation; four modified borrowers; 4 Star / 8 Cash Cow / 5 Question Mark / 6 Dog. All 20 queries execute. Financial table fingerprints unchanged by candidate execution.
- [Restorable production backup](production-backup.json): all 26 source-table fingerprints match the private restored dump. The first rehearsal comparison exposed a local timezone-reset issue in the backup verifier; fixed by using the same UTC representation on both sides, then rerun successfully. No live data was changed by rehearsal.
- [Affected dependency preflight](dependency-preflight.json): DEV/PROD existing source column signatures, relevant view definitions and charging/date functions match before promotion.
- [DEV backup](development-backup.json), [migration](development-migrate.json), [validation](development-validate.json).
- [Report plan](metabase-plan.json), [backup/state](metabase-state.json). Dashboard copy plus private full question/layout definitions provide report rollback.

## Production verification

- [Migration](production-migrate.json) / [validation](production-validate.json): V42 only; clean pin `ab6c82a1fc4e24ca3c9c9c072a9c3954ab8a529d` and [Flyway manifest](flyway-manifest.json). No repair, data backfill or source-object replacement.
- [Live parity](production-verification.json): all 52 loans match Python, 23 borrowers, four modified schedules, categories **4 Star / 8 Cash Cow / 5 Question Mark / 6 Dog**. Scores and contributions unchanged.
- [Reader grants](production-grants.json): SELECT on exactly the three new views; no writes or unrelated table grants. [20-query runtime preflight](metabase-preflight.json) executed through the actual Metabase source.
- [Saved questions](saved-question-definitions.json), [layout](metabase-saved.json), [query checks](metabase-verification.json). Saved native SQL is validated across Metabase's normalized staged-query representation.
- Dictionary exact PROD/DEV catalog and report metadata: [capture](dictionary-catalog.json), [validation](dictionary-validation.txt).

## Recovery and scope limits

Restore the saved before-question definitions and review-tab layout (private `r028-schedule-health/metabase/`); archive only the three new cards if reverting. The dashboard copy alone shares existing questions, so restore question definitions as well. V2 remains unchanged; additive V42 can remain unused. Do not roll back the financial database merely to reverse this reporting change. V42 is immutable after DEV application; corrections require a higher migration.

Both AppSheet definitions and their bound SQL objects are unchanged. Existing R026 app issues remain separately documented and owner-deferred; this SQL/report package is not a declaration of integrated AppSheet promotion readiness. No RC apps, financial writes, notifications or source data backfills are involved.

## Closure

Released as SQL/report-only R028. [Visual check](visual-verification.json) passed after summary layout refinement. Dictionary validation reports zero errors. Final sanitized evidence is published at annotated tag `R028`; R029 remains the sole Open development release.
