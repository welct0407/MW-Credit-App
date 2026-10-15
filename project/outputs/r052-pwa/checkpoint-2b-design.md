# R052 checkpoint 2B — borrower-related loan reads

7 October 2026. Agent A / Astra High. The owner accepted checkpoint 2A and instructed continuation. Starting app commit `adedf6915f51f6edd6dcf58daebb2667d3d29f0c`; management commit `d58a498892e18c5da04033f8310ab7990e45de29`. R052 remains the sole Open development release. This design is a bounded continuation of Phase 2, not Phase 2 completion or financial-operation authorization.

## Outcome and review stop

Extend the real DEV Borrowers directory into a usable borrower-to-loan list/detail flow. Retain actual pinned owner authentication, the accepted orange theme, readable EN/Thai presentation, the existing read service and AppSheet parallel operation. After tests and DEV deployment, stop for the owner's visual review of related loans and their source balances. Do not start Collection, financial commands, receipt access, schedules, production or schema additions.

Phase 2 explicitly calls for navigation, reusable details, current balances/status and related records. Borrower-related Loans is the next bounded dependency because its identity, dates, status and SQL-maintained balances already exist. It requires a narrow read-privilege extension without a calculation engine or new database object.

Collection remains required by Phase 2. Its OLTP current-date charge eligibility, repayment-on-date membership, collected/remaining amounts and status precedence are documented in checkpoint-1b-design.md. Similar names in the older OLAP analytics view do not prove equivalence to current OLTP formulas. Reconcile that provider before connecting Collection; do not silently substitute it or reuse synthetic sums. Native OLAP remains pre-go-live; Metabase enhancements remain after go-live.

## Ownership and established boundary

- Parent orchestrates scope, handoffs and the owner review checkpoint.
- A owns this design and read-only architecture review.
- B owns API/frontend implementation and relevant application dependencies.
- C owns independent tests and sanitized evidence.
- D owns infrastructure, bounded live metadata, privilege plan/apply/recovery, DEV deployment, all other documentation and Git publication.

Reuse checkpoint 2A evidence: Firebase Google sign-in, actual owner UID pin, exact project/issuer/audience/provider and verified owner email, current revocation checks, unique normalized Partners.Login Email mapping, fixed DEV database/runtime identity, and no business SQL before authentication. Neither a loan ID nor a borrower ID is authorization. No email-bootstrap fallback, new user grant, runtime identity, additional Firebase permission, endpoint environment switch or production access is introduced.

## Source evidence and metadata gate

These are saved source definitions, not new live observations by A:

| Source | Grounded behavior |
| --- | --- |
| PM dictionary `systems/appsheet/oltp/tables/borrowers.yaml`, Related Loans | `REF_ROWS("Loans", "Ref Borrowers")`: all related loans, not only active loans |
| PM dictionary `views/visible-borrowers-detail-9e72dde3.yaml` | Borrower details include Related Loans |
| PM dictionary `views/loans-inline-3198a9e4.yaml` | Related loan deck sorts Loan Date descending and presents loan status; recorded status grouping is not an API permission rule |
| PM dictionary `tables/loans.yaml`, Loan Status/Loan Type | Statuses are ยังไม่ปิดยอด and ปิดยอดแล้ว; types are กำหนดวันชำระ, ดอกเบี้ยรายวัน and ผ่อนชำระรายวัน |
| PM dictionary `views/loans-detail-c89c42a9.yaml` | Dates, principal, status/type, received/outstanding source balances, Defaulted and Auto Charge Enabled belong to loan details; other fields remain later parity scope |
| App `database/migrations/V1__existing_schema.sql` | Existing Loans key/reference, source dates/text/money/boolean fields |
| App `database/migrations/V12__charge_loan_materialized_balances.sql` | Physical numeric received/outstanding balances maintained by SQL; explicit negative/unclamped source semantics |
| App `database/migrations/V60__ordinary_business_source_crud.sql` | Current source-owned corrections refresh loan balances; PWA must read the governed values, not reconstruct them |

D must verify the actual DEV V77 schema/types, primary key/reference and existing supporting indexes against this exact projection before grants or deployment. Return only metadata and sanitized results, not borrower/loan rows. D subsequently reported exact DEV metadata verification: V77; all 14 proposed types match; Row ID alone is NOT NULL, the other 13 fields are nullable; Loans_pkey covers Row ID; appsheet_ref_01 links Ref Borrowers to Borrowers.Row ID; existing loans_borrower_idx covers Ref Borrowers, with no borrower/date compound index. No business rows were read. A reviewed the maintained helper against D's reported one-statement plan: only the 14-column Loans SELECT grant is added, with existing nine columns and role settings unchanged. This records metadata/plan review, not applied grants or deployment. A discrepancy is a concrete design issue to resolve; do not invent aliases, add columns or silently cast an incompatible source. Existing indexes may be reused. No new index is proposed by this read slice; an observed performance issue requires measured follow-up.

