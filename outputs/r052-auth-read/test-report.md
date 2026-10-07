# R052 real-DEV auth/read — independent synthetic verification

Baseline a3d21d5. Tester performed no live Firebase login, database query, deployment, grant, financial write or production operation.

## Results

- Synthetic build and `build:live-dev` both passed TypeScript/Vite compilation.
- `npm run check`:70 unit tests passed. After the final removal of public readiness SQL, the29-test real-boundary unit file passed again, including its new no-SQL readiness test. Total current unit inventory is71 (42 existing +29 real-boundary tests); unchanged prior42 results reused.
- Targeted live-entry browser suite:2 tests passed (desktop/mobile),4.8seconds. Firebase client modules and API responses were intercepted with explicit synthetic fixtures. These are not successful real authentication tests.
- Live JavaScript bundle inspection found no synthetic simulator/fixture markers. Public configuration was test-only; build compilation does not establish deployable provider configuration.
- Source review confirmed actual entry wiring uses Firebase Admin `verifyIdToken(token, true)`, dedicated DEV configuration, startup database identity check, and a separate read store. No public readiness route invokes SQL.

## Boundary coverage

- Exact DEV project/database/instance/reader/origin configuration; emulator disabled; explicit email-bootstrap or uid-pinned mode. UID-pinned mode requires its pin; both modes require the verified owner email.
- Bearer parsing, token verifier invocation with revocation checking, wrong audience/issuer/provider/tenant/time/email/UID, SDK revoked/disabled/expired/invalid errors, and sanitized denials. Cryptographic verification itself is delegated to Firebase Admin and was mocked here.
- No SQL on invalid token/nonowner, malformed list inputs or public readiness route. Unique normalized Partner Login Email lookup precedes borrower reads; absent/duplicate mapping and wrong database identity deny.
- BEGIN READ ONLY, bounded keyset pagination, Hidden Flag IS FALSE, explicit SELECT fields, parameterized IDs/cursors, exact decimal string/null projection, next-cursor behavior, Bangkok date envelope, rollback/release and generic source errors. No borrower/bank/contact/document data is present in fixtures or published evidence.
- HTTP exact-origin CORS, GET/OPTIONS-only methods, no credentialed CORS, no-store headers and sanitized API failures.

## Mocked browser evidence

The four `*-MOCKED-*.png` files show only the named SYNTHETIC BROWSER FIXTURE. Verified initial signed-out state, no simulator inclusion, bearer GET without cookies, fractional principal display, detail read,403 clearing prior data, immediate signout and rejection of a delayed pre-signout response. English/Thai controls exercised; local/session storage remained empty and no external provider/API network calls escaped interception. Mobile allowed screenshot visually inspected; no apparent clipping.

Isolated test Vite servers on4300/4301 were shut down; parent-owned4173 preview was preserved. Screenshots do not prove live login, actual permissions, DB financial parity or production readiness. Parent owns infrastructure/provider/live validation and deployment evidence. No broad historical screenshot regeneration was performed for this test batch.

## Live transport smoke and CI investigation

After owner-authorized service-only transport exposure, new read API application denials were observed directly: anonymous401 sign_in_required, invalid dummy bearer401 session_invalid, wrong origin403, exact allowed-origin preflight204, POST405 and removed /readyz401. Application responses carried no-store. No valid token, owner sign-in or business data was used. Original infrastructure API remains anonymous403/IAM-protected. Status-only/safe denial JSON evidence is in live-smoke-*.json.

Exception: new /healthz returned404 HTML rather than expected static200; Agent D is investigating whether the platform intercepts this path. This is not recorded as a passing static-health check.

CI run37613233717 for24c1981 failed one desktop mocked-browser click at scroll-into-view after visibility/enabled/stability checks;23 passed,2 skipped. Workflow did not upload a trace. Focused desktop one-worker local reproduction with tracing repeated3times and all passed (11.4seconds). No application defect found in B's source review; failure root remains unconfirmed. No force-click, timeout extension or speculative source fix was applied. A single CI rerun was recommended; result pending.

The single approved CI rerun of37613233717 completed successfully (attempt2) without force-click, timeout or speculative cache changes. The original failure remains recorded; its precise cause is unconfirmed. New source18c3736 replaces the new service's reserved /healthz path with /health. Focused boundary tests30/30 passed, including static health200/no SQL; D reports full unit72/72 and final-source CI37614765595 is pending at this note.

## Final deployed smoke and optimizer correction

Corrected deployed /health returned200 with no-store and static {status:ok,environment:dev,service:borrower-read}; the earlier reserved-path failure is superseded by live-smoke-health.json. Fresh desktop/mobile Hosting browsers returned200 and showed signed-out UI in English/Thai, visible Google sign-in control, zero borrower rows, zero read-API requests, zero page errors and empty local/session storage. Sign-in was not clicked. Final logo loads were explicitly awaited before screenshots.

Final-source CI18c3736 again failed the first desktop mocked live-entry case while mobile passed. This invalidated the earlier simple transient-runner interpretation. B established from installed Vite source that dependency scanning reads raw index.html before the mode-specific HTML transform: it was scanning the synthetic entry while serving the live entry, creating a documented late-discovery/rebundle/reload risk. The exact causal link to the historical CI failures remains inferred because their traces were not retained.

B corrected optimizer entries/includes per mode. Tester isolated each live test server's dependency cache under ignored root node_modules/.cache, broadened mock route matching for that cache, captured failure diagnostics and asserted exactly one main-page navigation. No force-click, relaxed timeout or application-state workaround was added. Four fresh-cache desktop/mobile repetitions passed(13.9s); final two-worker desktop/mobile run with concurrently checked synthetic mode passed(4.7s). Parent4173 remains preserved; test servers close afterward. Generated scratch dependency caches were removed from untracked .tmp and remain excluded from publication. Final CI after publication is pending.

After D pinned the verified owner UID in revision00003-pzr, one bounded recheck confirmed /health200 and anonymous /api/borrowers401, bothno-store. Evidence: live-smoke-uid-pinned-boundary.json. This is separate from the owner's reported successful login/list/detail before pinning; tester used no valid token and read no real borrower rows.
