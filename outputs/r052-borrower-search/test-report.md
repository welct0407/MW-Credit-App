# R052 checkpoint 2F — independent borrower search verification

8 October 2026. Baseline63ef702. Local synthetic fixtures and isolated browser profiles only; no live business records, fixture writes, schema or grants.

## Passing evidence

- Disposable PostgreSQL:16/16 cases passed using tests/integration/Run-Collection.ps1. Four new independent search cases plus12 existing financial/provider cases exercised the actual store SQL under a SELECT-only synthetic reader. The local server stopped normally.
- Browser:8/8 final cases passed: four new Borrowers/Collection search flows across1440 desktop and320 mobile, plus four directly affected grouped-read and Upcoming regression cases. Existing refresh selectors now distinguish the refresh action from the new search action sharing its style class.

SQL proves a match absent from the first25 can be found globally; Thai names and case-insensitive English descriptions match separately. Percent, underscore, backslash and quote remain literal, multiple internal spaces remain distinct, and a concatenated name/description boundary is not searchable. Hidden borrowers remain excluded from the directory but eligible in Collection; noneligible Collection borrowers stay excluded. Filtered Collection rows exactly equal their unfiltered financial DTOs. Malformed unmatched source data still fails the global Collection quality guard. Filtered29-row keyset pages cross status/active groups without omission or duplication and reject a differently cased query hash. Invalid controls/lengths and missing/null legacy ranks reject before SQL; valid old root cursors work only with empty search.

Browser flows verify explicit submit (typing and composing Enter do not send reads), exactly one submitted root request, Clear resetting to first page, detail/Back and root refresh retaining applied query, draft cancellation, paging reset, newer-query response winning over a held older response, and no completion-time scroll command. Loaded no-match text is localized and absent during pending results. Header remains60px desktop/56px mobile in both languages; all three search buttons are at least44px, no page overflow, and final screenshots contain one explicit Clear icon after native cancel suppression. Desktop Borrowers uses its existing refresh path because its Back control is mobile-only. Native iPhone keyboard/standalone interaction remains owner validation, not Chromium proof.

## Findings resolved

C measured search header growth to72px caused by a16px form bottom margin; B reset the scoped margin. A's missing/null legacy rank, loading/no-match messaging and late root-scroll findings were corrected and independently covered. Parent spotted duplicate native and explicit clear icons; B suppressed only the native cancel decoration. Test-only corrections handled the existing arrow-prefixed/mobile-only Back control and waited two animation frames for the deliberate initial layout transition while the synthetic response remained held; standard timeouts and completion assertions were retained.

## Scope and handoff

No broader PWA/auth infrastructure suite was repeated. Existing access/owner checks are unchanged; B's focused API/unit evidence is separate. C did not rebuild or overwrite D's managed artifact. All test servers closed; parent preview retained.

Intended C files: tests/e2e/borrower-search.spec.ts, grouped-read.spec.ts, upcoming-read.spec.ts; tests/integration/collection-postgres.test.mjs; this directory's eight synthetic EN/Thai PNGs and report. Regenerated tracked TRIM screenshots under outputs/r052-collection-read are incidental prior evidence and should be restored by D. Await exact-source CI, bounded unsigned deployed checks, and owner authenticated visual validation. R052 remains Open.

## Deployed verification

Source f6be56f0387a03cf35d48d206f9aea2712b667f6 passed CI37706939264. D delivered API00010-fzk and Hosting3f6fbb70ca3dc007. Seven bounded unsigned synthetic-query checks passed: both root q endpoints deny anonymous access401 with exact canonical/fallback CORS echo, Vary and no-store; invalid bearer401, untrusted origin403, authorized-origin GET/Authorization preflight204. No records returned.

Fresh canonical320/mobile and fallback1440/desktop browser contexts serve exact index-D2nJ4crK.js and worker SHA2561df70d368dd253818712497df00e59bf0701ab18a317dd26bc639560556cef70. Signed-out UI hides search and business records; canonical registers and fallback does not. Browser contexts made zero API requests. Evidence live-delivery.json and two live-*-signedout.png captures. Browsers closed; evidence frozen. Owner authenticated Thai/English search and native iPhone validation remain pending.

## Owner refinement — search as you type

The owner superseded explicit-submit-only behavior with300ms trailing live search. Final8 focused browser cases passed: four deterministic timer cases plus the four existing search/navigation/race/layout cases updated for automatic results. Unchanged SQL16-case and PWA evidence is reused, not rerun.

Verified trailing reset after additional typing, no request at299ms and one at300ms, canonical-query deduplication, preservation of raw surrounding spaces and caret, no request during composition, one delayed application after composition end, Enter flushing without a second timer request, Clear immediate, Back cancellation with applied-query restoration, and pending timers cancelled by result/detail, page, route and offline navigation. A's mid-composition close/reopen finding was corrected by B; reopening and typing normally now issues its request. Held older API responses cannot replace newer results, and completion does not issue another viewport scroll. Native IME event sequences were synthetically dispatched in Chromium; actual iPhone keyboard behavior remains owner validation.

New screenshots use *-live-search-{en,th}.png and preserve the earlier explicit-submit evidence. C files for this refinement: tests/e2e/live-search-timer.spec.ts, updated borrower-search.spec.ts, this report and eight new screenshots. No historical screenshots were overwritten, no app source/build was edited by C, and all owned test servers closed. Await exact-source CI, Hosting-only delivery and owner visual recheck.

### Live-search deployed delivery

Exact eb83cab317b37ab90b50c8c6a1d8efe3b61880d4 passed CI37708695277; D published Hosting8fa268235d983461. Fresh canonical320 and fallback1440 unsigned checks passed for exact index-C8WB96wS.js and worker SHA256275a80b9c57f2c2b87918265b97251bb8babfc1165aba13bfd53c7e69ed4452f/no-store. Canonical registration/fallback exclusion, signed-out UI and hidden search/business records passed; zero API requests. Evidence live-search-delivery.json and two live-search-*-signedout.png files. Browser contexts closed, no API probes or login. Owner authenticated typing/native iPhone review remains pending.
