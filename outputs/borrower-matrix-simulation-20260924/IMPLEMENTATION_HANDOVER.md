# Borrower reliability, matrix and payment health — implementation design

24 September 2026. **Design for owner review; no implementation or deployment authorization is implied.** This is the detailed handover accompanying the [methodology and simulation results](README.md). It includes the owner-requested borrower payment-health summary and its future OLTP integration. Proposed object/field names below are implementation targets, not existing objects verified in production.

## 1. Outcome and scope

Build one shared PostgreSQL calculation foundation for current arrears, historical payment behavior and reliability. Use it for the corrected borrower matrix and a read-only payment-health summary in OLTP. Portfolio Risks will later reuse the same arrears definitions. Retain existing providers and visuals while new results are compared and reviewed.

Included: additive SQL providers, borrower/charge field contracts, rating rules, matrix rules, OLTP summary/detail/navigation design, affected-consumer mapping and verification. Excluded: automated loan decisions, notifications, payment posting changes, debt write-offs, daily rating snapshots, replacement of Collection Monitor statuses and the paused Risks page redesign.

The existing fixed-snapshot simulation recommends 45/15/15/25 weights and produces 5 Star / 10 Cash Cow / 3 Question Mark / 4 Dog among 22 active borrowers. Ten have established history and twelve are provisional. These are reference results for that private snapshot, not permanent acceptance quotas for changing live data.

## 2. Existing source contract

| Existing object | Grain / relevant fields | Use |
| --- | --- | --- |
| `public."Borrowers"` | `Row ID`; Has Active Loan, Hidden Flag, Total Outstanding Principal | Stable identity, current matrix cohort and presentation context |
| `public."Loans"` | `Row ID`, `Ref Borrowers`; Loan Date, Close Date, Defaulted, Default Loss Amount | Charge ownership and distinct default facts |
| `public."Charges"` | `Row ID`, `Ref Loans`; Charge Date, Principal Due, Interest Due | Contractual obligation and effective due date |
| `public."Repayments"` | `Row ID`, `Ref Loans`, `Ref Charges`; Payment Date, Principal Paid, Interest Paid | Signed payment ledger; authoritative component coverage |
| `public."Payments"` / `public."Payment Allocations"` | Receipt and allocation records | Posting provenance where available; never an inner-join requirement that drops legacy repayments |
| Existing `olap_*_analytics` views | Charge, loan, borrower grains | Compatibility comparisons and existing consumer bindings |

Validate the repayment's loan equals its charge's loan. Do not multiply payments by joining receipt/allocation detail before aggregation. Do not use cached Paid/Closed status as proof of settlement. Closed/default processing and negative ledger adjustments must retain their real meanings.

This design is based on the captured V39 source and current repository definitions. At execution, verify the environment tuple and affected schema once, then reconcile actual changes. Never run historical scripts automatically.

## 3. Proposed database providers

Use ordinary read-only views initially, with no new stored business columns or snapshot tables:

| Proposed name | Grain / key | Responsibility |
| --- | --- | --- |
| `public.reporting_charge_payment_health_v1` | One row per existing Charge; `charge_id` | Component balances, historical timing, current overdue flags and quality flags |
| `public.reporting_borrower_payment_health_v1` | One row per existing Borrower; `borrower_id` | Aggregate current debt, behavior, rating, confidence, explanations and freshness |
| `public.reporting_borrower_matrix_v2` | One row per active Borrower; `borrower_id` | Signed economic contribution and quadrant, joined to the shared health rating |
| `public.oltp_borrower_payment_health_v1` | One row per Borrower; `Row ID` | AppSheet adapter using readable column names and Ref fields |
| `public.oltp_charge_payment_health_v1` | One row per Charge; `Row ID` | AppSheet adapter for governed overdue drill-down |

Dependency direction: physical tables → charge health → borrower health → matrix; AppSheet adapters select from health providers. No dependency on the legacy matrix score, and no circular dependency through existing analytics views. Compute the active cohort from the governed current borrower flag after validating its source definition.

Do not add a separate loan summary provider initially: the overdue detail can group charges by `Ref Loans`. Add one only if an actual consumer needs a loan-grain contract. View names include a version to permit comparison and rollback. Check for collisions before creating them.

