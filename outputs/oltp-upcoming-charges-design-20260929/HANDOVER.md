# OLTP upcoming charges — implementation handover

29 September 2026. **Design complete; implementation deferred by owner request.** No app, database, report, financial row, schedule or notification was changed. New object names below are proposed names, not existing deployed objects.

## 1. Requested result and decisions

Deliver two read-only presentations of one governed upcoming-charge calculation:

1. **Upcoming Charges · Next 7 Days**: all upcoming charges across borrowers, grouped by due date ascending, with the sum for each date.
2. In **Collection → borrower detail**, insert **Upcoming Charges · Next 5 Due Dates** immediately after `Todays Collection Charges` and before `Submitted Receipts`. Group by date and sum all that borrower's charges on each date.

**Owner-confirmed:** five recurrences means the next **five distinct due dates across all of the borrower's loans**, not five rows or five occurrences per loan, **capped at three calendar months ahead, whichever limit is reached first**. Include every charge on the fifth date when it falls within that horizon, even when this produces more than five rows. The owner's final three-month instruction supersedes the briefly proposed one-month cap. Never extend the preview further to find a fifth date.

Design defaults:

- “Next 7 days” means **tomorrow through today + 7, inclusive**. Today remains in the existing Collection section. Both future sections exclude overdue and due-today rows.
- Sum **remaining principal + remaining interest**, not original face amounts already partly paid. This is an upcoming collection obligation forecast, not a probability of collection or new accounting entry.
- Automatic loans use their current schedule, with existing charges taking precedence. Auto-generation-disabled loans use existing settlement charges only; do not extrapolate a recurrence or invent missing installments.
- Use Bangkok business dates. Refresh on normal online sync; an offline view is a saved forecast, not a live promise.
- Keep current Collection membership, receiving actions, totals, borrower note and receipt eligibility intact. A borrower with no activity qualifying them for today's Collection can still appear on the new seven-day screen.

These defaults are design choices, not additional owner confirmations. There are no unanswered questions blocking this document. A later implementation request should carry this contract forward unless the owner changes it.

## 2. Evidence and implementation starting point

Repository baseline: `64e92dd1b17fc656cbead26fa99e94bc94425de6`. This is a repository-based design, **not a fresh live audit**. Re-inspect affected live objects before mutation, including later migrations and intervening app changes.