## Exact projection and minimal privilege delta

Read only these 14 existing columns from `public."Loans"`:

| SQL column | DTO field | Wire representation |
| --- | --- | --- |
| Row ID | id | nonblank immutable case-sensitive string |
| Ref Borrowers | borrowerId | exact requested parent ID |
| Loan Date | loanDate | date::text, YYYY-MM-DD or null |
| Due Date | dueDate | date::text, YYYY-MM-DD or null |
| Close Date | closeDate | date::text, YYYY-MM-DD or null |
| Loan Type | loanType | source text or null |
| Loan Status | status | source text or null |
| Principal Amount | principalAmount | money::numeric::text decimal string or null |
| Outstanding Principal | outstandingPrincipal | numeric::text decimal string or null |
| Total Principal Received | totalPrincipalReceived | numeric::text decimal string or null |
| Total Interest Received | totalInterestReceived | numeric::text decimal string or null |
| Total Amount Received | totalAmountReceived | numeric::text decimal string or null |
| Defaulted | defaulted | boolean or null |
| Auto Charge Enabled | autoChargeEnabled | boolean or null |

List and detail can use the same explicit DTO. No `SELECT *`, actor/contact fields, documents, charges, receipts, calculation routines or aggregate portfolio principal. Initial principal is not outstanding principal. Received values are the SQL fields, not a browser sum. Preserve negative/zero/null distinctions; do not clamp, round in the API, recalculate, or replace unavailable values with zero. Cast PostgreSQL money through numeric before text so currency symbols/group separators never enter the wire format.

D extends the current reader with column SELECT on exactly these 14 columns, preserving the existing nine-column Borrowers/Partners grant baseline. No table-wide SELECT, EXECUTE, DML, schema CREATE or ownership is needed. Maintain the existing plan/apply helper and recovery snapshot; verify effective column access, no business writes, and no PROD business privileges. Rollback contains or restores the previous application revision, then removes only grants introduced by this batch using captured provenance. Do not revoke prior grants or alter shared PUBLIC privileges. This is an environment grant change, not a Flyway schema migration.

## Routes, population and errors

- `GET /api/borrowers/:borrowerId/loans?limit=25&cursor=...`
- `GET /api/borrowers/:borrowerId/loans/:loanId`

No global `/api/loans` route is introduced. Existing Borrowers and session routes retain their contracts. Parse routes exactly; do not let the old borrower-detail prefix handler consume nested loan paths. Reject unsupported/duplicate query keys and malformed IDs/cursors using bounded responses.

Every request passes existing Firebase owner verification, current Partner mapping and DEV identity checks. Each loan query explicitly joins `Loans."Ref Borrowers" = Borrowers."Row ID"`, restricts the requested borrower, and requires `Borrowers."Hidden Flag" IS FALSE`. Detail additionally restricts the requested loan ID. Recheck the parent on every request, including a previously selected loan. A loan linked to a different borrower must return the same generic 404 as missing or excluded resources.

A missing, hidden or null-visibility parent returns 404. A visible parent with zero related loans returns 200 with an empty list. Open, closed and defaulted loans all belong in the related population; no status filter. SQL uses parameters, explicit columns and the existing READ ONLY transaction/timeouts. Do not lock or mutate real business rows. A separate parent existence query is acceptable provided the actual loan SELECT also enforces parent visibility/reference; do not use a prior browser/cache result as the gate.

Keep 401/403 for authentication/application denial, generic 404 for absent/out-of-scope resources, bounded 400 for invalid pagination and sanitized 503 for provider failure. All responses remain no-store with the existing exact-origin CORS and GET/OPTIONS boundary. No raw SDK/SQL errors, tokens, private IDs or financial values enter logs or published test evidence.

## Pagination and source meaning

Order by `Loan Date DESC NULLS LAST`, then `Row ID COLLATE "C" ASC`. This follows the recorded newest-loan-first intent, with an explicit deterministic tie-break. Use default 25, maximum 100 and limit+1. Do not claim a total count or sum from one page. Show source statuses on each card; do not present page-local groups as the borrower's complete active/closed population.