Grant only the required SELECT access to the existing environment-specific AppSheet/reporting roles after inspecting those roles. Do not copy names or credentials from another environment. Underlying table permissions and app row access must remain consistent with existing access.

## 4. Calculation algorithm

### 4.1 Date, precision and ledger boundaries

Capture one statement timestamp T and derive D as its date in `Asia/Bangkok`. Use numeric arithmetic in SQL; no integer division or display rounding in classification. Method identifier: `payment-health-v1-review` during review, replaced by the accepted immutable method identifier at implementation freeze.

Historical ledger: Payment Date < D. Current ledger: Payment Date <= D, using committed rows visible to the query. Future-effective payments cannot cure today's arrears. T is the calculation timestamp, not a filter that invents creation timestamps for legacy repayments. Backdated corrections restate results; this is not a historical knowledge-time database.

Use epsilon 0.005 baht, matching the simulation. A component is covered when cumulative payment >= component due minus epsilon. Current remaining amount is `greatest(principal_due - principal_paid, 0) + greatest(interest_due - interest_paid, 0)`; count as unpaid when this total > epsilon. Preserve these precise conventions for parity, and explicitly test fractional-cent boundary cases because two sub-tolerance component residues can together exceed epsilon. If source precision permits such cases, resolve the tolerance policy and rerun affected simulations before adoption rather than silently changing it.

### 4.2 Charge history

An eligible historical obligation has a valid due date < D, nonnegative principal and interest due, and positive combined due. Zero/negative accounting obligations are excluded from repayment-success denominators, with an exclusion reason retained.

1. Aggregate signed repayment components per Charge ID and effective payment date.
2. Order dates and compute cumulative principal and interest independently.
3. On-time coverage is cumulative coverage of both components at the end of the due date. Later payments cannot turn a late obligation into an on-time one.
4. For settlement delay, use the start of the final uninterrupted sequence of fully covered daily balances before D. A later reversal that removes coverage resets settlement; subsequent full coverage starts a new sequence. If still uncovered before D, settlement date is NULL.
5. Historical delay is `greatest(coalesce(final_settlement_date, D) - due_date, 0)`. Grade: 0 days=100; 1=90; 2–3=70; 4–7=40; 8+=10.
6. Independently calculate the current component balances including today's visible effective payments. A matured positive obligation is currently overdue when remaining > epsilon. Current age is D minus due date; it is NULL when no current arrear exists.

An obligation paid on time and reversed later can retain its original on-time observation while showing reopened current debt and a longer final-settlement delay. Expose both facts. Do not rewrite the historical observation merely to make it agree with current status.

### 4.3 Borrower aggregation and score

Aggregate all owned loans, including closed loans for valid history. Never exclude unpaid balances solely because a loan is closed or a borrower is inactive. Current debt is independent of scoring-window membership.

| Component | Population / calculation | Nominal weight |
| --- | --- | ---: |
| Recent score | 100 × on-time obligations / eligible obligations due in `[D−30,D)` | 0.45 |
| Older score | Same calculation for `[D−180,D−30)` | 0.15 |
| Delay score | Average obligation delay grade for `[D−90,D)` | 0.15 |
| Current score | Oldest unpaid age: none=100; 1=60; 2–3=40; 4+=20; active default=0 | 0.25 |

For parity with the simulator, a recent default sets delay score to zero. This is in addition to the cap below; it is a policy rule, not an observed calibration result for active default-history borrowers, who are absent from the captured active cohort.

Absent historical components are NULL and their weights are omitted. `raw_score = sum(component × nominal_weight) / sum(available_nominal_weight)`. Return effective weights as nominal weight divided by the available total; an absent component's effective weight is zero. Cap final score at 60 when oldest unpaid age >7, an active default exists, or a recorded default close date falls in `[D−90,D]`. Active default follows the simulator's flagged loan open at D rule; inconsistent status/dates must raise a quality flag.

Display a score only when at least one recent eligible obligation exists and the history is usable. Otherwise rating status is Unclassified and published raw/final scores and band are NULL. The current-condition component and current debt remain available. This explicitly prevents the simulator's internal fallback number for an unclassified borrower becoming a customer-facing rating.

