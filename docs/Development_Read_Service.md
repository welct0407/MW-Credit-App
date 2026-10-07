# DEV borrower read checkpoint

This checkpoint is an owner-only read implementation. It does not implement Collection, loan/charge detail, receipts, writes, schedules, or production access. The existing IAM-protected readiness service remains separate and unchanged.

## Isolated application builds

- `npm run build` / `npm run dev`: explicit synthetic mode, existing design review.
- `npm run build:live-dev` / `npm run dev:live-dev`: independent `live-main.tsx` entry and `dist-live-dev` output. No fixture or simulator imports. Missing/incorrect configuration renders an unavailable state; it never falls back to sample records.
- Changing a URL or a color preview cannot change a build's data mode. Production data mode is not implemented.

Supply public browser configuration through the build process, not a committed environment file: `VITE_FIREBASE_PROJECT_ID=clever-oasis-508610-n7`, `VITE_FIREBASE_AUTH_DOMAIN=clever-oasis-508610-n7.firebaseapp.com`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, and HTTPS `VITE_API_ORIGIN` for the separate `mw-credit-app-read-dev` Cloud Run service. Firebase API keys identify the public client; they are not server authentication. Server account credentials remain outside the repository. Google provider enablement, authorized domains, and service deployment are separate infrastructure operations.

The owner-requested frontend follow-up initializes Firebase Auth with SDK browserLocalPersistence and the browser popup resolver from construction, before the auth observer, so a supported browser can restore sign-in after refresh. Firebase manages auth storage; application code does not copy tokens into custom storage, URLs, logs or artifacts. A random nonsecret marker write/read/remove probes local-storage availability without inspecting auth stores. If storage is blocked, initialization selects SDK in-memory persistence with an explicit temporary-sign-in notice; if neither mode initializes, setup fails visibly. Verified source11c91c2 passed CI37636993134 and is deployed on Hosting922b3ab61894b240; real owner refresh confirmation remains pending.

Business records remain memory-only and reload through fresh authorized API requests after restored identity. Logout and invalid/expired sessions clear rendered records and request Firebase sign-out; failed sign-out stays blocked with a retry control. Account changes clear records, and abort/generation checks reject earlier-session responses. A 403 remains access denied, not an automatic permission change. Backend revoked-token, provider, owner UID and Partner checks are unchanged.

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

- `GET /health`: service liveness only.
- `GET /api/session`: verified owner permission, borrower-only scope and the caller's verified subject for the controlled UID-pinning step.
- `GET /api/borrowers?limit=25&cursor=...`: default 25, maximum 100; base64url cursor contains the last immutable case-sensitive row key.
- `GET /api/borrowers/:id`: the same visible-record scope; hidden/missing records return the same not-found response.

Borrower projection: `id`, `name|null`, `createdDate|null`, `hasActiveLoan:boolean|null`, `outstandingPrincipal:decimal-string|null`, and `note|null`. Null is unknown, never silently zero. No contact, delivery/login email, address, account, private file URL, loan or charge fields are returned. Metadata uses source `dev`, server Bangkok business date, and ISO read timestamp.

SQL source fields are grounded in V1 (`Row ID`, `Borrower Name`, `Creation Date`, `Hidden Flag`), V13 (`Has Active Loan`, `Total Outstanding Principal`), V28 (`Borrower Note`) and V25 (`Partners.Login Email`). Only `Hidden Flag IS FALSE` records are eligible in this conservative first checkpoint; null is excluded until AppSheet null semantics are confirmed. Existing database values supply balances; this service does not recreate financial calculations.

Pages use stable `Row ID COLLATE "C"` keyset order. This is deliberately not final AppSheet active/Creation Date ordering. One page is not the full portfolio; no portfolio total or complete grouping is asserted. Search and production workflow parity remain later work.

## Dependency note and verification boundary

Firebase 12.19.0 and Firebase Admin 14.5.0 are pinned. `@grpc/grpc-js` is overridden to patched 1.14.5 because Firebase's unrelated Firestore dependency otherwise pins a version with security advisories. Only Firebase app/auth modules enter the browser bundle; no Firestore application integration is implemented.

Builds and synthetic tests do not prove Google provider setup, IAM grants, live sign-in or deployed read success. Those require separate deployment and owner-account validation, without recording real borrower data or tokens in test artifacts.

## Live infrastructure checkpoint — 7 October 2026

The dedicated service is Ready at https://mw-credit-app-read-dev-pvrgvyg3oq-as.a.run.app, image digest sha256:89f10f0398df19071601caf39df28dc4c26559c69ea0dd9af2d358615e0d8593 (source 18c3736). Startup checks actual DEV database identity before listening. DEV grants are applied: seven Borrowers and two Partners columns; PROD column grants zero, no writes/schema CREATE. Existing PUBLIC CONNECT is retained.

