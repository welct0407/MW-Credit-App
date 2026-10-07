# R052 checkpoint 1B — identity policy and operational read contract

7 October 2026. Architect: Agent A, Astra High. Implementation: Agent B; independent verification: Agent C. Scope: continuing Phase 1 discovery and executable synthetic contracts after the owner accepted checkpoint 1A visuals. This does not complete live authentication, Phase 1 or Phase 2. Starting management commit d247d7f; application commit ea22c16. Parent owns release evidence and publication.

## Bounded deliverable

Deliver a pure authorization-policy evaluator, a gated synthetic Collection/Borrowers read adapter, typed projections and reviewable allowed/denied access states in the existing accepted UI. Preserve readable typography, orange/pink theme previews, accepted OLTP logo variants, borrower/loan principal context and absence of a portfolio principal summary. No financial command, SQL migration/grant, API route, authentication SDK/provider setup, infrastructure deployment or notification change is part of this checkpoint.

The evaluator consumes a simulated verifier result; it does not verify a token. The simulator must say that it is synthetic. A boolean such as serverVerified is a test input, never a security boundary. The synthetic adapter requires an explicit synthetic mode, rejects missing/unknown/production modes and is not imported into the live API server. The preview's DEV/PROD color selector cannot select an auth environment, grant access or change an endpoint.

## Reconciled recorded evidence

All application facts below are dated saved configuration, not a new live audit. Exact current rows/identities remain private. Source paths are relative to the project-management repository.

| Object/evidence | Recorded contract | Consequence |
| --- | --- | --- |
| Documents/Data Dictionary/systems/appsheet/oltp/settings/editor-editor-security-require-sign-in-557012ee.yaml; matching development overlay | Google provider, sign-in required, allow-all-signed-in false; DEV matches these settings | Google authentication alone is insufficient for application access |
| OLTP editor-editor-access-roster-4dce691a.yaml and DEV overlay | App owner/Admin and a separately approved app user/User; private identities redacted | Do not create a public/domain-wide grant or assume every Partner has access |
| OLTP editor-editor-security-security-filters-cab9a28b.yaml | Borrowers, Loans, Charges and Partners: no recorded security filter, read as creator; Cash Statement Context has per-Partner Login Email filter | No evidenced per-borrower ownership filter for this slice. Do not invent one or generalize the preference filter |
| OLTP tables/partners.yaml | Login Email is sensitive identity; Email is delivery; Partner Role values A/B; Language Preference English/ไทย | Match normalized Login Email only. A/B is a business role, not Admin/User authorization. Delivery sharing grants no access |
| OLTP views/borrowers-fa2504ea.yaml and slices/visible-borrowers.yaml | Borrowers uses Visible Borrowers: NOT([Hidden Flag]); active grouping, outstanding principal, Creation Date ascending | Borrower-directory presentation excludes hidden records; preserve physical immutable IDs |
| OLTP views/collection-7b790708.yaml and slices/todays-collection-board.yaml | Collection uses Todays Collection Board: nonblank Daily Collection Status. Remaining is secondary value, collected is summary, status order groups | Collection is not simply positive amount remaining, nor the same hidden-record slice as Borrowers |
| R051 outputs/r051-production/affected-app-definitions.json, appsheet:oltp:table:Borrowers; current OLTP tables/borrowers.yaml | Current Collection virtual formulas and physical Has Active Loan/Total Outstanding Principal agree | Use OLTP definitions, not similarly named older OLAP formula fields |
| outputs/r051-production/README.md | PROD OLTP3.000270 / OLAP1.100212 / SQLV77; ordinary source CRUD promoted | This slice is read-only; it must not reintroduce old blanket posted-record restrictions later |

Hidden Flag is a presentation rule in the recorded Borrowers slice, not proven confidentiality policy. Collection can contain a hidden borrower with a nonblank collection status. Do not silently add NOT Hidden Flag to Collection. For a future live service, application permission is enforced first, then the requested module's population. If the owner intends Hidden Flag to be a security boundary, that is a separate explicit policy change affecting existing consumers.

