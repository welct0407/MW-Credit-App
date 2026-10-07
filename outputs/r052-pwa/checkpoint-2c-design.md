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
