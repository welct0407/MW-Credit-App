# Forecast & Planning — delivered handover

27 September 2026 · R045 · [Open tab](https://reports.mw-credit.com/dashboard/3?tab=262).

The approved [detailed design](../forecast-planning-design-20260927/HANDOVER.md) is implemented as **13 · Forecast & Planning**, tab262 in dashboard3. Its 21 questions cover actual interest, remaining interest, month-end outlook, target gap, principal receipts, assumptions, cumulative actual/forecast lines, interest bridge, three scenarios, weekly dues, borrower contributions, loan types, watchlist, loan/event detail, coverage and conditional cash planning. Four models344–347 and questions348–368 are recorded in [state.json](state.json); exact queries, filters and layout are in [saved.json](saved.json).

## Calculation contract

Scope is the current Bangkok month and existing loan book. Actuals use signed posted repayments through today. Interest and principal stay separate. Recorded obligations precede simulated future obligations. Daily-interest, fixed-interest and installment simulations follow the existing source rules without generating operational charges. Missing automatic charges or invalid source data flag incomplete coverage; headline projections are suppressed when incomplete. Manual schedules use recorded obligations only and show a coverage notice.

Schedule assumes 100% of eligible today/future dues and no arrears recovery. Planning applies separate interest/principal collection percentages and an overdue recovery percentage. Stress lowers each Planning collection rate by 20 percentage points, floored at zero, and assumes no arrears recovery. The default 100/100/0 is labelled an unadjusted schedule. These are user assumptions, not statistical probabilities. Actuals remain unchanged by scenarios.

The cumulative chart shows solid actuals and dashed projected/Stress/target series. Borrower contributions use horizontal bars with top borrowers plus Others. Native labelled tables implement the two bridges. Amount displays round to whole baht; calculations retain underlying precision. A blank interest target says “Target not set”.

Cash planning uses current BusinessCashHeld and remaining scenario receipts, never actual MTD receipts a second time. It requires explicit values for new lending, expenses, payouts/withdrawals, external inflows and reserve, including explicit zero. Until complete it says “Plan not ready”. Funding always covers the whole portfolio and ignores the loan-type filter. Planned new lending adds no forecast income. No daily cash low point, profit forecast or historical forecast accuracy is claimed.

## Implementation and maintenance

- Immutable [V48](../../../database/migrations/V48__forecast_planning.sql) adds five views and two pure invoker functions; no operational table/column or AppSheet change.
- [ForecastPlanning.mjs](../../scripts/metabase/ForecastPlanning.mjs) prepares, plans, publishes once, refines only state-owned questions and verifies 21 saved questions across three filter cases. Do not replay `--publish` on an existing state. `--refine --only=key,...` scopes a reviewed correction.
- [VerifyForecastSaved.mjs](../../scripts/metabase/VerifyForecastSaved.mjs) checks 15 independent numerical/filter reconciliations without publishing source amounts.
- Document-Forecast.py captured affected live SQL metadata and saved Metabase definitions using guarded dictionary updates; its create-once behavior deliberately rejects existing object files.
- SQL recovery and testing tools, sanitized evidence and the single [promotion checklist](promotion-checklist.md) are adjacent. Private backups, credentials and financial screenshots remain outside Git.

## Validation and recovery

Synthetic function tests, 48-migration rebuild, mandatory database CI, 63 DEV queries, 63 saved Metabase query/filter cases and 15 reconciliations passed. DEV and PROD V48 validate. Both pre-change backups were restored with all 26 source-table fingerprints matching; isolated PROD rehearsal proves V48 changes no source rows. Production source checks reconcile actuals and reject duplicate simulations. Existing 12 tabs and 247 placements remain unchanged.

Recovery dashboard22 and private pre-change definitions are retained. Roll back only R045-owned placements/questions/models, preserving later work; compatible additive V48 may remain unused. Do not restore financial records for report rollback. Both AppSheet apps are unchanged, with previous R036 editor evidence reused; no RCs were created.

Desktop Chrome verification confirms the signed-in service account, headline labels, dashed projections, comparison/driver charts and an 80% interest control update. Default settings were restored. A 390px viewport check displayed a scaled desktop presentation; mobile usability is limited and no physical-device verification is claimed. Wide detail tables require horizontal scrolling. See [browser evidence](browser-verification.json).
