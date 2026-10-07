# R052 checkpoint 2D — DEV custom domain

8 October 2026 (Asia/Bangkok). Owner selected dev-lm.mw-credit.com; existing web.app remains fallback. Compact mobile navigation was separately accepted; full Phase2 is incomplete.

Terraform created the existing-site custom-domain mapping and added the exact Firebase authorized hostname, preserving firebaseapp.com authDomain and both prior authorized domains. Mapping creation is not DNS/certificate completion. Cloudflare mapped account/zone verified in Edge; DNS mutation awaits private owner provisioning of a zone-only DNS Edit token. Terraform owns empty Secret Manager container mw-credit-app-dev-cloudflare-dns-token; token values must never enter Terraform state or repository.

API uses required ALLOWED_WEB_ORIGINS JSON allowlist: existing web.app and exact https://dev-lm.mw-credit.com; legacy singular env is rejected. Deploy image and config together after exact-source CI. Existing Google/UID/Partner checks unchanged; first sign-in on the new origin is expected, no session migration.

Validation:53 focused boundary tests, one tablet/touch-emulated responsive gap case across1024/768/640 with Thai/keyboard/pager checks; no physical device or native zoom claim. Terraform validation passed. See outputs/r052-custom-domain/test-report.md. Deployment/HTTPS/owner authenticated domain validation pending.

Rollback: API00008-9fw with image0b5352a9430d366d28e4e6e9517c641463f805929d1ff3acdac6f7ac434dd0d8 and singular ALLOWED_WEB_ORIGIN web.app restored as a pair; alternatively new binary with fallback-only JSON. Hostingdacf7a53b31f09b0 unchanged. Remove only newly introduced DNS records if necessary; preserve all production records. Mapping has ABANDON/prevent_destroy. No database/schema/grant/scaling changes.

Paired API deployment verified8October: build3996f956-5f86-4979-8436-cb872729c8d7 from838561430faefdbf128ea2e802992e590e6352b6, image04ecadbd8cd841302b5285d43c9e3471190bccc1a003ee6e3e4d37fc7456e70e, Ready00009-5x5. CI37660003633 passed. Exact plan1servicechange with onlyimage/origin delta; UID/auth/scaling preserved. Cloudflare account03566f0be789f9d2ba2a5389dfb0f1f6/zone77d9da76cfeaaf21ae589f95a958965c verified; no dev-lm record initially. DNS not mutated, token provisioning pending. No custom-host TLS readiness claimed.

Final independent API00009-5x5 smoke passed13 checks for both exact origins: origin echo/Vary/no-store, unsigned/invalid-token401, preflight204, denied-origin403/noecho, no-Origin401 and POST405. Evidence live-api-origins.json. Unchanged fallback Hosting reuses prior signed-out evidence; custom-host DNS/TLS/owner login remain pending.

Terraform DNS applied8October: pinned Cloudflare provider5.27.0, separate protected state prefixdevelopment-dns, exact2recordcreates0updates0deletes. Token Secret Manager version1 active; runner injects transiently and clears environment, no token in Terraform variables/state/repo. DNS-only CNAME dev-lm→mw-credit-app-dev-737787224638.web.app and provider-supplied public ACME TXT created. Private baseline12records preserved by name/type/content/TTL/proxy readback; total14. Public CNAME resolves. Initial Firebase HOST_UNHOSTED/OWNERSHIP_MISSING/CERT_VALIDATING and normal HTTPS not ready; certificate completion pending (no bypass).