### Current Collection semantics

R051's OLTP definition includes a charge when it belongs to the borrower and either: it is not fully paid with charge date on/before the business date; it is fully paid and its payment date is that date; or a related repayment occurred on that date. This includes completed work, not only outstanding work.

Daily Collection Status is blank if no collection charges; otherwise overdue unpaid historical charge takes precedence, followed by Fully Paid, Partially Paid, then Not Paid according to the recorded charge-status combination. The list's display order is Not Paid, Partially Paid, Overdue, Fully Paid. Calculation precedence and display ordering are distinct.

Todays Amount Collected is the sum of Payment Received Today on the displayed charge population. Todays Amount Remaining sums Amount Remaining for collection charges due on/before the business date. Todays Amount Due equals collected plus remaining. The accepted initial synthetic preview used a simplified positive-charge sum; that must not become the production provider contract. Label a residual headline Remaining to collect rather than Total due. Count labels must distinguish collection population from borrowers with an amount remaining.

Has Active Loan and Total Outstanding Principal are physical SQL-maintained values in the current OLTP record. A future read adapter must not infer the active flag from an incomplete nested loan list or recalculate financial truth in browser code.

## Authorization contract

Proposed evaluator shape: evaluateReadAccess({ principal, config, grants, partners, nowMs }). Equivalent explicit naming is acceptable. Every missing prerequisite fails closed.

1. Configuration supplies explicit synthetic mode, expected environment, expected issuer/audience and required capability. Missing configuration or unsupported mode denies. No environment selection comes from request query, browser theme, inferred email domain or build mode.
2. An injected verifier result must have a nonblank stable subject, expected identity/environment claims, verified email and a valid future expiry. Missing/unverified, expired, disabled or revoked identities deny. A real implementation must obtain these facts through cryptographic verification and current revocation/user checks, not client assertions.
3. Require exactly one enabled configured grant for the subject and environment, containing oltp.read. A Partner row, A/B role, Google account, email domain or matching delivery address alone grants nothing. Ambiguous grant configuration denies.
4. Normalize the verified login email by trimming and lowercasing and require exactly one Partner Login Email match with a usable immutable Partner Row ID. No match, blank or duplicate matches deny. Never match Partners.Email, display name or UI-selected role. IDs retain case.
5. Only then project an authorized read result. Re-evaluate for each list/detail call, so a changed grant/session is not bypassed by a prior allowed result.

Synthetic visible states: allowed preview; signed out; session expired; application access denied; unmapped login. Duplicate mappings, wrong audience/issuer/environment, unverified email, revoked/disabled user and missing configuration may remain unit-test scenarios. Display clear bilingual explanations without pretending a real sign-in or account change occurred.

Denied results contain an explicit failure discriminator and code, without rows, totals, selected detail, email, Partner data or private reason details. For this simulator, a generic scenario label may explain the selected case. A future live API should log detailed reasons safely and avoid exposing whether a particular private identity or borrower exists. Resource IDs outside the permitted requested module population return a generic not-found result.

The browser simulator exercises behavior and test contracts only. Even with negative unit tests it is not an implemented server authorization boundary.

## Read interfaces and projections

Proposed pure adapter operations: listBorrowers, listCollection and getBorrowerDetail; each gates authorization before projection. Detail receives the requested module context so its population matches the authorized list. An allowed detail lookup in Collection does not grant a general hidden Borrowers-directory lookup. Unsupported contexts and invalid IDs deny or return a generic not-found response.

The current synthetic envelope uses schemaVersion 1, source synthetic, businessDate 2026-10-07, timezone Asia/Bangkok, an explicit sample asOf timestamp and items/detail. Source metadata remains visibly synthetic. It must never label these fixtures live, current or synced data.

