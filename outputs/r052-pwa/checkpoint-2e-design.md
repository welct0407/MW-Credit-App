# R052 checkpoint 2E — Installable DEV application and safe offline fallback

8 October 2026 (Asia/Bangkok). Agent A design; B application/build implementation; C independent tests; D Hosting delivery, documentation and publication. Application baseline `845efef2`; PM baseline `4f59443b`. Owner authorized continuation and a theme-colored mobile bottom bar. Parent reports canonical DEV HTTPS/TLS verified and owner confirms sign-in, records and refresh on `https://dev-lm.mw-credit.com`. R052 remains Open; Phase 2 remains incomplete.

## Bounded deliverable

Add the missing Phase 2 manifest, install affordance, controlled application update lifecycle and an explicitly limited offline fallback. Current source has no manifest/worker/install path; current deployment sets no-store and existing business records/previews are memory-only. Preserve that data boundary. This checkpoint provides offline reconnect information, not offline business records or drafts. No API, database, permissions, production, financial workflow or push/background-sync scope. Preserve owner-pinned Firebase authorization and persistent sign-in.

Canonical install origin is `https://dev-lm.mw-credit.com`. Existing web.app remains the online fallback with no manifest attachment or worker registration. Synthetic builds must not acquire the live worker or install identity. A test-only harness may register the real worker on localhost; it must not weaken the shipped canonical-origin guard.

## Manifest and assets — B

Live-build output includes a manifest with stable relative id `/`, start_url `/`, scope `/`, name and short_name `MW Credit DEV`, display `standalone`, theme_color `#e8710a`, background_color `#ffffff`, and valid PNG icons at 192 and 512 pixels with purpose `any`. Derive icons and an Apple touch icon (180 pixels) from the approved current logo, preserving its appearance/aspect and padding; do not invent a new logo or claim a maskable asset without preparing/testing its safe zone. Attach manifest/theme/touch metadata only for the canonical live origin. App identity stays stable across build versions.

Use progressive enhancement in the existing account/navigation menu: Install appears only when a real beforeinstallprompt event is available, prompts only on user gesture, and handles acceptance/cancellation truthfully. Hide installation affordance in standalone mode. A concise manual browser-menu/Add to Home Screen help item is acceptable where no programmatic prompt exists; do not fake installation or insist every browser exposes the same UI. Keep installation and update controls accessible when desktop navigation is collapsed. No new main-header busy bar.

## Worker and data boundary — B

Use a small maintained worker, not a new runtime framework. Register fixed `/sw.js` at scope `/`, canonical live build only, using updateViaCache none. Emit a deterministic build identity into worker bytes so an application release triggers update detection. Check updates on registration and return to a visible page with sensible throttling; no frequent background polling.

Precache only an explicit public allowlist: self-contained `/offline.html` and the exact public app icon files. Cache names have an application-owned prefix and build version. Install fails if required public assets are missing/invalid; retain the previous active worker. Do not cache index.html, application JS/CSS, API output, authorization headers, tokens, Firebase resources, borrower records or documents. Existing SDK-managed auth storage is unchanged and is not a worker cache.

Fetch handling is deliberately narrow: only same-origin GET navigation to `/` with no query and no Authorization header uses network-first navigation with `/offline.html` returned on network failure. Every other request passes through without worker response substitution or caching: especially cross-origin, non-GET, `/api/`, `/__/auth/`, OAuth/token and query-bearing paths. Do not synthesize successful API responses or mask HTTP authorization/server errors as an offline page. The root HTML is fetched but never stored. Static fallback and icons are public assets and contain no runtime identity/data. Keep fallback styling self-contained; never load business application scripts in it.

The offline document shows short English and Thai text explaining connection is required, plus an accessible reconnect/reload control. It must not claim sign-in, current balances, saved records or successful updates. In an already-open application, an offline event cancels outstanding reads, clears business state and unmounts Collection/preview state before presenting a compact reconnect screen. Keep Firebase session storage intact. An online event is only a connectivity hint; explicit reconnect reloads and obtains fresh identity/API authorization before displaying records. No queued requests, background sync or automatic financial work. Guard late auth/read callbacks so they cannot repopulate the offline screen.

## Update and recovery lifecycle