Established confidence requires >=3 distinct matured due dates and >=30 elapsed days since the first eligible matured obligation; otherwise Provisional when rated. Unclassified uses Insufficient history or Data review as its confidence/status explanation. High reliability means final score >=80; lower means <80. This is not default probability.

### 4.4 Default and invalid-data handling

Current write-offs modify charge dues; original obligations cannot be assumed from the resulting rows. Do not parse free-text Notes as authoritative history without a separately tested recovery contract. Proposed first-release behavior for any borrower with unresolved default-altered history: continue publishing collectible balances and explicit default facts, but set rating status `Data review`, score NULL and matrix category Unclassified. This conservative extension is not claimed as simulated on the inactive population; it requires owner review and new fixtures. When original obligations can be recovered reliably, compare the restored-history result separately before changing that policy.

NULL/invalid dates, invalid monetary inputs, broken ownership references or non-default negative due components produce attributable quality flags and prevent a potentially misleading rating for the affected borrower. Do not silently coalesce corrupt inputs to successful payment. If a defect prevents attribution or complete balance calculation, surface a provider validation failure and do not present incomplete debt totals as complete. Keep accounting exclusions distinguishable from data errors.

### 4.5 Matrix

For all active borrowers, including analytically Hidden borrowers, sum signed Interest Paid over `[D−30,D)`. Divide each by the sum over that same cohort, then multiply by cohort count to obtain relative contribution. High contribution >=1. A nonpositive portfolio total makes the matrix Unclassified; it does not invalidate an otherwise usable health rating.

| Contribution | Reliability | Category |
| --- | --- | --- |
| High | High | Star |
| Low | High | Cash Cow |
| High | Lower | Question Mark |
| Low | Lower | Dog |

Use uncapped relative contribution on X, final capped reliability on Y, outstanding principal as bubble area, and a distinct outline for provisional history. No category quotas. Inactive borrowers retain health summaries but have no matrix row. App visibility filters do not alter the shared contribution denominator.

## 5. Provider field contracts

All listed fields are proposed. IDs are text matching existing immutable keys; money/scores/weights are PostgreSQL numeric; counts and elapsed days are integer; flags boolean; dates date; `calculated_at` timestamptz. No JSON field is required in AppSheet.

### Charge health

| Fields | Contract |
| --- | --- |
| `charge_id`, `loan_id`, `borrower_id` | Unique charge key and existing parent keys |
| `due_date`, `principal_due`, `interest_due` | Current source obligation; never imply these are recovered pre-write-off amounts |
| `history_eligible`, `exclusion_reason`, `data_quality_status` | Eligibility and distinguishable accounting/default/error reasons |
| `principal_paid_current`, `interest_paid_current` | Signed ledger sums through D |
| `principal_remaining_current`, `interest_remaining_current`, `remaining_current` | Component-clamped residues and their sum |
| `is_overdue`, `overdue_amount`, `current_days_overdue` | Overdue flag; amount zero if not overdue; age NULL if not overdue |
| `on_time`, `final_settlement_date`, `historical_delay_days`, `delay_grade` | NULL for ineligible history; settlement NULL if unsettled; delay follows section 4 |
| `reporting_date`, `calculated_at`, `method_version` | Shared calculation context |

### Borrower health