Use a canonical base64url-encoded JSON cursor containing version 1, borrowerId, loanDate (valid YYYY-MM-DD or null), and id. Validate exact bounded structure/ID/date types and the requested parent match; a cursor from another borrower is invalid. The cursor carries no authority and cannot change SQL syntax.

For a nonnull cursor date, later rows have an earlier Loan Date, a null Loan Date, or the same date and a greater C-collated ID. For a null cursor date, later rows must also have a null date and greater ID. Test same-date ties and the transition to null dates. Preserve existing list metadata (`source: dev`, asOf, businessDate, timezone), plus requested parent identity and nextCursor as appropriate. Dates remain business dates, not timezone-shifted instants. Paging is live, not a transaction spanning pages: source edits/reassignments may change membership/order; refresh starts from the first page.

Known status translation: ยังไม่ปิดยอด → Open; ปิดยอดแล้ว → Closed. Known types: กำหนดวันชำระ → Fixed due date; ดอกเบี้ยรายวัน → Daily interest; ผ่อนชำระรายวัน → Daily instalment. These are display translations only. Preserve source text for unknown values and display an explicit unrecognized/unavailable meaning, never infer Open/Closed or another type from amount/date/default flag. Defaulted is a separate source flag; a closed/defaulted loan must not be presented as an ordinary paid-off inference.

## Visual flow and state handling

Keep the accepted directory and selected borrower context. Add a clearly titled Related loans section to borrower detail; load its first bounded page when a borrower is selected. Each loan card shows identity, loan date, source status/type and outstanding principal. Opening a card shows its dates and the five source monetary values, default indicator and auto-charge setting as read-only information. No toggle, edit, payment, close/default, receipt or other command is present.

A Back to loans control returns to the same borrower's loaded loan page. Borrower Back to list returns to the existing directory. First-page refresh and Next page have distinct scopes. Mobile remains a single navigable detail flow; desktop can retain the existing split layout. Avoid a third cramped column. Preserve the orange tint/borders, logo, readable 14px minimum meaningful text, 16px body/controls, wrapping and touch targets. EN/Thai labels and values remain readable at the established desktop/mobile sizes.

Nested reads have visible loading, empty, failed/not-found and retry states. A related read failure may retain the already authorized borrower context, but must clear unavailable/stale loan results and not look like current success. Any 401/403 clears all sensitive state under the existing boundary. Parent selection, back navigation, sign-out/account change and new loads cancel prior nested requests and use identity/parent/request generation guards so late responses cannot attach loans to a different borrower or repopulate a signed-out screen. Preserve the correct loan page when returning from detail; do not merge pages from different parents.

Freshness applies to the displayed response. Do not refresh a loan timestamp while showing an older loan record. No business data or auth token is added to local/session storage, offline caches or URLs beyond bounded record navigation needed by the route. No service worker, manifest or offline feature is introduced here.

## Independent acceptance and deployment gate

C verifies with synthetic data/injected seams:

1. Existing auth/project/provider/pinned UID, denied-user no-SQL and mapping checks still apply to both nested endpoints; mutation methods remain denied.
2. Missing/hidden/null-visible parent, mismatched loan parent, nonexistent loan, changed parent visibility and denied direct requests return no loan data. Visible empty parent is distinguishable as a successful empty list.
3. SQL binds IDs/cursor values, projects only the 14 fields, includes parent visibility on actual loan reads and preserves money/date/null/negative semantics without calculation. Unknown status/type does not falsely map to a known value.
4. Pagination covers newest-first order, tied dates, null dates, page boundaries, parent-bound cursor rejection, malformed/oversized cursor, unsupported/duplicate params and invalid limits.
5. UI handles list→borrower→loan→back, empty/error/retry, first/next loan pages, EN/Thai and desktop/mobile. Borrower switch, rapid back, logout/auth loss and late responses cannot retain/repopulate unrelated loan data. No financial controls, fixtures or synthetic session dependencies leak into the live build.
6. Relevant builds, source tests and browser tests pass. Reuse unaffected checkpoint 2A checks with their basis; do not rerun unrelated financial suites or claim complete Loan/Collection parity.

D confirms actual DEV metadata before exact grants, preserves pinned identity configuration and deploys the tested immutable API/frontend artifacts. Verify startup identity, public static health, unauthenticated business denial, old IAM service protection and actual owner borrower-to-loan reads without publishing private record bodies/screenshots. An empty actual borrower list does not by itself prove populated loan detail; label that gap until representative authorized owner validation occurs.

