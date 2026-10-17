# Partners tab — detailed design and implementation handover

Implementation status — delivered in R044: [Partners tab](https://reports.mw-credit.com/dashboard/3?tab=249), [saved implementation and verification](../r044-partners/README.md). No AppSheet change. The entitlement bridge uses the specified labelled table fallback. The following design remains the metric contract; delivery evidence supersedes implementation-pending language.

Date: 26 September 2026

Status: **Design complete for review; implementation, live verification and dashboard publication not performed.**

Owner request: design a useful Partners tab and prepare an implementation handover, excluding forecast content.

Starting Git commit: `640db510d8a243635f209fcef34efeee0836f880`.

## 1. Purpose, scope and destination

Build one read-only **Partners** tab answering four questions:

1. How much capital has each partner contributed and withdrawn?
2. How much interest and expense has been allocated to each partner, producing their net earned profit?
3. How much has actually been paid through completed settlements, and how much is reserved by pending settlements?
4. What remains available under the existing settlement rules, and which records explain it?

The intended home is Loan Reports, dashboard `3` at `https://reports.mw-credit.com/dashboard/3`. The latest repository navigation evidence is R043: eleven tabs, with Forecast following Collection Monitor. The earlier empty Tab 11 observed on 24 September must **not** be assumed to remain available. Re-inspect saved tab IDs and owner edits at implementation time. Proposed first delivery is an additive **Partners · Review** tab; assign its ID through Metabase. Replacement/removal of the existing Forecast tab is a separate cutover decision. Do not silently delete forecasts elsewhere merely because this new tab excludes them.

No forecasts, estimated earnings, projected distributions, loan scenarios, automatic settlement actions, new profit-sharing policy or transaction editing belong on this tab. OLAP retains partner administration and settlement workflows. This design proposes no new stored financial tables or columns and no changes to AppSheet.

This is a documentation-only task. R044 was the sole Open release at the design read; no scope or successor number is reserved by this document. The implementer must read the then-current tracker and use its Open release.

## 2. Evidence and confidence

This design uses repository source definitions, the production dictionary captured on 24 September, and current maintained design/navigation references. It does not claim a fresh live database inspection, balance reconciliation, current Metabase permissions check or browser visual test. No private financial rows were queried for this task.

| Reference | Design implication |
| --- | --- |
| [Solution Design](../../Documents/Solution_Design.md), Model Overview, [R043 navigation](../r043-borrower-navigation/README.md) | OLAP owns partner/settlement management; reusable reporting computation belongs in PostgreSQL; current navigation supersedes the original dashboard review. |
| OLAP Partners dictionary | Current Pool Contribution/Share, Total Profit Earned, Net Profit Earned, Completed Settlement, Pending Settlement and Net Available to Settle are established concepts. The old gross Available to Settle field is not the new headline. |
| [V16 allocation rounding](../../../database/migrations/V16__align_partner_settlement_rounding.sql), [partner_net_profit dictionary](../../Documents/Data%20Dictionary/systems/postgresql/routines/public-partner-net-profit-p-partner-text-34544193.yaml) | Allocate interest at historical contribution ratios and round each repayment's partner allocation before summing. Subtract allocated expenses. |
| [V18 Loan Form Context](../../../database/migrations/V18__loan_form_context.sql), [current Partner Outlook SQL](../../scripts/metabase/models/partners.sql) | Current pool ratios use all recorded contributions. Outlook supplies role A/B and current shares, not a full partner balance or history ledger. |
| [V15 expenses](../../../database/migrations/V15__business_expenses_and_referrals.sql), [V21 cancellation](../../../database/migrations/V21__settlement_delete_reversal.sql) | Expenses carry historical partner allocations. Cancelled settlements retain history but cease reserving entitlement or representing effective payouts. SQL guards reserve all non-cancelled settlement amounts. |
| [V22 OLAP reporting](../../../database/migrations/V22__olap_analytics_views.sql) | `olap_repayments_analytics` supplies calculated Partner A/B Profit amounts with existing rounding, avoiding use of today's share on past interest. |
| [V31 FIFO dashboard](../../../database/migrations/V31__cash_dashboard_fifo_settlements.sql) | Completed payments allocated to this month's earned profit under FIFO differ from payments whose Transfer Date falls this month. This tab uses the latter for period payout activity. |
| [V34 reporting views](../../../database/migrations/V34__income_reporting_views.sql), Settlement Ledger dictionary | `reporting_settlements` filters Transfer Date through today and cannot alone provide every current pending reservation. Model 185 is recorded as archived; do not assume it is active. |
| [Partners schema](../../Documents/Data%20Dictionary/systems/postgresql/relations/partners.yaml), [capital schema](../../Documents/Data%20Dictionary/systems/postgresql/relations/cash-pool-contributions.yaml), [settlements schema](../../Documents/Data%20Dictionary/systems/postgresql/relations/settlements.yaml) | Immutable partner and event IDs exist. Nullable dates/statuses and role mapping need explicit validation. No verified creation/completion timestamp supports a true pending-age metric. |

Source evolution must be checked before implementing. Legacy scripts and archived models are references, not instructions to replay an installer.

## 3. User experience and filter contract

### Filters

| Control | Default and exact behaviour |
| --- | --- |
| Partner | All economic partners. Allow one or several partners, keyed by `Partners.Row ID`, displaying Partner Name. Applies to all displayed partner records, amounts and series. Keep a zero-activity partner visible. |
| Activity period | This month through Bangkok today; allow one continuous date range, including prior periods. Drives only period cards, activity charts and dated ledgers. Clearing means all valid event dates through today, explicitly labelled All recorded history. Reject a reversed range; future-only ranges show No actual activity. |
| Settlement ledger status | All by default, including Cancelled for audit visibility. Applies only to the settlement ledger; never changes headline balances, the fixed Pending queue or period payout totals. |

Use `Asia/Bangkok` for date boundaries. Date columns retain their recorded business date. Timestamp sources, if introduced, must be converted to Bangkok before date filtering. An inclusive UI range maps to inclusive date bounds, or an equivalent half-open timestamp interval.

**Current** means current recorded OLAP balances, using its existing all-record population. These values do not become historical when the activity period changes. Current pool and settlement logic have no universal date cutoff; do not silently replace them with an as-of-today variant. Flag future-dated or undated records, expose the scope in the note, and reconcile any difference before labelling a number payable. Future-dated pending rows are still current reservations, not a forecast.

Pool share always divides by the full valid economic pool before applying the Partner filter. Selecting one partner must not make their share 100%. Historical role allocations are also calculated before filtering partners.

### Proposed layout

```text
Partners                          [Partner: All] [Activity period: This month]
Current recorded position · live on refresh · activity period does not apply
[Net capital] [Net earned] [Completed payouts] [Pending] [Net available]
[Partner comparison table — all current balances and shares]
[Capital share by partner]       [Entitlement bridge]

Actual activity · selected period
[Allocated interest] [Allocated expenses] [Net earned] [Completed payouts]
[Monthly earned versus paid]     [Monthly capital in / out]
[Net contributed capital over time — one series per partner]

Pending settlements · current, all transfer dates
[Pending queue]

Transaction detail · selected period
[Capital ledger]
[Settlement ledger, status filter]
[Source / query time / exception status, short definitions]
```

Use native Metabase visuals and the established 24-column dashboard grid. Half-width chart pairs are 12 columns each; tables and the capital trend are full width. Use two rows for the five current cards if five across makes labels unreadable. Mobile order follows the reading sequence above, with charts stacked. Avoid a custom service or iframe for this page.

Amounts display in baht with separators and no abbreviated k/M labels by default. Whole-baht presentation is appropriate for the headline/chart scale; retain exact source precision in detailed exports/tooltips where supported. Percentages use two decimals. Do not round stored data or change the established row-level allocation rounding. Negative values remain signed; unavailable differs from zero.

Use stable colours by Partner ID across comparison charts. For the bridge and movement types, use labelled semantic colours: additions green, deductions red, balances blue, pending amber. Never use colour as the only indication of status. Titles explicitly identify current, period or cumulative values.

## 4. Metric catalogue and financial rules

### Definitions

For partner `p`, define current balances from the independently aggregated source sets:

- `Kp`: contributions minus capital withdrawals, following the established signed Net Contribution expression.
- `Gp`: lifetime allocated gross interest, rounded per repayment under the historical payment-date allocation rule.
- `Xp`: allocated Business Expenses, including signed adjustments; use the stored/calculated Partner A/B Expense amounts without reallocating by today's share.
- `Np = Gp - Xp`: net profit earned under the prototype's established allocation model.
- `Cp`: sum of settlement Amount with Status exactly `Completed`.
- `Pp`: sum of settlement Amount with Status exactly `Pending`.
- `Rp`: all settlement amounts reserved by the current SQL guard, i.e. Status `IS DISTINCT FROM 'Cancelled'`. This includes unexpected/null statuses until resolved.
- `Up = Np - Cp`: unpaid net entitlement before pending reservations.
- `Ap = Np - Rp`: signed net available to settle.

For valid status populations, `Rp = Cp + Pp` and `Ap = Np - Cp - Pp`. These are entitlements, not cash-account liquidity or permission to execute a payout. Do not clamp a negative `Ap` to zero or combine it with contributed capital into an invented withdrawable balance.

### Current metrics

| ID / label | Formula / source | Display and edge handling |
| --- | --- | --- |
| M01 Net contributed capital | `Kp`, or SUM over selected partners | Current card and partner table. Contributions/withdrawals belong to capital, never profit. Flag unknown transaction types; the operational ELSE-negative formula is not evidence that every unknown type is a valid Withdrawal. |
| M02 Capital share | `Kp / full_pool_net_capital` | Partner table and capital-share chart. No positive valid denominator, negative capital or unassigned pool entries: share unavailable with explanation. Do not render misleading percentages. Preserve signed amounts for investigation. |
| M03 Net profit earned to date | `Np` | Current card and table. Label To date / current recorded balances, with scope note; never use gross Total Profit Earned as net profit. |
| M04 Completed payouts to date | `Cp` | Current card and table; Completed only. Cancelled rows are excluded, Pending is not paid. Unexpected future Completed dates need explicit exception review. |
| M05 Pending settlements | `Pp`, plus count | Current card and table. All pending records, including future or blank transfer dates, reserve entitlement. Count appears in subtitle or table, not another headline. |
| M06 Net available to settle | `Ap` | Current card and table. Negative is visible. If unknown statuses or invalid mappings prevent reconciliation, label Needs review and expose the exception instead of an apparently safe payout figure. |
| M07 Unpaid net entitlement | `Up` | Partner table / bridge detail only. It includes amounts already reserved as Pending. Avoid adding another ambiguous headline. |

The comparison table columns are Partner, Net capital, Capital share, Allocated interest to date, Allocated expenses to date, Net earned to date, Completed payouts, Pending, Net available. Show role and immutable key in detail metadata; no email, phone, account number or integration credentials. A footer sums amounts across selected partners, while share totals retain the full-pool denominator.

### Actual-period metrics

For inclusive selected dates `[s,e]`, with actual-event upper bound capped at Bangkok today:

| ID / label | Event date and calculation |
| --- | --- |
| M08 Allocated interest | SUM allocated Partner A/B Profit from `olap_repayments_analytics`, filtered by Payment Date. Signed correction effects must follow the canonical repayment source. |
| M09 Allocated expenses | SUM Partner A/B Expense filtered by Expense Date. Positive is cost; negative adjustments reduce cost. |
| M10 Net profit earned | M08 minus M09. No capital movements or payouts are subtracted from earned profit. |
| M11 Completed payouts | SUM settlement Amount with current Status = Completed and Transfer Date in the period. Label actual transfer-date activity; do not call it profit earned in the period or FIFO month allocation. |
| M12 Capital contributed / withdrawn | Separate sums by Contribution Date and exact Transaction Type; show withdrawals as an outflow in charts. |
| M13 Net capital movement | M12 contributions minus M12 withdrawals. Used in capital chart/ledger, not another required headline. |
| M14 Net capital at period start/end | Sum signed capital events before `s` / through `e`. Calculate opening from all prior history before applying the display filter. |

Historic charts are reconstructed from current effective source records. A backdated correction or cancelled settlement can change previous months. They are not immutable historical snapshots or proof of what an earlier user saw. V1 does not reconstruct historic pending balances or settlement status-transition timelines.

### Allocation integrity

Existing economics are role A/B based, while capital and settlements reference individual Partner IDs. Verify exactly one economic partner per allocated role before assigning role-level profit to individual partners. Do not duplicate an entire role's profit onto multiple people or split it using an invented rule. If mappings are absent/ambiguous, affected profit metrics are unavailable until the existing model is reconciled; clearly identified capital/settlement records can still be inspected.

Current Partner Outlook (recorded model 76) has role-level share semantics. Only reuse it after confirming one-to-one mapping and parity with individual capital totals. Do not assume every Partners row is an economic partner; separately flag unmapped references and non-A/B economic activity.

The published partner profit amounts in `olap_repayments_analytics` already reflect per-repayment whole-baht rounding. Do not multiply the displayed two-decimal share by interest to reconstruct them. Independent A/B rounding may leave a residual against total interest. Reconcile and disclose that residual; do not silently force it into one partner. Expenses use their established allocation and residual method. Default losses and referral expenses must follow existing model classifications rather than new accounting assumptions.

## 5. Chart and table implementation specification

| ID / visual | Query grain and presentation | Filters and acceptance behaviour |
| --- | --- | --- |
| V01 Capital share by partner | One row per partner; horizontal percentage bars with amount and share labels. Prefer bars over a pie so selecting one partner still visibly retains their original share. | Current only; Partner filter after denominator. Show 0–100% axis for valid shares; suppress invalid share plot and retain signed capital table. |
| V02 Entitlement bridge | Waterfall: allocated interest → less allocated expenses → net earned subtotal → less completed payouts → less pending/other reservations → net available total. Use subtotal markers, not an extra additive net-earned bar. | All current history, selected partner(s). Caption identifies the selection. If native waterfall cannot express both subtotal and signed deductions accurately, use a labelled bridge table with the same arithmetic; no custom rendering required. |
| V03 Monthly net earned versus completed payouts | Grouped columns, two series: net earned and completed payouts, at calendar month grain. Clear zero line and negative earned values. For All partners, totals; selecting a partner narrows the series. | Activity period. Aggregate only selected dates within boundary months and label partial months. Both series use baht and one axis. Explain that payouts can exceed that month's earnings by using earlier entitlement. |
| V04 Monthly capital contributions and withdrawals | Diverging columns at month grain: contributions above zero, withdrawals below zero; net movement in tooltip. | Activity period and Partner. No profit settlements in this chart. Zero months are rendered when coverage is known. |
| V05 Net contributed capital over time | Daily step/line series per partner, computed from cumulative signed capital. Begin with opening balance and carry forward on no-movement days. | Display Activity period; accumulate all earlier capital first. Current all-record balance can differ from a today-bounded endpoint if future/undated records exist; disclose rather than force equality. |
| T01 Partner comparison | One row per economic partner, columns from section 4. | Current, Partner only. Default stable partner order; amount totals and share denominator behave as specified. |
| T02 Pending settlements | One row per Pending Settlement ID: Partner, Amount, Recorded transfer date, date-quality flag, source reference. Sort dated entries ascending, missing dates visibly grouped. | Current all dates, Partner only. No Activity/status filtering. Transfer Date is not proven creation date: do not label its age Days waiting. |
| T03 Capital ledger | One row per capital Row ID: Contribution Date, Partner, Transaction Type, signed movement, cumulative partner capital after that date, record reference. | Activity period and Partner. Multiple same-date entries: show date-end balance once per date or explicitly label a deterministic ID-ordered display balance; ID order is not intraday chronology. Invalid/undated rows remain visible through the exception detail. |
| T04 Settlement ledger | One row per Settlement ID: Transfer Date, Partner, Amount, Status, source reference. Cancelled amounts are audit facts with zero current balance effect. | Activity period, Partner and ledger-only Status. Show a separate Completed total and Pending total; never a misleading paid total over all statuses. Blank-date rows go to explicit exception detail; Pending queue still includes them. |

A click on a partner label sets the page Partner filter if supported by the installed Metabase build; provide the normal dropdown as the reliable fallback. Ledger links may open existing OLAP detail views only after verifying current target app/view identity and same-environment links. No guessed AppSheet deep links and no direct action links that create, complete or cancel settlements.

The bridge's Unknown/other reservation component appears only when required by `Rp-Cp-Pp`; accompanying status is Needs review. Expense refunds can make the expense deduction positive in the bridge; preserve the arithmetic. Avoid forcing all components into a positive-only stacked chart.

## 6. Reporting source implementation contract

Use database-owned read-only providers with thin Metabase models. The following are **logical provider names and proposed contracts, not existing database object names or assigned model IDs**. Choose physical names only after inspecting current schema and repository conventions.

| Logical provider | Required grain / fields | Source and work needed |
| --- | --- | --- |
| Partner position | One row per Partner ID; role/name; K/G/X/N/C/P/R/U/A; full pool denominator; current status flags; query timestamp | Aggregate capital, repayment allocations, expenses and settlement statuses independently, then join by immutable partner key. Compare N with `partner_net_profit(p)` and A with the reservation guard / OLAP. |
| Partner capital events | One row per contribution Row ID; Partner ID; business date; exact type; signed numeric amount; validity flags | Read existing Cash Pool Contributions through a narrow reporting projection. No new source storage. |
| Partner earnings events | Unique `(event type, source ID, partner role)`; mapped Partner ID; Payment/Expense date; allocated interest or expense; net effect | Unpivot authoritative A/B profit allocations and expense allocations. Keep expense adjustments signed. Do not join raw repayments to raw expenses/capital. |
| Partner settlement events | One row per Settlement ID; Partner ID; Transfer Date; Amount; exact Status; paid/reserved/cancelled flags | Existing `reporting_settlements` can serve dated past/current detail after verification, but excludes future/undated reservations. Prefer a complete narrow status projection for current position and queue. |
| Partner period summary / capital trend | One row per selected partner per period / partner per calendar date, respectively | Bounded read-only functions or governed views; calculate cumulative opening before filtering dates. Expose source completeness and range. |

Casting `money` to numeric must happen in SQL before aggregation. Preserve source precision. Validate IDs, dates and accepted transaction/status types; don't let COALESCE hide a missing join or invalid input as a true zero. Known complete empty activity is zero; unknown coverage is unavailable.

Do not grant raw base-table access merely to simplify charts. Reuse existing permitted providers where semantics fit; scope any necessary SELECT/EXECUTE grants to named reporting objects for the established restricted reader. Check actual privileges and source identity; old permissions are dated evidence. Read queries must never call mutating recalculation/refresh routines. No scheduled job, snapshot storage, materialized view or refresh cadence change is proposed. Measure default and full-history query costs before considering extra infrastructure.

Keep current metrics in one shared provider so separate cards do not independently reproduce allocations. Reuse equivalent saved questions where definitions and filter contracts match; different semantics warrant separate questions. Do not alter current allocation, settlement validation, source tables, existing monthly FIFO calculations or existing dashboard consumers to make this page easier to build.

## 7. Freshness, exceptions and omitted metrics

Show one compact footer: source = live query on report refresh, queried at Bangkok timestamp, selected activity range, and exceptions count/status. Distinguish a cached result's query time from page-open time. Display a readable error for query failure instead of stale-looking zeros.

Exceptions to detect include missing/duplicate role mappings, orphan Partner references, unknown capital types, null amount/date, unexpected settlement status, future-dated earned/capital/Completed records, negative capital, nonpositive pool and unallocated or rounding residuals. Include only sanitized counts in published implementation evidence. Restrict detailed exception records to the dashboard's intended audience.

Cash custody/advance balances are deliberately not partner-entitlement cards. Existing custody sources use Cash Holder IDs; no verified partner-to-holder mapping or additive cash-versus-entitlement identity was established here. Provide an ordinary link to Cash Position for liquidity review if useful. A negative cash account is not automatically a partner capital withdrawal or profit overpayment.

V1 also omits ROI/APR, annualized returns, partner net worth, payout recommendations, days waiting and historical pending trends. Those require additional denominators, ownership definitions or status-history evidence. Useful existing metrics above are sufficient without inventing them. No forecast content should appear in headings, cards, tooltips or default chart series.

## 8. Implementation sequence and authorization boundaries

1. Read this handover and current Open release, relevant release log, environment inventory and database change procedure. Re-read actual affected providers/permissions, current dashboard/tab/card definitions and AppSheet reference formulas. Resolve only concrete mismatches; do not audit unrelated pages.
2. Establish rollback for affected assets before a coherent mutation batch: current Git commit and local work, scoped Metabase backup/copy plus definitions for shared questions to change, and applicable database recovery evidence. This design task changed no live assets and required no live backup.
3. Verify PROD source `2`, underlying `loan_manager_prod`, existing restricted identity and complete Cloud SQL target against current inventory. Use DEV for any required SQL development. A new view/function requires the repository migration procedure; no migration version is preassigned here. No new stored table/column is authorized by this design.
4. Confirm role cardinality, accepted statuses/types, date completeness and allocation parity using bounded read-only diagnostics. Keep transaction values and raw backups outside Git. Reuse valid recorded evidence, refreshing only affected assumptions.
5. Implement the smallest additive reporting provider set and DEV reconciliation tests. Follow normal authorization and exact tested migration promotion for PROD. The owner's current request authorizes this design/documentation, not live migration or dashboard publication.
6. Build thin models, saved questions and the additive review layout with independent Partner/activity/status parameters. Map every visual as specified; preserve all existing tabs, cards and filters. Test the actual dashboard filter endpoints and native display.
7. Conduct owner review of the concrete page. Canonical naming/order and old-tab retirement are decisions at cutover; no forecast deletion is implicit. Use the release's one applicable promotion checklist, not a second parallel checklist.
8. Complete relevant source/dictionary/log documentation and release evidence, commit/push the intended files, and verify publication under repository rules. Update this handover with implementation links and final source/visual IDs instead of creating a competing current contract.

For browser work follow [Service Account and Browser Mapping](../../Documents/Service_Account_Browser_Mapping.md): Metabase uses Chrome with the Gmail profile, and the selected service account must also be verified. API/CLI work may use its correctly authorized identity. No browser work was required for this document-only design.

## 9. Required verification cases

Run relevant checks on synthetic DEV fixtures or read-only reconciliation; do not manufacture PROD financial events for a dashboard test.

| Case | Required result |
| --- | --- |
| Base arithmetic | Synthetic partner: capital 60,000 contributed less 10,000 withdrawn = 50,000; gross allocated interest 12,000 less expenses 2,000 = net earned 10,000; Completed 4,000 and Pending 1,500 produce unpaid 6,000 and available 4,500. Capital remains 50,000. |
| Pending becomes Completed | Same 1,500 moves from Pending to Completed. Paid rises, pending falls, available remains 4,500; no second deduction. Validate by fixture, not a PROD status write. |
| Cancellation | Cancelled Pending releases its reservation. Cancelled Completed removes the effective payout and restores availability under existing reversal semantics. Retain an audit row; no double counting as a negative new payout. |
| Historical share change | Synthetic 100 interest at 60/40, later 100 at 50/50, produces 110/90 before expenses, not 100/100 using today's split. Preserve per-event rounding and check its residual. |
| Role ambiguity | Two partners sharing an allocated role must not each inherit its full earnings. Affected economic values show Needs review. |
| Period versus current | Switching month changes period cards/trends/ledgers, never current balance cards or Pending queue. Dates filter earnings, expenses, capital and payouts on their own documented date basis. |
| Filter denominator | If a partner owns 40% of the full pool, selecting that partner still displays 40%. Totals sum selected monetary amounts only. |
| Capital opening | Contribution before selected period remains in opening/trend. A withdrawal in the period reduces capital; an identical-amount profit payout does not. |
| Status/date exceptions | Pending with future/blank Transfer Date is reserved and listed in current queue. Unexpected/null status is included in operational reservation reconciliation and visibly flagged. Dated source alone cannot drop it. |
| Negative/empty inputs | Losses and negative availability stay signed. Known empty activity is zero. Zero pool returns unavailable share; unknown source data is not silently zero. |
| Signed adjustments | Negative expense adjustment increases net earnings; signed repayment corrections follow canonical source. No ABS or positive-only filter hides adjustments. |
| Many-to-many protection | Multiple repayments, expenses and settlements do not multiply rows or totals. Assert unique provider keys before joins. |
| Monthly aggregation | Partial first/last months respect selected dates; chart totals equal period cards. Payouts over monthly earnings are possible and correctly explained. |
| Cash/earnings separation | No account custody, principal return or capital movement is misclassified as earned partner profit. No current share is applied to historical earnings. |
| Security and drill-through | Correct Partner ID mappings, read-only providers, no unnecessary PII; any app links resolve to the correct environment. Filtering is not a substitute for access control. |
| Saved UI | Native desktop/mobile rendering, labels, negative bars, long partner names, filters, empty/error states and ledger pagination work. Compare bridge table/card arithmetic at exact precision. |

Reconcile current capital/share, net earned and net available to the affected authoritative OLAP/SQL definitions, not just to another chart using the same new query. For valid status populations, verify `net earned = completed + pending + available`; where a residual reservation exists, include it explicitly. Verify all-partner earnings against source interest with documented rounding/unallocated residuals, and allocated expenses against total expenses. Do not require false exact equality after whole-baht display rounding.

## 10. Completion and recovery handoff

Implementation is complete only when providers and visuals are saved, the filter/financial checks above pass, browser display is verified, scoped owner publication authority is satisfied, and required documentation/publication is complete. Record actual source IDs, question IDs, placement IDs, tab ID, backup reference, migration version/hashes and test evidence at implementation time; no placeholder counts as executed evidence.

Rollback should first restore the scoped dashboard layout/questions from the verified baseline. Keep newly added unused read-only SQL providers for compatible rollback unless a separate reviewed removal is justified. Never revert financial transactions or run historical installers wholesale as dashboard rollback. Review shared consumers before restoring a shared question.

Current task deliverables are this handover, design summary, [change log](https://github.com/welct0407/MW-Credit-App/blob/cbc8843/project/Change%20Logs/CHANGE_NOTES_PARTNERS_TAB_DESIGN_2026-09-26.md), and a navigation entry in the documentation map. No model dictionary, environment, development differences or release status is changed because the proposal changes no implemented definition.
