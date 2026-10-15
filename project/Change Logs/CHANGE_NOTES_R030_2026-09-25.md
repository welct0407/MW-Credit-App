# R030 — custom matrix authentication validation

## Scope and decision

25 September 2026. Owner requested validation of Debian hosting with reuse of the Metabase login and explicitly accepted a shared-secret fallback for single-user access. Selected the fallback because same-origin session reuse introduces a gateway/routing dependency for the existing Railway-hosted report. No mandatory additional charge for session reuse was established.

## Changes

- Added `scripts/metabase/chart-auth-proof.py`, an ephemeral synthetic HTTP authentication proof.

- Recorded exact observations, proposed deployment/authentication contract and remaining checks in `outputs/r030-chart-auth-validation/README.md`.

- Updated R030's tracker description; it remains the sole Open development release.

## Verification

Eight proof tests passed on Windows and eight on the verified Debian VM. Missing/wrong secrets and forged Referer requests are rejected; valid bearer access works; rotation rejects the previous key. Tests use synthetic data and temporary loopback listeners, which stop on completion. Read-only live/source inspection verified Metabase version, lack of custom-viz entitlement, iframe allowlist, unauthenticated API rejection, session-cookie implementation, Debian availability and the existing dashboard's shared collection permission.

No real-session forwarding or public HTTPS iframe test was performed. Browser fragment/CSP behaviour, actual data access, sizing/refresh and tunnel integration remain implementation work. Existing dashboard 3 is shared with report partners: an owner-only secret must initially live in a separate owner-only dashboard.

## Rollback and status

Starting commit `4c8481e9734eed60da15aea81b6bda36de877c7a`; unrelated untracked work preserved. Rollback is a Git revert of these scoped files. No SQL, AppSheet, Metabase definitions, production VM files/services, firewall, DNS or tunnel settings were changed. No private data or credentials are included. The Debian proof was executed from stdin and left no installed service.

Validation complete; fallback selected and documented; no custom chart deployed. R030 remains Open. This checkpoint is not AppSheet release readiness or production promotion.

## Owner-authorized implementation — same release

Owner requested necessary VM/DB/Metabase setup and a custom comparison chart in the existing tab, explicitly excluding Apps. This supersedes the earlier owner-only placement proposal; dashboard 3 remains shared with report partners and the bearer key will be available to its authorized readers. Prepared dedicated service/identity, fixed read-only SQL query, role/grant provisioning, secret authentication, SVG labels/tooltip and deployment/recovery documentation. Nine backend tests and synthetic browser desktop/mobile checks passed. Fresh PROD dump restored with all 26 fingerprints matching; Metabase recovery dashboard 7 saved. No schema migration is needed. Live deployment not yet applied at this candidate checkpoint.

Promotion started 2026-09-25T04:50:43.236549+00:00; frozen package `07efaacc9f39a83a8490f3e9d9abdfba2d09bdd0`. R031 opened as sole development release. No AppSheet RC/Upgrade or new Flyway migration.

## Verified deployment — 25 September 2026

R030 is Released. Dedicated Debian service, narrow PROD role, HTTPS tunnel route and comparison iframe1501 are deployed. No AppSheet changes, financial writes or schema migration; V43 and accepted categorization unchanged. Original274 and every original dashboard definition are preserved, with later tab31 rows shifted22. Dashboard recovery copy7 and privately restored DB backup provide recovery; scoped rollback is in the operating README.

Nine backend tests, synthetic and real desktop/mobile checks, authenticated/unauthenticated HTTPS checks, deployed source hashes and all-field SQL parity passed.23 named borrowers retain4/8/5/6 Star/Cow/Question/Dog distribution. Tooltip name25px and single category verified. Mobile iframe requires internal scrolling; dashboard filters/PDF/subscriptions are not automatically inherited. Existing hooks route and proxy/tunnel services remain active.

Source, access/dictionary definitions, environment/development/design references, manifest and the single promotion checklist are updated. Final sanitized evidence is published under tagR030; R031 remains Open. Owner visual comparison is available without cutting over/removing the native chart. [Evidence](../outputs/r030-custom-matrix/README.md).
