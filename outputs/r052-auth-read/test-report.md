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
