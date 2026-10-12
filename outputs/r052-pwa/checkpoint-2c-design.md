# R052 checkpoint 2C — Collection board and charge reads

7 October 2026 (Asia/Bangkok). Agent A design; B application implementation; C independent tests; D permissions, infrastructure, release documentation and publication. Owner continuation authorizes this bounded Phase 2 slice. Starting PM commit `17e9a5fe02ca75b2176d8d5c5023d0e9957ec085`; application commit `130fd859b8ec776f195d5ba2f76d4c0019332785`. R052 remains Open. This design does not complete Phase 2 or authorize production/financial changes.

## Deliverable and stopping point

Add authenticated, read-only Collection navigation: globally status-grouped borrower board and borrower-scoped, paginated today's collection charges. Reuse the pinned owner grant, persistent Firebase sign-in, current exact DEV identity and Partner mapping. Preserve the accepted neutral surfaces, branded header, original OLTP logo, readable bilingual typography, desktop 40/60 independent panes and mobile separate list/detail pages.

Stop after independent tests, scoped DEV deployment, sanitized smoke, documentation/publication and a concrete owner visual review. Do not proceed into receiving, receipt access/upload, upcoming forecasts, schedules, financial commands, new schema or production. Phase 7 Metabase enhancements remain post-go-live. D updates the overall progress overview at session closeout, distinguishing designed/implemented/tested/deployed/owner-accepted.

## Evidence and reconciliation

Sources below are current maintained, dated recorded definitions, not a fresh AppSheet GUI audit:

- `Documents/Data Dictionary/systems/appsheet/oltp/tables/borrowers.yaml`: R051-backed Todays Collection Charges, Daily Collection Status, Todays Amount Due/Collected/Remaining, Daily Collection Status - Order.
- Same directory `charges.yaml`: Payment Received Today; physical Payment Status, Payment Date, Amount Remaining, Total Paid.
- Same directory `repayments.yaml`: Amount Received = Principal Paid + Interest Paid; Payment Amount Today = IF(Payment Date = TODAY(), Amount Received, 0).
- OLTP `slices/todays-collection-board.yaml`: ISNOTBLANK(Daily Collection Status), with no Hidden Flag predicate.
- OLTP `views/collection-7b790708.yaml`: borrower TE label, remaining secondary value, collected summary, ascending status-order grouping; no specified within-group sort.
- OLTP `views/charges-inline-2cc781ad.yaml`: descending Charge Date, remaining and Total Paid presentation.
- Application `database/migrations/V12__charge_loan_materialized_balances.sql`: SQL-owned physical charge balances/status; a closed loan can produce paid status with null Payment Date. Do not recalculate these balances/statuses from browser values.
- `database/migrations/V22__olap_analytics_views.sql` has a different Collection amount-due aggregation (charge Amount Due). It is not the current OLTP amountDue contract and must not be substituted. OLAP health/forecast providers also do not establish this operational board's membership.

D independently verified exact DEV V77 metadata during this checkpoint: the proposed eleven additional columns exist with the types below; existing foreign keys/indexes support charge ownership and repayment aggregation. Aggregate-only checks found zero unknown/null charge statuses, zero missing charge dates, zero null Amount Remaining/Total Paid and zero null principal/interest components on charge-linked repayments. No business rows were captured and no grants were applied by that inspection. This is bounded current quality evidence, not a permanent invariant.

## Governed read formulas

Use one server transaction instant T and Bangkok business date D = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date. Device timezone/date and request query never choose D. Return T as an ISO instant and D as YYYY-MM-DD.

A charge belongs to the borrower through Charges.Ref Loans -> Loans.Row ID -> Loans.Ref Borrowers -> Borrowers.Row ID. Its Collection membership is exactly any of:

1. Payment Status is not `ชำระแล้ว` and Charge Date <= D.
2. Payment Status is `ชำระแล้ว` and Payment Date = D.
3. At least one related Repayment has Payment Date = D.

This population includes historical outstanding charges, completed activity and future-dated charges with repayment today. It is not simply a positive residual filter. Hidden borrowers remain eligible here; keep the existing Borrowers-directory Hidden Flag IS FALSE rule unchanged. Collection access does not create a hidden-borrower bypass into the directory routes.

