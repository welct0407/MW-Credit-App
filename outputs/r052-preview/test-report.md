# R052 checkpoint 1A verification — 7 October 2026

Scope: local synthetic Collection/Borrowers design preview only. Baseline 761b7010; implementation/test commit will be recorded by orchestrator at publication.

## Result

- Final `npm run check`: TypeScript/Vite build passed without CSS warnings; all 6 unchanged environment guard unit tests passed.
- Final `npm run test:e2e`: 15 passed, 1 deliberately skipped (desktop duplicate of mobile-only Thai screenshot), 9.3 seconds.
- Verified fixture-derived amount due THB 4,400 across 3 borrowers, distinct from THB 90,000 principal. Summary labels identify portfolio totals while filtering changes visible borrower count.
- Verified Collection status, borrower active/inactive groups, search, empty/reset, two-loan detail, no-active-loan detail, mobile Back, EN/Thai labels and fixed sample date.
- Verified keyboard list activation, mobile drawer focus trap, Escape and focus return. Narrow 360px and 390px mobile layouts and 1440px desktop had no page overflow. Last mobile borrower and planned payment control can be reached by scrolling.
- Observed only local GET requests during the exercised workflow; no API/external/business posting requests. Local/session storage, Cache Storage and service-worker registrations were empty. Payment action is disabled and receipt is explicitly a placeholder.
- Inspected final English390 and Thai360 viewport images: meaning-bearing text is more legible after the readability correction; no clipping observed. Owner visual acceptance is pending.

## Evidence

- `desktop-collection.png`, `desktop-detail.png`: 1440×900 viewport, full-page captures.
- `mobile-collection.png`, `mobile-detail.png`: 390×844 viewport, full-page captures.
- `mobile-viewport.png`: visible 390×844 viewport.
- `mobile-thai-collection.png`: Thai390 full page; `mobile-thai-360-viewport.png`: visible Thai360×844 viewport; `mobile-thai-detail.png`: Thai360 full page.
- Screenshot pixels use the configured emulated device scale; CSS viewport sizes above are the interaction sizes.

## Resolved findings and limits

Initial test selector assumptions were corrected for desktop-hidden Back, mobile decorative-icon names and nested notice text. Formatting introduced two invalid CSS pseudo-class selectors; Agent B fixed both and final build has no CSS warnings. Small/low-contrast mobile labels were improved before final capture.

No deployment, live database/API/AppSheet checks, authentication, financial posting, offline behavior, real-device or browser-engine parity was tested or claimed. This checkpoint is suitable for owner visual review, not production readiness. Existing reports remain in their current tools; native management/analytics remain pre-go-live scope and Metabase follows production go-live.

## Owner-requested visual revision — 7 October 2026

Final revision result: clean `npm run check` (build and 6 guard tests), and `npm run test:e2e` with 17 passed / 1 intentional duplicate screenshot skip in 9.6 seconds. Earlier checkpoint evidence above is superseded where this section changes the presentation.

- Portfolio principal summary card removed; exactly two white summary cards remain. Fixture financial values are unchanged; borrower/loan principal checks still pass.
- DEV primary color computed as rgb(232,113,10), exact #e8710a; PROD-style preview rgb(216,27,96), exact #d81b60. Both local presentation states show the explicit “Colors only · no environment change” notice. Switching colors produced no requests; reload returns to default DEV, and ?theme=prod affects local presentation only.
- All summary card backgrounds are white, selected resting borrower cards white, and summary text/status backgrounds transparent. The permitted neutral hover background is tested separately from resting state by moving the pointer away before the white-surface assertion.
- Bundled original logo SHA256 matches the existing AppSheet recovery asset byte-for-byte: 5808EE79D5B6E843C8ED648E8507678EA349297D1CC687A97021C5D396DD2A8D. Browser image complete/naturalWidth>0 verified, with alt text Loan Manager.
- Existing interaction, keyboard, EN/Thai, 360/390/1440 layout and local-only checks all pass. DEV mobile and local PROD-style desktop images visually inspected: no green summary highlight or portfolio principal card; original logo renders on desktop, white surfaces retained.
- Updated captures: dev-desktop-style-viewport.png, dev-mobile-style-viewport.png, prod-desktop-style-viewport.png and prod-mobile-style-viewport.png. PROD names denote local style previews only. Existing collection/detail/Thai captures were refreshed to this revision.

The parent-owned preview server was reused on port4173 and was not stopped by this test run. No live API/database/AppSheet operations, deployment, credential or financial writes were performed. Owner visual acceptance remains pending.

Final palette follow-up: inactive mobile navigation foreground changed from residual green to neutral #565656. Clean build rerun passed; the five affected visual/layout/logo/theme checks passed, with one deliberate desktop duplicate skip (screenshots refreshed). Earlier 17-check interaction pass remains valid for this CSS-only change; six unchanged guard results reused.
