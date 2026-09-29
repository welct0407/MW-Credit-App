# R048 — OLTP upcoming charges implementation

## Refinement — date then borrower grouping

29 September 2026: at owner request, Upcoming Charges by Day now groups first by **Due Date ascending**, then **Ref Borrower ascending**. `SUM :: Amount Remaining` remains the aggregate, providing date totals and borrower subtotals. Saved DEV OLTP **1.000141**, no editor issues. Seven displayed daily totals matched the prior view; the current GUI showed borrower subgroups after entering a date. The borrower-specific Collection preview is unchanged because it already contains one borrower. SQL V54 and OLAP1.000045 are unchanged; prior SQL/companion verification remains valid for this view-only edit.

Rollback: remove only the second GroupBy entry, or use the recorded pre-edit restorable version1.000140 after checking intervening edits. Starting Git71b4dc623770f861df7bbf2d7a97ba44a6b12258. [Exact saved view](borrower-grouping.json) · [Screenshot](borrower-grouping.png). The original implementation checkpoint below remains dated1.000140 evidence; this refinement supersedes its single-level portfolio grouping.

29 September 2026. **Implemented and verified in DEV; ready for owner review.** R048 remains Open. Production is unchanged. The owner authorized development after the original design-only handover.

## Delivered behavior

- **Upcoming Charges** is a new OLTP menu dashboard showing tomorrow through T+7 inclusive, grouped by due date ascending with daily remaining principal-plus-interest totals.
- **Collection → borrower detail** shows today's charges, then upcoming charges and coverage, then submitted receipts. Upcoming means the first **five distinct future due dates across all borrower loans**, within **three calendar months**, additionally bounded by the existing 93-day engine guard. Every loan on the fifth date is included.
- Auto-charge-enabled loans use the current schedule through the existing forecast engine. Recorded remaining charges take precedence over projected occurrences. Auto-off loans contribute only existing settlement charges. Paid amounts are removed; no future financial rows are created.
- Projected amounts assume scheduled principal is collected on its due date. Normal app sync refreshes the data. Business dates use the existing Bangkok reporting clock; the context timestamp is explicitly labeled UTC.

## Target, recovery and versions

| Asset | Before | Verified after |
| --- | --- | --- |
| DEV OLTP `500b27b6-884a-41e8-a9ec-df801b0110ad` | 1.000128, Deployed | **1.000140**, Deployed; no editor issues |
| DEV OLAP `9f3422be-bc87-4a5a-a42a-67528ee80393` | 1.000045 | **1.000045**, unchanged; no editor issues |
| DEV SQL | V53 | **V54**, Flyway validation passed |
| PROD | OLTP3.000257 / OLAP1.100208 / V53 | Unchanged by this task |

DEV tuple: instance `appsheet-pg-prod-20260914`, host `34.21.174.215`, database **loan_manager_dev**. AppSheet account and work Chrome profile were verified. Starting Git commit: `5b12c8bc839f952a5446f9b3f43f1b55677ab7a9`.

[Backup verification](development-backup.json) records the private full DEV dump and hash. Its restored copy matched all source-table fingerprints; V54 rehearsal changed no existing financial values. Credentials, full database backups and raw captures remain outside Git. App rollback point is 1.000128: check for intervening edits before restoring. The additive SQL views can remain unused after display rollback. Any later SQL removal must be a new migration after dependent AppSheet sources are removed; never rewrite applied V54 or restore financial data just to undo a display.

## SQL implementation

[V54](../../database/migrations/V54__oltp_upcoming_charges.sql) adds three read-only views, without physical business tables/columns or changes to the V53 engine, jobs, notifications or payment routines:

| Provider | Grain and purpose |
| --- | --- |
| `public.oltp_upcoming_charge_events_v1` | One loan/date, stable length-prefixed loan/date key; positive remaining principal and interest; borrower-wide dense rank; seven-day rows **union** first-five-date rows. |
| `public.oltp_upcoming_charge_coverage_v1` | One borrower, including zero-event borrowers; displayed-date count, recorded-only loans, review/incomplete coverage and horizon. |
| `public.oltp_upcoming_charge_context_v1` | Singleton `upcoming`; synced business date, seven-day range, calculation timestamp and assumptions/coverage. |

All providers reuse `forecast_schedule_v1` and `reporting_forecast_inputs_v1`. Ranking follows loan/date aggregation, so multiple components and tied dates are counted correctly. The seven-day screen retains dates six and seven even when the borrower preview stops at five. Public grants are revoked; the existing verified owner connection is retained. [Captured definitions](postgresql-affected-definitions.json) and [SQL verification](sql-verification.json) contain the exact sanitized evidence.

## AppSheet implementation

Three READ_ONLY sources on database-3: **Upcoming Charge Forecast**, **Upcoming Charge Coverage**, **Upcoming Charge Context**. All use Text **Row ID** keys, explicitly corrected from initial row-number inference. Forecast references point to Borrowers and Loans, with no IsPartOf. Remaining monetary columns use baht Price with two decimals. Internal rank/horizon/key fields and generated unbounded reverse lists are hidden; forecast rows have no financial or editing actions.