Aggregate repayments per charge before joining borrower/charge totals, so multiple repayments and charges cannot multiply amounts. A repayment's Amount Received is Principal Paid::numeric + Interest Paid::numeric. Payment Received Today sums this expression only for Payment Date = D. Null repayment date is not today. No Payments join, Posted filter, positive-only filter or inferred transaction-grain substitution is supported by these AppSheet expressions.

For each borrower's eligible charges:

- Collected = sum of Payment Received Today.
- Remaining = sum of physical Amount Remaining for eligible charges whose Charge Date <= D.
- Due = Collected + Remaining, exactly the current OLTP expression.

Use PostgreSQL numeric arithmetic and canonical decimal strings across JSON. Preserve signs and source precision; do not clamp negative corrections or convert to floating point for arithmetic. Empty sums are zero. If a relevant today's repayment has a null principal/interest component, its receivedToday and dependent collected/due totals are null. A null relevant Amount Remaining propagates to remaining/due. Null Total Paid is displayed unavailable. Never silently sum only known components and present a complete total. UI number conversion is presentation only; display baht with the existing currency helper, preserving meaningful cents.

Daily status calculation, after validating source status values:

1. No eligible charges: no board row; detail returns generic 404.
2. Any eligible charge dated before D and not paid: `overdue`.
3. No eligible pending or partial charge: `fully_paid`.
4. Any partial charge, or a mixture of paid and pending: `partially_paid`.
5. Otherwise: `not_paid`.

Exact physical mappings: `รอชำระ` pending, `ชำระบางส่วน` partial, `ชำระแล้ว` paid. Display order differs from calculation precedence: not paid, partially paid, overdue, fully paid. Use recorded Thai meanings ยังไม่ชำระ, ชำระบางส่วน, เกินกำหนด, ชำระครบ alongside the existing language switch.

Validate all connected candidate charges before eligibility: whole board scope for board reads, requested borrower scope for detail. An unknown/null Payment Status or missing/invalid Charge Date produces sanitized `source_unavailable`, not false paid status or silently incomplete results. This intentionally makes malformed source data visible as an unavailable read; current bounded DEV quality checks found no such blockers. A paid charge's null Payment Date is valid; that equality branch is false and other eligibility branches remain available. A charge without a valid loan/borrower dereference has no board membership. No source repair is part of this slice.

## API, ordering and access boundary

- `GET /api/collection?limit=25&cursor=...` returns metadata and a bounded borrower page.
- `GET /api/collection/:borrowerId/charges?limit=25&cursor=...` returns the current Collection borrower summary and a bounded eligible charge page. No unbounded embedded child list or separate loan-history access is introduced.
- Default page size 25, maximum 100, strict input validation. No new search/filter contract is needed in this checkpoint.
- Board order is globally computed status rank 0..3, then immutable borrower Row ID COLLATE C ascending. This tie-breaker is a reversible implementation choice because AppSheet records no within-group sort.
- Charge order is Charge Date descending, then immutable charge Row ID COLLATE C ascending. Validate dates before ordering.
- Versioned canonical base64url cursors bind resource kind, businessDate and exact ordering tuple; charge cursor additionally binds borrower ID. Reject malformed, noncanonical, wrong kind/parent or impossible tuples with 400. Parameterized SQL only.
- If a cursor's date differs from current D, return 409 `business_date_changed` without rows. UI clears that Collection state and offers first-page Refresh; it must not combine yesterday and today.
- New Collection calls use REPEATABLE READ READ ONLY to keep quality guard, summary and detail consistent within a request. Reuse existing exact database/runtime identity and unique Partner mapping checks. Do not change existing Borrowers/Loans transaction behavior unnecessarily.
- Pagination is a fresh read per request, not a retained snapshot. Concurrent AppSheet edits can change rank/membership between pages; show read time and provide first-page Refresh. Do not promise no skips across changing datasets. Stable-data pagination must have no duplicates/skips.
- Every list/detail request repeats the verified owner/UID/revocation and Login Email gate before business SQL. Unknown/nonmember borrower returns generic 404. Auth denial returns no business data. Existing server error redaction/cache prevention remain.

