# DEV borrower read checkpoint

This checkpoint is an owner-only read implementation. It does not implement Collection, loan/charge detail, receipts, writes, schedules, or production access. The existing IAM-protected readiness service remains separate and unchanged.

## Isolated application builds

- `npm run build` / `npm run dev`: explicit synthetic mode, existing design review.
- `npm run build:live-dev` / `npm run dev:live-dev`: independent `live-main.tsx` entry and `dist-live-dev` output. No fixture or simulator imports. Missing/incorrect configuration renders an unavailable state; it never falls back to sample records.
- Changing a URL or a color preview cannot change a build's data mode. Production data mode is not implemented.

Supply public browser configuration through the build process, not a committed environment file: `VITE_FIREBASE_PROJECT_ID=clever-oasis-508610-n7`, `VITE_FIREBASE_AUTH_DOMAIN=clever-oasis-508610-n7.firebaseapp.com`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, and HTTPS `VITE_API_ORIGIN` for the separate `mw-credit-app-read-dev` Cloud Run service. Firebase API keys identify the public client; they are not server authentication. Server account credentials remain outside the repository. Google provider enablement, authorized domains, and service deployment are separate infrastructure operations.

Firebase Web Google popup sign-in uses in-memory persistence. Refreshing the page loses the browser session. Tokens are only sent in the Authorization header; no token appears in URLs, local storage, application logs, or artifacts. Logout, account change, and authorization failures clear rendered records. Abort and generation checks reject responses from an earlier session.

## Dedicated server

Entrypoint: `node services/api/dev-read-server.mjs` (or `npm run start:read-dev`). The existing `services/api/server.mjs` is unchanged.

Required fixed runtime settings:

| Variable | Required value |
| --- | --- |
| APP_ENV | dev |
| AUTH_MODE | firebase |
| FIREBASE_PROJECT_ID | clever-oasis-508610-n7 |
| DB_NAME | loan_manager_dev |
| INSTANCE_CONNECTION_NAME | clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914 |
| DB_USER | mw-credit-app-read-dev@clever-oasis-508610-n7.iam |
| ALLOWED_WEB_ORIGIN | https://mw-credit-app-dev-737787224638.web.app |
| OWNER_IDENTITY_MODE | email-bootstrap or uid-pinned |
| OWNER_FIREBASE_UID | Required nonblank in uid-pinned mode; supplied privately |

Unknown settings for the fixed identity tuple and missing identity mode fail startup. The Firebase authentication emulator is forbidden. ADC supplies runtime credentials. Bootstrap mode explicitly permits only the verified Google owner email selected by the owner; pinned mode additionally requires the verified Firebase subject to match the private pinned UID. There is no blank-UID wildcard and no runtime permission to create or enroll users.

Firebase Admin `verifyIdToken(token, true)` verifies signature, expiry, revocation and disabled status. Additional checks require the exact issuer/audience, Google provider, verified email, nonblank subject, valid token timestamps and no tenant. The application grants only the owner account read access. Partner Role and delivery Email are never authority.

A valid identity then requires exactly one `Partners.Login Email` match after trim/lower normalization. This lookup occurs inside every authorized read transaction; the partner key is not returned in borrower DTOs. Startup and transactions confirm actual `current_database()` and `current_user`. Pool maximum is 2; queries have bounded timeouts. Business transactions are `BEGIN READ ONLY` and use parameterized SQL with explicit projections.

## HTTP and data contract

All responses use `Cache-Control: no-store`. Exact-origin CORS permits GET and Authorization only, no cookies. Other origins and mutation methods are rejected. The public health endpoint contains no row data, identity values, secrets, storage probes, or database queries. Database identity is verified once before listening and again inside each authorized read transaction. No public readiness-query route is exposed.

- `GET /healthz`: service liveness only.
- `GET /api/session`: verified owner permission, borrower-only scope and the caller's verified subject for the controlled UID-pinning step.
- `GET /api/borrowers?limit=25&cursor=...`: default 25, maximum 100; base64url cursor contains the last immutable case-sensitive row key.
- `GET /api/borrowers/:id`: the same visible-record scope; hidden/missing records return the same not-found response.

Borrower projection: `id`, `name|null`, `createdDate|null`, `hasActiveLoan:boolean|null`, `outstandingPrincipal:decimal-string|null`, and `note|null`. Null is unknown, never silently zero. No contact, delivery/login email, address, account, private file URL, loan or charge fields are returned. Metadata uses source `dev`, server Bangkok business date, and ISO read timestamp.

SQL source fields are grounded in V1 (`Row ID`, `Borrower Name`, `Creation Date`, `Hidden Flag`), V13 (`Has Active Loan`, `Total Outstanding Principal`), V28 (`Borrower Note`) and V25 (`Partners.Login Email`). Only `Hidden Flag IS FALSE` records are eligible in this conservative first checkpoint; null is excluded until AppSheet null semantics are confirmed. Existing database values supply balances; this service does not recreate financial calculations.

Pages use stable `Row ID COLLATE "C"` keyset order. This is deliberately not final AppSheet active/Creation Date ordering. One page is not the full portfolio; no portfolio total or complete grouping is asserted. Search and production workflow parity remain later work.

## Dependency note and verification boundary

Firebase 12.19.0 and Firebase Admin 14.5.0 are pinned. `@grpc/grpc-js` is overridden to patched 1.14.5 because Firebase's unrelated Firestore dependency otherwise pins a version with security advisories. Only Firebase app/auth modules enter the browser bundle; no Firestore application integration is implemented.

Builds and synthetic tests do not prove Google provider setup, IAM grants, live sign-in or deployed read success. Those require separate deployment and owner-account validation, without recording real borrower data or tokens in test artifacts.
