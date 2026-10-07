# R052 Collection refinement — independent test evidence

Date: 2026-10-07. Synthetic fixtures only; no owner login, live business rows, writes or production verification.

## Results

- Disposable PostgreSQL: **12/12 passed** (nine existing Collection checks plus three Upcoming checks). Executed the maintained V53 forecast function, V45 basis function, V54 events/coverage views and V56 summary view against synthetic JSON forecast inputs and synthetic source tables. The complete live reporting-input adapter is not represented by this fixture.
- Affected unit checks: **7/7 passed** (Collection 3, Upcoming 4). Strict canonical resource/date cursors, malformed bounds/dates, no connection/store access on rejected inputs/authentication, invalid coverage versus genuine empty, null decimals, unknown basis, duplicate summaries, and invalid money are covered.
- Browser checks: **4/4 passed** across desktop 1440×900 and mobile 390×844. The two Upcoming cases were subsequently rerun **2/2 passed** with an additional late Upcoming response after navigation assertion. Fresh isolated Vite caches were used. Authentication/API responses are mocked; these runs do not establish live Google authentication or forecast correctness.
- Final diff whitespace check passed. No application defect was discovered in this refinement. Initial fixture failures were test setup ordering and extraction of a SQL statement containing a semicolon in a string; the test harness was corrected before the successful SQL run.

## Observed behavior

Real provider SQL returns five distinct future dates while preserving all 27 loans on the fifth date across 25+2 pages. The full date total remains 270 on both pages. Exact 102.125 recorded-settlement amounts, closed/review status basis, warning versus genuine empty, hidden Collection membership and midnight/owner denials are exercised. Provider SQL and injected clocks use synthetic data only.

The reserved header keeps its height and the grid's document position across a delayed second request and partial failure. Updated is withheld until both charge and Upcoming requests succeed. A failed Upcoming response retains successful charge rows and displays Could not update. Reduced-motion removes spinner animation. A response released after navigation cannot restore Collection content.

Compact charge rows show date, lifetime Total Paid (125.75), and remaining, distinct from receivedToday (-2.50). Local charge detail performs no request and retains its read timestamp. Upcoming whole-baht display, whole-date total on both pages, English/Thai basis labels, review-only warning, return navigation, raw-ID exclusion and page overflow checks pass. The final Thai screenshot includes the corrected future-date total label. Existing Collection date-rollover, child error, pagination, navigation and logout race checks pass.

## Visual evidence

All new files are synthetic and prefixed REFINED; historical evidence is unchanged.

- `desktop-chromium-REFINED-loading.png` and `mobile-chromium-REFINED-loading.png`: delayed second request.
- `{desktop,mobile}-chromium-REFINED-summary-{en,th}.png`: compact actual rows and Upcoming summary.
- `{desktop,mobile}-chromium-REFINED-upcoming-{en,th}.png`: date drilldown with whole-date total.
- `{desktop,mobile}-chromium-REFINED-regression-{en,th}.png`: affected Collection regression.

These are browser checks, not blanket accessibility certification or real-device testing. Owner visual validation of deployed authenticated content remains separate. SQL fixture servers were stopped; the existing parent preview was preserved. No cloud grant/deployment was performed by C.

## Owned changes ready for D

- tests/integration/collection-postgres.test.mjs
- tests/unit/upcoming-read.test.mjs
- tests/e2e/collection-read.spec.ts
- tests/e2e/upcoming-read.spec.ts
- this report and the new REFINED PNG files in outputs/r052-collection-read

The final architecture grant contract is **19 view columns** plus EXECUTE on the existing pure forecast function; the initial 20-column proposal was superseded. D owns grant audit, actual DEV SQL shape verification, publication, exact-source CI and deployment coordination.

## Deployed unsigned verification

