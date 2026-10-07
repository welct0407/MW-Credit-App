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
