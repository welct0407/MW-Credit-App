# R052 checkpoint 2F — Server-side bilingual borrower search

8 October 2026 (Asia/Bangkok). Agent A design; B implementation; C independent tests; D delivery, parity/progress records and publication. Baselines: application `63ef702`, PM `a6ba15c0`, Hosting `b11661ef7a7a3d77`, API `00009-5x5`. Owner authorized the next checkpoint after the Collection scroll correction. R052 and full Phase 1/2 remain open.

## Purpose and evidence

Add server-side name search to the existing Borrowers and Collection root lists. This closes a practical read-navigation gap: current paged lists cannot find a borrower outside the loaded page. A client-only filter would imply completeness it does not provide.

Recorded OLTP dictionary `tables/borrowers.yaml` marks physical `Borrower Name` (Thai name) and `Description` (English Name) Searchable Yes. The Borrowers and Collection deck definitions use the bilingual borrower label. These are maintained recorded sources, not a fresh AppSheet GUI audit. Existing PWA projects both fields and already has their column privileges. The scope is this two-field name-search subset; it does not claim all AppSheet searchable columns or identical AppSheet tokenization. No new columns, indexes, grants, totals, financial formulas or writes.

## API and SQL contract

Only GET `/api/borrowers` and GET `/api/collection` accept optional query parameter `q`, once. Other routes retain their existing allowlists and reject q. Existing bearer verification, pinned owner/Partner mapping, exact DEV identity, read-only transactions, statement timeout and CORS remain unchanged.

One shared server canonicalizer is authoritative:

- Missing q is empty. A provided value must be a string, at most 512 UTF-16 code units before normalization, with no ASCII control U+0000–001F or U+007F (validate before trimming).
- Trim leading/trailing JavaScript whitespace only. Maximum normalized length is 100 Unicode code points. Empty or whitespace-only means unfiltered.
- Preserve case, internal spaces and Unicode sequence. No normalization, transliteration, token splitting, fuzzy matching or accent folding. UI mirrors the same limits without silently truncating; server still enforces them.
- Duplicate q, invalid type/control/length or invalid query-bound cursor returns sanitized 400 invalid_request before business SQL. Direct business HTTP requests are still authenticated before route processing.

Search is a literal case-insensitive substring of either field separately. Use parameterized SQL equivalent to `strpos(lower(COALESCE(name,'')),lower($q)) > 0 OR strpos(lower(COALESCE(description,'')),lower($q)) > 0`, with an empty-query pass-through. Parameter values must never be interpolated into SQL. Percent, underscore, backslash, quotes and hyphen remain literal. Do not match a string spanning the displayed separator between the two fields. SQL lower follows existing database collation; do not promise language-aware fuzzy search.

Borrowers applies name filtering before keyset/limit while retaining Hidden Flag IS FALSE and global active/inactive/unknown, creation-date ascending null-last, ID C-collation ordering. Collection applies the filter to completed `summaries` after the unchanged charge/repayment aggregation. Preserve all original membership, global source-quality checks, rank/ID ordering, single Bangkok transaction date and rollover 409 behavior. A matching borrower's displayed amounts remain identical to the unfiltered board; there is no new board aggregate or result count. Do not incorrectly import the Borrowers hidden filter into Collection. Child loans, charges and Upcoming retain their existing ownership and authorization checks independent of search.

## Query-bound pagination and compatibility

Compute lowercase-hex SHA256 of canonical q (UTF-8). It binds cursor use; it is not encryption, authentication or a secret. Root Borrowers cursor v3 adds queryHash to current rank/date/ID. Root Collection cursor v2 adds queryHash to current kind/businessDate/rank/ID. Decode using strict canonical serialization and compare expected queryHash; any changed canonical q, including case-only differences, requires a new first page. Continue existing limit 25 default / 100 maximum.

Accept prior Borrowers v2 and Collection root v1 cursors only when canonical q is empty, to preserve installed/open prior UI tabs. Emit new root cursor versions for every new result, including unfiltered results. Existing child cursor formats stay unchanged. Old clients treat new cursors as opaque. Every page request carries the current q; do not infer q from cursor or search only a loaded page.

Do not add application logging/analytics of names, query strings, record identifiers or returned data. Standard platform request logs may include request URLs; this slice makes no new claim that those are redacted or changes their policy. Published tests/evidence use synthetic search strings only.

## Compact UI contract