| Evidence | Relevant finding |
| --- | --- |
| [Solution Design](../../Documents/Solution_Design.md) | OLTP owns operational collection; heavy reusable joins and schedule calculations belong in PostgreSQL. Thin, bounded operational views are appropriate. |
| [Current release](../../Documents/Release_Tracker.md#current-development-release) | R048 was Open at design time. Design-only work allocates no release or migration number. At implementation, use the then-current single Open release. |
| [V8 charge generator](../../database/migrations/V8__common_charge_generation.sql) | Three loan-type branches; schedule anchors/intervals; existing loan/date charge suppresses automatic creation. This function writes charges and must never be called to render a forecast. |
| [V48 forecast providers](../../database/migrations/V48__forecast_planning.sql), [V53 replacement](../../database/migrations/V53__original_daily_interest_rate.sql) | Existing pure forecast function and JSON inputs supply reusable rules. V53 supersedes V48's daily-interest repricing. Existing report event view ends at month-end and function accepts at most 93 days. |
| [Delivered reporting contract](../r045-forecast-planning/IMPLEMENTATION.md) | Recorded obligations precede simulation; auto-off uses recorded plans; forecast calculations create no real charges. Reporting scenario rates are outside this feature. |
| [Loans dictionary](../../Documents/Data%20Dictionary/systems/appsheet/oltp/tables/loans.yaml), [Charges dictionary](../../Documents/Data%20Dictionary/systems/appsheet/oltp/tables/charges.yaml), [Borrowers dictionary](../../Documents/Data%20Dictionary/systems/appsheet/oltp/tables/borrowers.yaml) | Immutable Row IDs, existing Ref chain, current schedule fields, stored charge residuals and today's charge list. |
| [Collection](../../Documents/Data%20Dictionary/systems/appsheet/oltp/views/collection-7b790708.yaml), [detail](../../Documents/Data%20Dictionary/systems/appsheet/oltp/views/todays-collection-board-detail-df449327.yaml), [slice](../../Documents/Data%20Dictionary/systems/appsheet/oltp/slices/todays-collection-board.yaml) | Collection uses `Todays Collection Board`; detail currently ends with today's charges and Submitted Receipts. Recorded `MaxNestedRows` is 30. |
| [Receipt correction](../r048-collection-receipts/HANDOVER.md) | Receipt gallery uses positive allocations intersecting today's displayed charges. Future rows must not enter that list or alter receipt eligibility. |

Recorded baseline facts are evidence, not deployment targets. Resolve live app IDs, database/host/instance tuple and service account through the [inventory](../../Documents/Environment_Inventory.md) and [browser mapping](../../Documents/Service_Account_Browser_Mapping.md) when implementation begins.

## 3. Screen design

### 3.1 Portfolio screen

Add a menu entry **Upcoming Charges**; preserve existing primary navigation. Use a compact read-only dashboard containing a small context/detail panel and a native grouped table. This remains one screen, with no date picker or scenario inputs in V1.

Context: exact seven-date range, forecast business date/calculation time, and a short coverage message when recorded-only plans or calculation issues exist. Label partial totals clearly when any affected amount cannot be calculated. Display the date range from synced provider fields, not a device-only `TODAY()` title over older data.

Grouped table:

| Setting | Proposed value |
| --- | --- |
| Source | `Upcoming Charges 7 Days` slice |
| Group by | `Due Date`, ascending |
| Group aggregate | SUM of `Amount Remaining` |
| Sort within date | Borrower label, Loan Key, stable Row ID |
| Visible columns | Borrower, Loan Key, Amount Remaining, Basis |
| Row selection | Dedicated read-only forecast detail |
| Detail fields | Date, borrower/loan Refs, principal, interest, total, basis, assumption/coverage notes, source charge links where recorded |
| Editing/actions | No add, edit, delete, quick edit, generate-charge or receiving action on forecast rows |

`Basis` is **Recorded** or **Projected**. Recorded auto-off rows can show **Recorded settlement**; do not confuse borrower settlement charges with OLAP Partner Settlements. Whole-baht display follows existing presentation, but calculations retain source precision and sums are rounded only for display. Preserve any nonzero sub-baht residual in drilldown.

Native groups exist only for dates with positive rows. Empty dates need no artificial charge or zero-value row. An empty seven-day result says **No upcoming charges in this period**, unless coverage issues mean **Forecast unavailable/incomplete**. It must not silently present missing schedules as a known zero.

AppSheet documents native date grouping and group aggregates for table/deck views: [table/deck configuration](https://support.google.com/appsheet/answer/10106514?hl=en). This is the intended native implementation; mobile layout still requires GUI verification.

### 3.2 Borrower section in Collection

Preserve existing detail content, with the affected tail ordered as:

1. Borrower Note (existing).
2. Todays Collection Charges (existing and unchanged).
3. **Upcoming Charges · Next 5 Due Dates** (new grouped inline table).
4. Forecast coverage/assumption note, when applicable.
5. Submitted Receipts (existing).

Use the same date grouping and amount aggregate as the portfolio table. Omit the borrower column here; show Loan Key, Amount Remaining and Basis. Show the subtitle **Up to 5 due dates within 3 months**, with the exact horizon end date. The window can extend beyond seven days or month-end, but never beyond the three-month cap. If fewer than five positive due dates exist within it, show those available; do not search further or pad with invented dates. For auto-off loans, indicate **Recorded settlement charges only**. For an empty known schedule, show **No upcoming charges within 3 months** instead of an unexplained blank space.

Use a dedicated slice-backed ref view so the grouped presentation does not change `Charges_Inline` or another existing charge view. [AppSheet reference views](https://support.google.com/appsheet/answer/10106516?hl=en) support custom ref views for a table or slice.

All rows on each selected date must remain accessible. Do not equate `MaxNestedRows = 5` with five dates. Test more than 30 underlying rows: show the full grouped section where practical and retain a borrower-scoped **View all shown charges** route if native inline rendering truncates. That route keeps the same five-date/three-month cap; it reveals rows, not later dates. Never claim a truncated preview contains all selected complete groups; group totals must reconcile to the full selected population.

Synthetic illustration: Borrower A has loan L1 due 100 and loan L2 due 200 on 30 September, followed by dues on 2, 4, 6, 8 and 10 October. Display 30 September (300), 2, 4, 6 and 8 October, including both loans on 30 September. Exclude 10 October from this section. The seven-day screen independently includes dates through 6 October when T = 29 September.

## 4. Calculation contract

### 4.1 Clock, grain and amounts

Define `T = (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date` and `Q = statement_timestamp()` for a provider query. Reuse the governed reporting-date helper only after verifying it has this same contract.

Final forecast grain is **one borrower / loan / future due date**. A row may combine several real charges for that loan/date. Preserve access to every contributing charge; never collapse different loans into one detail row. The date header sums the rows, so each loan/date contributes once.

For each real charge, derive remaining principal/interest from the canonical charge balances or their governed signed-posted-repayment calculation. Reconcile the chosen source against the current stored `Charges` residuals. Unposted Payments are not repayments. Respect reversals and prepayments; do not subtract both Payments and Repayments. Values with future effective payment dates or inconsistent component totals are exceptions requiring a declared handling rule, not silent extra cash.

Ordinary eligible charge components are nonnegative and `Amount Remaining = Principal Remaining + Interest Remaining`. Fully paid charges are excluded from displayed rows and the five-date ranking, but **retained as schedule occupancy** so a projection cannot recreate them. Negative default-accounting entries are not collectible cash and do not reduce an unrelated day's total. Flag invalid balances rather than silently repairing them in the forecast.

### 4.2 Recorded-first merge

1. Load source charge identity/date/components and signed posted settlements for each relevant loan, including paid and out-of-window records needed to establish the schedule state.
2. Keep positive future residuals as Recorded events. Sum multiple valid charges on the same loan/date.
3. For an automatic schedule candidate, if **any actual charge exists for that loan/date**, suppress the synthetic event for that whole date, including when the actual row is fully prepaid or its amount differs from the nominal schedule. This follows the inspected generator's date-level precedence.
4. Invalid recorded rows also occupy that date; mark incomplete instead of filling their place with an assumed amount. An unusual partial/manual charge on an automatic loan may warrant a coverage notice; never create the apparent difference as another forecast charge.
5. Merge recorded and unsuppressed simulated dates, remove zero remaining events, then aggregate/rank. Do not rank each loan and use that rank directly as the borrower limit.

This prevents future settlement rows, early payments and generated charges appearing twice. An actual charge generated later replaces the projected representation at the same logical forecast key.

### 4.3 Population

- Project only valid, started, open, nondefaulted automatic loans, using the current source status/close-date rules. Never infer a future loan or new lending.
- Include valid positive existing future obligations for both automatic and auto-off loans. Do not require membership in today's Collection slice or `Visible Borrowers`; `Hidden Flag` is not a new financial exclusion.
- Existing future obligations on a closed/defaulted loan remain visible as **Recorded · review status** with a coverage warning. Do not fabricate automatic continuations or silently hide a real settlement obligation. Show that designation in detail and qualify aggregate coverage. Reconcile any legal/financial cancellation through the existing source workflow, not by deleting rows from the forecast.
- Orphan loans/charges or inaccessible parents must not produce broken Refs or expose otherwise restricted borrowers. Report authorized aggregate coverage issues and leave source correction to its own workflow.

### 4.4 Automatic schedule rules

Use the **current governed generator and V53 forecast behavior** as implementation evidence; exact parity must be tested before accepting the feature.

| Loan type | Candidate dates and amount |
| --- | --- |
| Daily interest (`ดอกเบี้ยรายวัน`) | Anchor is `Interest Schedule Anchor Date`, falling back to `Loan Date`; dates after anchor with `(date - anchor) mod Interest Payment Interval = 0`. Use current daily interest and elapsed days since the applicable prior charge/candidate. Do not assume a seven-day interval or treat the interval as a monthly calendar recurrence. |
| Fixed due date (`กำหนดวันชำระ`) | One event at `Due Date`: projected remaining principal plus `Fixed Interest`, unless a recorded charge occupies the date. Do not repeat it five times. |
| Daily installment (`ผ่อนชำระรายวัน`) | Interval dates after Loan Date through Due Date, plus final Due Date even when off-cycle. Preserve inclusive term length, principal floor/remainder allocation and final rounding from the generator; interest is installment amount for elapsed days minus principal. Existing first-day charge establishes state. |
| Auto Charge Enabled = false | Only future real charge residuals. Ignore nominal loan interval/rate for adding new rows. |

Daily interest forecasts begin with the stored `Current Daily Interest`. When the simulated path includes scheduled principal being collected, use the V53 frozen `Original Daily Interest Rate`: `round(projected outstanding principal * original rate / 100, 0)`. Do not reconstruct the rate from a mutable label or apply daily-interest repricing to fixed/installment loans.

Assumption: currently due-today and future scheduled principal is collected on its due date, after that day's obligation; subsequent interest uses the resulting balance. Past arrears are not assumed recovered. Today's still-unpaid principal can therefore affect later projected interest; state this assumption in forecast detail. Actual recorded charge amounts remain authoritative even if the model would calculate another amount. A missed payment, principal correction, settlement edit or rate/anchor change revises projections after sync. This is the existing schedule scenario, not a collection-probability estimate.

Preserve the inspected distinction between daily-interest prior-date lookup and installment `MAX(Charge Date)` behavior, including future recorded installments. Future installment rows can prevent earlier synthesis under current rules. Treat nonpositive elapsed periods, missing initial charge, invalid interval, unknown rate when repricing is needed, invalid dates/components and conflicting principal coverage as explicit incomplete coverage. Do not silently fix the operational schedule through this display feature. Any required generator correction becomes separately recorded scope before implementation acceptance.

### 4.5 Five-date limit within three months

Define `H = LEAST((T + INTERVAL '3 months')::date, T + 93)`. Three calendar months uses PostgreSQL calendar arithmetic, clamping to the last valid day for shorter target months. The explicit 93-day maximum preserves the existing function guard. For T = 29 September 2026, H = 29 December 2026. Both recorded and projected rows must satisfy `T < due_date AND due_date <= H`; a charge on H is eligible and a charge after H is not.

Reuse `reporting_forecast_inputs_v1` and the **current V53** `forecast_schedule_v1(loan, charges, T, H)` in additive OLTP views. Do **not** bind directly to `reporting_forecast_events_v1`, whose existing report window stops at month-end. No horizon extension, moving-as-of calls, multi-year search or replacement schedule engine is needed.

Retain complete schedule inputs needed by the function, including existing paid and historical charges; apply the future display window to its results, not by prematurely deleting source occupancy/history. Reconcile its Recorded results to canonical residuals. Preserve positive recorded recovery/settlement amounts as specified in section 4.3 rather than blindly discarding every result with `eligible = false`; Exception/Notice rows belong in coverage, never monetary sums. Only eligible Simulated rows become projected obligations.

Aggregate same-loan/date positive results, then compute on that future event set:

```sql
-- Illustrative contract, not executable deployment SQL.
dense_rank() over (partition by borrower_id order by due_date)
  as borrower_due_date_rank
```

Return the union of rows within T + 7 or with `borrower_due_date_rank <= 5`, always also within `(T, H]`, deduplicated by loan/date. Include every row on each selected date; a row-count LIMIT must not drop ties. The seven-day screen is not restricted to five dates. SQL owns residuals/ranking and the UI reads the bounded union.

Fewer than five dates because of the horizon is a normal capped result, not automatically incomplete coverage. Say **Showing N due dates within 3 months**; distinguish that from invalid input or a blocked simulation. Out-of-window actual charges must never be appended after ranking. Leave existing reporting signatures, month-end windows and outputs unchanged; use targeted compatibility checks rather than rewriting V48/V53.

## 5. Proposed SQL and AppSheet objects

No new stored financial table or operational column is required. Propose three ordinary read-only views over the existing forecast inputs/function; implement through the next unreserved Flyway migration when authorized. SQL view columns are derived outputs, not a backfill to Loans or Charges. If implementation discovers a need for a stored table/column, explain the need and obtain the required owner approval first.

| Proposed SQL object | Contract / reason |
| --- | --- |
| `public.oltp_upcoming_charge_events_v1` | Bounded event rows shared by both screens. Stable unique text key; borrower/loan IDs; Due Date; remaining principal/interest/total; Basis; As Of Date; Horizon End; Calculated At; Within 7 Days; Borrower Due Date Rank; coverage designation. |
| `public.oltp_upcoming_charge_coverage_v1` | One row per borrower in the applicable source population, including borrowers with zero events or blocked forecasts. Counts/concise reasons for manual-only plans and invalid schedules, number of displayed dates, horizon end and as-of fields. Necessary to distinguish no dues within the cap from a missing forecast. |
| `public.oltp_upcoming_charge_context_v1` | One singleton row for the screen's date window and coverage summary; calculate from the same governed contracts. No independent monetary ledger or stored refresh job. |

Suggested event key: a namespaced, unambiguous encoding of immutable loan ID + ISO date, such as `uf1:<length>:<loan-id>:<YYYY-MM-DD>`. Do not include amount, rank, query timestamp, borrower name or Basis in the key. Ref Borrower must agree with the source loan's owner. Coverage key = immutable borrower ID; context key = constant `upcoming`. Do not use row numbers as AppSheet keys.

Grant only the required SELECT/EXECUTE permissions through the maintained database workflow. Pure helpers perform no INSERT/UPDATE/DELETE, notification or generation call. Explicitly configure all three AppSheet adapters as read-only even if PostgreSQL could consider a simple view updatable. No scheduler, materialization or extra integration service is proposed. Measure query/sync costs before introducing one.

Proposed AppSheet configuration:

| Object | Configuration |
| --- | --- |
| `Upcoming Charge Forecast` table | Bind events view; text key `Row ID`; `Ref Borrower` → Borrowers; `Ref Loan` → Loans; Date and Price types; no IsPartOf cascade; read-only. Map remaining proposed fields consistently. |
| `Upcoming Charges 7 Days` slice | Filter `[Within 7 Days]`; same necessary fields; read-only. |
| `Borrower Upcoming 5 Dates` slice | Filter `AND([Borrower Due Date Rank] >= 1, [Borrower Due Date Rank] <= 5, [Due Date] <= [Horizon End])`; read-only. The SQL source already guarantees positive future rows within three months. |
| `Borrowers.Upcoming Charges` virtual column | List of Ref to the borrower slice: `REF_ROWS("Borrower Upcoming 5 Dates", "Ref Borrower")`. Not a physical Borrowers column. |
| `Upcoming Charge Coverage` / `Upcoming Charge Context` tables | Read-only adapters over the other two views; do not show them as independent navigation pages. Borrower coverage Ref/list supplies the empty-state and issue text, including when no forecast event exists. |
| `Borrower Upcoming 5 Dates_Inline` | Position ref; source borrower slice; Table; Due Date ascending; SUM Amount Remaining; no data-change actions. |
| `Upcoming Charge Forecast_Detail` | Read-only detail and normal loan/borrower navigation; recorded component links can use loan/date selection from actual Charges. No synthetic Ref to a nonexistent Charge. |
| `Todays Collection Board` slice | Add new virtual forecast/coverage display members only. Preserve row filter, existing members, note editing and action configuration. |
| `Todays Collection Board_Detail` | Insert forecast and its conditional note at the position in section 3.2; preserve receipt section and all unrelated view properties. |
| New menu dashboard and children | Context detail + seven-day grouped table; no interactive selection that unexpectedly filters the portfolio total. |

Generated reverse Refs may appear on Loans/Borrowers when adapters are added. Inspect and hide redundant generated presentation; keep the explicitly scoped Collection list. Read back saved view configurations and regenerated slice membership.

Use existing Partner-language preference and bilingual label conventions for new display text. Reuse existing borrower and Loan Key labels; never build identity by parsing a display label. Do not modify existing internal object names.

### Access and freshness

Inspect actual current access/security filters; the inspected dictionary records blank table security filters, but that is not future authorization. Apply equivalent borrower visibility to event and coverage adapters. A Ref alone does not enforce access. If current access is row-scoped, make context counts/totals equally scoped or omit portfolio diagnostics; never expose hidden users' data through a singleton SQL aggregate.

Keep SQL as-of date and calculation time visible. A sync after midnight or source edits must reload the date-dependent SQL views even if no physical charge changed. Verify actual sync/cache behavior and configure these sources accordingly. Where separate table reads cross midnight, detect differing As Of Dates and prompt a fresh sync; do not combine mixed-day results. Offline screens retain the last synchronized forecast and context. Do not fabricate a live refresh timestamp with `NOW()`.

## 6. Dependencies and implementation sequence

1. Read the current continuation/release row and this handover. Recheck affected live Loans, Charges, Repayments, Borrowers, forecast functions, Collection slice/detail and app access. Confirm schema drift before using recorded formulas.
2. Record starting Git commit, preserve unrelated work, record restorable affected AppSheet versions and follow applicable database recovery procedure. Resolve the correct service account/profile and full DEV database identity. No browser routing was needed for this documentation task.
3. Build additive SQL and synthetic tests. Preserve existing reporting function contracts, signed settlement handling, generator dates/rounding and stable keys. Allocate migration number only now after inspecting current reservations/history.
4. Follow [database each-change procedure](../../database/README.md#each-change), including disposable migration rebuild/CI and affected tests; apply to verified DEV using existing runners. No production writes are implied by this handover.
5. Add the three read-only DEV OLTP sources, Refs, slices, views and lightweight virtual columns. Verify environment binding and generated changes; no ordinary Charges regeneration is needed merely to add a new view.
6. Verify both requested screens in the **current** editor/app GUI, including native mobile/desktop grouping, display totals, more-than-30-row case, sync and read-only behavior. Existing Collection receive/selected-charge actions and receipts need focused regression evidence.
7. OLAP has no planned source/config change. Verify shared SQL compatibility and affected report forecast output with targeted parity cases. If common functions or shared schema are changed, reconcile all affected OLAP/report consumers before readiness. Do not audit unrelated dashboards.
8. Update affected dictionary YAML (new adapters/views/slices, Borrowers virtual fields, Collection membership/order, SQL objects), index and validation. Update Solution Design/Model Overview to explain the new read-only operational forecast once implemented; record DEV differences, exact versions and release scope. Keep this design marked separately from delivered evidence.
9. Record outcomes and any native-layout adaptations in an adjacent implementation record; commit/push sanitized intended files. Both DEV editors must have zero configuration warnings/errors before readiness. No repeated deployment-mode toggle/check for already-Deployed apps.
10. Production is a later, explicitly authorized scope using the release's single promotion checklist, compatible SQL before PROD-bound RC verification, frozen RC/App Upgrade, limited production validation and documentation closure. Include the new sources in RC mapping. This design does not authorize production deployment.

## 7. Acceptance cases

Use synthetic fixtures and independently calculated expectations. The table is a test plan; **none of these runtime tests were executed for this design-only task**.

| Case | Required result |
| --- | --- |
| Window boundary | With T = 29 September, seven-day range is 30 September–6 October inclusive; exclude 29 September and 7 October. Month/year/leap transitions use dates correctly. |
| Borrower ranking | Multiple loans share dates; return first five distinct positive dates and every row on the fifth date. Portfolio seven-day and borrower five-date totals agree on their shared population/dates. |
| Three-month cap | With T = 29 September, include 29 December if among the first five dates, exclude 30 December. If only two dates fall inside the horizon, show two and never extend to find five. Repeat with month-end/leap-date arithmetic and assert every call fits the 93-day function guard. |
| Auto-off settlement | Irregular recorded dates/amounts remain exact; do not derive rows from nominal interval. Zero future entries show recorded-only coverage, not an invented plan. |
| Recorded precedence | Two real charges 120 and 80 on one loan/date produce one forecast row 200, no synthetic duplicate; two different loans remain separate. |
| Partial/prepayment | Charge 200 paid 50 leaves 150; fully prepaid row disappears but still suppresses projection. Signed reversal restores appropriate residual without double counting. |
| Projected → Recorded | Generation on the due date causes future row to leave both windows; existing Collection handles it. Pre-generation of the same future date replaces projected Basis at the stable key. |
| Daily schedule | Non-daily interval, anchor change and elapsed-day interest match current rules; no straight 7 × daily amount shortcut. |
| Principal path | Due-today/future scheduled principal reduces later daily interest at the frozen integer rate; old arrears are not assumed collected. No principal deducted twice. |
| Fixed/installment | Fixed due produces one event; installment remainder/final off-cycle due/initial charge and future-row rules match source. Nonpositive elapsed period is an issue, not a phantom bill. |
| Invalid schedule | Missing rate when needed, missing initial installment charge, invalid interval/date, inconsistent components or orphan parent yields visible incomplete coverage. Available amounts labelled partial; not a false zero. |
| Closed/defaulted | No simulated continuation; positive recorded future settlement obligations remain designated for review; negative accounting records are excluded. |
| Collection preservation | Today's totals, borrower selection, note editing, Receive All/selected-charge eligibility and receipt gallery still follow existing actual-charge logic. No future projection enters a payment form. |
| Visibility | Future-only borrower appears on portfolio screen; current Collection membership remains unchanged. Hidden Flag does not discard an obligation. Access-restricted rows and summary counts do not leak. |
| Native rendering | Correct order before receipts, date header sums, bilingual labels, mobile readability, row navigation and complete fifth-date contents with more than 30 rows. |
| Sync/offline | Advance business date and edit schedule/payment without changing other charge rows; full sync refreshes source views. Offline timestamps stay honest; mixed-day provider reads detected. |
| No writes / compatibility | Forecast reads change no financial table fingerprints; no notifications/generator runs. Existing reporting V48/V53 outputs unchanged unless an explicitly documented correction is separately accepted. |
| Performance | Record representative DEV SQL plans/times and before/after OLTP sync measurements, counts and fixture size. No invented latency threshold or claimed measurement. Resolve observed material regression before readiness. |

## 8. Recovery, completion and current verification

Implementation rollback: remove/hide only new menu/inline configuration and restore the prior Collection column order/virtual membership, using captured affected-app version as recovery. Preserve intervening features and existing receipt behavior. Compatible additive SQL views/functions can remain unused after app rollback; do not restore financial data for a display rollback. Later cleanup uses a reviewed higher migration, not modification of applied migrations.

Design rollback: remove/revert this handover and its dedicated change log; no live recovery needed. Pre-existing modified/untracked report work was preserved.

Completed for this task: repository/source-rule review, owner clarification on five distinct dates and the three-month maximum, official AppSheet grouping/ref-view capability review, detailed calculation/UI/object/test/recovery plan, local Markdown link/whitespace checks and scoped repository publication. Publication is verified separately in the final response. No live forecast measurements, app tests, database execution, owner acceptance of a running feature, release freeze or production readiness are claimed.