Stop at the deployed DEV related-record checkpoint for owner validation. Remaining Phase 2 includes exact Collection reads and other foundation items; completion of this slice does not silently advance phases or authorize financial writes.
## Owner refinement addendum — AppSheet presentation and grouped paging

7 October 2026, after owner review of the deployed initial 2B candidate. Starting app `e9281e9075b33995bc51ce4233c977ffe06f1a01`, PM `6c3b6f91d84e54edf5df2c232e121b9eb74400d3`. R052 remains Open. This addendum supersedes the initial ID display and ungrouped pagination presentation above. It remains the same review checkpoint; it adds no financial command, schema, production or subsequent feature slice.

### Exact source labels and profit

The owning OLTP dictionary contains these definitions:

- `Borrowers.Borrower Name TE`: `CONCATENATE([Borrower Name], " - ", [Description])`. The physical Description field is labelled English Name. The user phrase Borrower - TE refers to this display label; there is no new schema field. Preserve both language values and the exact separator in either UI language; do not translate names, drop one name, or substitute Communication Name.
- `Borrowers.Total Interest Earned`: physical Price field, displayed as `ดอกเบี้ยที่ได้รับทั้งหมด / Total Profit Earned`. The Borrowers deck uses this as its summary. V13 SQL maintains the field from related-loan repayment interest aggregates, including governed corrections; the PWA simply reads this numeric value. It is not a newly calculated economic profit, not outstanding principal, not total received, and not `Active Profit After Principal Coverage`. Show the recorded bilingual label with the source value, null as unavailable and negative values preserved.
- `Loans.Loan Key`: `CONCATENATE([Borrower Name TE], "-", TEXT([Principal Amount]), "-", TEXT([Loan Date], "DD/MM"), "-", IF(ISBLANK([Original Daily Interest Rate]), "Unavailable", CONCATENATE([Original Daily Interest Rate], "%")))`. This is a presentation label, not the immutable row key.

D verified actual DEV metadata: Borrowers.Description is nullable text, Borrowers.Total Interest Earned nullable numeric, Loans.Original Daily Interest Rate nullable integer. Extend the existing reader by only these three column SELECT privileges (26 allowed columns total), with the same plan/snapshot/effective-audit/recovery process. No schema or function is needed. Preserve all 23 previously accepted column grants.

API borrower results add the exact bilingual display name (suggested `borrowerDisplayName`) and `totalProfitEarned` numeric::text/null. Loan results add the joined parent's current bilingual display name and `originalDailyInterestRate` integer/null. Existing raw source names/IDs may remain internally for compatibility. Never expose raw borrower/loan IDs as visible headings, secondary captions or tooltips; IDs still own routes, React keys, selection, cursor and authorization. Nonunique Loan Key labels must not be treated as record keys.

Principal Amount's saved AppSheet Type Details specify baht symbol, thousands grouping and zero decimal digits. Official [AppSheet TEXT documentation](https://support.google.com/appsheet/answer/10107701?hl=en), checked 7 October 2026, says a one-argument column conversion applies its Type Details. Therefore render the Loan Key's principal segment as grouped whole-baht `฿12,000` using saved en-US punctuation, with DD/MM from the business date and the stored integer rate followed by %. This is supported by the documented formatter and saved configuration, not a new claim of live screenshot comparison. Synthetic example: `สมชาย - Somchai-฿12,000-07/10-2%`.

Treat missing name/Description/principal/date as empty concatenation segments, preserving separators. Missing original rate uses the literal `Unavailable` from the formula; zero is `0%`. Do not recalculate the original rate from today's amounts, dates or a rounded display. Loan Key display rounding does not alter underlying decimal fields. All other currency formatting uses `฿` rather than `THB`, preserving current up-to-two-decimal amount display. Format symbols explicitly or use narrowSymbol consistently in EN and Thai. Unknown source data remains unavailable rather than zero.

### Global groups and cursor order

The existing Borrowers view groups `Borrower Activity Group` ascending and sorts Creation Date ascending. That group formula uses Has Active Loan. Implement the owner's grouping in SQL over the full visible population before LIMIT:

| Resource | Global group rank | Within each group |
| --- | --- | --- |
| Borrowers | Has Active Loan true = 0 (Active); false = 1 (Inactive); null = 2 (Unknown) | Creation Date ASC NULLS LAST, Row ID COLLATE C ASC |
| Related Loans | status ยังไม่ปิดยอด = 0 (Open); ปิดยอดแล้ว = 1 (Closed); null/unrecognized = 2 (Unknown) | Loan Date DESC NULLS LAST, Row ID COLLATE C ASC |

