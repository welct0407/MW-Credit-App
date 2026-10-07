# Checkpoint 2B owner refinements — independent tests

7 October 2026. Baseline e9281e9075b33995bc51ce4233c977ffe06f1a01. All fixtures, names, IDs and tokens in this evidence are synthetic. This is the same owner-review checkpoint, not Phase 2 completion.

## Pagination finding

The owner clarified the reported Borrower Next page issue was a greyed/disabled control. C served the committed baseline through read-only Vite source overrides, without rolling back shared source, and supplied 27 distinct synthetic borrowers. The old UI sent the returned cursor correctly and changed from 25 records to the final two. The old Next control remained visible but disabled at the end. See baseline-pagination.json and BASELINE-paging-page2.png. No SQL/cursor defect was reproduced, and the test does not establish what data the owner's session returned. The revised UI hides Next at the end and states the page number/end explicitly; loading feedback distinguishes temporarily disabled controls from completion.

## Verification

- Static/synthetic build and 89/89 unit tests passed, including five additional grouped-read tests and updated version-2 cursor assertions.
- Six affected browser checks passed across desktop/mobile Chromium: grouped paging/scrolling, loan read/error/isolation, and existing authentication/borrower behavior. All use fresh isolated Vite caches, mocked Firebase/API responses and no real login.
- Independent synthetic 58-row traversal covers each group crossing bounded pages, repeated dates, null dates and unknown statuses, with no duplicate/omitted IDs. Client parameters and SQL rank/date/ID predicates are asserted. This uses an injected client predicate; it is not execution of SQL semantics. D owns actual operator EXPLAIN and the separate effective-privilege audit.
- Canonical v2 shape, invalid rank/date/extra fields, obsolete cursor, cross-resource and wrong-parent rejection remain covered. Exact mapping, parent visibility, auth-before-SQL, projection and no-write checks remain intact.
- Browser fixtures contain 27 borrowers and 27 related loans, including group changes at the page boundary. Checks verify changed records, outgoing cursors, first-page reset, loading feedback, end-of-list/no Next, unknown labels, and grey inactive/closed cards remaining clickable.
- Exact bilingual name/Loan Key strings, original rate 0/2/null, missing segments, whole-baht Loan Key rounding, negative/zero/null profit from Total Interest Earned, up-to-two-decimal currency and no visible raw IDs/THB are checked. Fuller borrower profile remains deferred.

## Scroll defect found and repaired

C reproduced a real separate problem: opening the last loan from a 25-item list left Back to loans above the clipped detail pane (desktop button y145.8 vs pane top346) and above the mobile viewport (y-30.8). B added post-layout alignment to the related-loan section on detail/Back. The exact failing assertion now passes in both projects, while desktop borrower-list scroll stays unchanged. No forced click, manual scroll-up, or relaxed timeout masks the issue.

## Visual evidence and limits

REFINED-* screenshots supersede initial 2B presentation evidence while retaining the historical captures. Desktop EN and mobile Thai grouped screenshots were inspected for labels, wrapping, distinct grey surfaces and readable text. Closed card computed background #e9e9e9 with #333 text yields 10.41:1; the #565656 secondary text against that surface yields 6.05:1. This is limited palette evidence, not a blanket accessibility claim. Thai document overflow checks passed. Real devices, actual owner loan data and production are untested by C.

Final scoped recheck: B reused the rect-based helper for successful explicit Next and first-page loan refresh. The two grouped desktop/mobile tests passed again, asserting Related loans is immediately at the relevant pane/viewport top after both actions. Initial borrower selection retains borrower context. Final tests/evidence are frozen for D publication; historical screenshots were not overwritten in this refinement. C-owned changes: tests/unit/dev-read-boundary.test.mjs, loan-read.test.mjs, grouped-read.test.mjs; tests/e2e/live-read.spec.ts, loan-read.spec.ts, grouped-read.spec.ts; baseline-pagination.json, BASELINE-paging-page2.png, REFINED-* screenshots and this report.