The allUsers invoker binding was rejected by organization domain-restricted sharing. The owner explicitly approved the reviewed service-only alternative; Terraform disabled the Invoker IAM check for this new service only. Business routes enforce Firebase owner authentication before SQL. Old API IAM and organization policies remain unchanged. Re-enable the check to contain the service if necessary.

Owner pinning is persistent: infrastructure/dev/owner-identity.tf owns mw-credit-app-dev-owner-identity, populated from the verified real owner login in version 1. Tracked owner_identity_mode=uid-pinned and owner_uid_secret_version=1 are applied; Ready revision mw-credit-app-read-dev-00003-pzr. Future changes must retain pinned mode and an explicit verified numeric version. Terraform reads the value into runtime configuration; no runtime Secret Manager grant is added. Missing version or empty value fails closed; never use latest or fabricate a UID. Private state/plans contain sensitive values and are excluded from Git.

The owner reported successful real Google sign-in, Borrowers list and detail reads. Private exact-email lookup independently verified a unique enabled Google identity with verified email; actual UID pin is applied. This owner report is distinct from tool-executed business-data testing. Cloud Run reserves some paths ending in z; the new read handler/startup probe uses /health after public /healthz returned platform HTML404. Corrected image/probe is deployed at ready revision mw-credit-app-read-dev-00002-ln2. Auth/CORS/method rejection tests pass and old API remains anonymous403. Independent live /health200/no-store and signed-out desktop/mobile checks passed. The cold-start test-tooling correction passed final CI37615986417 at exact source20358d1; see sanitized live-smoke evidence.

## Checkpoint 2B — related loan read contract

Deployed in DEV from tested source084bb537 at revision00004-wmg, with owner loan validation pending. Extends the same pinned-owner DEV service with GET /api/borrowers/:borrowerId/loans and GET /api/borrowers/:borrowerId/loans/:loanId. Every read checks current identity/mapping, parent visibility and exact loan-parent linkage. Missing/hidden/null-visible parent and mismatched detail remain generic not-found; visible parents with no loans return an empty list.

The exact 14-column Loans projection contains key/reference, three dates, status/type, five existing monetary values and two booleans. Money is cast through numeric to decimal text; null, zero and negative values stay distinct. No browser balance calculation, aggregate count or financial command. Rows sort Loan Date descending/nulls last, then case-sensitive Row ID; cursors bind the parent and exact date/key position. Known status/type translations are display-only; unknown source text remains explicit.

Existing loans_borrower_idx supports parent selection. No new schema/index or EXECUTE privilege. The maintained ACL helper plans only missing column SELECT; verified reader scope is 23 DEV columns after the reviewed 14-column grant; PROD business columns remain zero. Private before-ACL recovery preserves prior nine-column grants and unchanged database-local settings. See outputs/r052-loan-read/metadata-preflight.json and the checkpoint change log for actual deployment status. Collection remains deferred until its operational provider contract is reconciled.

## Checkpoint 2B owner refinement contract

The same checkpoint now uses the governed Borrower Name + ` - ` + Description label and displays physical Total Interest Earned as Total Profit Earned; it does not recompute profit. Loan Key uses existing date/type/principal and original daily rate fields. Display formatting follows the saved AppSheet expression and column Type Details, including ฿, whole-baht Loan Key principal and grouping; ordinary monetary values preserve the agreed up-to-two-decimal presentation. Technical IDs remain internal.

Borrowers sort active, inactive, unknown; then Creation Date ascending/nulls last and C-collated ID. Loans sort open, closed, other; then Loan Date descending/nulls last and C-collated ID. Canonical v2 cursors include group rank and date/key; old cursors are rejected, and refresh starts a new first page. Group headers do not claim global totals. Inactive/closed cards remain readable/clickable grey. Desktop list/detail scrolling is independent; opening/returning/paging loan details aligns the related-loan section after layout. End-of-list hides Next and states completion; the previous disabled end control was confusing, not a confirmed SQL defect.

Three reviewed SELECT additions bring the DEV reader to 26 columns: Borrowers.Description, Borrowers.Total Interest Earned and Loans.Original Daily Interest Rate. PROD remains zero business columns; no writes/schema/IAM expansion. See refinement metadata, SQL and test evidence. Fuller borrower contact/location/referrer/related-record parity remains Phase 5. Owner refinement acceptance remains pending deployment/review.

Refinement deployment: application source9ffc957, validation6fbcb5 (test-only timing correction), CI37626536327 passed. Read revision00005-wn4/imageaab122...32c0d and Hosting3f33c848f8542024 are live with the actual owner UID pin retained. Owner visual refinement acceptance is pending. Evidence: outputs/r052-loan-read/refinement-deployment.json.

Current frontend: neutral UI source d599041, CI37634043751 passed, Hosting e112e2801d7ff306. Mostly white/light-grey body and cards, neutral groups and environment-colored main header; desktop panes40/60. API revision00005-wn4 is unchanged. Owner visual review pending.