| Proposed field | Source/representation contract |
| --- | --- |
| id | Borrowers.Row ID; immutable case-sensitive string, not name or row ordinal |
| name | Borrower display label; bilingual sample names are fixture presentation, not two assumed production columns |
| hasActiveLoan | Existing governed physical flag |
| outstandingPrincipal | Existing Total Outstanding Principal as a decimal string or null |
| collection.status | not_paid, partially_paid, overdue, fully_paid, or null, mapped from governed current OLTP status |
| collection.amountDue / amountCollected / amountRemaining | Separate decimal strings or null, with current OLTP meanings; do not rename remaining to due |
| note | Optional authorized Borrower Note/issue text; omit routine no-issue filler |
| loans / charges / upcoming | Minimal explicit child projections for the displayed detail; retain immutable child IDs and provider date semantics |

Keep synthetic area labels as fixture-only if retained; they are not a confirmed production field mapping. Do not project Login Email, notification Email, full addresses, bank/account identifiers, authentication claims, agent evidence or unrestricted receipt URLs into this read DTO. Receipt access needs its own authorized contract later.

Borrowers membership uses hidden === false; unknown visibility is not coerced to visible. Collection membership uses a recognized nonnull status, including Fully Paid with zero remaining. Include hidden-with-collection-status and fully-paid fixtures in tests even if kept out of the default visual fixture list. Reject unrecognized nonblank statuses as contract errors instead of silently mapping to a familiar status.

### Production contract design, not implemented in 1B

Money crosses the JSON boundary as canonical decimal strings, preserving source precision; null is unknown/unavailable and never zero. Browser conversion is for formatting only. Synthetic fixture aggregation does not establish an approved SQL total or financial algorithm. Posted amounts, repayment dates and current canonical SQL/AppSheet expressions must be reconciled in the eventual governed provider. Unknown component amounts must not produce a falsely complete summary. The synthetic provider must reject duplicate/blank row IDs, unrecognized nonnull statuses and invalid envelope business-date/instant metadata with source_unavailable, rather than silently dropping records. Synthetic charge IDs are stable fixture identifiers, not invented mappings to existing database rows.

A business date is YYYY-MM-DD interpreted in Asia/Bangkok. asOf is an ISO-8601 instant with offset/Z. The server chooses authoritative business date/read timestamp. Do not infer business date from the user's device locale. The UI preserves date-only meaning and localizes presentation without changing the underlying date.

Future list endpoints use a bounded page size (proposed default 25, maximum 100) and a stable opaque continuation cursor after authorization and population filtering. Cursor validation binds it to the query/order and authorized scope; clients cannot inject SQL order/filter expressions. Use an immutable ID tie-breaker. Borrowers keeps active grouping and creation-date order; Collection keeps recorded status order. Stable ordering alone does not guarantee snapshot consistency during concurrent changes: document live paging semantics or use an explicit provider snapshot. Aggregate metadata needs its own query scope; summing one page is not the portfolio total. Detail child lists are independently bounded with continuation metadata, not silently truncated. These limits are proposed reversible engineering defaults, not historical AppSheet limits or agreed performance promises.

The small synthetic adapter can return all bounded fixture rows and explicitly report that pagination/live-query completeness is not implemented. Do not fabricate cursor or server-query evidence.

## Live-auth feasibility and next boundary

The parent performed read-only checks on 7 October: Firebase project clever-oasis-508610-n7 / 737787224638 was ACTIVE, web-app listing was empty and the Identity Toolkit admin configuration request returned HTTP404. This establishes that end-user authentication is not ready or verified through these checks; it does not establish the precise cause of the404. This agent performed no cloud operation.

Recommended later path: Google sign-in through a configured DEV Firebase/Identity Platform client; bearer ID token to a separately scoped DEV read API; server SDK verification, current user/revocation checks, explicit application grant and Login Email mapping; then least-privilege read queries against the verified DEV database tuple. Keep the existing IAM-protected readiness service protected. Do not expose its health/storage/secret probes by making the existing service public wholesale.