Two READ_ONLY slices share the event source:

- `Upcoming Charges 7 Days`: Within 7 Days plus As Of Date equality with the context singleton.
- `Borrower Upcoming 5 Dates`: ranks 1–5, Due Date within Horizon End, and the same As Of Date check.

Borrowers.Upcoming Charges uses `REF_ROWS("Borrower Upcoming 5 Dates", "Ref Borrower")`. Upcoming Charge Note uses an explicit `[_THISROW].[Row ID]` lookup into coverage, includes the horizon and shared status, and warns when coverage/context business dates differ. Context.Forecast Status warns if any synced event or coverage row has a different As Of Date. These bounded checks do not recompute schedules in OLTP.

| View | Configuration |
| --- | --- |
| Upcoming Charges | Menu dashboard; bilingual label, calendar icon; context Wide then table Large; interactive off, mobile tabs off. |
| Upcoming Charges by Day | Ref table on seven-day slice; Due Date ascending groups; SUM Amount Remaining; borrower, loan, amount, basis. |
| Borrower Upcoming Charges_Inline | Ref table on five-date slice; same grouping/sum; loan, amount, basis. |
| Upcoming Charges Context | Ref detail; Date Range, Calculated At (UTC), Forecast Status; no quick edit. |
| Todays Collection Board_Detail | Today's charge list → upcoming list → coverage note → Submitted Receipts. Existing borrower-note editing remains. |

Forecast tables sort borrower/loan or loan ascending within date groups and have quick edit disabled. Expanded borrower lists retain the same slice and date cap. The existing nested-row setting of 30 was retained: a 40-row example was verified with all eight loans on its fifth date visible. Generated Borrower/Loan reverse references were hidden, and affected generated slice memberships were captured without changing their filters/actions.

[Exact saved app metadata](app-config-observations.json) is authoritative for names, expressions, ordered columns and generated properties. The 23 targeted dictionary objects live in `development:R048-upcoming-charges`; production definitions remain unchanged.

## Verification

- Full local database CI passed: 54-migration rebuild, new 14-check upcoming-charge suite, and existing forecast/payment/concurrency suites. Synthetic SQL fixtures rolled back.
- Private DEV backup restore, fingerprint verification and V54 rehearsal passed; DEV migrate/validate passed.
- SQL verified 237 event rows, unique stable keys, positive future amounts, horizon bounds and no duplicate loan/date rows. Timings in the evidence are query observations, not an end-to-end sync benchmark.
- Current DEV GUI: seven-day menu and date range loaded; representative first/middle/last daily totals reconciled with independent SQL. Normal sync refreshed the displayed calculation timestamp.
- Multi-loan borrower: ten rows on five distinct dates; expanding retained five dates. Large borrower: forty rows on five dates, all eight loans on the fifth date visible, no later dates. Read-only row details had no Add/Edit/Delete/payment actions.
- Existing synthetic borrower: today's charge remained visible, empty future state and horizon were clear, and two submitted receipt images remained available after the new section. Selected-charge receipt form contained the actual charge only; canceled without saving a payment.
- Desktop and mobile dashboard presentation checked. Both final saved DEV editors reported no issues. OLAP remained 1.000045.

[GUI evidence](gui-verification.json) records checks without borrower identities. [Synthetic empty-state screenshot](collection-empty-state.png) is safe to publish.

## Native presentation decisions and limits

The original [design handover](../oltp-upcoming-charges-design-20260929/HANDOVER.md) remains the rationale; this record supersedes proposed names and implementation details. Native date groups display positive-event dates, without padded zero-date groups. Baht displays retain two decimals instead of discarding sub-baht residuals. Existing Loan Ref navigation provides access to actual charges; a projected event is not a Charge Ref. Native empty tables are supplemented by borrower/context coverage notes. Menu and borrower section labels are bilingual; technical column/coverage text remains English.

No forced offline or midnight-transition GUI test was performed, and no comparative sync-latency benchmark is claimed. Mixed-business-date guards were verified in saved configuration; normal sync was exercised. A fully stale offline snapshot still needs sync, as stated on screen. Production readiness/owner acceptance is not implied by DEV completion.

## Later promotion handover

1. Obtain scoped owner acceptance and production authorization for the integrated R048 batch; reread the current tracker and all intervening DEV work.
2. Follow the single master promotion checklist and normal freeze/RC workflow. This task did not freeze R048, allocate R049, create an RC or publish a release tag.
3. Pin the tested Git/migration hashes and reconcile every pending migration. Apply additive V54 before verifying PROD-bound RC sources; keep the existing app usable through cutover.
4. Capture the integrated OLTP candidate, rebind all sources (including these three views) to PROD, restore PROD theme, retain scheduled guards, verify diagnostics and use App Upgrade after authorization. OLAP is unchanged by this feature but its integrated-batch status must be recorded.
5. Validate production sources, load/sync, menu range/group totals, borrower cap/receipt placement, read-only behavior and both editor diagnostics. Close only this feature's DEV overlays after verified promotion; preserve other open R048 work.