Application source 5efa533144248b1b76bc434fa3f16461433fa212 initially failed CI only on infrastructure/dev/terraform.tfvars formatting. D published the formatting/image-pin correction as b94c234935e172c76eac678601025270d1fc17e5; [exact validation CI passed](https://github.com/welct0407/MW-Credit-App/actions/runs/37646540641). No application or test change was required for that CI correction.

API revision mw-credit-app-read-dev-00007-st5 and Hosting version 7364ee7db2ffe012 passed seven bounded HTTP checks: static health200, unsigned Upcoming summary/detail401, deliberately invalid synthetic token401, POST405, wrong-origin403, and exact-origin GET preflight204. All returned no-store; preflight returned the exact allowed origin. This proves the unsigned boundary only, not authenticated owner reads or DB query execution.

Fresh desktop1440×900/mobile390×844 contexts rendered signed-out EN/Thai, zero business/API requests, zero records and no horizontal overflow. Thai mobile screenshot was visually inspected and shows the translated sign-in prompt and Google button. Evidence: refinement-live-api.json, refinement-live-hosting.json and four refinement-live-{desktop,mobile}-{en,th}.png. No real login, token or business data was used. Owner authenticated visual validation remains pending.

## Compact shell and bounded preview follow-up

Baseline e1bdb400206905a009653c4fe235ab718cba61a9; same owner-authorized checkpoint refinement. Final source accepted after the focused layout/focus corrections below.

- Actual-provider PostgreSQL **12/12 passed**. Summary returns exactly five previews ×25 rows in the 27-loan fixture; preview rows, next cursor, full-date total and read timestamp match fresh detail. Both summary and detail use **10 total store statements**, including BEGIN, timeout, database identity, Partner mapping and COMMIT; readUpcoming itself issues five queries. One synthetic loopback summary measured181ms. This is not a Cloud Run, network, cold-start or owner-latency benchmark, and no initial-load speed improvement is claimed.
- Updated defensive Upcoming units **4/4 passed**, preserving coverage/null/invalid-source, scope-bound cursor and auth rejection checks with the consolidated snapshot shape.
- Relevant browser coverage across runs: **11 passed, one intentional mobile duplicate SDK skip**: Upcoming2, grouped Borrower/Loan2, Collection2, persistence5. Final Upcoming desktop/mobile rerun passed2/2 after deterministic refresh synchronization; final mobile viewport confirmation passed1/1. No unchanged SQL or broad infrastructure rerun followed CSS-only fixes.

Preview checks establish zero extra HTTP for a valid current-parent first page, unchanged original read timestamp, and fresh requests after60seconds, Bangkok midnight, visibility resumption, explicit detail refresh and next-page navigation. Held responses after route changes cannot restore data. Existing Collection auth/date/logout races and actual Firebase SDK synthetic storage/reopen/cross-tab tests passed; none claims real Google owner-session verification. No business disk cache was introduced.

Status is a descendant of the actual orange topbar. Header geometry remains stable across held loading, success and error. Desktop icon-only collapse widens content; accessible names/title/selected state remain and keyboard toggle restores full labels. Desktop body stays viewport-bounded and panes scroll independently. Long-list loan Back/heading remains visible after selection, pagination and refresh. Mobile dialog Tab stays within the menu, Escape/close returns opener focus, and the orange header remains at viewport y=0 after scrolling. Null actual Payment date is absent from local detail.

Testing found genuine shell defects: inherited shared main margin:auto prevented content stretch and bounded pane height, leaving long-list detail Back offscreen; native dialog focus could leave the menu. B reset main sizing/desktop containment and added scoped Tab wrapping/focus return. The original repro assertions now pass. A separate mobile loan-heading test was updated from absolute top100px to the new sticky-header-relative boundary. A cache-test helper initially accepted old Updated before a refresh completed; it now holds the response and explicitly observes Loading then Updated, without relaxed timeouts or assertions.

### Final visual evidence

- desktop-chromium-SHELL-summary-en.png — expanded sidebar and compact panes.
- desktop-chromium-SHELL-collapsed.png — icon-only sidebar and wider content.
- mobile-chromium-SHELL-menu.png — modal navigation.
- mobile-chromium-SHELL-upcoming-th-viewport.png — actual390×844 viewport, sticky header at y=0, no blank space above it.
- Other SHELL loading/summary/upcoming/regression/group screenshots retain synthetic EN/Thai evidence. Full-page mobile captures at a scrolled position can place the sticky header partway down the full document image; the viewport capture and geometry assertion establish the actual visible result.

Final diff whitespace check passed. Parent preview preserved; disposable test processes stopped. Owned changes for publication: tests/e2e/{collection-read,upcoming-read,grouped-read}.spec.ts, tests/unit/upcoming-read.test.mjs, tests/integration/collection-postgres.test.mjs, this report and new SHELL PNGs. Historical image paths were not overwritten. CI/deployed verification for this follow-up remains D/parent-coordinated; owner visual acceptance remains separate.

Final owner width checks also passed in the focused desktop case: at2560×1440, header width is2560, expanded/collapsed rails are180/72, main begins immediately after the rail and ends exactly at2560, and grid padding is16px. Unselected Borrowers/Collection lists fill the available grid at1440/2560; hidden empty detail does not reserve space. Selected panes retain approximately40/60, and Back to Collection restores the full-width list. Evidence: desktop-{1440,2560}-SHELL-list-{expanded,collapsed}.png and desktop-2560-SHELL-{expanded,collapsed}.png. Final added desktop Back assertion rerun passed1/1; final diff check passed. This completes the scoped test freeze; counts above represent unique relevant cases, not repeated executions.

### CI navigation synchronization correction

Exact application source5d203daf641973a02e3d1268cbcd69983bd9435f CI37651900847 failed one mobile Collection case (36passed/3skipped). The test navigation helper sampled menu visibility immediately after asynchronous sign-in, before the ready-state menu existed, then attempted the still-hidden Collection action. Both owned navigation helpers now branch on the known viewport breakpoint and use Playwright's normal auto-waited Open navigation click. No application change, force click or timeout increase. Focused affected mobile Collection/Upcoming rerun passed2/2; final whitespace check passed. The original CI is recorded as failed; corrected-commit CI remains to be verified after D publication.

### Final shell deployment smoke

Corrected validation c280c58c539b7f1e1576d108ff0587a55f5a89e2 [CI37652555729 passed](https://github.com/welct0407/MW-Credit-App/actions/runs/37652555729); built application remains5d203daf641973a02e3d1268cbcd69983bd9435f. D deployed API mw-credit-app-read-dev-00008-9fw and Hosting49547c853832dd36.

Seven bounded unsigned API checks passed (health200, summary/detail401, invalid synthetic token401, POST405, wrong-origin403, allowed GET preflight204), all no-store. Fresh signed-out EN/Thai contexts at1440×900,2560×1440 and390×844 passed: no API/business requests, no records or overflow, header x=0/y=0 and exact viewport width, status inside header. This is unsigned deployment evidence, not authenticated owner latency or business/provider execution proof. Evidence is shell-live-api.json, shell-live-hosting.json and six shell-live-{desktop,wide,mobile}-{en,th}.png. Owner authenticated visual review remains separate. C evidence frozen for publication.

## Mobile bottom navigation and account-control refinement

Baseline a357435230cbbaa6be084b1b17363bfacd1483f6. UI-only follow-up; previous SQL/provider/permission evidence reused because backend and access contracts are unchanged.

**15 relevant browser cases passed; one intentional duplicate mobile SDK case skipped.** Collection desktop/mobile2 passed; grouped, loan, live-auth, persistence and Upcoming suites13 passed/1skip. Existing account actions now use a shared test helper matching the relocated controls. No timeout relaxation or force clicks.

The mobile header contains menu/logo/title and icon-only status, measures at most80px in the fixture, and has no DEV line, language group or sign-out button. Localized status remains in a polite live region with visually clipped text; held-loading geometry and reduced-motion checks pass. Mobile Borrowers/Collection appear exactly once in the bottom navigation and neither appears in the drawer. The drawer retains language and signed-in sign-out, keyboard Tab wrapping/Escape/focus return. Signed-out English/Thai switching remains reachable without business navigation or sign-out. Desktop has no visible bottom bar; expanded/collapsed sidebar account controls have accessible names/tooltips, and the collapsed language panel supports Enter/Escape/focus return.

At390×844, the last Upcoming page/refresh control can be scrolled entirely above the fixed bottom bar. Sticky header, Back visibility, list/detail navigation, full-width desktop states, memory-preview invalidation and late-response/auth isolation remain covered. Actual Firebase SDK synthetic persistent-session reopen/cross-tab checks passed; this is not real Google owner-session verification. Safe-area CSS is present; physical notched-device testing was not performed.

Synthetic review images use COMPACT filenames: mobile-chromium-COMPACT-bottom-en-viewport.png, mobile-chromium-COMPACT-menu.png, mobile-chromium-COMPACT-upcoming-th-viewport.png, desktop-chromium-COMPACT-summary-en.png and desktop-chromium-COMPACT-collapsed.png, plus related EN/Thai/full-width captures. No product defect was found in this batch.

C-owned freeze: tests/e2e/live-controls.ts; affected collection-read, upcoming-read, grouped-read, loan-read, live-read and persistence spec files; this report and new COMPACT images. Loan/live regression runners incidentally regenerated their prior tracked r052-loan-read screenshots; D should restore those historical PNGs to the published baseline rather than include them. Parent preview preserved and test servers stopped. Publication/exact CI/Hosting-only unsigned smoke and owner review remain separate.

### Compact UI Hosting-only deployment verification

Exact source d959e6fca428b643e685e50e5a684bc1ee058108 [CI37656348383 passed](https://github.com/welct0407/MW-Credit-App/actions/runs/37656348383). D deployed Hosting dacf7a53b31f09b0; API00008-9fw was unchanged and not probed.

Fresh unsigned1440×900 desktop and390×844 mobile contexts passed English/Thai sign-in prompt and language access checks. Both headers measured76px high, full viewport width atx0/y0; no visible DEV line/account controls in the header, no business navigation/sign-out while signed out, no records, no API requests and no horizontal overflow. Mobile language is reachable in the account drawer. Evidence: compact-live-hosting.json, compact-live-{desktop,mobile}-{en,th}.png and compact-live-mobile-account-menu.png. No owner session, credential inspection or business data was used. Signed-in bottom navigation is supported by the separate synthetic tests; actual owner authenticated visual review remains pending. C evidence frozen for publication.

## Workspace trim verification — 8 October 2026

Baseline d620f5b3352278938703fcd83da1157850dd753d. Synthetic browser fixtures only; no DNS/TLS, live API, Google login or business data checks in this slice.

Final relevant browser results: 8 cases passed across desktop/mobile in collection-read, grouped-read, upcoming-read and live-read (6 passed in final combined run; 2 grouped cases passed after correcting a test assertion's accidental placement in beforeAll). The first run exposed a real header sizing defect: inherited 4px/1px borders produced 61px instead of 60px desktop/56px mobile. B removed those redundant borders; exact dimensions now pass. A prior desktop heading top+100 expectation became obsolete when removed text shortened the page; the replacement verifies full visible heading and maximum-scroll clamping, without forced clicks or timeout changes.

Verified header refresh clears selected Borrower/Collection detail and issues exactly one first-page request, disables while the active view loads, and retains route/logout late-response isolation. Removed root toolbar, freshness paragraphs and About block remain absent. Collection's header status waits for both child reads, remains geometrically stable, and preserves error/reduced-motion announcements. Internal memory preview zero-HTTP click, 60-second expiry, visibility/date invalidation and fresh paging checks still pass. Existing backend/provider SQL and real-SDK persistence evidence is reused; not rerun or claimed newly verified. Persistence test references were mechanically updated to the new root refresh accessible name.

Desktop 1440/2560 expanded/collapsed full-width geometry, independent panes, nested Back/paging and mobile last-pager clearance passed. Upcoming tests use 320x844; grouped and Collection regressions retain their configured mobile viewport. EN/Thai rendered without page overflow; controls at least 44px. Synthetic captures use TRIM in filenames, including desktop-chromium-TRIM-summary-en.png, mobile-chromium-TRIM-upcoming-th-viewport.png and mobile-chromium-TRIM-menu.png. Parent reviewed the summary and Thai viewport with no visual blocker. These Chromium checks do not establish physical-device accessibility or owner-authenticated acceptance.

All owned test servers stopped. Parent's existing preview retained. git diff --check passed. Four incidental historical REFINED-*-AUTH-*.png outputs under r052-loan-read should be restored by publication owner D; only new TRIM evidence is intended for this refinement.
