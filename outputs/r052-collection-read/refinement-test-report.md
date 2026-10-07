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
