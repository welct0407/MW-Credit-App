# Canonical cash statements — R016 continuation

Owner authorized the proposed 9R/10R enhancements and replacement of original pages 2, 9 and 10 on 23 September 2026. Starting Git `cf243e138cd85701cd8e156626e88a65174d604e`, clean. This remains R016; whole-release acceptance/key retirement/tag are separate.

Source policy: page 2 keeps today/live and past/snapshot routing. Pages 9/10 use live statement totals and supporting detail for any selected period; separately labeled completed-day trends read stored Daily Analytics. No new financial storage, backfill or scheduler change.

V38 adds four read-only views and two period functions. Live income has no FIFO/cash history joins. Cash statements aggregate one fresh opening seed from source facts and window only selected transactions. V39 corrects a UTF-8 transfer label exposed by DEV full-row parity; V38 remains immutable. Existing providers remain for rollback/shared consumers; destructive SQL removal is deferred under expand/contract.

Recovery: exact Metabase definitions, dashboards, snippets and permission graph are privately saved under `r016-20260922/statement-cleanup-before`. Verified database dumps and restore fingerprints are under `r016-20260922/statement-cleanup`; sanitized backup references are adjacent. Roll back dashboard/questions/models/snippets together, unarchive retired cards, and leave compatible additive SQL in place. No app definitions or financial data change.

Implemented and verified in the existing [Loan Reports dashboard](https://reports.mw-credit.com/dashboard/3). PROD V38/V39 was promoted from exact tested commit `311fa9986287a9f4ab234aafcd24c1df0219330f`; both environments validate at V39. This is completion of the authorized cash-page scope, with whole-R016 acceptance/key retirement/final tag still open.

## Final pages

| Page | Behavior |
| --- | --- |
| 2 · Cash Position / tab 14 | Existing nine placements preserved. Today reads live OLAP; past selected position and completed-day trend read snapshots. Signed balances and source/freshness remain explicit. |
| 9 · Income Statement / tab 16 | Live income, signed expenses, net profit, calendar-day average, period/query time, profit waterfall, horizontal category expense bars and expense detail with payee, paying person and notes. No retained earnings, partner advances or allocated draws. Separate daily income/expense bars read stored completed days on one y-axis. |
| 10 · Cashflow Statement / tab 15 | Live opening/in/out/closing/net movement, selected period/account/query time, actual equation status, type totals and chronological detail. Separate stored daily flows use portfolio snapshots for All accounts and account snapshots for one account. |

Pages 9/10 default to this month, bounded through Bangkok today. A valid continuous range includes zero-activity dates in averages. Empty/future selections are unavailable; disjoint selections produce guidance. Unknown opening/closing stays NULL in numeric results and displays **Unavailable** on the two balance cards. Movements/detail remain visible before the known opening. Negative balances are preserved. The current month can have a known closing and unavailable opening when the month's first date predates verified account initialization.

Live statements include later dated corrections on report refresh. Snapshots can temporarily differ until the existing rebuild covers the affected date. Both trends exclude today and expose completed-date counts, missing-snapshot counts and actual oldest/latest generation times. A missing snapshot stays a gap; missing data is never silently replaced with a zero or older snapshot. These are restated history snapshots, not an as-recorded immutable audit archive. No additional refresh bot or new backfill was needed.

Income retains the existing posted `Interest Paid` semantics, including the prototype's existing signed adjustments. Principal, capital contributions/withdrawals, internal transfers and partner settlement payments are not operating income/expenses. Cashflow retains governed transaction types; combined repayments are not artificially split. Actual settlement payments follow their recorded transaction date. Internal transfers remain visible, with zero consolidated inflow/outflow.

## Cleanup and ownership

Original tabs 5/12/13 are removed; the review suffixes are removed and pages ordered 1–10. Unused old date/account dashboard parameters are removed. Shared questions on other pages remain canonical and unchanged.

- Archived questions: **53, 65, 66, 67, 172, 173, 174, 175, 179, 180, 182, 183, 200, 201**.
- Archived models: **165, 166, 185, 187, 188, 190, 191**.
- Model **186** now exposes thin **Income Events**, with immutable prefixed Event ID at repayment/expense grain. Model **205** adds Income, Expenses and Net Profit from existing stored fields. Model **206** is unchanged.
- Snippets **2/3** now select live bounded statement periods without FIFO or daily cash-history reconstruction. All four snippets have consumers and remain.
- New questions **212–216** provide expense detail, two stored trends and their coverage/freshness tables. Existing metric questions are reused, not duplicated.

Final inventory: **10 tabs, 129 visual placements, 117 distinct dashboard questions, 15 active models / 228 fields, 4 snippets**. Dependency traversal covers all dashboards, parameter value sources, native and MBQL card references, snippets, alerts and subscriptions. [Exact retirement record](retirement.json). Old page installers now fail before writes; `StatementCleanup.mjs` is the canonical page 9/10 entry point. Historical installers/SQL remain dated recovery evidence, not active providers for the new statements.

The four new views and two functions live in PostgreSQL. They grant the existing restricted reader SELECT/EXECUTE only, with no write grants or new tables. Heavy joins and selected-period running balances stay in PostgreSQL. Historical ledger aggregation is still necessary for a fresh live opening; it does not use an hourly snapshot as a supposedly live seed. An ordinary view or snippet is not a query cache. Existing SQL providers are retained under the required expand/contract policy; permanent removal is a separate later tested change.

## Verification and limits

Disposable migration/repeat/checksum/regression/concurrency CI passed. DEV and PROD compare full bounded transaction rows against the existing governed provider across all account scopes and current/past periods; independent totals, income parity, balance equations, transfers and future guards pass. The [125 report checks](verification.json) exercise real dashboard mappings across five account scopes and today/yesterday/month/opening/pre-opening/past/empty/future selections. Unchanged page placements, the POC layout and partner permissions are preserved.

[Final checks](final-verification.json) verify all retained models, the nine Cash Position visuals, updated charts/freshness, restricted read access and the numeric/null balance display. One small-data EXPLAIN sample showed similar execution time (~2.7 ms) and lower outer planning overhead for the period function; this is not a production-load benchmark or a promised speedup. No financial result rows are published.

Four [read-only synthetic edge checks](edge-verification.json) additionally exercise the deployed period-function body with negative/unknown openings and both trend queries with a missing stored day. No test financial records are written.

Desktop and 390 × 844 viewport review exercised Yesterday and an individual account, checked table/chart rendering and corrected combo series, clipped notes and wide freshness tables. The transaction table retains horizontal scrolling for nine detailed columns on phones. This is viewport QA, not a physical-phone test. Default period/account and normal viewport are restored. Existing Metabase custom-range picker limitations remain; presets work.

YAML owns exact model/SQL/snippet/dashboard definitions; the frozen workbook is untouched. Unaffected imported dictionary records remain unreconciled. All AppSheet definitions, live financial data, snapshot generation, platform settings and recipient permissions are unchanged; no app upgrade/RC or operational GUI retest is required for these additive reporting providers. Prior app diagnostics are reused rather than represented as a new inspection.