## Projection and least privilege

Board/summary DTO: internal id; displayName using exact existing Borrower - TE formatter; status; amountDue, amountCollected, amountRemaining. Financial values are decimal strings or null. Metadata includes businessDate, timezone Asia/Bangkok, asOf, nextCursor. No page sum is labelled as a whole-board or whole-group total. Whole-group aggregates are deferred; the grouping itself is global.

Charge DTO: internal id and loanId; loanDisplayKey from the existing governed name/principal/date/original-rate formatter; chargeDate; paymentStatus; paymentDate; amountRemaining; totalPaid; receivedToday. Internal keys are never displayed as labels. Child queries prove the borrower, loan and Collection membership independently. No raw receipt URLs, accounts, Partner fields, auth claims, contact details or unrestricted notes are added.

Reuse existing Borrowers/Loans/Partners column privileges. Exact new SELECT-only delta:

| Table | Columns | Verified types/nullability |
| --- | --- | --- |
| Charges | Row ID; Ref Loans; Charge Date; Payment Status; Payment Date; Amount Remaining; Total Paid | Row ID text NOT NULL primary key; all remaining fields nullable: Ref Loans text, Charge Date date, Payment Status text, Payment Date date, Amount Remaining numeric, Total Paid numeric |
| Repayments | Ref Charges; Payment Date; Principal Paid; Interest Paid | nullable text, date, money, money |

Existing indexes: charges_loan_date_idx(Ref Loans, Charge Date DESC); repayments_charge_idx(Ref Charges). D owns the maintained grant-tool plan, ACL recovery capture, review, scoped application and effective privilege verification. Expected total projection privileges increase 26 -> 37 columns only if final code actually needs all eleven. No full-table SELECT, new function EXECUTE, schema change, production privileges or financial writes. D must verify final source/plan agreement before deployment.

## UI and independent acceptance

Borrowers and Collection are separate navigation destinations and state scopes. Preserve persistent SDK auth and fresh API reads; do not cache business data. Route/parent/account changes abort pending requests and reject late responses. Authentication failure clears all data; ordinary child failure preserves only still-authorized parent context. Collection date rollover clears Collection state and requests refresh.

Board cards show the borrower TE label, status, remaining and collected; selected detail shows distinct due/collected/remaining and `Today's collection charges`. Explain this list includes earlier outstanding charges; do not label all charge dates as today. Paid zero rows stay visible. Keep neutral section/group bands and existing mobile Back behavior, independent desktop scroll, explicit page/loading/end feedback and no raw IDs. Do not render receiving buttons, receipt thumbnails or upcoming-charge placeholders as if functional.

C tests actual query semantics with isolated synthetic PostgreSQL fixtures where available, plus handler/UI tests; regex/source checks alone do not prove aggregation:

- Each of three eligibility arms, future repayment-today, fully paid zero, hidden Collection member versus directory exclusion, no eligible charges.
- Overdue precedence; all paid; all pending; partial; paid/pending mix; status display order distinct from precedence.
- Multiple charges and multiple repayments without multiplication; signed corrections; null relevant money; empty sums; amountDue equals collected+remaining rather than original due.
- Unknown/null status and missing date cause unavailable; null paid date is permitted; non-today/null repayment date excluded from today's sum.
- More than 25 borrowers and charges, tied dates/ranks, strict cursors, parent substitution, first/end pages, same-data traversal with no duplicates/skips.
- Bangkok midnight rollover, including device timezone disagreement; 409 no stale mixed-day rows.
- Unauthenticated, wrong owner/UID, revoked, unmapped/duplicate Partner, wrong environment: no business query/data. Foreign borrower/charge linkage cannot leak through the detail route.
- EN/Thai desktop/mobile, long Loan Keys, non-overflowing neutral cards, route/parent/logout race protection, available/unavailable/empty/zero/negative displays. Existing persistent-auth behavior remains intact.

No business ambiguity currently requires owner input. Remaining implementation prerequisites are D's final source/provider/privilege review, B's exact query implementation and C's independent checks. Current source semantics are recorded evidence; claim fresh AppSheet parity only if an actual targeted GUI comparison is subsequently performed.

