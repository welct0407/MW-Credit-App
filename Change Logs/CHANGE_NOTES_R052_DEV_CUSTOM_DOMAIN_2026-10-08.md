# R052 checkpoint 2D — DEV custom domain

8 October 2026 (Asia/Bangkok). Owner selected dev-lm.mw-credit.com; existing web.app remains fallback. Compact mobile navigation was separately accepted; full Phase2 is incomplete.

Terraform created the existing-site custom-domain mapping and added the exact Firebase authorized hostname, preserving firebaseapp.com authDomain and both prior authorized domains. Mapping creation is not DNS/certificate completion. Cloudflare mapped account/zone verified in Edge; DNS mutation awaits private owner provisioning of a zone-only DNS Edit token. Terraform owns empty Secret Manager container mw-credit-app-dev-cloudflare-dns-token; token values must never enter Terraform state or repository.

API uses required ALLOWED_WEB_ORIGINS JSON allowlist: existing web.app and exact https://dev-lm.mw-credit.com; legacy singular env is rejected. Deploy image and config together after exact-source CI. Existing Google/UID/Partner checks unchanged; first sign-in on the new origin is expected, no session migration.

Validation:53 focused boundary tests, one tablet/touch-emulated responsive gap case across1024/768/640 with Thai/keyboard/pager checks; no physical device or native zoom claim. Terraform validation passed. See outputs/r052-custom-domain/test-report.md. Deployment/HTTPS/owner authenticated domain validation pending.

Rollback: API00008-9fw with image0b5352a9430d366d28e4e6e9517c641463f805929d1ff3acdac6f7ac434dd0d8 and singular ALLOWED_WEB_ORIGIN web.app restored as a pair; alternatively new binary with fallback-only JSON. Hostingdacf7a53b31f09b0 unchanged. Remove only newly introduced DNS records if necessary; preserve all production records. Mapping has ABANDON/prevent_destroy. No database/schema/grant/scaling changes.