Use explicit submission, not debounce or request-per-keystroke. Both views offer a search icon in the existing orange header. Search mode replaces existing header contents with Back, flexible search input, Clear and Submit; all controls retain 44px targets and the existing header height. No new wide body row. Normal menu/logo/refresh controls can be visually replaced while searching. Keep the live status announcement inside the header; the Submit control may display the spinner without changing dimensions. Ensure the normal narrow header remains usable with its added search action; trim flexible title space, not touch targets.

The input has a localized accessible name, inputMode/search semantics and Enter/Search keyboard action. Guard IME composition so confirming Thai composition is not premature submission. A different query can be submitted while an earlier query is pending: abort/generation protection must prevent stale completion and allow replacement, rather than indefinitely disabling the input. No false result count.

Maintain draft versus applied query. Submit applies canonical q, clears selected/detail/child preview state, resets page/cursor, and starts one fresh server read. Clear explicitly applies empty q. Back/Escape closes search mode and discards unsubmitted draft while preserving applied results; it must not unexpectedly navigate the business view or issue a request. Normal header can show `<view> · <applied query>` truncated visually with full accessible text, so a hidden filter is not mistaken for the complete list. Empty results say no matching borrowers, distinguished from an unfiltered empty board. Keep errors visible and retryable without showing old-query results as new results.

Opening a result and returning to its list preserves the applied query and current page. Header refresh reloads first page of the applied query. Route changes, sign-out/account changes and offline transition clear search state along with existing business state. Search text/results stay in memory, not localStorage, cache storage, browser history or service worker. Existing preview freshness/date/auth clearing remains unchanged. Align scroll on deliberate search/navigation transition, not after delayed responses; preserve the recent load-completion jump fix.

## Testing and delivery

C executes actual SQL against disposable synthetic PostgreSQL tables and affected browser tests. Cover matches beyond page 25, Thai name and English Description, case, literal wildcard/quote/backslash, internal whitespace, null fields, empty/control/overlong input, repeated q, bound and legacy cursors, ties/null dates and group order. Confirm Borrowers hidden semantics versus Collection eligibility, unchanged per-borrower amounts/status and date-rollover behavior; no new privilege or write. HTTP tests confirm auth failure does not query business SQL and unexpected child q is rejected.

Browser cases: explicit submission/IME, replace a delayed search and ignore its late response, query-bound Next, Clear and refresh, empty/error states, result/detail/Back preservation, route/auth/offline reset, narrow EN/Thai header keyboard/focus, and no completion-time scrolling. Test old unfiltered client/cursor behavior against the new API. Reuse unaffected PWA lifecycle and domain evidence.

Deploy compatible API before UI; retain existing exact grants/runtime identity. Record image/revision and Hosting/worker versions. Rollback UI first to an existing compatible UI if needed; then API. Returning API to its prior version while a new search UI remains open would reject q and new cursors, so coordinate rollback and explicit reload/recovery; do not claim an atomic two-service rollout. D handles publication, sanitized delivery evidence and progress. Live query measurement is only needed for an observed performance concern and remains read-only; no live synthetic writes or broad audit.

## Bounded parity reconciliation and remaining gates

D may update affected baseline rows using this table and linked prior checkpoint evidence; initial 7 October scaffold observations are historical, not current pending status. This does not establish full enabled-object parity.

| Backlog | Current bounded position | Still open |
| --- | --- | --- |
| P01 navigation/identity/preferences | Owner-pinned auth, current two-view bilingual shell, persistent sign-in and access tests delivered | Broader role/action policy, Partner-backed language/preferences and final frequent-view selection |
| P02 Borrowers read | Physical list/detail, global grouping, bilingual label, profit/source read and scoped loan reads delivered; name search is this checkpoint | Full contact/documents/other read-field parity and later source CRUD |
| P08 Collection read | Governed board/charge reads, Upcoming provider detail and bounded previews delivered; name search is this checkpoint | Receiving/actions and complete future workflow parity; no false Hidden Flag equivalence |
| P22 Upcoming | Borrower-scoped Collection summary/detail delivered | Standalone Upcoming entry and other planned consumers remain separately scoped |
| P37 install/offline | Canonical PWA installation owner-confirmed; public-only fallback/update tested | Owner offline/update review and user-scoped business offline records/drafts design |

Next foundation work should close remaining error/request tracing and acceptance gaps deliberately. Before payment/prod readiness, reconcile the first receiving command's current V77 source/transaction/idempotency and actor/event/notification ownership, precise permissions, retained reporting and measurable acceptance targets. No payment implementation, production readiness declaration, full Phase 1 closure or Phase 5 expansion follows from this search checkpoint. Phase 7 stays post-go-live.

Stop after independent checks, DEV publication, updated overall progress and a user-reviewable search checkpoint.