## Owner refinement — stable feedback, compact charges and upcoming summary

This addendum supersedes the earlier exclusion of upcoming reads for this checkpoint only. Owner explicitly requested the addition after the initial 2C preview. Baselines supplied for this batch: application c5f76024730f6b3b181de5b339955fb84ee50167, PM b1a6dba4cce07f55e6ac42ec98bdd69f6d86ae9e. Existing unrelated DNS/layout-plan/progress edits are outside A/B/C ownership and must be preserved. Financial writes, receipt access, standalone portfolio forecast navigation and production remain excluded.

### Presentation fixes

Current OLTP Charges_Inline specifies Charge Date descending, Amount Remaining secondary and **Total Paid** summary. Therefore the compact actual-charge row contains only Charge date, Amount received (existing physical `totalPaid`, lifetime amount), and Amount remaining. Do not substitute `receivedToday`. Clicking the row opens a local detail view containing the already-authorized DTO's Loan Key, dates, payment status, Total paid, Received today and remaining. This introduces no new actual-charge endpoint or privilege. Preserve the page/read timestamp; a local click is not a fresh read. Back restores the charge page and scroll. Clear selected charge on parent/page/refresh/auth/error invalidation. Mobile uses a separate detail page; desktop replaces the detail pane.

Replace the conditional Loading Collection paragraph above the grid with a permanently reserved status slot in the page header/toolbar. Reserve icon/text dimensions in idle/loading/completed/error states. Spinner plus Loading while the current request batch is pending; check plus Updated only after that batch succeeds; a distinct failure indication on error. Never signal payment completion. Use polite live status, aria-busy on the affected region, and a static icon under prefers-reduced-motion. Cancelled/stale responses cannot change the indicator. Selecting a borrower loads charges and upcoming summary within one generation; Updated waits for both, while a partial failure retains successful sibling content and offers a scoped retry. Header insertion/removal must not move the grid. Preserve existing typography, neutral surfaces and branding.

### Current upcoming source, not a new calculation

Latest governing AppSheet layout is R049, reflected in maintained production dictionary objects and `outputs/r049-upcoming-summary/HANDOVER.md`; its historical pre-promotion wording is superseded by current production dictionary evidence. Collection detail shows **Upcoming Charges Summary** after today's charges, then the issue-only note. It no longer displays the superseded R048 flat forecast list by default. The summary has exactly Date / Total Charge; tapping a date opens loan/amount/basis details.

Read existing `public.oltp_upcoming_charge_summary_v2`, `public.oltp_upcoming_charge_events_v1` and `public.oltp_upcoming_charge_coverage_v1`. V54/V56 and the current Borrower Upcoming Summary/Borrower Upcoming 5 Dates slices govern membership:

- First five distinct future due dates across every loan of the borrower, within the earlier of three calendar months and 93 days from the provider's Bangkok reporting date.
- Include every loan on the fifth date; paginate events, never truncate that date to five loans or one page.
- Existing recorded residuals take precedence; auto-charge-disabled loans contribute recorded settlement charges only. The existing forecast engine governs projected occurrences, paid amounts and review/unsupported schedule cases. Do not reproduce these rules in the browser or add new financial rows.
- Summary Total Charge is the existing provider's aggregate, not a sum of the visible detail page. Source decimal precision is retained; upcoming amounts display whole baht, matching AppSheet.
- Basis is explicit: Recorded / บันทึกแล้ว; Recorded settlement / รายการชำระที่บันทึกแล้ว; Recorded - review status / บันทึกแล้ว - ตรวจสอบสถานะ; Projected / คาดการณ์. Unknown basis is unavailable, never silently projected. The explanation that projected amounts assume scheduled principal is collected on its due date may be a short persistent section description; ordinary coverage diagnostics remain hidden.
- `Review Loans > 0` yields the existing issue message: “Schedule data is incomplete or loan status needs review.” / “ข้อมูลตารางชำระไม่ครบถ้วนหรือสถานะสินเชื่อต้องตรวจสอบ”. Empty forecasts are allowed and can coexist with this warning. Normal auto-off/empty coverage does not become an error or verbose diagnostic.

