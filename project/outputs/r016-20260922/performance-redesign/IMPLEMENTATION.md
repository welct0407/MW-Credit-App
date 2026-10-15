# Performance Review — implemented parallel page

Current refinement: [Metabase seven-day averages](ROLLING_IMPLEMENTATION.md) supersedes daily question 222 and the affected tab layout below. Owner renamed/moved tab 18 to **6R · Performance** after original Performance.

24 September 2026 · R016 · Owner review pending.

[Open 6R · Performance Review](https://reports.mw-credit.com/dashboard/3?tab=18-6r-%C2%B7-performance-review). Dashboard 3, tab ID **18**, appended after the owner's Tab 11. The original **6 · Performance** (tab ID 7), its questions, filters and placements remain unchanged. The owner will decide whether to replace it later.

## Scope and source behavior

Implemented the [proposed design](DESIGN.md) as a separate review page, overriding its original replacement/removal instructions. Ten data visuals plus two context tables use the existing models 70 (Loan Book), 71 (Repayment Ledger) and 74 (Daily Performance). No model, database schema/data, AppSheet configuration, permission, bot or refresh engine changed. Review-only questions keep the original page independently usable; deduplication/retirement awaits the owner's replacement decision.

The new independent **Performance period** filter defaults to the previous **30 completed Bangkok dates**, excluding today. Clearing it uses the reporting calendar's available history through today. Explicit date selections support 1900–2199; the local presentation date spine permits dates preceding snapshot coverage and future-only tests without silently replacing them with yesterday. This calendar does not reconstruct financial history. Discontinuous selections are rejected with guidance to choose a continuous range.

- **Live section:** gross interest, principal issued, loans issued and interest by loan type query existing live OLAP-backed models on report refresh for any selected current or historical period. Future dates are excluded; future-only selections return unavailable rather than financial zeros. These are gross-interest measures, not net profit. Interest uses Payment Date; lending uses Loan Date.
- **Stored section:** trends and daily detail use Daily Analytics through model 74, for selected dates strictly before Bangkok today. The same selector never switches all visuals between sources. Today-only and future-only selections have no stored-history results and no fallback.
- **Coverage:** expected dates are left-joined to snapshots. Missing/incomplete values remain null, charts do not interpolate them, and status reports stored/expected counts, missing dates, incomplete rows and actual oldest/latest Generated At. The compact label `null` counts stored rows with any missing required measure. Historical generation times do not imply a one-hour expiry: the existing hourly job recalculates yesterday/today; older corrections require the existing unified history rebuild.
- **Aggregation:** signed flows are preserved. Principal returned is the posted principal component, not all cash collected. Weekly average is sum(selected Principal Issued) / sum(selected Loans Issued); a zero denominator or a missing required daily input gives null. Boundary weeks include only selected dates. EOD activity follows the existing loan/close-date snapshot rule, is never summed across dates and may differ from current operational outstanding-based counts. No type, partner or account filter is applied to portfolio-grain history.

## Saved questions and layout

| ID | Visual | Source |
| --- | --- | --- |
| 217 | Gross interest · large numeric KPI | Live model 71 |
| 218 | Principal issued · large numeric KPI | Live model 70 |
| 219 | Loans issued · large numeric KPI | Live model 70 |
| 220 | Gross interest by loan type · horizontal bars | Live model 71 |
| 221 | Live period, source, query time and status | Selected-date context |
| 222 | Daily gross interest · line | Stored model 74 |
| 223 | Principal issued and returned · grouped bars, common axis | Stored model 74 |
| 224 | Loans issued per day · bars | Stored model 74 |
| 225 | Weighted average loan size by week · bars | Stored model 74 |
| 226 | Active loans and borrowers EOD · two lines, common axis | Stored model 74 |
| 227 | Eight-column daily performance detail, newest first | Stored model 74 |
| 228 | Snapshot coverage and actual generation times | Stored model 74 + selected date spine |

Three equal KPI tiles lead the page. Horizontal loan-type bars sit beside live context. A separate stored-history heading and coverage table precede four charts in two desktop rows, a full-width EOD chart and daily detail. Numeric KPIs and tables use full values, with integer counts and whole-baht display rounding. Raw query values retain precision. The phone layout stacks cards and permits table scrolling. No growth, cumulative interest, yield, expense or net-profit visual was added. Original versions remain on the original page.

## Evidence and maintenance

- [Exact saved definitions/layout](plan.json), [installed IDs](state.json), [sanitized checks](verification.json).
- Builder: [PerformanceReview.mjs](../../../scripts/metabase/PerformanceReview.mjs); verifier: [Verify-PerformanceReview.mjs](../../../scripts/metabase/Verify-PerformanceReview.mjs). Run with the bundled Node runtime. `--prepare` captures the private baseline once and preflights every query; `--install` creates the review page. Do not use the original Performance installer to replace this page. Later refinements must compare current definitions before changing them; the saved plan records the final state.
- 75 focused checks passed: original dashboard preservation, permissions, unchanged shared models, saved question definitions, independent live sums/counts and type totals; default/today/yesterday/historical/month-to-date/future queries through actual dashboard mappings; exact snapshot series/detail and weekly ratios; cleared filter; pre-coverage gaps and controlled read-only fixtures for weighted averages, zero-loan weeks, signed corrections, internal missing days and discontinuous dates. No financial result rows were published.
- Desktop and 390px browser review checked visible KPI sizing, category labels, common-axis charts, EOD lines and detail. Mobile review led to shorter notes/status labels; snapshot context was enlarged so desktop users can see all rows. Responsive browser emulation is not a claim of a physical-phone test.
- Snapshot source reuse is verified; no benchmark claims are made. Live summaries may differ from stored history after later corrections until the affected snapshots are rebuilt.

## Rollback and remaining decision

Starting Git commit: `52a8bd44cfade2ec43c54ccb39889b1037b3329c`, clean tree. Before editing, full dashboard metadata (including embedded questions), models 70/71/74 and collection permissions were captured outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r016-20260922/performance-review-before-20260924/`.

For a selective rollback, remove only tab 18 and its placements and the `review-performance` parameter after confirming no later consumers. Recoverably archive questions 217–228 only after checking dependencies. Restore from the private baseline only if doing so would not overwrite intervening owner edits; never blindly replace the complete dashboard. Revert this repository batch as appropriate. No financial rollback or SQL migration is involved.

The original eleven tabs and 182 placements were preserved; the review adds one tab, twelve questions, one isolated filter and eighteen placements, giving twelve tabs and 200 placements at this checkpoint. Owner-created Tab 11 is untouched. Original Performance retirement, whole R016 acceptance, migration-key retirement and final release closure remain pending.
