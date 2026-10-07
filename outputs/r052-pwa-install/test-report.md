# R052 checkpoint 2E independent verification

8 October 2026, Agent C. Synthetic data and isolated browser profiles only. Parent accepted canonical-domain owner login separately; these tests do not access that profile or establish native OS installation.

## Results

Six focused cases passed: actual-worker lifecycle (1), built canonical application/two-tab lifecycle (1), and synthetic-auth offline/expiry races on desktop and mobile (4). Duplicate mobile runs of the two worker-level cases are intentionally skipped by their declarations; lifecycle tests run once in desktop Chromium while the canonical case separately creates a 320px mobile context.

- The maintained worker caches exactly offline.html and three public PNGs. Synthetic Authorization/API/auth/non-GET requests do not add cache entries. A root HTTP503 remains503, rather than becoming the fallback.
- A-to-B waits for explicit activation. Existing second-tab context remains; the initiating app tab reloads once, another offers its own Reload app action. Rejected activation-message delivery leaves a usable retry; retry activates successfully.
- Missing required asset makes installation fail and retains B. Serving valid A again successfully rolls back. The actual retirement worker removes only the owned cache prefix and unregisters; unrelated cache and synthetic auth marker survive.
- Real offline root navigation displays the static bilingual reconnect page without application scripts. Online reload recovers. Synthetic restored-session offline events clear records, suppress late reads/auth callbacks and do not sign out; an online event alone does not repopulate. Explicit reconnect obtains a new authorized read. Delayed401 sign-out completion cannot overwrite the offline reconnect screen.
- Built canonical-origin app attaches the manifest and registers the real worker. The same built files on fallback web.app do neither. Private loopback TLS and browser-only host resolution exercise the exact shipped origin guard; no system DNS/trust store or live endpoint changed. External requests are blocked. Synthetic builds retain their existing no-worker foundation contract (prior evidence reused).
- Manifest identity, start/scope, standalone mode, DEV theme and real decoded192/512 PNG dimensions pass. A synthetic beforeinstallprompt verifies no prompt before user action and truthful dismissal. This is an event/UI check, not proof of native browser installation. Apple180 output is delivery-helper checked; OS install/reopen remains owner validation.
- DEV bottom navigation measured orange, selected bold/current marker and3px keyboard outline, with computed text/background contrast at least4.5:1. EN/Thai captures are synthetic. Desktop bottom navigation remains hidden. Existing safe-area/last-pager and independent-scroll evidence is reused; no physical-device accessibility claim.

## Corrections and scope

A identified activation failure/reload-intent cleanup and delayed expired-session/offline completion paths; B corrected both before final verification. Initial test-only failures were corrected without relaxing timeouts: rollback awaited actual activation cleanup rather than install-cache creation, and reconnect waited for the restored-observer harness to initialize after reload. No product workaround or source edit was made by C.

No API/database/grants, owner credentials, financial writes or production systems were tested or modified. C did not rebuild or overwrite D's managed-config dist artifact. Worker source tests substitute only the build-version placeholder in their loopback server. TLS fixture keys are ephemeral test identities, never saved to the repository or installed in a trust store.

## Evidence and handoff

Files: tests/e2e/pwa-worker.spec.ts, pwa-canonical.spec.ts, fixtures/worker-server.ts, fixtures/canonical-server.ts, and added cases in persistence.spec.ts. Screenshots in this directory: canonical-menu-desktop.png, canonical-menu-mobile.png, canonical-menu-mobile-th.png, canonical-update-waiting.png, offline-mobile.png, theme-bottomnav-en.png, theme-bottomnav-th.png.

Parent reviewed mobile Thai installation menu, offline reconnect and desktop waiting-update captures with no visual blocker. C test servers/browsers closed. Await exact-source CI, DEV publication, scoped unsigned asset delivery verification, and owner install/offline/update visual checkpoint. Phase2 remains incomplete; R052 remains Open.