D verified DEV V77 metadata and matching V54/V56 history checksums. All three views are owned by postgres with default owner-rights relation permission checks. Their forecast function is pure JSON/date IMMUTABLE SECURITY INVOKER, with no business SQL writes; its pure daily_interest_basis dependency already has effective EXECUTE. olap_reporting_date uses CURRENT_TIMESTAMP in Asia/Bangkok, matching the request transaction date. Nonexistent-parent aggregate execution samples were below five seconds; this is not representative real-borrower latency proof.

### Endpoints, scope and dates

Add `GET /api/collection/:borrowerId/upcoming?businessDate=D` and `GET /api/collection/:borrowerId/upcoming/:dueDate?businessDate=D&limit=25&cursor=...`.

Every request repeats verified owner/UID, unique Partner mapping, exact DEV identity and REPEATABLE READ READ ONLY. Reuse current Collection quality/membership logic for the parent, including hidden borrowers; no general Borrowers-directory bypass. Parent must currently have eligible Collection charges. Missing/nonmember parent returns generic 404, authorization failure clears all business state.

D is required and validated as a real date in 0001..9999; malformed query is 400. Compare it with the current transaction's authoritative Bangkok business date; mismatch is 409 business_date_changed with no rows. Coverage must contain exactly one parent row and a valid horizon; missing/malformed coverage is 503. Coverage/provider As Of Date must match D; mixed dates yield 409 and a Collection refresh. Return current asOf/businessDate metadata. Do not combine yesterday's summary with today's details.

Summary query selects the named summary V2 columns for this parent and D and requires an event with matching parent/date/as-of, Borrower Due Date Rank between 1 and 5, Due Date > D and Due Date <= Horizon End. Sort Due Date ascending. Return all at-most-five dates; if the provider violates that cap, report unavailable rather than silently truncating. No summary cursor is needed.

Date detail first verifies the requested date is in that allowed summary. Query only matching parent, D, due date, rank/horizon event rows and join the existing Loans/Borrowers ownership chain for Loan Key. Order Ref Loan COLLATE C ascending, then event Row ID COLLATE C ascending. Default 25/max100; canonical cursor binds version, resource kind, parent, businessDate, dueDate, last loan ID and event ID. Reject cross-parent/date/kind cursors with 400. Preserve all events across pages. Source reads remain live per request; changing schedules can require a first-page refresh.

Summary DTO: items {internal id, dueDate, totalCharge}, horizonEnd, reviewRequired and standard read metadata. Date-detail DTO: dueDate, totalCharge for the whole date, items {internal id, internal loanId, loanDisplayKey, principalRemaining, interestRemaining, amountRemaining, basis}, nextCursor and metadata. No raw IDs on screen. Null monetary values remain unavailable, never false zero. Unknown/invalid source dates, identifiers, basis or numeric encoding produce sanitized unavailable errors.

Selecting a summary date opens the scoped detail list, with Back restoring borrower summary/scroll. Upcoming requests participate in the existing abort/generation boundary. 401/403 clears all; 409 clears Collection; parent 404 clears selected context; a missing selected future date clears that drilldown and offers summary refresh. A 503 clears failed child data, retains independently authorized sibling data and displays retry. Do not label estimates as booked charges or offer receiving/edit actions.

### Exact additional permission plan

D owns reviewed plan/application/recovery. Existing 37 base-column privileges remain unchanged. Required additional view-column SELECT only:

- summary_v2 (5): Row ID, Ref Borrower, Due Date, Total Charge, As Of Date.
- events_v1 (10): Row ID, Ref Borrower, Ref Loan, Due Date, Principal Remaining, Interest Remaining, Amount Remaining, Basis, As Of Date, Borrower Due Date Rank.
- coverage_v1 (4): Ref Borrower, As Of Date, Horizon End, Review Loans.

Also required: EXECUTE on the existing pure `public.forecast_schedule_v1(jsonb,jsonb,date,date)` only. No broader underlying table SELECT, full-view grant, mutating routine EXECUTE, PUBLIC grant, schema change or production access. D must verify effective runtime privileges and preserve exact prior ACL recovery before applying. New view ownership does not permit returning fields outside the DTO.

