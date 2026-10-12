# Phase 3A contained server foundation — B handoff

11 October 2026. Starting application commit: `24532742bd65a9fbf2bd53810b35e68100b5c3db`. Existing unrelated dirty files preserved. New files only; no DEV entrypoint, frontend, database, permission, Terraform or deployment change.

Entrypoint: `node services/production/server.mjs`. The existing image copies `services/`; a later reviewed deployment must explicitly select this entrypoint. It supports distinct `reader` and `command` roles with separately validated runtime identities. No image was built or deployed here.

## Explicit configuration contract

Required environment inputs have no production-target defaults:

| Input | Contract |
| --- | --- |
| `APP_ENV`, `FOUNDATION_MODE`, `FOUNDATION_ROLE` | `prod`, `foundation`, `reader` or `command` |
| `APPLICATION_PROJECT_ID`, `APPLICATION_PROJECT_NUMBER` | Explicit new project ID/number; current DEV/data project and number rejected |
| `AUTH_MODE`, `FIREBASE_PROJECT_ID` | `firebase`; exact application project |
| `RUNTIME_SERVICE_ACCOUNT` | `mw-credit-app-read-prod@<application-project>.iam.gserviceaccount.com` or corresponding `command` identity |
| `DATA_PROJECT_ID`, `DB_NAME`, `INSTANCE_CONNECTION_NAME` | Retained `clever-oasis-508610-n7`, `loan_manager_prod`, `clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914`; inventory validation only, no client created |
| `OWNER_IDENTITY_MODE`, `PROD_OWNER_FIREBASE_UID` | `uid-pinned`; separately enrolled production owner UID, never email-bootstrap |
| `OWNER_IDENTITY_SECRET_VERSION` | `projects/<application-project>/secrets/mw-credit-app-prod-owner-identity/versions/<positive-number>`; binding metadata, supplied secret payload remains outside repository |
| `HOSTING_SITE_ID`, `ALLOWED_WEB_ORIGINS` | Explicit site ID; JSON origins containing exact `https://lm.mw-credit.com`, optionally exact `https://<site>.web.app`; no wildcard, localhost or DEV origin |

Emulators, tenant configuration, legacy DEV owner pin, ambient database credentials, receipt configuration, command modes and readiness enablement are rejected. Proposed or synthetic IDs are not proof of a provisioned project. Actual target identity, secret payload/version binding and attached service identity must be verified by the later deployment package.

## Implemented behavior

`GET /health` returns only liveness and foundation mode. `GET /api/session` requires Firebase Admin verification with revocation checking, exact issuer/audience, verified Google identity, no tenant, valid times and exact production owner UID/email. Successful responses expose neither email nor UID; capabilities are empty, business access is false and database membership is explicitly unverified.

Every other raw route, including readiness, business reads, status/history, financial commands, uploads and receipts, denies before any authentication-dependent data operation. Only safe GET routes allow restrictive preflight. No data/storage module, scheduler or background business task is imported. Completion logs contain fixed operation/status/code, role and generated request ID only.

P3A06 is deliberately the disabled-probe branch: no driver, database or storage probe is implemented or accessible. Authorized exact-tuple identity/SELECT1 and dedicated PROD health-object live proof remain deferred; this package claims none. Wider membership and business activation require separate implementation and approval.

## Checks and handoff

Maintained command: `node --test tests/unit/production-foundation.test.mjs tests/unit/dev-read-boundary.test.mjs`. The new foundation suite passes four tests covering configuration rejection matrices, verifier claims/revocation, exact Admin initialization and real local HTTP containment with throwing data/storage spies. All five new production modules pass `node --check`. C independently verifies P3A03–06.

Owned paths: `services/production/{config,principal,handler,runtime,server}.mjs`, `tests/unit/production-foundation.test.mjs`, and this evidence file. D owns the coherent Phase3 change log/publication. Rollback: remove these additive unreferenced modules/tests/evidence from the candidate; current DEV entrypoints remain unchanged. No CI, browser run, live request, build, deployment or publication performed by B.
