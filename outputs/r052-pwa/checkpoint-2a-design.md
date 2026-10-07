# R052 checkpoint 2A — real DEV owner sign-in and Borrowers read

7 October 2026. Agent A / Astra High. Starting implementation commit a3d21d5; management commit30be9ed0. The owner accepted checkpoint1B and the separator refinement and instructed continuation. The initial DEV cohort is already resolved: only welct0407@mw-credit.com; other users come later by owner instruction. No further cohort confirmation is needed.

## Outcome and scope

Deliver working Google/Firebase sign-in and real authorized DEV Borrowers list/detail reads in the accepted responsive shell. Preserve accepted typography, card tints/separators and logo variants. This is a real read checkpoint, not another simulated session milestone. Keep financial submission, production access, receipt files, notifications and schedules outside scope. Stop for owner validation after the working sign-in/read checkpoint.

Borrowers is the first live source because its required values already exist physically and are governed by SQL. Collection needs a provider matching its full status, same-day repayment and amount semantics, documented in checkpoint-1b-design.md; do not reuse the simplified fixture engine for live amounts. In the live build, Collection and other unfinished modules are clearly unavailable and contain no sample records. No production readiness or full Phase2/parity claim follows from this bounded slice.

## Ownership

- Parent coordinates Terraform, provider setup, runtime identity, DEV grant operations, identity reconciliation, deployment and sanitized live evidence.
- B implements new read-service source, Firebase client/Admin verification, parameterized read provider, live frontend entry/build and dependencies. The existing IAM readiness server stays unchanged.
- C tests source with injected verifier/provider seams and synthetic fixtures, then reports independent evidence. Parent owns actual live execution and validation; do not confuse mocked verification with working sign-in.
- A owns this design and source review only. No live operation, SQL grant/migration or Git operation is performed by A.

## Authentication boundary

Use the existing Firebase project clever-oasis-508610-n7 (737787224638) for DEV. Future production authentication uses a separate auth project unless a later verified binding necessitates a reviewed alternative. Two frontend web apps in one project are not different token audiences. A color selector or browser parameter cannot select identity environment.

The public frontend uses the Firebase Web SDK, GoogleAuthProvider and real signInWithPopup. Keep only identity scopes needed for sign-in, not Drive/Gmail/bank access. Historical initial-slice policy: use inMemoryPersistence; reload may require sign-in again. Superseded by the owner-requested 7 October persistent-sign-in follow-up: SDK initializeAuth with browserLocalPersistence and the popup resolver from construction, before the auth observer, explicit temporary-session notice on in-memory fallback, fresh authorized reads after restore and retryable sign-out failure. This follow-up passed synthetic installed-SDK checks and CI37636993134 and is deployed at Hosting922b3ab61894b240; real owner refresh confirmation remains pending. Business records remain memory-only. No service worker or business-data local persistence is introduced. Present actual signed-out, loading, allowed, denied, expired/retry and unavailable states; never fall back from failed live auth/read into sample data.

The separate read service uses firebase-admin initialized explicitly with the DEV project and runtime ADC. Each business request verifies the Firebase ID token with verifyIdToken(token,true), including revocation/current user checks. Then enforce:

1. aud equals clever-oasis-508610-n7 and iss equals https://securetoken.google.com/clever-oasis-508610-n7.
2. Stable nonblank uid/sub, verified email and firebase.sign_in_provider google.com. Reject tenant-bearing tokens because this checkpoint configures no tenant.
3. Trim/lower verified email equals the explicit owner-only application allowlist. A valid Google/Firebase account alone grants no business access. Do not accept a raw Google OAuth access/ID token in place of a Firebase ID token.
4. Exact normalized Login Email lookup returns one Partner with a usable immutable Row ID. Zero or multiple matches deny. Partners.Email, Partner Role A/B and a browser-selected identity grant nothing.

Use an explicit DEV-only owner identity mode. OWNER_IDENTITY_MODE=email-bootstrap accepts only the verified Google owner email and a valid SDK-verified nonblank subject. After the first actual owner sign-in, the parent records that UID privately and changes to OWNER_IDENTITY_MODE=uid-pinned, with OWNER_FIREBASE_UID requiring an exact match as well as owner email. Pinned mode with a missing UID fails startup; there is no empty-UID wildcard. Do not pre-create an email-only Firebase user or let the runtime grant/pin the first arriving account. The runtime remains user-read only; the authenticated session endpoint may return the current owner UID for the parent to pin. Bootstrap remains explicitly labelled until completed.