### Acceptance additions

C independently verifies stable grid/header geometry across loading/success/error and reduced-motion, stale-response suppression, compact actual-charge columns using Total Paid when it differs from receivedToday, local detail/back/page preservation, and mobile/desktop bilingual layouts. SQL tests use the existing providers or disposable migrations/fixtures to prove first-five distinct dates, all loans on the fifth date across multiple pages, exact summary/detail totals, recorded/projected and auto-off behavior, paid-date removal, empty/review coverage and the three-month/93-day boundary. Test hidden Collection parent, foreign parent/date/cursor rejection, denied access before business SQL, mixed/rolled-over Bangkok dates, unsupported basis/source data, nullable money, partial child failures and no writes. Do not claim AppSheet live GUI parity from saved definitions alone.

Stop at this same refined 2C DEV visual checkpoint. D updates PWA_Progress at closeout and publishes only this task's intended files; unrelated pending edits remain excluded. Full Phase 2 completion and production acceptance are not implied.

Coverage validation clarification: Review Loans must be a nonnull integer >= 0; Horizon End must equal the earlier of (D + interval '3 months')::date and D + 93, inclusive. Missing/malformed coverage is unavailable, not a genuine empty forecast. Valid coverage plus zero summary rows is empty; Review Loans > 0 still shows the issue. If a selected date disappears, clear only that drilldown and refresh the summary; a subsequent summary 404 establishes that the parent has left Collection and clears its context.

Source-review refinement: the event view's Horizon End column is not used. Queries use the independently validated coverage horizon for the same transaction business date, so remove that unused privilege. Final delta is 19 view-column SELECT privileges (5 summary + 10 event + 4 coverage), taking 37 existing base columns to 56 total, plus the one pure forecast_schedule_v1 EXECUTE. No underlying table privilege is added. Reviewed source preserves first-five membership, whole-date provider totals, all fifth-date events through keyset pages, and the existing financial engine.

## Owner refinement — compact application shell and faster upcoming drilldown

Owner feedback continues the same 2C checkpoint. Baselines: app e1bdb400206905a009653c4fe235ab718cba61a9, PM 33a04fb14569db5ee182001269310f75465a8f39; API00007-st5 / Hosting7364ee7db2ffe012. DNS work is not authorized here. Preserve unrelated DNS/layout documentation edits; D coordinates only the explicitly requested UI scope and intended publication.

### Settled UI contract

The loading/completed/error indicator must be **inside the orange main topbar**. The previous Collection-toolbar placement is superseded. Lift the current Collection request status to the shell using a lifecycle-safe callback; reserve its icon/text area so request transitions do not change layout. Keep polite announcements, reduced-motion behavior and current-generation success/error rules. Reset on navigation/auth changes; stale component callbacks cannot mark a new screen complete.

Use a compact topbar with original logo, current view title (Collection/Borrowers), small DEV identification, status and language/sign-out controls. Remove the giant duplicated page heading, authentication subtitle, separate DEV strip, horizontal view tabs and long routine instructional text from the primary content flow. Move optional explanations to an information disclosure; retain short financial-source labels, error messages, freshness and pagination controls where useful. Do not shrink readable text to fit.

Desktop: narrow left vertical Borrowers/Collection menu, clear selected state, remaining width allocated to the current neutral workspace. The shell fills the viewport; list/detail panes independently scroll in the remaining height, preserving the accepted 40/60 relation where space permits. Avoid a fixed large subtraction that leaves unused vertical space. Mobile: menu toggle opens an accessible modal drawer with focus containment, Escape/backdrop dismissal and focus return; close after selection. Preserve separate list/detail pages and usable touch controls. No new theme, logo or auth behavior.

Actual charge detail omits Payment Date when the value is null/unavailable. A real date remains visible. Compact actual-charge received amount remains Total Paid; no financial formula changes.

### Measured diagnosis and bounded improvement