A newly installed update waits; do not call skipWaiting automatically. A waiting-worker menu action says Update and reload and requires an explicit gesture. Post the bounded activation message to the waiting worker and reload the initiating page only once after activation/controller transition. Receiving controllerchange in another tab must not silently reload that tab or discard active detail; offer its own Reload action. First installation is not an available update and must not cause a reload loop. No claim that cached preview selection refreshes source data. Future draft workflows must extend this explicit action with unsaved-work handling before they are introduced.

On activation, remove only older caches with this application's owned prefix, never unrelated caches or SDK storage. Since no app bundle is cached, retained tabs continue their existing memory-loaded bundle; incoming navigations fetch current HTML. Existing tabs may defer reloading without losing current context. Worker install/update/storage failures leave the ordinary online app usable, with a truthful menu status where needed.

D records prior Hosting version and the matching worker/cache version. Rollback serves a valid earlier worker at the same URL and proves it can supersede the newer version; restoring a pre-worker release alone is insufficient because an installed worker survives file removal. If retreating completely, deploy a reviewed network-only retirement worker at the same URL that removes only owned caches and unregisters itself. Do not clear Firebase persistence. Test normal A-to-B update and B-to-A/retirement recovery on synthetic local builds before publication.

## Hosting delivery — D

Deliver `/sw.js`, manifest, offline document and icons as real files with correct MIME types, not SPA HTML rewrites. Worker responses remain no-store/no-cache and must be revalidated; existing no-store policy for the rest can remain. No extra origin/access grant is needed. Confirm versioned public assets and actual custom-domain delivery, preserving web.app fallback. No production or unrelated DNS work. A/B coordinate build/deployment interface; D alone owns deployment tooling/header changes.

## Mobile theme refinement

Within existing mobile-only bottom navigation, set container including safe area to var(--brand-primary), transparent buttons and var(--header-foreground). Selected route remains aria-current page, bold and has a 3px currentColor indicator; color is not the only cue. Use subtle transparent hover/focus feedback and a visible keyboard focus outline. Preserve two existing routes, 64px plus safe area, readable labels, 44px targets, content padding, auth gating and absence on desktop. No future routes or duplicate drawer entries.

## Independent acceptance — C

- Validate manifest identity/scope/display and real icon sizes/MIME; canonical live build attaches/registers, fallback and synthetic build do not. Installation prompt is user-triggered and cancellation/unsupported/standalone states are honest. Native OS installation and device-specific manual flows are separately reported if unavailable to automation.
- Exercise the actual worker in a browser: first install, reload online, offline navigation fallback, reconnect, update waits, explicit activation reloads only initiating tab, another active tab retains detail, failed install retains old worker, owned-cache cleanup and rollback/retirement recovery. Inspect Cache Storage after synthetic authorized read flows: only allowlisted public asset URLs, no API/auth/HTML/bundle/business responses. Verify unrelated caches/auth persistence survive cleanup.
- Exercise already-open offline transition with an in-flight response and Collection preview: data clears, late callbacks cannot repopulate it, no queued requests, explicit reconnect yields new authorized reads. Retain owner denial/revocation and same-origin sign-out behavior; do not infer actual owner sign-in from mocked tests.
- Check bottom-nav DEV contrast, active/focus distinction, narrow EN/Thai mobile view, safe-area/last-item access, hidden desktop and signed-out nav. Reuse current independent-scroll/header tests unless a changed layout invalidates them.

Stop after tested DEV publication and a concrete owner install/offline/update visual checkpoint. D updates the progress overview, release evidence and any actual limitations; do not mark all Phase 2 complete or silently advance to financial work. Native offline records/drafts, full parity, remaining API foundations and later phase gates remain separately tracked. Phase 7 Metabase enhancements remain post-go-live.

## Current platform references

Checked 8 October 2026: [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) describes manifest/icon requirements and browser differences; [MDN icon guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Define_app_icons) covers icon preparation. [Service worker lifecycle](https://web.dev/articles/service-worker-lifecycle) explains waiting/activation and origin cache ownership; [PWA update guidance](https://web.dev/learn/pwa/update) supports explicit update handling. These sources establish platform behavior, not evidence that this implementation or a particular device is already verified.
