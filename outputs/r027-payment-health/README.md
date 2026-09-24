# R027 — borrower payment health and BCG review

## Delivered

V41 is applied and validated in **DEV and PROD**. The new [6R · Borrower Health Review](https://reports.mw-credit.com/dashboard/3?tab=31-6r-borrower-health-review) is live alongside the existing Borrowers tab. Dashboard 3 now has 12 tabs and 207 placements; the 184 pre-existing placements and existing parameters are unchanged. The review adds 17 questions (253–269) and six explanatory notes. Backup dashboard 4 and private before-state metadata preserve report recovery.

**No AppSheet feature remains from this task.** At the owner's scope correction, the two DEV app bindings, saved detail view and generated references were removed. DEV OLTP saved version 1.000085 reports No issues found. PROD OLTP 3.000246 and PROD OLAP 1.100198 remain unchanged; both editors report No issues found and their previews load. Prior R026 DEV OLAP warnings and production branding issues remain documented in that release; this task neither resumes that promotion nor asserts readiness for a later AppSheet upgrade.

## Review results and rating method

This is a BCG-style adaptation using contribution and payment reliability, rather than the original market-share/market-growth axes.

The fixed production-snapshot simulation matched all 22 borrowers' score, category, value and arrears: **5 Stars / 10 Cash Cows / 3 Question Marks / 4 Dogs**. At production verification on 24 September 2026, 23:27 Bangkok, the current active cohort was **23: 5 Stars / 11 Cash Cows / 3 Question Marks / 4 Dogs**. Live data has changed since the snapshot. No category quotas or threshold tuning were used to force this result.

Reliability uses recent punctuality **45%**, older punctuality **15%**, average obligation-delay grade **15%**, and current payment health **25%**. Missing components redistribute their weights; recent observations remain required. High reliability begins at an unrounded score of **80**. Insufficient recent history produces Unclassified; default-altered history produces Data review and no published score. Severe arrears over seven days cap an otherwise available score at 60. History confidence is labeled independently.

Contribution is signed interest received during the last 30 completed Bangkok days, divided by the active cohort's equal share. A multiple of **1** is the high-contribution boundary, independently of reliability. High/high is Star; high reliability/lower contribution is Cash Cow; lower reliability/high contribution is Question Mark; lower/lower is Dog. These are descriptive portfolio categories, not eligibility or lending decisions.

Current overdue balances use signed posted repayments and separate principal/interest coverage. Due today is not overdue. A cure today removes current arrears without turning a historically late payment into an on-time observation. Default/loss context and missing data stay visible. See the [detailed contract](../borrower-matrix-simulation-20260924/IMPLEMENTATION_HANDOVER.md) for date windows, grain, formulas, confidence and edge cases; its AppSheet UI section is now deferred future scope.

## Report design

- Summary: active cohort size; overdue amount across all borrowers; provisional active borrowers; unclassified active borrowers; Bangkok query timestamp.
- Four-quadrant board: Cash Cow/Star across the high-reliability row, Dog/Question Mark across the lower row; counts plus named detail with score, contribution multiple, confidence and arrears. Distinct colors supplement text.
- Bubble chart: contribution multiple versus reliability; size indicates outstanding principal. Horizontal boundary is 80; the x-axis labels the 1× boundary. Classification uses unrounded values.
- Payment-health summary: every borrower, including inactive borrowers with debt; current health, amount/count/age of overdue obligations, rating status, confidence, category and reason.
- Unavailable/default detail: explicitly displays Data review and Unclassified cases outside the active matrix.
- Methodology and component table: raw/final score, all four scores and effective weights, cap, observation counts and history span.

This is a current-portfolio review. Existing dashboard date/borrower filters do not apply. Values refresh on report refresh; query time does not guarantee that an operational payment has been entered or synced. Wide evidence tables use horizontal scrolling. No canonical Borrowers/Risks cutover occurred.

## Verification and exact evidence

- Full maintained SQL CI passed, including 22 health behavior assertions, financial/concurrency tests and migration-chain checks: [final CI](database-ci-final.txt).
- All 22 fixed-snapshot outcomes matched: [parity](sql-simulation-parity.json).
- All 17 report queries passed DEV preflight; affected source schemas, clock and name-provider definitions matched PROD: [preflight](promotion-preflight.json).
- Private PROD V40 backup restored with all 26 table fingerprints matching: [backup proof](production-backup.json).
- Exact pinned checkout `bc85f75f0a2777fd0f77d1915fd4515ce7c984eb`; only V41 pending/applied; all 42 Flyway entries validated: [migration](production-migrate.json), [validation](production-validate.json). Pre-migration validation reported only expected pending V41; info confirmed no other invalid/pending migrations. No repair or checksum bypass.
- Ten production assertions passed: [production checks](production-verification.json). Query timings are approximately 194–373 ms in this observation, not AppSheet sync measurements.
- Existing Metabase reader received SELECT on only the three named reporting views: [grants](production-grants.json). No write privileges, future-table grants or AppSheet adapter grants.
- All 17 saved questions execute without truncation; original report placements and parameters preserved: [report verification](metabase-verification.json). Desktop browser inspection covered summary/freshness, four groups, chart, health/default detail and methodology. No query-error panel appeared.
- Exact SQL catalog and saved question metadata are in [catalog](dictionary-catalog.json), [questions](saved-question-definitions.json) and [layout](metabase-saved.json), mirrored in the maintained dictionary.

## Recovery and limits

Restore/remove only tab 31 and its new questions if report rollback is required; existing questions were not edited. Backup dashboard 4 is retained. Additive SQL can remain unused for compatibility; any correction requires a higher migration, never editing V41. The verified private V40 backup is a last-resort database recovery artifact, not permission to overwrite later financial activity. No financial rows or notifications were written by this task.

The five SQL views include dormant OLTP adapters for possible later use; no AppSheet binding or operational UI is enabled. Ordinary views recompute on query; there is no rating-history store or point-in-time audit reconstruction. Default-altered history remains a deliberate Data review case. Legacy tabs retain legacy metrics until separately accepted cutover.