D measured the existing source path on the verified DEV database using the established operator connection, returning only sanitized timing/count metadata. No owner token was retained and runtime impersonation was unavailable, so these are SQL/source measurements, not browser/API/IAM/revocation/network/cold-start timings. Cache warmth was uncontrolled.

- Summary: five source queries, 515.81 ms total; clock4.96, quality6.31, Collection membership9.35, coverage150.21, summary339.52 ms.
- Date detail: seven source queries, 805 ms total; clock2.73, quality6.43, membership7.13, coverage145.51, summary306.32, basis152.42, detail155.33 ms.
- Summary plan shows two forecast_schedule function scans in separate materialized raw expansions; borrower filtering is downstream. Existing source separately expands events through summary_v2, summary membership, basis validation and detail projection.

An actual-charge click is already local display of an authorized DTO. Upcoming date selection currently performs a fresh verified API request and these repeated forecast reads; the two interactions have different costs. Do not claim that all perceived delay is SQL or that sign-in/revocation checking has been measured.

Implementation remains entirely within API/PWA code and existing privileges:

1. After unchanged clock, source quality, current Collection membership and coverage/date gates, execute one statement with a scoped events AS MATERIALIZED CTE. Reuse those rows for allowed-date membership, basis validation, loan-owned projection and keyset paging, while retaining unchanged summary_v2 Total Charge values. No new schedule algorithm, SQL view/migration, table, privilege, infrastructure capacity or financial write.
2. This removes separate basis/detail forecast expansions: the date path becomes five source queries rather than seven, and four event-provider expansions become two (one materialized events source, one inside canonical summary_v2). Coverage remains independently governed.
3. The summary response also includes the first 25 detail rows for each of its at-most-five dates, with the existing detail DTO and nextCursor. Use a 26th-row sentinel per date; expose no more than125 detail DTOs. Compute them in the same statement/transaction, not five additional forecast/API requests. Whole-date totals still come from summary_v2; never sum only the preloaded page. Existing fifth-date completeness continues through the cursor.
4. Preserve strict quality, basis, null/decimal, parent, owner and date validation. If a bundled source cannot be represented safely, return sanitized unavailable rather than a falsely complete preview. Direct detail requests remain available for explicit refresh, continuation or preview fallback.

### Memory preview validity

Only the current Collection component holds the bounded preview set, scoped to current verified-user generation, selected borrower, businessDate and summary asOf. No business localStorage, IndexedDB, service-worker cache or server cross-user cache is added.

Ordinary first-date selection may use a preview for at most60 seconds after response receipt (a monotonic elapsed timer is preferred), only while identity/parent/date scope still matches. Compare the current device's Bangkok date as a conservative additional invalidation; the server remains date authority whenever a request occurs. Retain the original read timestamp. A local click is an already-read display, not a fresh server authorization or revocation check, exactly as with the existing actual-charge detail. Do not show a new Updated timestamp for it.

Clear previews on parent/route/account/auth change, explicit refresh, failed fresh access, business-date/409 change and hidden-to-visible tab resume. Next-page and explicit first-page Refresh always call the server and invalidate the old preview set. Expired/missing/mismatched preview falls back to the consolidated authorized endpoint. No polling or speculative five-request background refresh is introduced. All real requests retain current owner/UID/revocation and Collection membership checks.

### Verification and closeout

C verifies the indicator is a descendant of the orange topbar, stable geometry, readable bilingual navigation, drawer keyboard/focus behavior, independent viewport scrolling, null Payment Date omission and unchanged actual-charge amount meaning. SQL tests verify consolidated output equals the canonical provider and prior accepted semantics, including all fifth-date pages, whole-date totals, malformed basis/nulls and parent/date/cursor guards. Browser tests verify no extra request for a valid preloaded first page; fresh fallback after expiry, date change, visibility resume, refresh or account change; and stale-response isolation. No business records persist to browser disk.

D repeats the same bounded operator source timing protocol against the final implementation and records actual results. Initial summary latency/payload must be assessed alongside the improved drilldown; query-count reduction alone is not a speed claim. Retain the stated measurement limits and do not assert a universal latency guarantee. D updates the mandatory overall progress record and publishes only intended files. Stop again for the owner's refined 2C visual review; full Phase 2 and production remain unaccepted by this work.

