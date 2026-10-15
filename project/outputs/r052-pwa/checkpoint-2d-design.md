# R052 checkpoint 2D — DEV custom domain

8 October 2026 (Asia/Bangkok). Agent A design; B application changes; C independent testing; D infrastructure, documentation and publication. Starting application commit `e4d40a8`; PM commit `0a5ea649`. R052 remains Open. Owner accepted the preceding compact header/mobile navigation checkpoint and selected **dev-lm.mw-credit.com** for DEV. This is bounded Phase 2 continuation, not completion of Phase 2 or production authorization.

## Reconciled scope

The current application already has a bounded desktop viewport, fixed header, independently scrolling list/detail panes, full-width workspace, collapsible desktop navigation, sticky mobile header and separate mobile pages with safe-area bottom navigation. These are delivered behavior, despite older planned wording in the roadmap/progress record. Reuse valid recent tests; add only missing responsive/zoom/touch verification and fix demonstrated defects. Do not repeat the layout implementation.

Connect the chosen hostname to the existing Firebase Hosting site, permit that exact browser origin and verify owner sign-in/read behavior. Preserve `https://mw-credit-app-dev-737787224638.web.app` as a working fallback without a forced redirect. No new business workflow, schema, DB grants, production DNS, identity cohort, infrastructure policy or service worker/business-data caching. PWA manifest/install/update/offline design remains a later Phase 2 slice. Phase 7 remains after go-live.

## Application contract — B

Affected boundary: `services/api/dev-read-config.mjs` and `dev-read-handler.mjs`, plus focused tests/fixtures. Replace singular `ALLOWED_WEB_ORIGIN` with `ALLOWED_WEB_ORIGINS`, a JSON array. The only accepted sets are:

- `https://mw-credit-app-dev-737787224638.web.app` alone;
- that fallback plus `https://dev-lm.mw-credit.com`.

Require the fallback and reject missing/malformed configuration, duplicates, arbitrary origins, wildcards, string `null`, HTTP, ports, paths, query/fragment, credentials or alternate spellings. Match literal canonical strings; do not normalize untrusted origins into an allowed value. Return a frozen array. Ambiguous old/new environment configuration must not silently override the intended configuration.

For requests containing Origin, compare exact membership before business processing. Echo only a matched origin in Access-Control-Allow-Origin; keep Vary: Origin and Cache-Control: no-store. Preserve GET-only, Authorization-only preflight and denied-origin behavior. Do not add credentials/cookie CORS. Preserve existing no-Origin requests with mandatory bearer verification on business routes; CORS is not authentication. Health remains the existing static route. Every business request retains revoked-token verification, exact Firebase project/provider/email/UID, unique Partner mapping and read-only DEV database boundary.

Do not change the frontend Firebase authDomain, popup provider, SDK persistence, API URL or data flows merely to connect Hosting. Current helper remains `clever-oasis-508610-n7.firebaseapp.com`; branding the Google consent/helper domain is outside this slice.

## Declarative setup and migration — D

Target existing Firebase project `clever-oasis-508610-n7` and Hosting site `mw-credit-app-dev-737787224638`. Pinned google-beta 8.6.0 supports google_firebase_hosting_custom_domain (D inspected provider schema). Create only the chosen domain mapping; initial wait_dns_verification=false can obtain exact required DNS updates without claiming verified completion. Add `dev-lm.mw-credit.com` to authorized_domains while retaining current firebaseapp.com and web.app entries.

After verifying the intended Cloudflare account/zone and existing selected-host records, apply only Hosting-returned ownership/routing records for the chosen hostname. Preserve unrelated apex, mail, production and other DNS. Retain needed ownership records for certificate renewal. Do not invent A/CNAME targets, replace conflicting records without examining their use, or modify account-wide TLS/proxy/security policy. Cloudflare sign-in is currently unavailable; independent code/Hosting preparation can continue while access is restored.

Deploy the new API image and JSON environment setting together in one tested Cloud Run revision. Preserve runtime identity, pinned UID secret version and all other security settings. Keep prior revision/image/environment recorded. Verify fallback service first, then new-host DNS, ownership, certificate, HTTPS and correct Hosting content. A created custom-domain resource or pending certificate is not a successful cutover. No automatic redirect from the fallback.

Rollback pairs the API image with its matching configuration: either restore the prior revision with its singular ALLOWED_WEB_ORIGIN, or retain the new image with its allowed fallback-only JSON array. Never deploy the old image with only the new variable or the new image with only the old variable. Restore only changed selected-host DNS/bindings from recorded prior state if domain recovery is necessary; preserve the original Hosting URL and unrelated records. Reconcile Terraform to the recovered state rather than leaving an accidental subsequent reapply.

## Session implications

Firebase web persistence is host-origin scoped: the owner must sign in once on the new hostname; the existing web.app session remains separate. Subsequent refresh/reopen on that origin uses the maintained Firebase LOCAL persistence and fresh authorized API reads, subject to normal browser storage/expiry behavior. Do not copy tokens or storage between domains. Same-origin tab sign-out synchronization remains required; sign-out on one hostname does not promise to clear a separate session on the other. Server revocation/owner checks still apply to both. See [Firebase persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).

Retaining the existing popup helper avoids introducing the separate custom-authDomain redirect configuration described in [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin). Hosting routing and managed certificate behavior are documented in [Firebase custom domains](https://firebase.google.com/docs/hosting/custom-domain). These official sources were checked 8 October 2026; the exact DNS instructions must come from the actual selected-host binding.

## Acceptance and stop — C / D

- Unit tests: both permitted sets; invalid/missing JSON, duplicates, missing fallback, suffix/prefix lookalikes, alternate ports/paths and null Origin rejected. Matched origins receive their own exact CORS header; denied origins receive none and invoke no verifier/store. OPTIONS accepts only existing GET/Authorization contract. No-Origin business calls still verify tokens; unknown/revoked/wrong-owner tokens and failed mapping remain denied.
- Build/runtime: the matching image plus environment starts; invalid configuration fails closed. No frontend or database mutation is required. Scope-check Terraform so unrelated resources, credentials and policies remain unchanged.
- After DNS/TLS: correct certificate and current release on both URLs, actual owner popup sign-in on new hostname, read-only Borrowers/Collection entry points, refresh remembers sign-in, explicit sign-out clears displayed data. Distinguish mocked/SDK tests from actual Google/browser observations. Never capture private records or tokens in published evidence.
- Responsive gap checks only: desktop panes scroll independently under visible header, last details/Back/pagers reachable; tablet breakpoint and zoom retain readable controls; mobile sticky header/bottom nav leave content reachable with keyboard/touch. Reuse latest valid coverage and record only additional checks actually performed.

Stop after scoped deployment, verification, publication/progress update and the new DEV URL is ready for owner review. If DNS login/certificate remains pending, report that exact limitation and preserve the usable fallback; do not call the domain complete. D records preceding visual acceptance, current 2D outcome and remaining Phase 2 work in the overall progress overview. Preserve unrelated pre-existing DNS/layout planning hunks unless D deliberately reconciles the now-authorized affected entries.