Null/unknown is intentionally separate to preserve uncertainty, never silently inactive or closed. Grouping changes presentation only; every actual query retains parent visibility, exact loan ownership, pinned-owner verification and mapping. Defaulted remains a separate source flag and is not a new ranking/status inference.

Use version 2 canonical cursors carrying group rank, date (nullable), ID, and borrower ID for loan cursors. Validate exact shape, rank 0–2, date/ID and parent binding. A row follows a cursor when its group rank is greater, or its rank is equal and it follows the corresponding date/null/ID order. Null dates come after nonnull dates within the same rank. Do not apply the date condition across ranks. Update the encoded order marker and reject obsolete/invalid cursor shapes explicitly; coordinated API/frontend deployment and first-page refresh recover old open pages without interpreting an ID-only cursor under the new order.

Do not fetch a mixed bounded page then sort/group only in the browser: active/open records outside that page could otherwise follow inactive/closed ones. Render section headings for the globally ordered rows returned. Make clear this is a paginated list; a repeated heading on a later page can say continued. Do not label page counts as full group totals or imply an absent group has no records beyond the page. On unchanged source data, iterating all pages must return each visible record exactly once in rank/date/ID order. Concurrent source changes remain live-paging behavior; refresh begins again.

Inactive borrower and closed-loan cards use a neutral grey surface with readable dark text. They remain clickable and are not visually disabled. Unknown groups retain a clear neutral status, not a false closed style. Active/open keeps the accepted orange treatment. Preserve accessible contrast, keyboard focus, font sizes and touch targets.

### Navigation, scroll and paging repair

Desktop should provide independently scrollable list and detail panels within a viewport-bounded workspace, or an equivalent stable floating detail. Selecting an item near the bottom of the list must immediately show its detail without scrolling the whole document back to the top. Use a bounded CSS layout with min-height:0/overflow handling rather than overlapping fixed panels. Keep mobile as the existing separate list/detail flow; no squeezed desktop columns on mobile. Preserve borrower context when returning from a loan.

Replace ambiguous `Next loans` with clear scoped pagination: `Next page` inside an explicitly titled Loans pager or `Next loan page`. Show the current page number, bounded page size, visible loading/page-change feedback and an explicit end state. Borrower paging uses equivalent controls. First-page reset is explicit; if Previous is implemented, retain cursor history scoped to the current dataset/parent and clear it on refresh/auth/parent change. Increment page counters only after successful response; failed or aborted requests do not advance them. Reset only the relevant list scroll on successful page change, and ensure keyboard users receive a page-change announcement/focus target.

The owner reports Borrower Next page does not work. B's initial static review found the old cursor passed through UI→handler→SQL, but identified retained bottom scroll, no page indicator and no page-change feedback. These observations do not prove the cause of the owner's failure. C must reproduce the pre-fix transition with at least 26 deterministic synthetic borrowers, inspect the outgoing cursor and returned row change, then verify the new path. If a concrete API/state defect appears, repair it and record that cause; do not close the bug with an unsupported claim that it was only scrolling. Final tests must cover both borrower and loan pagers across group/date/null boundaries, including rapid navigation and late responses.

### More borrower information and scope

The roadmap includes fuller borrower details, notes/preferences and related records in Phase 5. Recorded AppSheet Visible Borrowers_Detail also contains Communication Name, Instagram Username, City, Working Location, Address and Ref Referrer, plus governed metrics and Upcoming Charges. These are deferred parity items requiring exact field/access/source review; this refinement does not add those contacts, documents, integrations or every metric. Description/English Name and the existing profit field are added now solely to satisfy the requested labels/summary. Collection remains its separately reconciled Phase 2 read dependency; the next checkpoint after this review will be selected explicitly, not assumed to include every borrower field.

### Refinement acceptance

C tests exact synthetic bilingual/Loan Key strings, missing segments/rate0, baht formatting, raw IDs absent from visible UI, source profit distinct from principal/total received, negative/null amounts, active/inactive/unknown and open/closed/unknown rank across more than one page, ties/null dates, v1/wrong-parent malformed cursors, no duplicated/omitted unchanged rows, and denied direct access. Browser tests cover both pagers, grey-but-clickable closed/inactive records, desktop independent scrolling with bottom-of-list selection, mobile navigation, EN/Thai readability and existing stale-response/auth clearing.

D checks the narrow grant delta and source types, then publishes/deploys only the tested read-only candidate with pinned UID preserved. Owner reviews the same 2B checkpoint again. Neither the refinement nor a passing synthetic suite establishes full Phase 2 completion or new financial/production authority.