| Fields | Contract |
| --- | --- |
| `borrower_id`, `has_active_loan`, `hidden_flag` | Identity and source flags; no borrower name used as a key |
| `overdue_principal`, `overdue_interest`, `overdue_amount`, `overdue_charge_count` | Sums/count of currently overdue charge facts; zero with no arrears |
| `oldest_overdue_date`, `oldest_unpaid_days` | NULL without arrears |
| `recent_obligation_count`, `recent_on_time_count`, `recent_late_count`, `recent_on_time_rate` | Rate is 0–1, NULL with zero denominator; late count = count minus on-time count |
| `older_obligation_count`, `older_on_time_count`, `older_on_time_rate`, `severity_obligation_count` | Older rate 0–1 or NULL; severity population count |
| `first_matured_due_date`, `distinct_matured_due_dates`, `history_span_days` | Confidence evidence; first/span NULL with no history, count zero |
| `recent_score`, `older_score`, `delay_score`, `current_score` | 0–100 components or documented NULL |
| `recent_effective_weight`, `older_effective_weight`, `delay_effective_weight`, `current_effective_weight` | Fractions summing to 1 when calculation is available |
| `raw_score`, `reliability_score`, `reliability_band`, `rating_status`, `confidence` | Status Rated / Unclassified / Data review; band High / Lower only when Rated |
| `severe_risk_guard`, `score_cap_applied` | Guard trigger separately from whether it actually reduced an available raw score |
| `active_default`, `recent_default`, `default_count`, `recorded_default_loss` | Distinct loan-based default context; aggregate each loan once |
| `current_health_status` | Data review if balances incomplete; otherwise Default flagged if active/recent default; otherwise Overdue if any arrear; otherwise No current overdue |
| `primary_reason_code`, `reason_text`, `data_quality_status` | Deterministic reasons below; no opaque generated diagnosis |
| `reporting_date`, `calculated_at`, `method_version` | Date/as-of/method context |

Primary reason priority: incomplete/altered data → active default → recent default → arrear >7 days → other current arrear → insufficient recent history → recent late payments → provisional history → no current arrears with observed punctuality. Return a short factual primary explanation; secondary detail retains all independent facts. No current arrears is never phrased as proof of perfect reliability.

### Matrix

Return `borrower_id`, `contribution_30d`, `active_borrower_count`, `portfolio_contribution_30d`, `contribution_share`, `equal_share`, `relative_contribution`, `reliability_score`, `confidence`, `quadrant`, `classification_reason`, `outstanding_principal`, and common context fields. Share/equal-share are fractions; relative contribution is a multiple, not a percentage. Preserve NULLs when classification is unavailable.

## 6. OLTP configuration and layout

### Tables and bindings

Register two new read-only logical tables: `Borrower Payment Health` and `Charge Payment Health`, bound to the matching `oltp_*_v1` views in the app's own environment. Set updates allowed to READ_ONLY; expose no Add/Edit/Delete actions. `Row ID` is a stable key, never a generated row number.

Borrower adapter: map `borrower_id` to both `Row ID` and `Ref Borrower` (Ref to existing Borrowers). Map health fields to readable names such as `Overdue Amount`, `Oldest Unpaid Days`, `Recent On Time Rate`, `Reliability Score`, `Rating Status`, `Confidence`, `Reason`, `Reporting Date`, `Calculated At` and `Method Version`. Preserve every remaining contract field as its corresponding readable title for detail/testing; document exact mappings in the dictionary at implementation.

Charge adapter: map `charge_id` to `Row ID` and `Ref Charge` (Ref to existing Charges), `loan_id` to `Ref Loans`, and `borrower_id` to `Ref Borrower`. Expose due date, component overdue amounts, current age, overdue flag and context. Use the original Charge Ref to navigate into existing charge detail; never create a second editable charge record.

App types: IDs/Ref as above, money Price, rates/effective weights Percent with source fractions, scores Decimal, counts/ages Number, flags Yes/No, dates Date and timestamps DateTime. Score display one decimal; money two decimals. Explicitly display NULL as unavailable, not zero.

Keep Borrowers' physical source intact. Proposed lightweight Borrowers VC `Payment Health Ref`: Ref to Borrower Payment Health, app formula `[Row ID]`, noneditable. The provider guarantees one row per borrower; missing matches show “Payment health unavailable — sync/review required.” Use dereferences for a small summary, not repeated SELECT scans over repayment history. Add the relevant fields to the existing Visible Borrowers slice and borrower-detail column order without discarding existing columns.

The recorded Visible Borrowers slice uses `NOT([Hidden Flag])`; it is a presentation filter, not proof of row-level security. Inspect the actual Borrowers security filter and copy its effective authorization to the summary and charge adapter, using borrower linkage. Do not rely on a Ref alone to hide unauthorized rows. Preserve current hidden-borrower navigation behavior; no new global navigation tab is needed.

### Borrower detail layout

Insert the payment-health section after identity/outstanding principal and before long related-record lists:

```text
PAYMENT HEALTH                    As of 24 Sep, 20:00
[Overdue • 3 days]                 [Provisional history]
Overdue ฿450.00       2 charges     Oldest due 21 Sep
Reliability 74.2 / 100 — Lower
On time: 16 / 20 obligations (80.0%), last 30 completed days
Oldest unpaid obligation is 3 days overdue.
[View overdue charges]            [Reliability details]
```

This is a synthetic layout example, not a production borrower/result. Use native AppSheet detail fields, Show headers, format rules and navigation actions; do not promise custom web-card rendering inside AppSheet. A compact list indicator is optional within this design, but the complete required surface is borrower detail.

Visual rules: red + alert icon for active default or arrear >7 days; amber + clock for other arrears; neutral gray + information icon for unavailable/insufficient data. No current overdue uses a calm neutral/check indicator; it does not turn the whole borrower card green if history is weak or limited. Label Provisional separately. Always show text so color is not the only distinction. Use the app's existing bilingual display-label convention; final Thai wording is reviewed in the GUI rather than invented as stored status codes.

### Detail and navigation

Proposed view names: `Payment Health Detail` (borrower summary Detail), `Payment Health Overdue` (charge-health Table/Deck), and `Reliability Components` (summary Detail with component/evidence fields). The health action from Borrowers uses `LINKTOROW([Row ID], "Payment Health Detail")`. Overdue action from health uses `LINKTOFILTEREDVIEW("Payment Health Overdue", AND([Ref Borrower] = [_THISROW].[Ref Borrower], [Is Overdue]))`; verify row context in the current editor and GUI. This deep-link filter supplements, and never replaces, access controls.

Overdue list sorts due date ascending, then loan/charge key; shows due date, loan label, unpaid principal, unpaid interest, total and age. Charge selection opens the original Charges detail through `Ref Charge`, using the existing detail view name discovered during implementation. Do not guess or rename that existing view. When no debt exists, show an empty-state message and zero summary; do not display due-today rows as overdue.

Reliability detail orders: final rating/status and confidence → reason/cap/default warnings → four component scores with effective weights → observation counts/history span → reporting date/method. BCG category remains optional secondary context outside the operational warning.

### Refresh and performance

SQL views update on query; AppSheet shows its last synced result. The design does not promise push updates or continuous real-time monitoring. Reuse existing sync behavior and test whether the payment-posting workflow refreshes these read-only tables; if not, label the need to sync rather than showing stale health as current. Do not add payment-triggered notifications or a new scheduler.

One statement uses one date/T. Separate app table queries can straddle midnight or a payment commit; carry context fields and test reconciliation after a complete sync. Benchmark representative query and full-sync time before/after in DEV, with row counts and repeated warm runs recorded. Investigate material regressions before enabling the surface. No performance improvement is claimed from a view alone. Any later cache requires payment-change and date-rollover refresh, a last-successful-refresh stamp and failure handling; it is a separate justified schema decision.

## 7. Verification matrix

These are required future checks, not newly executed tests. Use synthetic DEV/disposable fixtures; private captured PROD data stays outside Git.

| Case | Expected outcome |
| --- | --- |
| Due today, unpaid | No arrear and no historical observation; existing daily collection status can still be Not Paid |
| Yesterday due 100 principal +20 interest, paid 100+10 | Overdue 10, one charge, age 1, historical on-time false |
| Same due, paid 110+10 | Still overdue interest 10; excess principal does not offset it |
| Fully paid on due date | Historical on-time true; delay 0; no arrear |
| Yesterday due, fully paid today | No current arrear; historical on-time false; completed-day delay still reflects the pre-D position |
| Paid on time, later reversed | Current debt reopens when component coverage fails; original on-time observation and final-settlement delay stay distinct |
| Resettled after reversal | Final uninterrupted settlement starts at the later cure date |
| Eight-day arrear outside 90/180-day windows | Debt remains visible and severe guard triggers; no window silently drops old debt |
| No recent history / zero observations | Current debt available; published rating/band NULL and Unclassified; no perfect fallback rating |
| Multiple obligations on one due date | Separate obligation observations, only one distinct date toward confidence |
| No older history | Effective weights 45/85, 0, 15/85, 25/85 when other components exist |
| Default-altered history | Default/loss context retained; no write-off counted as successful payment; Data review policy exercised |
| Inactive borrower with debt | Health and debt visible under access rules; absent from active matrix |
| Nonpositive portfolio contribution | Matrix Unclassified; independently valid health rating retained |
| Boundary score 80 / relative contribution 1 | High side, using unrounded values |
| Hidden / unauthorized borrower | Presentation matches existing hidden behavior; unauthorized rows unavailable even through direct links |
| Midnight with no new transactions | Prior day's unpaid due becomes overdue after next query/sync; age increments |
| Receipt with several allocations / legacy repayment | No amount duplication; valid legacy repayments remain counted |
| Backdated payment correction | Current effective-date history restates; no claim of original knowledge-time reconstruction |