Keep authentication verification, application access and Partner mapping distinct in code and tests. Public response codes may distinguish 401 (missing/invalid session) from 403 (no application access), but must not disclose private Partner mappings or raw SDK/SQL exceptions. Log sanitized event/status/request IDs, not tokens, headers, email/borrower records or SQL bind values.

Official Firebase guidance establishes server token verification and the additional revocation check; use supported SDKs rather than a handwritten JWT implementation. [ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) and [session management](https://firebase.google.com/docs/auth/admin/manage-sessions), checked7 October2026.

## Provider provisioning sequence

Parent's earlier read-only observation: Firebase project ACTIVE, webApps empty and identity configuration request404. Parent subsequently observed CONFIGURATION_NOT_FOUND on provider/config reads. Do not infer that creating a Hosting site configured authentication.

1. Verify the current project, then register the dedicated DEV Firebase web app and retrieve its generated client configuration. apiKey/projectId/appId/authDomain are client configuration; the OAuth provider client secret is not frontend configuration.
2. Initialize authentication for the existing project if required, then enable Google in Firebase Authentication / Sign-in method. Firebase's documented console flow is the preferred supported route. The owner support/contact email is already known; use the existing Google account as intended.
3. If no usable Google OAuth web client is generated/available, create one through Google Auth Platform/Credentials, with the appropriate app information and audience, and configure its ID/secret in the Google provider. Reuse a verified suitable client only; do not guess a client ID from project number. Keep provider secrets in provider configuration/private working storage and never Git, build arguments or frontend JSON.
4. Bind the actual authorized Hosting domain and the selected authDomain handler /__/auth/handler. Use exact observed domains and redirects. Do not add wildcard origins or unrelated projects. If development remains OAuth testing, include only the owner as intended tester where required; provider signup itself is never the application allowlist.
5. Read back provider state/configuration without printing secrets, then test the actual owner sign-in. A settings save is not proof that redirects, API key restrictions or token verification work.

[Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin) documents enabling the provider and client flow. [Cloud Run's Identity Platform tutorial](https://docs.cloud.google.com/run/docs/tutorials/identity-platform) documents manual OAuth web-client/provider setup. The supported [initializeAuth endpoint](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.identityPlatform/initializeAuth) uses an empty-body POST to projects/{project}/identityPlatform:initializeAuth; it needs firebaseauth.configs.create. A [Google default-provider config](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs/create) still needs a real OAuth client configuration. These are implementation references, not a claim setup has occurred.

No additional business input is missing for the owner-only cohort. A consent screen, browser reauthentication or unavailable OAuth-client configuration may require the owner's direct interaction only if the available authorized setup tools cannot complete it. Complete independent code/tests first and report the exact remaining operation rather than asking the owner to choose the cohort again.

## Runtime separation

Keep mw-credit-app-api-dev and its IAM-protected readiness path unchanged. Its /readyz touches a health storage prefix and a secret, so it must not become public as a shortcut for end-user requests.

Deploy a separate DEV read service and runtime service account, with a public ingress that performs application-level Firebase verification on all business routes. Parent selected mw-credit-app-read-dev for both the new service and service-account ID; read back actual provisioning before configuring code. The corresponding PostgreSQL IAM login is expected to be mw-credit-app-read-dev@clever-oasis-508610-n7.iam and must be verified. New deployment uses a separate command/entrypoint from services/api/server.mjs. [Cloud Run end-user authentication](https://docs.cloud.google.com/run/docs/authenticating/end-users) distinguishes this pattern from IAM invocation.

The runtime requires only Cloud SQL connection/IAM-login capability and the minimum Firebase user-read permission needed for revoked/disabled-user checks. It has no receipt bucket, VAPID secret, notification or production application privilege. Keep managed credentials/ADC; no service-account key or database password. Begin with a two-connection pool, bounded connection/query/request timeouts and bounded service scale. Parent reconciles limits against the shared instance before deployment. These are conservative initial limits, not measured performance guarantees.

Fail startup on any mismatched environment or missing binding: APP_ENV dev; instance clever-oasis-508610-n7:asia-southeast1:appsheet-pg-prod-20260914; database loan_manager_dev; exact newly provisioned DB_USER; Firebase project clever-oasis-508610-n7; exact allowed frontend origin. Verify current_database/current_user on the actual connection before business reads. The server never trusts browser environment hints.

## SQL source mapping and privileges

Canonical database ownership/procedure were read in MW-Credit-App/database/OWNERSHIP.md and database/README.md#each-change. Existing V1–V77 remains immutable. No new table, column, view, function or migration is needed for this slice. Environment-specific role/IAM grant setup is parent-owned and recorded as operational prerequisites. Do not run migrations merely to connect a reader.

| Source | Columns | Basis/use |
| --- | --- | --- |
| public."Borrowers" | "Row ID", "Borrower Name", "Creation Date", "Hidden Flag" | V1 existing schema; text identity/name, date creation, nullable boolean hidden |
| same | "Total Outstanding Principal", "Has Active Loan" | V13 physical SQL-maintained numeric and boolean; never reconstruct from nested rows |
| same | "Borrower Note" | V28 optional informational text |
| public."Partners" | "Row ID", "Login Email"; optionally "Language Preference" | V25 normalized unique Login Email index; language existing source, only if UI uses it |

Parent's current read-only metadata checks verified required actual columns/types, DEV and PROD V77 and one normalized owner Login Email match in DEV. Those bounded findings validate source prerequisites; no private row values belong in this document. Do not infer grants before the new role exists.

Grant the new IAM database principal CONNECT on loan_manager_dev, USAGE on public and SELECT only on the listed columns. Hidden Flag and Login Email are queried but need not be returned to the browser. No schema CREATE, source INSERT/UPDATE/DELETE/TRUNCATE, ownership, role administration, sequence usage, broad table SELECT or financial routine EXECUTE is required. Inspect actual inherited/PUBLIC effective privileges, not only the GRANT script. Never revoke broad shared privileges without dependency review.

Parent's catalog audit found no PUBLIC schema CREATE and only one PUBLIC-executable SECURITY DEFINER function: public.payment_reallocation_permitted(text,jsonb,jsonb). Canonical V57 defines a STABLE fixed-search-path SELECT-only boolean guard requiring session_user='postgres' and an exact transaction-bound audit transition; non-admin IAM sessions cannot satisfy that guard. It performs no financial DML and exposes no audit rows. This finding does not require a broad shared revoke or schema change for the reader, but parent must verify the new role has no inherited elevated membership. Direct source write-denial and restricted-column checks should use effective privilege inspection/isolated fixtures, not attempted financial writes against real borrowers.

Every provider read runs in a READ ONLY transaction with a statement timeout and rolls back/releases on all errors. Default read-only connection settings are additional safeguards, not a substitute for privileges. Only fixed parameterized SELECT statements are exposed; no generic SQL endpoint or callback from request fields.

## HTTP and DTO contract

Routes: GET /api/session; GET /api/borrowers; GET /api/borrowers/:id. Unsupported methods return405 without work. OPTIONS handles allowed browser preflight; exact-origin CORS permits GET and Authorization, sets Vary: Origin, does not allow credentials/cookies or wildcard origins. No Origin header from a direct client bypasses authentication. Public health, if included, returns only liveness; no private readiness/storage probes.

All responses containing session/business/error data use Cache-Control:no-store. HTTP logs and error payloads are sanitized. Bearer tokens never appear in URLs. Invalid IDs/cursors/limits return a generic bounded400; unavailable provider503; absent or excluded borrower404. No unverified token or denied owner reaches the database; owner authentication precedes identity lookup, which precedes borrower read.

The initial live Borrower DTO is deliberately flat:

- id: immutable case-sensitive string.
- name: string or null; no invented bilingual duplicate production columns.
- createdDate: YYYY-MM-DD or null, obtained with date::text rather than timezone conversion.
- hasActiveLoan: boolean or null; unknown is not inactive.
- outstandingPrincipal: numeric::text decimal string or null; preserve source precision, no binary-floating financial calculation or implicit zero.
- note: authorized informational string or null.

Envelope: source dev, server-generated asOf ISO instant, server Asia/Bangkok businessDate, items or item, and nextCursor for lists. No collection status/remaining totals, related loans/charges, fake receipt, aggregate principal or unavailable values replaced with zero. The UI may format exact source decimals for display; monetary arithmetic remains outside this read slice.

Borrower-directory population is Hidden Flag IS FALSE. This intentionally excludes unknown/null visibility, matching the conservative explicit-false checkpoint1B contract; a wider AppSheet blank-flag interpretation requires verified semantics, not an implicit IS NOT TRUE change. Identity lookup is lower(btrim("Login Email"))=$1 with LIMIT2 and exact-one validation. Use the same population in detail queries to avoid hidden-row bypass.

For the bounded first live implementation, order by "Row ID" COLLATE "C" and use a validated base64url cursor representing the last exact ID, a parameterized greater-than predicate and limit+1. Default25, maximum100. Cursor values never modify SQL syntax or permissions. This stable ID ordering is an explicit limited read checkpoint; final AppSheet active/creation-date ordering is not claimed. Do not claim global grouping or portfolio totals from one page. No search is required now; if implemented, bound/parameterize it and bind cursor semantics to the search. Paging is live, not snapshot-consistent across concurrent inserts/edits; refresh begins a new list.

## Frontend behavior

The live build has a separate entry/module graph with no fixture, synthetic-verifier, access simulator or test principal import. The design preview remains a separate development artifact and cannot be enabled through a production/live query parameter. Build artifact inspection verifies the separation.

Use the accepted layout for Borrowers list/detail with real source labels and explicit DEV context. Only actual read fields render. Other modules state their pending status without borrowing synthetic data. Do not show account-state toggles or a visual PROD switch in the live app; environment branding comes from pinned build/runtime configuration.

Clear rows, details and tokens immediately on sign-out, auth loss or account switch. Cancel pending calls and use a request generation/identity guard so a late response cannot repopulate the previous account's data. SDK-managed token refresh may retry a failed read once when appropriate; no infinite retry or automatic financial action. Errors are visible and recoverable without stale data masquerading as current. Keep business records in memory only. This does not deliver offline reads/drafts or installation.

## Checks and review stop

C's source tests cover real verification invocation with revocation enabled; exact project/provider/tenant/email policies; missing/expired/revoked/disabled/other-user tokens; no SQL before verification; zero/multiple Partner mappings; connection identity mismatch; field projection; decimal/date/null preservation; hidden/null exclusion; parameterized pagination/ID/cursor validation; no mutation methods; sanitized errors, exact CORS and no-store. Test using synthetic data and injected SDK/provider seams without declaring those mocks live proof.

Frontend tests cover actual signed-out/loading/allowed/denied/failure rendering, immediate data clearing and late-response rejection, bounded list/detail/pagination, no fixture/simulator leakage, accepted responsive/Thai readability and unchanged branding. Relevant build/dependency/guard checks run once per coherent candidate; no unrelated financial regression is needed when schema and financial source are unchanged.

Parent verifies the new runtime identity/effective privileges, protected old readiness service, deployed artifact/configuration, real owner Google sign-in, /api/session and representative Borrowers list/detail reads. Verify anonymous and unauthorized access fail without exporting private records. Keep screenshots/response bodies containing real borrowers out of published evidence; record counts/statuses, projection names and sanitized results. No forced notification, financial entry, PROD query or production deployment is needed for the acceptance path.

A configured provider or green unit suite is not completion. If actual owner sign-in or real DEV read is unavailable, preserve and publish completed source and identify the exact outstanding operation. Once the real read works and necessary checks pass, present the usable DEV page for owner validation and stop before Collection expansion, financial commands or production work.

## Fine-grained grant execution and recovery contract

Parent maintains a plan/apply role-configuration tool outside Flyway for this environment prerequisite, consistent with database/README.md noting V1 excludes roles/grants. Terraform owns the SA/IAM database-user resource; the helper owns only reviewed fine-grained PostgreSQL grants/settings. Never put the database administrator credential in Terraform state or repository files.

Plan mode checks the complete DEV instance/host/database/principal tuple and emits exact intended additions. Preserve the affected role direct database/schema/table/column grants, inherited memberships, elevated attributes and database-specific settings as the before state. Keep sensitive operational evidence private; sanitized outputs may contain role/object/privilege names and result booleans, not customer rows.

Apply only CONNECT on loan_manager_dev, USAGE on public, and SELECT on the listed columns. Partners.Language Preference is excluded unless the implemented UI actually uses it. Optional default_transaction_read_only and statement_timeout settings are scoped to the new role in loan_manager_dev. Re-read effective privileges after apply, including inherited/PUBLIC privileges, unexpected columns/tables, source write/DDL/role privileges and accessible SECURITY DEFINER routines. A direct GRANT listing alone is insufficient proof.

PUBLIC CONNECT may allow an IAM role on the shared instance to connect to another database even without an explicit role grant; REVOKE CONNECT from that role cannot override PUBLIC. Do not silently change PROD/PUBLIC policies. Verify/report actual production business-data privileges (none intended) and enforce the fixed DEV application tuple; do not claim separate network/instance isolation.

Rollback first contains the new read service, then removes only grants introduced by this batch and restores prior per-database role settings. Preserve unrelated pre-existing grants and identities. Drop the new IAM login/service account only through its owning Terraform recovery plan after dependencies are checked; never use financial-data restoration to undo this read setup. The payment_reallocation_permitted helper checks session_user, so SET ROLE under a postgres administrator is not evidence equivalent to a real IAM login.

The first Terraform apply was blocked by automatic approval review pending the parent explicit resource/IAM-scope question. No apply is claimed from that attempt. Independent implementation and tests continue; deployment completion requires actual authorized apply/readback evidence.
