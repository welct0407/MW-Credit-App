# R030 — custom borrower matrix

**Current placement, R033:** owner accepted the custom chart. The old native plot and its four surrounding text labels are removed from tab31; question274 remains saved for recovery. Iframe1501 is now row31; method note row53 and detail table row56. [Cutover evidence](https://github.com/welct0407/MW-Credit-App/blob/de8d66a79bb0a6bb814359b427256b9912361a45/project/outputs/r033-matrix-cutover/README.md). The original comparison placement below is the dated R030 deployment.

## Scope

Owner authorized Debian hosting, necessary database access and insertion of a separate custom visual into existing Metabase dashboard 3, Borrower Health Review tab 31. Apps must remain untouched. This latest instruction supersedes the earlier proposed owner-only placement: dashboard 3 remains readable by Loan Report Partners, and its authorized readers/admins can obtain the shared iframe key. Possession of that key grants the same chart data until rotation. No Google login, paid Metabase feature or new VM is introduced.

## Implementation

`scripts/metabase/chart_service/` contains a dedicated Python WSGI service and dependency-free SVG chart. Gunicorn binds only to `127.0.0.1:8011` on `vm-mw-credit-agent`; a dedicated `mwcharts` service account and systemd resource limits isolate it from the integration agent. The verified Cloudflare HTTPS route publishes `charts.mw-credit.com` without opening an inbound application port. Metabase and the public website retain their current routes.

The API executes only `query.sql` against existing V43 `reporting_borrower_matrix_plot_v1` and the two borrower identity columns in `olap_borrowers_analytics`. New login `mw_chart_reader` has SELECT on those providers, two connections maximum, read-only default transactions, and a 12-second statement timeout. Role/grants are infrastructure prerequisites outside Flyway, consistent with database/README.md; no schema migration, financial write or category recalculation is introduced. Existing SQL remains V43.

The app authenticates every data request using a 256-bit random bearer secret, stored privately and represented by a SHA-256 verification digest in its protected server configuration. The iframe fragment bootstraps the client; it is removed from the frame's address and never included in HTTP request URLs. The client uses an Authorization header, memory only, no cookies/localStorage or third-party JavaScript. Secrets still exist in Metabase's saved iframe definition; anyone with the key can reuse it. The static shell is public and contains no borrower data. APIs are non-cacheable externally, provide no permissive CORS and reject arbitrary parameters/methods. A 60-second private process cache bounds SQL load; failures are retried after a short backoff and show an explicit unavailable state. A CSP restricts framing to the existing report host. This supplements, not replaces, authentication.

## Visual contract

- Four equal-size quadrants on desktop and mobile, classic ordering: Star top-left, Question Mark top-right, Cash Cow bottom-left, Dog bottom-right.
- Exact existing SQL `plot_x`/`plot_y` positions, no scaffold rows, display-score changes or retuned categories.
- R031 presentation update: muted grey category icons, category totals above the plot, and names directly above/below dots without connector lines. Nearby candidate positions reduce collisions; narrow screens prioritize boundary-constrained points. All dots remain radius5.5. Long names may truncate; the tooltip shows the full name. [Refinement evidence](https://github.com/welct0407/MW-Credit-App/blob/4a14d07/project/outputs/r031-matrix-labels/README.md).
- Tooltip starts with a 25px borrower name (23px mobile), then only that borrower's category badge. Raw payment score, contribution ratio, interest, principal, schedule, history confidence, reporting date and placement explanation follow.
- Search highlights matching names without moving points or changing category totals. Names toggle and manual refresh; automatic refresh every 60 seconds while visible, plus refresh on returning to the page. Timestamp is explicitly Bangkok.
- Explicit unplotted list for unavailable/invalid positions. Errors clear previously rendered private data rather than leaving an apparently live chart.
- Add the iframe below the existing matrix/method note, moving later cards down. Preserve original question 274, its placement and all other tabs, questions and filter definitions.

## Verification / current status

Prepared candidate: nine backend tests passed; JavaScript syntax passed. Synthetic browser preview verified 23 named dots, four equal rectangles, large-name/single-category tooltip and mobile rendering. Latest bounded production backup was restored into a disposable local database: all 26 table fingerprints matched. Dashboard recovery copy 7 and complete pre-change metadata are captured privately.

Deployed and verified on 25 September 2026. Placement1501 renders 23 named borrowers: 4 Stars, 8 Cash Cows, 5 Question Marks and 6 Dogs. Every returned field matches the same SQL query through Metabase source2. Browser checks verified four equal quadrants, 25px name heading, one category, search, names toggle and refresh. Missing/wrong keys return401; valid key returns200. Deployed source hashes match pin07efaac; chart, proxy and tunnel services are active. See [final verification](final-verification.json), [installation](metabase-installation.json), [manifest](release-manifest.json) and [single checklist](promotion-checklist.md).

On mobile Metabase gives iframe cards a shorter viewport, so the chart scrolls inside the card. The chart itself still has four equal quadrants and all23 labels. Desktop is the recommended monitoring view.

## Rollback

Retain the built-in chart throughout comparison. Remove only the new iframe and reverse its row offset using saved baseline metadata; restore the iframe-host allowlist only if no intervening changes occurred. Dashboard recovery copy 7 is available, but prefer the scoped layout rollback to preserve later work.

Remove only the new chart tunnel/DNS route, stop/disable `mw-report-charts`, and retain its private recovery files. Revoke the chart role's explicit grants, disable its login and terminate only its idle connections if required. Do not restore the business database or change AppSheet to undo this additive deployment. No integration-agent service/timer/route is stopped or changed.

## Operating notes

Credentials and complete secret-bearing Metabase metadata live outside Git under `C:/Users/MWCredit/Documents/ChatGPT/AppSheet-Loan-Project/r030-custom-matrix`; deployed config is `/etc/mw-report-charts/config.json` (root:mwcharts 0640). Git contains no credentials or raw borrower exports. Owner-managed backup coverage of the external credential directory is not independently verified; retain private deployment/recovery files on Debian too.

Rotate by generating a new secret, updating the digest and restarting only the chart service, then updating the iframe fragment privately; the old key must fail. Last rotated on 22 October 2026 (Railway incident). The canonical copy is now Secret Manager `mw-report-charts-key`, and the pre-rotation config is kept on Debian as `config.json.before-incident-20261022`. Never paste a live iframe URL into repository evidence, tickets or public documentation. Disable access by stopping the chart service or disabling its route. Metabase logout alone does not revoke a copied bearer key.

This is a live, automatically refreshed comparison visual. Dashboard filters and Metabase PDF/subscription rendering are not automatically inherited by iframe contents; current matrix scope is the same all-active-borrower population as the original built-in matrix.