Also verify unique keys, complete borrower coverage, valid Ref chains, charge-to-borrower sums, component bounds, effective weights, deterministic reasons and no write permissions. Port/reuse all 28 existing synthetic tests and add the new summary/default/data-quality/UI cases. Compare SQL to offline output for the exact captured snapshot in an approved private analysis environment; expect the recorded 22-borrower results, while accounting explicitly for any reviewed policy extensions. Never force fresh live counts to match that snapshot.

## 8. Implementation sequence, compatibility and rollback

1. Obtain owner review of the methodology/results and this design before implementation. Explicitly confirm or revise the proposed unresolved-default-history suppression policy and monetary boundary behavior if relevant source values exist. No approval is inferred from requesting this document.
2. Read the current tracker: R026 is Open at this design date; use whichever release is the sole Open release at execution. Inspect affected consumers, actual roles, app bindings/security and current migration history. Allocate a higher unused migration only then; do not reserve V40 from an old checkpoint.
3. Capture rollback for assets actually changing: current Git commit, restorable DEV app versions, and database recovery under the existing procedure. Copy reports before any later report edit.
4. Implement additive SQL in a new immutable Flyway migration and focused SQL fixtures. Existing legacy providers remain unchanged. Register appropriate SELECT grants and run the maintained disposable migration checks, then DEV parity/quality/performance checks.
5. Add read-only tables, references, fields, views and actions to DEV OLTP; reconcile generated columns/Refs in both apps where affected. Test payment entry and changed navigation with the current GUI. Both apps must meet the repository's zero-editor-issues readiness rule.
6. Introduce a separately named review matrix/report provider after owner review; inspect the existing Metabase Borrowers/Risks/Borrower Insight and Data Studio bindings before any cutover. Compare at the same effective date and source snapshot. Do not silently repoint legacy consumers or publish the paused Risks redesign.
7. Update affected dictionary objects, release log/manifest, development differences and architecture explanation only where facts change. Keep this design/proposal distinct from the eventual deployed reference and retain sanitized test evidence.
8. Present DEV results for acceptance. Production changes use scoped authorization and the repository's current single promotion checklist, verified backup, exact SQL pins and RC/App Upgrade process. No production writes are part of this design task.

Rollback: revert app bindings/versions to captured baseline; retain unused additive SQL views where compatible. Do not drop existing providers or undo financial data to roll back this feature. SQL corrections use higher immutable migrations, never checksum repair. Old/new coexist until an explicit cutover; provider removal belongs to a later dependency-checked change.

## 9. Handover deliverables and remaining decisions

An executing model should deliver migration and fixture files, exact SQL/AppSheet field mappings, consumer/dependency evidence, DEV GUI results, private comparison output plus sanitized aggregates, performance evidence, dictionary/release updates and a concise owner review. None is claimed complete by this document.

Owner review remains for the scoring method, caps and borrower movements; first-release treatment of unreconstructed default history is now explicit above. App-specific existing view names, actual security expressions and role names are discovery tasks, not business-policy questions. Historical knowledge-time ratings and a persistent rating history remain out of scope.

Evidence: [simulation and methodology](README.md), [sanitized comparison](reliability-comparison.json), [simulator](../../scripts/analysis/borrower_matrix_simulate.py), [synthetic suite](../../scripts/analysis/test_borrower_matrix.py), and [analysis runner/privacy guide](../../scripts/analysis/README.md). No new simulation result is implied by the added implementation detail.