Final bounded source review: optimized queries preserve owner/Collection membership, transaction date, coverage/horizon, canonical summary_v2 totals, basis/ownership guards and date-bound cursors. Responses contain at most five previews of25 DTOs; local opening retains the original asOf and does not emit a new Updated state. Monotonic60-second expiry, Bangkok-date comparison, visibility, parent/route/auth and fresh-request invalidation are present. Status is now a descendant of the main topbar; null actual-charge Payment Date is omitted. Browser assertions remain C's independent responsibility.

D's after sample: initial summary672.52 ms/five queries versus515.81 ms/five queries before; fresh detail476.14 ms/five queries versus805 ms/seven queries before. The additional initial response work buys bounded local first-date previews; it did not make initial loading faster in these samples. Exact same-parent identity was not retained, cache warmth was uncontrolled, and these are operator SQL/source timings rather than Cloud Run/auth/network measurements. Treat them as bounded observations, not a benchmark or guaranteed improvement. Query counts are observed; forecast-expansion reduction is source/plan evidence unless separately measured. C must independently confirm zero additional HTTP requests for a valid local preview click.

Latest owner navigation refinement: desktop left navigation must expand/collapse like AppSheet. Use a small toggle with changing accessible Collapse navigation / Expand navigation labels (localized), aria-expanded and aria-controls referencing the stable menu ID. Expanded width approximately180–200px; collapsed64–72px, returning space to the existing40/60 panes. Reuse existing app Borrowers/Collection SVG icons; no new icon/framework dependency. Icon-only buttons retain accessible labels and title tooltips, aria-current and a clear selected indicator, keyboard access and44px targets. Visually hidden labels remain available to assistive technology. Default expanded; ordinary component UI state is sufficient. Existing mobile modal drawer remains and the desktop collapse control does not replace it. C verifies both desktop states, focus and resize behavior. No business-data persistence is added.

Follow-up paired measurement from D uses the same privately retained parent/date: old summary491.36 ms/five queries and detail842.44 ms/seven; new summary482.67 ms/five and detail551.57 ms/five. One connection, old then new, uncontrolled cache: indicative SQL-only evidence, not HTTP/auth/cold-start proof. New snapshot plans show two forecast scans with scoped_events reused; see D's upcoming-latency-paired.json and upcoming-latency-plan-after.json. This paired comparison is more directly comparable than the preceding unpaired samples, while remaining a bounded observation.

## Owner refinement — mobile account menu and frequent-view navigation

UI-only continuation from app a357435230cbbaa6be084b1b17363bfacd1483f6 / PM a819c23e5dd5c8284113b92ec1540a93f5ed9870. Remove the visible DEV Read only line. Orange header contains the compact logo/view title, menu toggle where needed and icon-only status; move language and sign-out into the menu/sidebar. Preserve localized visually hidden live status text, decorative icons, fixed geometry and reduced-motion behavior.

Use one shared navigation definition: existing Borrowers then Collection, both provisionally frequent. Support up to five frequent views later without placeholders or unimplemented routes. Signed-in mobile renders frequent views only in a fixed bottom bar, omitting them from the drawer. The drawer contains language/account controls and only implemented nonfrequent routes. Desktop has no bottom bar; its expandable sidebar lists all implemented routes, frequent ones first. Expanded account controls show text; collapsed Language/Sign out controls retain accessible names/tooltips, with a keyboard-accessible language choice panel, Escape and focus return. Keep language accessible when signed out, but no business navigation; sign-out appears only for an existing session.

Mobile bottom navigation reserves approximately64px plus safe-area-inset-bottom and maintains44px touch targets, icons/short labels and aria-current. Add matching content/scroll bottom padding so the last records, Back and pagination controls remain unobscured. Continue measured-header scroll offsets. Route selection uses the existing navigation/auth/cache invalidation path. No API, SQL, auth policy, infrastructure or DNS change. C checks responsive route uniqueness, signed-out boundaries, keyboard/focus behavior, status accessibility and content clearance. D handles publication/progress updates while preserving unrelated edits. Stop at the same visual checkpoint.
