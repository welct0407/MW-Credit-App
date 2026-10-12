# R052 checkpoint2D — independent custom-domain verification

Date: 2026-10-08. Synthetic verification only; no owner session or authentication-store inspection.

## Source checks

53 focused origin/auth/read-boundary tests passed across dev-origins, dev-read-boundary, loan-read, collection-read and upcoming-read. C independently added configuration/rollback edge cases and an actual loopback HTTP-server test to B's initial51 checks.

Both exact allowed sets are accepted, frozen, and immutable. Missing/malformed JSON, missing fallback, duplicates, arbitrary/alternate hosts, noncanonical ports/paths/credentials, null and legacy/new ambiguity reject. New-image fallback-only JSON permits the original Hosting origin while denying the new domain. The new image rejects singular-only configuration; actual old-revision image/environment recovery remains D's operational responsibility and was not performed by C.

Actual loopback HTTP verifies exact allowed-origin echo, Vary:Origin, no-store, no cookies/credentials, GET/Authorization preflight, denied origins before verifier/store, synthetic revoked-token401, failed mapping403, and no-Origin requests still requiring bearer verification. The underlying revocation/UID/mapping and no-SQL-before-denial tests pass. These are injected verifier/database fixtures, not live Google identity verification.

No application defect found. Frontend authentication helper/persistence and database permissions are outside this source change and retain prior evidence.

## Responsive gaps

One focused browser case passed at1024×900,768×900 and640×900 with touch emulation, long loan lists, Back/detail/pager clearance below sticky header and above bottom navigation, drawer Tab wrapping/Escape focus return, Thai text and no horizontal overflow. Screenshots: gap-1024-th.png, gap-768-th.png, gap-640-th.png. The640px case covers a narrow effective viewport/reflow; it does not claim browser-native zoom or a physical touch/notched-device test. Prior1440/2560 and390 desktop/mobile evidence is reused. Initial new test locator omitted the existing arrow prefix from Back to loans; corrected without product change or timeout relaxation.

## Handoff and pending live verification

C-owned edits: tests/unit/dev-origins.test.mjs (two independent additions), tests/e2e/responsive-gaps.spec.ts and this output folder. B owns its other fixture migrations; D owns infrastructure, DNS/certificate, documentation and publication. No live DNS/grant/API mutation by C. Source is ready for exact-commit CI and deployment checks.

Pending D delivery: confirm new-domain HTTPS/certificate/current release and fallback remains available, exact live CORS and unsigned desktop/mobile EN/Thai UI. Actual owner Google sign-in/read/refresh/sign-out on the new origin is separate owner validation; no token/session copying between hosts.

## Deployed API origin boundary

Exact source838561430faefdbf128ea2e802992e590e6352b6 [CI37660003633 passed](https://github.com/welct0407/MW-Credit-App/actions/runs/37660003633). D deployed paired image/JSON origin configuration as mw-credit-app-read-dev-00009-5x5.

13 bounded live HTTP checks passed: both permitted Origin values receive their own exact CORS echo with unsigned401/invalid synthetic bearer401 and valid GET/Authorization preflight204; null/trailing slash/explicit443/suffixlookalike origins return403 without CORS echo; no-Origin unsigned/invalid bearer remain401; POST returns405. All responses retain Vary:Origin and no-store, with no credential CORS. Evidence: live-api-origins.json.

This establishes API handling of the Origin header only. It does not establish new-host DNS, certificate, HTTPS or authenticated owner access. DNS delivery remains pending. Unchanged fallback Hostingdacf7a53b31f09b0 reuses its preceding fresh signed-out EN/Thai evidence; no duplicate browser run was needed for this API-only delivery. No real token, owner session or business record was accessed. C evidence frozen pending later domain-readiness handoff.