Firebase verification validates signed tokens and project audience/issuer; revocation requires explicit additional checking. The pure evaluator is downstream of this real verifier. See [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens) and [session management](https://firebase.google.com/docs/auth/admin/manage-sessions), checked7 October2026.

The documented Cloud Run end-user pattern uses a public-facing service with application-level token verification; it differs from the current IAM-only readiness endpoint. The ingress/deployment change is future scoped work. See [Cloud Run end-user authentication](https://docs.cloud.google.com/run/docs/authenticating/end-users), checked7 October2026.

DEV and future PROD require a server-enforced identity boundary. Recommended straightforward default is separate Firebase authentication projects, with the existing project serving DEV if inspection/setup confirms suitability. A reviewed Identity Platform tenant split is an alternative if shared-project ownership is required. Two web apps within one Firebase project alone do not provide different token audiences. For tenants, pin and verify the expected tenant as well as issuer/audience and app membership; tenant selection supplied by the browser does not grant access. [Identity Platform multi-tenancy](https://docs.cloud.google.com/identity-platform/docs/multi-tenancy) describes isolated tenant user/configuration pools. No project/tenant is created or selected by this design.

## Owner decision and unresolved facts

The owner selected an owner-only initial DEV pilot: welct0407@mw-credit.com. Add other users later only when explicitly requested. This decision is resolved; do not ask it again. Require an explicit owner application grant and a unique normalized Login Email mapping. This policy selection does not configure or verify real sign-in, and no real roster is provisioned in checkpoint1B. Later authentic DEV setup also requires verified provider/client configuration, domain/redirect configuration, exact server identity boundary and private identity-to-Partner reconciliation. No new Partner/schema fields are proposed here.

AppSheet's recorded shared operational dataset suggests explicitly authorized read users can read the operational population; it does not justify auto-authorizing every Partner or widening the app roster. The owner-only first read cohort is already selected. Reconcile that approved identity to its actual verifier subject and unique Partner Login Email before connecting real reads; no further cohort confirmation is needed. Any later widening requires an explicit request. Existing private account records and current runtime grants have not been re-audited by this agent.

## Agent B implementation and Agent C acceptance

B owns pure implementation modules, declarations, fixture adaptation and the labelled UI state simulator. A shared mjs implementation with adjacent d.mts types is acceptable using existing tooling. Keep server.mjs and production infrastructure untouched. Preserve the already accepted presentation except necessary accurate Collection status/amount labels and the bounded simulator control.

C owns independent tests/evidence:

- Missing/invalid config, unsupported mode, missing/unverified/expired/revoked/disabled identity, mismatched environment/issuer/audience, unverified email, missing/duplicate grant and missing/duplicate Login Email mapping all deny without business data.
- Delivery email, Partner Role A/B, browser theme and arbitrary client role cannot grant access. Exact immutable ID handling remains case-sensitive.
- Gated list/detail functions recheck policy and return only allowed projected fields. Denied results contain no totals or residual selected record; unknown/out-of-population detail uses generic not-found.
- Collection includes fully-paid zero-remaining and respects recorded status ordering; Borrowers hidden exclusion is distinct; null/invalid statuses and unknown monetary values are explicit.
- DTO monetary strings and date/instant metadata are unambiguous; synthetic fixture totals cannot be described as live SQL parity.
- UI allowed→denied→allowed transitions clear stale records/selection and preserve bilingual usability, readable typography and theme-only controls at desktop/mobile. No functional sign-in, external token, SQL, financial action or private file request occurs.
- Existing build/guard tests and directly affected browser tests pass. Report any unverified real provider, performance, live authorization and real-device behavior accurately.

Stop after the tested contract/read-state checkpoint for owner validation. The next go-ahead should authorize the concrete DEV authentication/read integration plan once identity policy and setup facts are settled, not financial posting or production access.
